import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode } from '../errors/error-code';

type ErrorBody = Record<string, unknown> & {
  code?: unknown;
  message?: unknown;
};

const resolveCode = (status: number, body: ErrorBody): string => {
  if (typeof body.code === 'string') return body.code;
  if (
    status === Number(HttpStatus.BAD_REQUEST) &&
    Array.isArray(body.message)
  ) {
    return ErrorCode.VALIDATION_FAILED;
  }
  return HttpStatus[status] ?? 'UNKNOWN_ERROR';
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: ErrorBody =
      typeof raw === 'string' ? { message: raw } : (raw as ErrorBody);

    response.status(status).json({
      statusCode: status,
      ...body,
      code: resolveCode(status, body),
    });
  }
}
