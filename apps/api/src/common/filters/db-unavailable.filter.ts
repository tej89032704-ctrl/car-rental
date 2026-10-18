import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { dbReadiness } from '../db/readiness';

/**
 * Turns "the database is not there" into an answer a person can act on.
 *
 * Every endpoint that touches Postgres used to surface a failed connection as
 * `500 Internal server error`, which the signup page printed verbatim. The
 * cause (an unreachable host, or migrations that have not finished) is not a
 * bug in the request, and retrying after a minute is exactly the right thing to
 * do — so it is reported as 503 with that instruction instead.
 *
 * Anything that is already an HttpException keeps its own status and body: this
 * filter must not rewrite validation errors, 401s or RBAC denials.
 */
const DB_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  '57P03', // cannot_connect_now
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '53300', // too_many_connections
  '3D000', // invalid_catalog_name (database dropped)
]);

function isDatabaseUnavailable(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | undefined;
  if (err?.code && DB_CODES.has(String(err.code))) return true;
  // Whatever the driver said, a database that is not ready yet cannot serve
  // this request — the boot loop is the authority on that.
  return dbReadiness.phase !== 'ready';
}

@Catch()
export class DbUnavailableFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(exception.getResponse());
      return;
    }

    if (isDatabaseUnavailable(exception)) {
      console.error('[db] request while database unavailable:', exception);
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        retryable: true,
        message:
          'The service is still connecting to its database. Please try again in a minute.',
      });
      return;
    }

    console.error('[api] unhandled error:', exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
