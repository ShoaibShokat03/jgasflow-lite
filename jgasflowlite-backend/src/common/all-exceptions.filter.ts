import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { Request, Response } from 'express';

/**
 * Global exception filter. Maps every uncaught error to a clean JSON
 * response with NO SQL / stack-trace leakage. The full error is still
 * logged server-side at ERROR level for debugging.
 *
 * Mappings:
 *   - HttpException                 -> its own status + message (passthrough)
 *   - MySQL driver error            -> friendly DB message
 *   - anything else                 -> 500 "Internal server error"
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // ----- NestJS HttpException (incl. UnauthorizedException, BadRequestException, ...)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body =
        typeof payload === 'string'
          ? { statusCode: status, message: payload }
          : (payload as Record<string, any>);
      return res.status(status).json({
        statusCode: status,
        ...body,
        path: req.url,
      });
    }

    // ----- MySQL driver error (duplicate key, missing table, connection ...)
    const dbErr = exception as { code?: string; sqlMessage?: string; message?: string; stack?: string };
    if (dbErr && typeof dbErr === 'object' && typeof dbErr.code === 'string' && (dbErr.sqlMessage || dbErr.code.startsWith('ER_') || dbErr.code === 'ECONNREFUSED')) {
      this.logger.error(`DB query failed [${dbErr.code}]: ${dbErr.sqlMessage ?? dbErr.message}`, dbErr.stack);
      const status = mapDriverCodeToStatus(dbErr.code);
      return res.status(status).json({
        statusCode: status,
        error: status >= 500 ? 'Database error' : 'Bad Request',
        message: mapDriverCodeToMessage(dbErr.code, dbErr.sqlMessage),
        path: req.url,
      });
    }

    // ----- Fallback (uncaught)
    const err = exception as Error;
    this.logger.error(
      `Unhandled exception at ${req.method} ${req.url}: ${err?.message ?? exception}`,
      err?.stack,
    );
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong. Please try again later.',
      path: req.url,
    });
  }
}

/**
 * Map MySQL driver error codes to user-friendly messages.
 * Anything not listed falls back to a generic "database error".
 */
function mapDriverCodeToMessage(code?: string, raw?: string): string {
  switch (code) {
    case 'ER_DUP_ENTRY':
      return 'A record with these unique fields already exists.';
    case 'ER_BAD_FIELD_ERROR':
      return 'The database schema is out of sync with the application. An administrator needs to apply the latest migration.';
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return 'Referenced record does not exist.';
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return 'Cannot delete: this record is referenced by other data.';
    case 'ER_PARSE_ERROR':
      return 'Invalid query.';
    case 'ER_DATA_TOO_LONG':
      return 'One of the values is too long for its field.';
    case 'ER_NO_SUCH_TABLE':
      return 'A required table is missing. An administrator needs to run database migrations.';
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'Database access denied.';
    case 'ECONNREFUSED':
    case 'ER_CON_COUNT_ERROR':
      return 'Database is unavailable. Please try again shortly.';
    default:
      return raw && process.env.NODE_ENV !== 'production'
        ? `Database error: ${raw}`
        : 'A database error occurred.';
  }
}

function mapDriverCodeToStatus(code?: string): number {
  switch (code) {
    case 'ER_DUP_ENTRY':
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_DATA_TOO_LONG':
      return HttpStatus.BAD_REQUEST;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
