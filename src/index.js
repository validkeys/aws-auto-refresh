#!/usr/bin/env node
// @ts-check

/**
 * AWS SSO Token Auto-Refresh Daemon
 * 
 * Main daemon process that monitors AWS SSO token expiry and automatically
 * refreshes tokens before they expire. Designed to run as a long-lived
 * background service managed by PM2.
 * 
 * @module index
 * @see {@link ../README.md} for usage documentation
 * @see {@link ../ARCHITECTURE.md} for architecture details
 */

const { config, CONSTANTS, validateConfig, printConfig, getReloginErrorMessage } = require('./config');
const logger = require('./logger');
const cacheManager = require('./cache-manager');
const { refreshTokenWithRetry, cleanup: cleanupTokenRefresher } = require('./token-refresher');
const notifier = require('./notifier');

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * @type {NodeJS.Timeout|null} - Interval timer for periodic token checks
 */
let monitorInterval = null;

/**
 * @type {boolean} - Flag indicating daemon is shutting down
 */
let isShuttingDown = false;

/**
 * @type {number} - Counter for consecutive refresh failures
 * Used to detect persistent problems and prevent infinite retry loops
 */
let consecutiveFailures = 0;

/**
 * @constant {number} - Maximum allowed consecutive failures before warning
 * After this many failures, we log a warning but continue monitoring
 */
const MAX_CONSECUTIVE_FAILURES = CONSTANTS.MAX_CONSECUTIVE_FAILURES;

// ============================================================================
// MAIN TOKEN REFRESH LOGIC
// ============================================================================

/**
 * Main function that checks token expiry and refreshes if needed
 * 
 * This function is called:
 * 1. Once immediately at startup
 * 2. Periodically via setInterval (every REFRESH_CHECK_INTERVAL)
 * 
 * Flow:
 * 1. Check if daemon is shutting down (early return if true)
 * 2. Read current token from cache
 * 3. Check if refresh is needed (based on REFRESH_THRESHOLD)
 * 4. If refresh needed:
 *    a. Notify user if expiring very soon (<= 10 minutes)
 *    b. Call OIDC API to get new tokens
 *    c. Update cache file with new tokens
 *    d. Send success notification
 *    e. Reset failure counter
 * 5. If refresh not needed:
 *    a. Log current token validity
 *    b. Reset failure counter
 * 6. Handle errors:
 *    a. Increment failure counter
 *    b. Detect if re-login is required
 *    c. Send appropriate notifications
 *    d. Warn if too many consecutive failures
 * 
 * Error Recovery:
 * - Transient errors (network): Continue monitoring, will retry next interval
 * - Invalid token errors: Notify user, continue monitoring in case they re-login
 * - After MAX_CONSECUTIVE_FAILURES: Warn but continue monitoring
 * 
 * @async
 * @function refreshTokenIfNeeded
 * @returns {Promise<void>}
 * 
 * @example
 * // Called automatically by monitoring loop
 * await refreshTokenIfNeeded();
 */
async function refreshTokenIfNeeded() {
  if (isShuttingDown) {
    return;
  }
  
  try {
    // ========================================================================
    // STEP 1: Read current token from cache
    // ========================================================================
    const cache = await cacheManager.readTokenCache();
    
    // ========================================================================
    // STEP 2: Check if refresh is needed
    // ========================================================================
    if (!cacheManager.shouldRefresh(cache.expiresAt)) {
      const timeRemaining = cacheManager.formatTimeRemaining(cache.expiresAt);
      logger.debug(`Token is valid for ${timeRemaining} - no refresh needed`);
      
      // Reset failure counter on successful check
      consecutiveFailures = 0;
      return;
    }
    
    // ========================================================================
    // STEP 3: Token needs refresh - Prepare and notify
    // ========================================================================
    const minutesRemaining = Math.round(
      cacheManager.getTimeUntilExpiry(cache.expiresAt) / 60000
    );
    
    logger.refresh(`Token expires in ${minutesRemaining} minutes - refreshing now`);
    
    // Notify if expiring very soon (10 minutes or less)
    if (minutesRemaining <= CONSTANTS.EXPIRY_WARNING_THRESHOLD_MINUTES) {
      notifier.notifyExpiringSoon(minutesRemaining);
    }
    
    // ========================================================================
    // STEP 4: Extract credentials and call OIDC API
    // ========================================================================
    const credentials = {
      clientId: cache.clientId,
      clientSecret: cache.clientSecret,
      refreshToken: cache.refreshToken,
    };
    
    // Attempt token refresh with retry logic
    const newTokens = await refreshTokenWithRetry(credentials);
    
    // ========================================================================
    // STEP 5: Update cache and notify success
    // ========================================================================
    await cacheManager.writeTokenCache(newTokens);
    
    // Send success notification
    notifier.notifySuccess(newTokens.expiresAt, newTokens.expiresIn);
    
    // Reset failure counter after successful refresh
    consecutiveFailures = 0;
    
    logger.success('Token refresh cycle completed successfully');
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING
    // ========================================================================
    consecutiveFailures++;
    
    logger.failure(`Token refresh failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, {
      error: error.message,
    });
    
    // Check if it's a re-login required error
    if (error.message.includes('invalid or expired') || 
        error.message.includes('invalid_grant')) {
      notifier.notifyReloginRequired();
      logger.error(getReloginErrorMessage('Refresh token is no longer valid'));
    } else {
      // Send error notification for other failures
      notifier.notifyError(error.message);
    }
    
    // Warn if too many consecutive failures (only once per streak)
    if (consecutiveFailures === MAX_CONSECUTIVE_FAILURES) {
      logger.warning(
        `⚠️  ${MAX_CONSECUTIVE_FAILURES} consecutive failures detected. ` +
        'Consider checking your configuration and network connection.'
      );
    }
  }
}

// ============================================================================
// DAEMON LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Starts token monitoring loop with automatic refresh
 * 
 * Initializes the daemon's monitoring loop which:
 * 1. Performs an immediate token check at startup
 * 2. Sets up periodic checks at REFRESH_CHECK_INTERVAL
 * 3. Logs startup messages and configuration
 * 4. Sends startup notification to user
 * 
 * The monitoring loop continues until stopMonitoring() is called.
 * Each check is independent - failures don't stop the daemon.
 * 
 * @async
 * @function startMonitoring
 * @returns {Promise<void>}
 * 
 * @example
 * await startMonitoring();
 * // Daemon now runs until stopped
 */
async function startMonitoring() {
  logger.startup('AWS SSO Token Refresh Daemon Starting');
  logger.info('Configuration:', printConfig());
  
  // =========================================================================
  // INITIAL TOKEN CHECK (immediate, at startup)
  // =========================================================================
  logger.info('Performing initial token check...');
  try {
    await refreshTokenIfNeeded();
  } catch (error) {
    // Error already handled inside refreshTokenIfNeeded()
    // Log here to ensure visibility of startup failures
    logger.error('Initial token check failed', { error: error.message });
  }
  
  // =========================================================================
  // PERIODIC TOKEN CHECKS (every REFRESH_CHECK_INTERVAL)
  // =========================================================================
  monitorInterval = setInterval(async () => {
    try {
      await refreshTokenIfNeeded();
    } catch (error) {
      // Error already handled inside refreshTokenIfNeeded()
      // This catch prevents unhandled promise rejection
      logger.error('Token refresh check failed', { error: error.message });
    }
  }, config.refreshCheckInterval);
  
  logger.success(
    `Daemon started - checking tokens every ${config.refreshCheckInterval / 1000}s`
  );
  
  // Send startup notification
  notifier.notifyStartup();
}

/**
 * Stops the token monitoring loop
 * 
 * Performs graceful shutdown of the daemon:
 * 1. Sets shutdown flag to prevent new operations
 * 2. Clears the monitoring interval timer
 * 3. Cancels any in-flight HTTP requests
 * 4. Sends shutdown notification
 * 
 * @function stopMonitoring
 * @returns {void}
 * 
 * @example
 * stopMonitoring();
 * // Daemon is now stopped
 */
function stopMonitoring() {
  isShuttingDown = true;
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info('Token monitoring interval stopped');
  }
  
  // Cancel any in-flight HTTP requests
  cleanupTokenRefresher();
  
  // Send shutdown notification
  notifier.notifyShutdown();
  
  logger.info('AWS SSO Token Refresh Daemon stopped');
}

// ============================================================================
// SIGNAL HANDLERS AND ERROR HANDLING
// ============================================================================

/**
 * Sets up process signal handlers for graceful shutdown and error handling
 * 
 * Handles:
 * - SIGINT (Ctrl+C): Graceful shutdown
 * - SIGTERM (kill command, PM2 stop): Graceful shutdown  
 * - uncaughtException: Log error, notify user, then exit
 * - unhandledRejection: Log error and notify user
 * 
 * All handlers attempt to perform cleanup before exiting.
 * 
 * @function setupShutdownHandlers
 * @returns {void}
 * 
 * @example
 * setupShutdownHandlers();
 * // Now Ctrl+C will trigger graceful shutdown
 */
function setupShutdownHandlers() {
  /**
   * Generic shutdown handler for SIGINT and SIGTERM
   * 
   * @param {string} signal - Signal name (SIGINT or SIGTERM)
   */
  const shutdown = (signal) => {
    logger.info(`Received ${signal} - initiating graceful shutdown`);
    stopMonitoring();
    
    // Give time for cleanup operations to complete
    setTimeout(() => {
      process.exit(0);
    }, CONSTANTS.GRACEFUL_SHUTDOWN_DELAY_MS);
  };
  
  // Handle Ctrl+C (SIGINT)
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle kill command / PM2 stop (SIGTERM)
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  /**
   * Handle uncaught exceptions
   * 
   * These are serious errors that escaped all error handling.
   * Log the error, notify the user, then exit gracefully.
   * 
   * @param {Error} error - The uncaught exception
   */
  process.on('uncaughtException', (error) => {
    logger.failure('Uncaught exception', { error: error.message, stack: error.stack });
    notifier.notifyError(`Uncaught exception: ${error.message}`);
    
    // Attempt graceful shutdown
    stopMonitoring();
    process.exit(1);
  });
  
  /**
   * Handle unhandled promise rejections
   * 
   * These are promises that rejected without a .catch() handler.
   * Log the error and notify, but don't exit (might be recoverable).
   * 
   * @param {*} reason - Rejection reason
   * @param {Promise} promise - The rejected promise
   */
  process.on('unhandledRejection', (reason, promise) => {
    logger.failure('Unhandled rejection', { reason, promise });
    notifier.notifyError(`Unhandled rejection: ${reason}`);
  });
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Main function - daemon entry point
 * 
 * Startup sequence:
 * 1. Validate configuration (throws if invalid)
 * 2. Setup signal handlers for graceful shutdown
 * 3. Start token monitoring loop
 * 4. Keep process alive until explicitly stopped
 * 
 * Error Handling:
 * - Configuration errors: Log and exit immediately with helpful message
 * - Runtime errors: Handled by setupShutdownHandlers()
 * 
 * Exit Codes:
 * - 0: Normal shutdown (SIGINT/SIGTERM)
 * - 1: Configuration error or fatal startup error
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 * 
 * @example
 * // Run daemon - errors handled internally with process.exit(1)
 * main();
 */
async function main() {
  try {
    // ========================================================================
    // STEP 1: Validate configuration
    // ========================================================================
    // Throws if required config is missing or invalid
    validateConfig();
    
    // ========================================================================
    // STEP 2: Setup shutdown handlers
    // ========================================================================
    // Register signal handlers for graceful shutdown
    setupShutdownHandlers();
    
    // ========================================================================
    // STEP 3: Start monitoring
    // ========================================================================
    // Begin token monitoring loop
    await startMonitoring();
    
    // ========================================================================
    // STEP 4: Keep process alive
    // ========================================================================
    // Resume stdin to prevent process from exiting
    // Process will stay alive until SIGINT/SIGTERM received
    process.stdin.resume();
  } catch (error) {
    // ========================================================================
    // STARTUP ERROR HANDLING
    // ========================================================================
    // Fatal errors during startup (usually configuration issues)
    logger.failure('Failed to start daemon', {
      error: error.message,
      stack: error.stack,
    });
    
    notifier.notifyError(`Failed to start: ${error.message}`);
    
    // Print user-friendly error message to console
    console.error('\n❌ Fatal Error:', error.message);
    console.error('\nPlease check your configuration and try again.');
    console.error('Run with LOG_LEVEL=debug for more details.\n');
    
    process.exit(1);
  }
}

// ============================================================================
// RUN DAEMON (only if executed directly, not if required as module)
// ============================================================================

if (require.main === module) {
  main();
}

// ============================================================================
// MODULE EXPORTS (for testing or programmatic use)
// ============================================================================

/**
 * Export daemon functions for testing or programmatic control
 * 
 * @exports index
 */
module.exports = {
  startMonitoring,
  stopMonitoring,
  refreshTokenIfNeeded,
};
