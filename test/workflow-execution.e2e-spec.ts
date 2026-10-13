import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/shared/entities/user.entity';
import { Workflow } from '../src/shared/entities/workflow.entity';
import { WorkflowRun, WorkflowRunStatus } from '../src/shared/entities/workflow-run.entity';
import { ApiKey } from '../src/shared/entities/api-key.entity';
import axios from 'axios';

// Mock axios for HTTP requests in workflows
jest.mock('axios');
const mockedAxios = (axios.request as jest.MockedFunction<typeof axios.request>);

describe('Workflow Execution (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DATABASE_HOST || 'localhost',
          port: parseInt(process.env.DATABASE_PORT || '5432'),
          username: process.env.DATABASE_USERNAME || 'workflow_user',
          password: process.env.DATABASE_PASSWORD || 'workflow_pass',
          database: process.env.DATABASE_NAME || 'workflow_engine_test',
          entities: [User, Workflow, WorkflowRun, ApiKey],
          synchronize: true,
          dropSchema: true,
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register a test user
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!@#',
        firstName: 'Test',
        lastName: 'User',
      });

    authToken = registerResponse.body.data.tokens.accessToken;
    userId = registerResponse.body.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Workflow Execution', () => {
    it('should execute a complete workflow successfully', async () => {
      // Create a workflow with filter -> transform -> http_request
      const workflowData = {
        name: 'Complete E2E Workflow',
        description: 'Tests complete workflow execution',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [
              { path: 'event_type', op: 'eq', value: 'user.signup' },
            ],
          },
          {
            type: 'transform',
            ops: [
              {
                op: 'template',
                to: 'welcome_message',
                template: 'Welcome {{user.name}} to our platform!',
              },
              {
                op: 'default',
                to: 'priority',
                value: 'normal',
              },
            ],
          },
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://hooks.slack.com/services/test',
            headers: {
              'Content-Type': 'application/json',
            },
            body: {
              mode: 'custom',
              value: {
                text: '{{welcome_message}}',
                priority: '{{priority}}',
              },
            },
          },
        ],
      };

      // Create the workflow
      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData)
        .expect(201);

      const workflow = createResponse.body.data;
      const triggerPath = workflow.triggerUrl.split('/t/')[1];

      // Mock successful HTTP request
      (axios.request as jest.MockedFunction<typeof axios.request>).mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        data: { ok: true },
      });

      // Trigger the workflow
      const triggerPayload = {
        event_type: 'user.signup',
        user: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        timestamp: new Date().toISOString(),
      };

      const triggerResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(triggerPayload)
        .expect(200);

      expect(triggerResponse.body.success).toBe(true);
      expect(triggerResponse.body.data.status).toBe('success');
      expect(triggerResponse.body.data.runId).toBeDefined();

      // Verify the HTTP request was made with correct data
      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://hooks.slack.com/services/test',
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          text: 'Welcome John Doe to our platform!',
          priority: 'normal',
        },
        timeout: 5000,
        validateStatus: expect.any(Function),
      });

      // Check run history
      const runId = triggerResponse.body.data.runId;
      const runResponse = await request(app.getHttpServer())
        .get(`/api/runs/${runId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(runResponse.body.data.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(runResponse.body.data.inputContext).toEqual(triggerPayload);
      expect(runResponse.body.data.outputContext.welcome_message).toBe('Welcome John Doe to our platform!');
      expect(runResponse.body.data.outputContext.priority).toBe('normal');
    });

    it('should skip workflow when filter conditions are not met', async () => {
      const workflowData = {
        name: 'Filter Skip Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [
              { path: 'event_type', op: 'eq', value: 'user.premium_signup' },
            ],
          },
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://hooks.slack.com/services/test',
            body: { mode: 'context' },
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      // Trigger with non-matching event type
      const triggerPayload = {
        event_type: 'user.regular_signup', // Doesn't match filter
        user: { name: 'Jane Doe' },
      };

      const triggerResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(triggerPayload)
        .expect(200);

      expect(triggerResponse.body.data.status).toBe('skipped');
      expect(mockedAxios).not.toHaveBeenCalled(); // HTTP request should not be made

      // Verify run status
      const runId = triggerResponse.body.data.runId;
      const runResponse = await request(app.getHttpServer())
        .get(`/api/runs/${runId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(runResponse.body.data.status).toBe(WorkflowRunStatus.SKIPPED);
    });

    it('should handle HTTP request failures gracefully', async () => {
      const workflowData = {
        name: 'HTTP Failure Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [
              { op: 'template', to: 'message', template: 'Processing {{event_id}}' },
            ],
          },
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://api.example.com/webhook',
            body: { mode: 'context' },
            retries: 1,
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      // Mock HTTP failure
      mockedAxios.mockRejectedValue({
        response: {
          status: 500,
          statusText: 'Internal Server Error',
        },
        message: 'Request failed with status code 500',
      });

      const triggerPayload = {
        event_id: 'evt_123',
        data: 'test data',
      };

      const triggerResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(triggerPayload)
        .expect(200);

      expect(triggerResponse.body.data.status).toBe('failed');
      expect(mockedAxios).toHaveBeenCalledTimes(2); // Initial + 1 retry

      // Verify error details in run
      const runId = triggerResponse.body.data.runId;
      const runResponse = await request(app.getHttpServer())
        .get(`/api/runs/${runId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(runResponse.body.data.status).toBe(WorkflowRunStatus.FAILED);
      expect(runResponse.body.data.errorDetails).toBeDefined();
      expect(runResponse.body.data.errorDetails.message).toContain('HTTP request failed');
    });

    it('should handle complex nested data transformations', async () => {
      const workflowData = {
        name: 'Complex Transform Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [
              {
                op: 'pick',
                to: 'user_summary',
                from: 'user',
                fields: ['id', 'name', 'email'],
              },
              {
                op: 'template',
                to: 'notification_title',
                template: 'New order from {{user.name}} ({{user.email}})',
              },
              {
                op: 'template',
                to: 'order_total',
                template: '${{order.total}}',
              },
            ],
          },
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://api.notifications.com/send',
            body: {
              mode: 'custom',
              value: {
                title: '{{notification_title}}',
                amount: '{{order_total}}',
                user: '{{user_summary}}',
              },
            },
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      mockedAxios.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        data: { notification_id: 'notif_123' },
      });

      const triggerPayload = {
        user: {
          id: 'user_456',
          name: 'Alice Smith',
          email: 'alice@example.com',
          internal_data: 'should_not_be_picked',
        },
        order: {
          id: 'order_789',
          total: 99.99,
          items: ['item1', 'item2'],
        },
      };

      await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(triggerPayload)
        .expect(200);

      // Verify the transformed data was sent correctly
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            title: 'New order from Alice Smith (alice@example.com)',
            amount: '$99.99',
            user: {
              id: 'user_456',
              name: 'Alice Smith',
              email: 'alice@example.com',
              // internal_data should not be included
            },
          },
        })
      );
    });

    it('should handle multiple filter conditions (AND logic)', async () => {
      const workflowData = {
        name: 'Multi-Filter Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [
              { path: 'user.role', op: 'eq', value: 'premium' },
              { path: 'order.total', op: 'neq', value: 0 },
              { path: 'event_type', op: 'eq', value: 'order.completed' },
            ],
          },
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://api.rewards.com/add-points',
            body: { mode: 'context' },
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      mockedAxios.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        data: { points_added: 100 },
      });

      // Test case 1: All conditions met
      const validPayload = {
        event_type: 'order.completed',
        user: { role: 'premium', id: 'user_123' },
        order: { total: 150.00, id: 'order_456' },
      };

      const validResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(validPayload)
        .expect(200);

      expect(validResponse.body.data.status).toBe('success');
      expect(mockedAxios).toHaveBeenCalledTimes(1);

      // Test case 2: One condition not met (should skip)
      jest.clearAllMocks();
      
      const invalidPayload = {
        event_type: 'order.completed',
        user: { role: 'basic', id: 'user_789' }, // Not premium
        order: { total: 50.00, id: 'order_101' },
      };

      const invalidResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(invalidPayload)
        .expect(200);

      expect(invalidResponse.body.data.status).toBe('skipped');
      expect(mockedAxios).not.toHaveBeenCalled();
    });

    it('should handle workflow execution timeout', async () => {
      const workflowData = {
        name: 'Timeout Test Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://slow-api.example.com/webhook',
            body: { mode: 'context' },
            timeoutMs: 1000, // 1 second timeout
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      // Mock timeout error
      mockedAxios.mockRejectedValueOnce({
        code: 'ECONNABORTED',
        message: 'timeout of 1000ms exceeded',
      });

      const triggerResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send({ test: 'data' })
        .expect(200);

      expect(triggerResponse.body.data.status).toBe('failed');
      
      const runId = triggerResponse.body.data.runId;
      const runResponse = await request(app.getHttpServer())
        .get(`/api/runs/${runId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(runResponse.body.data.errorDetails.code).toBe('TIMEOUT_ERROR');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty payload', async () => {
      const workflowData = {
        name: 'Empty Payload Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [
              { op: 'default', to: 'status', value: 'processed' },
            ],
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      const triggerResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send({}) // Empty payload
        .expect(200);

      expect(triggerResponse.body.data.status).toBe('success');
    });

    it('should handle malformed JSON gracefully', async () => {
      const workflowData = {
        name: 'Malformed JSON Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [
              { op: 'default', to: 'processed', value: true },
            ],
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      // Send malformed JSON
      await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}') // Malformed JSON
        .expect(400); // Should return 400 Bad Request
    });

    it('should handle disabled workflow', async () => {
      const workflowData = {
        name: 'Disabled Workflow',
        enabled: false, // Disabled
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [{ op: 'default', to: 'test', value: 'value' }],
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send({ test: 'data' })
        .expect(403); // Should return 403 Forbidden
    });

    it('should handle non-existent trigger path', async () => {
      const fakeTriggerPath = 'nonexistent1234567890abcdef1234567890ab';

      await request(app.getHttpServer())
        .post(`/t/${fakeTriggerPath}`)
        .send({ test: 'data' })
        .expect(404); // Should return 404 Not Found
    });

    it('should handle very large payloads', async () => {
      const workflowData = {
        name: 'Large Payload Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [{ path: 'process', op: 'eq', value: true }],
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      // Create a large payload (close to 1MB limit)
      const largeArray = new Array(10000).fill(0).map((_, i) => ({
        id: i,
        data: 'x'.repeat(50), // 50 chars per item
      }));

      const largePayload = {
        process: true,
        items: largeArray,
      };

      const triggerResponse = await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(largePayload)
        .expect(200);

      expect(triggerResponse.body.data.status).toBe('success');
    });

    it('should reject payloads exceeding size limit', async () => {
      const workflowData = {
        name: 'Size Limit Test Workflow',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [{ op: 'default', to: 'processed', value: true }],
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      const triggerPath = createResponse.body.data.triggerUrl.split('/t/')[1];

      // Create a payload larger than 1MB
      const oversizedPayload = {
        data: 'x'.repeat(2 * 1024 * 1024), // 2MB string
      };

      await request(app.getHttpServer())
        .post(`/t/${triggerPath}`)
        .send(oversizedPayload)
        .expect(413); // Should return 413 Payload Too Large
    });
  });
});