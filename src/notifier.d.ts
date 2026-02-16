/**
 * Notification Module Type Definitions
 *
 * @module notifier
 */

/**
 * Sends notification when token is successfully refreshed
 *
 * Only sent if NOTIFY_ON_SUCCESS=true in configuration.
 *
 * @param expiresAt - ISO 8601 timestamp when token expires
 * @param expiresIn - Seconds until token expires
 *
 * @example
 * ```typescript
 * notifySuccess('2026-01-24T14:30:00Z', 3600);
 * ```
 */
export function notifySuccess(expiresAt: string, expiresIn: number): void;

/**
 * Sends notification when token refresh fails
 *
 * Always sent (unless NOTIFY_ON_ERROR=false).
 *
 * @param error - Error message describing the failure
 *
 * @example
 * ```typescript
 * notifyError('Network timeout');
 * ```
 */
export function notifyError(error: string): void;

/**
 * Sends notification when daemon starts
 *
 * Only sent if NOTIFY_ON_STARTUP=true in configuration.
 *
 * @example
 * ```typescript
 * notifyStartup();
 * ```
 */
export function notifyStartup(): void;

/**
 * Sends notification when token is expiring soon
 *
 * @param minutesRemaining - Minutes until token expires
 *
 * @example
 * ```typescript
 * notifyExpiringSoon(5);
 * ```
 */
export function notifyExpiringSoon(minutesRemaining: number): void;

/**
 * Sends notification when refresh token is invalid and re-login is required
 *
 * Critical notification that requires user action.
 *
 * @example
 * ```typescript
 * notifyReloginRequired();
 * ```
 */
export function notifyReloginRequired(): void;

/**
 * Sends notification when daemon shuts down
 *
 * @example
 * ```typescript
 * notifyShutdown();
 * ```
 */
export function notifyShutdown(): void;

/**
 * Sends test notification for debugging notification system
 *
 * @example
 * ```typescript
 * notifyTest();
 * ```
 */
export function notifyTest(): void;
