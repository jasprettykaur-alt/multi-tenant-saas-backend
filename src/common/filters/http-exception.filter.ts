import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolveException(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveException(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();
      if (typeof response === 'string') {
        return { status, message: response, error: exception.name };
      }
      const body = response as { message?: string | string[]; error?: string };
      return {
        status,
        message: body.message ?? exception.message,
        error: body.error ?? exception.name,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with the given unique value already exists',
          error: 'Conflict',
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested resource was not found',
          error: 'Not Found',
        };
      }
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Database request could not be processed',
        error: 'Bad Request',
      };
    }

    // Never leak stack traces / internal details for unexpected errors.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };
  }
}
