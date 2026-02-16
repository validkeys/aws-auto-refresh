/**
 * AWS SSO Token Auto-Refresh Daemon Type Definitions
 *
 * Main module exports for programmatic usage
 *
 * @module index
 */

/**
 * Starts token monitoring loop with automatic refresh
 *
 * Initializes the daemon's monitoring loop which:
 * 1. Performs an immediate token check at startup
 * 2. Sets up periodic checks at REFRESH_CHECK_INTERVAL
 * 3. Logs startup messages and configuration
 * 4. Sends startup notification to user
 *
 * @returns Promise that resolves when monitoring starts
 *
 * @example
 * ```typescript
 * await startMonitoring();
 * // Daemon now runs until stopped
 * ```
 */
export function startMonitoring(): Promise<void>;

/**
 * Stops the token monitoring loop
 *
 * Performs graceful shutdown of the daemon:
 * 1. Sets shutdown flag to prevent new operations
 * 2. Clears the monitoring interval timer
 * 3. Cancels any in-flight HTTP requests
 * 4. Sends shutdown notification
 *
 * @example
 * ```typescript
 * stopMonitoring();
 * // Daemon is now stopped
 * ```
 */
export function stopMonitoring(): void;

/**
 * Main function that checks token expiry and refreshes if needed
 *
 * This is the core refresh logic called by the monitoring loop.
 * Exposed for testing purposes.
 *
 * @returns Promise that resolves when check completes
 *
 * @example
 * ```typescript
 * await refreshTokenIfNeeded();
 * ```
 */
export function refreshTokenIfNeeded(): Promise<void>;
