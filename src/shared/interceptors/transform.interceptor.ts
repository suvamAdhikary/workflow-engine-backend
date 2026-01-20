import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { instanceToPlain } from 'class-transformer';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    timestamp: string;
    requestId?: string;
    version: string;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'];

    return next.handle().pipe(
      map((data) => {
        // Handle different response types
        let responseData: T;
        let message: string | undefined;

        if (data && typeof data === 'object' && 'data' in data && !('total' in data)) {
          // If response has a data property but is not a paginated response, extract it
          responseData = data.data;
          message = data.message;
        } else {
          // Otherwise, use the entire response as data (including paginated responses)
          responseData = data;
        }

        // Transform class instances to plain objects
        const transformedData = instanceToPlain(responseData, {
          excludeExtraneousValues: false,
          exposeDefaultValues: true,
        });

        return {
          success: true,
          data: transformedData as T,
          message,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            version: '1.0.0',
          },
        };
      }),
    );
  }
}