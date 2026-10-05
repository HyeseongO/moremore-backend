import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode, toErrorPayload } from '../errors/error-code';
import { HttpExceptionFilter } from './http-exception.filter';

const run = (exception: Parameters<HttpExceptionFilter['catch']>[0]) => {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn<{ json: typeof json }, [number]>(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  return { status: status.mock.calls[0], body: json.mock.calls[0][0] };
};

describe('HttpExceptionFilter', () => {
  it('keeps an explicit code and message', () => {
    const { status, body } = run(
      new NotFoundException({
        code: ErrorCode.INVALID_INVITE_CODE,
        message: '유효하지 않은 초대 링크입니다.',
      }),
    );

    expect(status).toEqual([404]);
    expect(body).toEqual({
      statusCode: 404,
      code: 'INVALID_INVITE_CODE',
      message: '유효하지 않은 초대 링크입니다.',
    });
  });

  it('marks validation pipe errors as VALIDATION_FAILED', () => {
    const { body } = run(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      }),
    );

    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.message).toEqual(['email must be an email']);
  });

  it('falls back to the HTTP status name when no code is given', () => {
    expect(run(new UnauthorizedException()).body).toEqual({
      statusCode: 401,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  });

  it('keeps extra fields from object responses', () => {
    const { body } = run(
      new ServiceUnavailableException({ status: 'error', db: 'down' }),
    );

    expect(body).toEqual({
      statusCode: 503,
      status: 'error',
      db: 'down',
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

describe('toErrorPayload', () => {
  const fallback = { code: 'JOIN_ROOM_FAILED', message: 'fallback' };

  it('reads the code and message from an HttpException', () => {
    expect(
      toErrorPayload(
        new NotFoundException({
          code: ErrorCode.STUDYROOM_NOT_FOUND,
          message: '스터디룸을 찾을 수 없습니다.',
        }),
        fallback,
      ),
    ).toEqual({
      code: 'STUDYROOM_NOT_FOUND',
      message: '스터디룸을 찾을 수 없습니다.',
    });
  });

  it('uses the fallback for unknown errors', () => {
    expect(toErrorPayload(new Error('db down'), fallback)).toEqual(fallback);
  });
});
