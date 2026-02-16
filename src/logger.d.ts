/**
 * Logging Module Type Definitions
 *
 * @module logger
 */

import { Logger as WinstonLogger } from 'winston';

/**
 * Extended Winston logger with custom log methods
 */
export interface Logger extends WinstonLogger {
  /**
   * Log application startup events
   *
   * @param message - Startup message
   * @param meta - Additional metadata
   *
   * @example
   * ```typescript
   * logger.startup('AWS SSO Token Refresh Daemon Starting');
   * ```
   */
  startup(message: string, meta?: Record<string, any>): void;

  /**
   * Log successful operations
   *
   * @param message - Success message
   * @param meta - Additional metadata
   *
   * @example
   * ```typescript
   * logger.success('Token refresh successful', { expiresIn: 3600 });
   * ```
   */
  success(message: string, meta?: Record<string, any>): void;

  /**
   * Log failed operations
   *
   * @param message - Failure message
   * @param meta - Additional metadata including error details
   *
   * @example
   * ```typescript
   * logger.failure('Token refresh failed', { error: error.message });
   * ```
   */
  failure(message: string, meta?: Record<string, any>): void;

  /**
   * Log warning events
   *
   * @param message - Warning message
   * @param meta - Additional metadata
   *
   * @example
   * ```typescript
   * logger.warning('Token expires in 5 minutes', { expiresAt: '2026-01-24T14:30:00Z' });
   * ```
   */
  warning(message: string, meta?: Record<string, any>): void;

  /**
   * Log token refresh operations
   *
   * @param message - Refresh operation message
   * @param meta - Additional metadata
   *
   * @example
   * ```typescript
   * logger.refresh('Attempting token refresh', { endpoint: 'https://oidc.ca-central-1.amazonaws.com/token' });
   * ```
   */
  refresh(message: string, meta?: Record<string, any>): void;

  /**
   * Log token-related debug information
   *
   * SECURITY: Never logs actual token values, only metadata
   *
   * @param message - Token operation message
   * @param meta - Non-sensitive metadata only
   *
   * @example
   * ```typescript
   * logger.token('Token cache read successfully', {
   *   expiresAt: '2026-01-24T14:30:00Z',
   *   hasAccessToken: true,
   *   hasRefreshToken: true
   * });
   * ```
   */
  token(message: string, meta?: Record<string, any>): void;
}

/**
 * Configured logger instance with custom methods
 */
declare const logger: Logger;

export default logger;
