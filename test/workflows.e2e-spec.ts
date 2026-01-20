import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/shared/entities/user.entity';
import { Workflow } from '../src/shared/entities/workflow.entity';
import { WorkflowRun } from '../src/shared/entities/workflow-run.entity';
import { ApiKey } from '../src/shared/entities/api-key.entity';

describe('Workflows (e2e)', () => {
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
          dropSchema: true, // Clean database for each test run
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register a test user and get auth token
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!@#',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);

    authToken = registerResponse.body.data.tokens.accessToken;
    userId = registerResponse.body.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/workflows (POST)', () => {
    it('should create a new workflow', async () => {
      const workflowData = {
        name: 'Test Workflow',
        description: 'A test workflow for e2e testing',
        enabled: true,
        trigger: {
          type: 'http',
        },
        steps: [
          {
            type: 'filter',
            conditions: [
              {
                path: 'event_type',
                op: 'eq',
                value: 'user.signup',
              },
            ],
          },
          {
            type: 'transform',
            ops: [
              {
                op: 'template',
                to: 'message',
                template: 'Welcome {{user.name}}!',
              },
            ],
          },
          {
            type: 'http_request',
            method: 'POST',
            url: 'https://hooks.slack.com/test',
            body: {
              mode: 'custom',
              value: {
                text: '{{message}}',
              },
            },
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: workflowData.name,
        description: workflowData.description,
        enabled: workflowData.enabled,
        userId: userId,
        trigger: workflowData.trigger,
        steps: workflowData.steps,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.triggerUrl).toMatch(/^http:\/\/.*\/t\/[a-f0-9]{32}$/);
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();
    });

    it('should reject workflow with invalid steps', async () => {
      const workflowData = {
        name: 'Invalid Workflow',
        description: 'A workflow with invalid steps',
        enabled: true,
        trigger: {
          type: 'http',
        },
        steps: [
          {
            type: 'invalid_step_type',
            data: 'some data',
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData)
        .expect(400);
    });

    it('should reject workflow without authentication', async () => {
      const workflowData = {
        name: 'Unauthorized Workflow',
        steps: [],
      };

      await request(app.getHttpServer())
        .post('/api/workflows')
        .send(workflowData)
        .expect(401);
    });

    it('should reject workflow with empty steps', async () => {
      const workflowData = {
        name: 'Empty Workflow',
        description: 'A workflow with no steps',
        enabled: true,
        trigger: {
          type: 'http',
        },
        steps: [],
      };

      await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData)
        .expect(400);
    });
  });

  describe('/api/workflows (GET)', () => {
    let workflowId: string;

    beforeEach(async () => {
      // Create a test workflow
      const workflowData = {
        name: 'List Test Workflow',
        description: 'For testing list endpoint',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [{ path: 'test', op: 'eq', value: 'value' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      workflowId = response.body.data.id;
    });

    it('should list user workflows with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/workflows?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.total).toBeGreaterThan(0);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.totalPages).toBeGreaterThan(0);
    });

    it('should filter workflows by enabled status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/workflows?enabled=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data.every((w: any) => w.enabled === true)).toBe(true);
    });

    it('should search workflows by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/workflows?search=List Test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data.length).toBeGreaterThan(0);
      expect(response.body.data.data[0].name).toContain('List Test');
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/workflows')
        .expect(401);
    });
  });

  describe('/api/workflows/:id (GET)', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflowData = {
        name: 'Get Test Workflow',
        description: 'For testing get endpoint',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'transform',
            ops: [{ op: 'template', to: 'msg', template: 'Hello {{name}}' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      workflowId = response.body.data.id;
    });

    it('should get workflow by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(workflowId);
      expect(response.body.data.name).toBe('Get Test Workflow');
      expect(response.body.data.userId).toBe(userId);
    });

    it('should return 404 for non-existent workflow', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app.getHttpServer())
        .get(`/api/workflows/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/workflows/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}`)
        .expect(401);
    });
  });

  describe('/api/workflows/:id (PATCH)', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflowData = {
        name: 'Update Test Workflow',
        description: 'For testing update endpoint',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [{ path: 'test', op: 'eq', value: 'original' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      workflowId = response.body.data.id;
    });

    it('should update workflow', async () => {
      const updateData = {
        name: 'Updated Workflow Name',
        description: 'Updated description',
        enabled: false,
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.enabled).toBe(updateData.enabled);
    });

    it('should update workflow steps', async () => {
      const updateData = {
        steps: [
          {
            type: 'filter',
            conditions: [{ path: 'test', op: 'eq', value: 'updated' }],
          },
          {
            type: 'transform',
            ops: [{ op: 'template', to: 'result', template: 'Updated: {{test}}' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.steps).toHaveLength(2);
      expect(response.body.data.steps[0].conditions[0].value).toBe('updated');
    });

    it('should reject invalid step updates', async () => {
      const updateData = {
        steps: [
          {
            type: 'invalid_type',
            data: 'invalid',
          },
        ],
      };

      await request(app.getHttpServer())
        .patch(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);
    });

    it('should return 404 for non-existent workflow', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app.getHttpServer())
        .patch(`/api/workflows/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('/api/workflows/:id (DELETE)', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflowData = {
        name: 'Delete Test Workflow',
        description: 'For testing delete endpoint',
        enabled: true,
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [{ path: 'test', op: 'eq', value: 'delete' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      workflowId = response.body.data.id;
    });

    it('should delete workflow', async () => {
      await request(app.getHttpServer())
        .delete(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify workflow is deleted
      await request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent workflow', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      await request(app.getHttpServer())
        .delete(`/api/workflows/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/api/workflows/${workflowId}`)
        .expect(401);
    });
  });

  describe('Workflow ownership', () => {
    let otherUserToken: string;
    let workflowId: string;

    beforeAll(async () => {
      // Register another user
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'other@example.com',
          password: 'Other123!@#',
          firstName: 'Other',
          lastName: 'User',
        });

      otherUserToken = registerResponse.body.data.tokens.accessToken;
    });

    beforeEach(async () => {
      // Create workflow with first user
      const workflowData = {
        name: 'Ownership Test Workflow',
        trigger: { type: 'http' },
        steps: [
          {
            type: 'filter',
            conditions: [{ path: 'test', op: 'eq', value: 'ownership' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowData);

      workflowId = response.body.data.id;
    });

    it('should not allow other users to access workflow', async () => {
      await request(app.getHttpServer())
        .get(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(404); // Should return 404, not 403, to avoid information leakage
    });

    it('should not allow other users to update workflow', async () => {
      await request(app.getHttpServer())
        .patch(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('should not allow other users to delete workflow', async () => {
      await request(app.getHttpServer())
        .delete(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(404);
    });
  });
});