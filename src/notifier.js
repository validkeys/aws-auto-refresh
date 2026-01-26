// @ts-check

/**
 * Notification Module
 * 
 * @module notifier
 * @description Manages native macOS desktop notifications for AWS SSO token refresh events.
 * Provides user-friendly notifications for various daemon lifecycle and operational events,
 * with configurable notification preferences.
 * 
 * Features:
 * - Native macOS notification center integration
 * - Configurable notification types (success, error, info, warning)
 * - Customizable sounds per notification type
 * - Auto-dismiss after timeout
 * - Configuration-based notification filtering
 * 
 * Event Types:
 * - Success: Token successfully refreshed
 * - Error: Token refresh failed, re-login required
 * - Warning: Token expiring soon
 * - Info: Daemon startup/shutdown, status changes
 * 
 * @example
 * const notifier = require('./notifier');
 * 
 * // Notify successful refresh
 * notifier.notifySuccess('2026-01-24T14:30:00Z', 3600);
 * 
 * // Notify error
 * notifier.notifyError('Network timeout');
 * 
 * // Notify startup
 * notifier.notifyStartup();
 * 
 * @requires node-notifier - Native notification library
 * @requires path - Path manipulation
 */

const notifier = require('node-notifier');
const { config, CONSTANTS } = require('./config');
const logger = require('./logger');

// ============================================================================
// CORE NOTIFICATION FUNCTION
// ============================================================================

/**
 * Sends a native macOS notification with type-based filtering
 * 
 * Respects configuration settings to show/hide notifications based on type.
 * All notifications auto-dismiss after 10 seconds to avoid cluttering notification center.
 * 
 * @function sendNotification
 * @param {Object} options - Notification configuration
 * @param {string} options.title - Notification title (defaults to 'AWS SSO Token Refresh')
 * @param {string} options.message - Notification message body
 * @param {string} [options.sound='default'] - macOS sound name or 'none' for silent
 * @param {string} [options.icon=null] - Path to notification icon (optional)
 * @param {string} [options.type='info'] - Notification type: 'info', 'success', 'error', 'warning'
 * @returns {void}
 * 
 * @example
 * sendNotification({
 *   title: 'Token Refreshed',
 *   message: 'Your AWS SSO token has been refreshed',
 *   type: 'success',
 *   sound: 'default'
 * });
 * 
 * @example
 * // Silent notification
 * sendNotification({
 *   title: 'Token Status',
 *   message: 'Token is valid',
 *   type: 'info',
 *   sound: 'none'
 * });
 */
function sendNotification(options) {
  const {
    title,
    message,
    sound = config.notifySound,
    icon = null,
    type = 'info', // info, success, error, warning
  } = options;
  
  // Check if notifications are enabled for this type based on configuration
  if (type === 'success' && !config.notifyOnSuccess) {
    logger.debug('Success notification skipped (disabled in config)');
    return;
  }
  
  if (type === 'error' && !config.notifyOnError) {
    logger.debug('Error notification skipped (disabled in config)');
    return;
  }
  
  try {
    notifier.notify({
      title: title || 'AWS SSO Token Refresh',
      message,
      sound: sound === 'none' ? false : sound,
      icon: icon,
      wait: false, // Don't wait for user interaction
      timeout: CONSTANTS.NOTIFICATION_TIMEOUT_SECONDS, // Auto-dismiss after 10 seconds
    });
    
    logger.debug('Notification sent', { title, type });
  } catch (error) {
    // Gracefully handle notification errors (e.g., not on macOS)
    logger.error('Failed to send notification', { error: error.message });
  }
}

// ============================================================================
// NOTIFICATION FUNCTIONS FOR SPECIFIC EVENTS
// ============================================================================

/**
 * Sends notification when token is successfully refreshed
 * 
 * Only sent if NOTIFY_ON_SUCCESS=true in configuration.
 * Displays the token expiry time and remaining validity duration.
 * 
 * @function notifySuccess
 * @param {string} expiresAt - ISO 8601 timestamp when token expires
 * @param {number} expiresIn - Seconds until token expires
 * @returns {void}
 * 
 * @example
 * notifySuccess('2026-01-24T14:30:00Z', 3600);
 * // Shows: "Token Refreshed - Expires: 2:30 PM (60 minutes)"
 */
function notifySuccess(expiresAt, expiresIn) {
  const minutes = Math.round(expiresIn / 60);
  const expiryTime = new Date(expiresAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  
  sendNotification({
    title: '✅ AWS SSO Token Refreshed',
    message: `Profile: ${config.awsSsoProfile}\nExpires: ${expiryTime} (${minutes} minutes)`,
    type: 'success',
  });
}

/**
 * Sends notification when token refresh fails
 * 
 * Always sent (unless NOTIFY_ON_ERROR=false).
 * Uses more prominent 'Basso' sound to alert user of critical error.
 * 
 * @function notifyError
 * @param {string} error - Error message describing the failure
 * @returns {void}
 * 
 * @example
 * notifyError('Network timeout');
 * // Shows: "Token Refresh Failed - Network timeout"
 */
function notifyError(error) {
  sendNotification({
    title: '❌ Token Refresh Failed',
    message: `Profile: ${config.awsSsoProfile}\nError: ${error}`,
    sound: 'Basso', // More urgent sound for errors
    type: 'error',
  });
}

/**
 * Sends notification when daemon starts
 * 
 * Only sent if NOTIFY_ON_STARTUP=true in configuration.
 * Confirms daemon is running and shows monitoring configuration.
 * 
 * @function notifyStartup
 * @returns {void}
 * 
 * @example
 * notifyStartup();
 * // Shows: "Daemon Started - Monitoring profile: AWS-CWP-Developers-Dev-442294689084"
 */
function notifyStartup() {
  if (!config.notifyOnStartup) {
    return;
  }
  
  sendNotification({
    title: '🚀 AWS SSO Token Refresh Started',
    message: `Monitoring profile: ${config.awsSsoProfile}\nChecking every ${config.refreshCheckInterval / 1000}s`,
    type: 'info',
  });
}

/**
 * Sends notification when token is expiring soon
 * 
 * Alerts user that refresh is about to happen.
 * Useful for understanding daemon activity.
 * 
 * @function notifyExpiringSoon
 * @param {number} minutesRemaining - Minutes until token expires
 * @returns {void}
 * 
 * @example
 * notifyExpiringSoon(5);
 * // Shows: "Token Expiring Soon - Expires in 5 minutes"
 */
function notifyExpiringSoon(minutesRemaining) {
  sendNotification({
    title: '⚠️ AWS SSO Token Expiring Soon',
    message: `Profile: ${config.awsSsoProfile}\nExpires in: ${minutesRemaining} minutes\nRefreshing now...`,
    type: 'warning',
  });
}

/**
 * Sends notification when refresh token is invalid and re-login is required
 * 
 * Critical notification that requires user action.
 * Provides the exact command needed to re-authenticate.
 * Uses prominent 'Basso' sound to ensure user attention.
 * 
 * @function notifyReloginRequired
 * @returns {void}
 * 
 * @example
 * notifyReloginRequired();
 * // Shows: "Re-login Required - Run: aws sso login --profile <profile>"
 */
function notifyReloginRequired() {
  sendNotification({
    title: '🔐 AWS SSO Re-login Required',
    message: `Profile: ${config.awsSsoProfile}\nRefresh token expired\nRun: aws sso login --profile ${config.awsSsoProfile}`,
    sound: 'Basso',
    type: 'error',
  });
}

/**
 * Sends notification when daemon shuts down
 * 
 * Informs user that automatic token refresh has stopped.
 * 
 * @function notifyShutdown
 * @returns {void}
 * 
 * @example
 * notifyShutdown();
 * // Shows: "Daemon Stopped - Token refresh monitoring has ended"
 */
function notifyShutdown() {
  sendNotification({
    title: '👋 AWS SSO Token Refresh Stopped',
    message: `Profile: ${config.awsSsoProfile}\nDaemon shutting down`,
    type: 'info',
  });
}

/**
 * Sends test notification for debugging notification system
 * 
 * Useful for verifying notification configuration is working.
 * 
 * @function notifyTest
 * @returns {void}
 * 
 * @example
 * notifyTest();
 * // Shows: "Test Notification - Notifications are working!"
 */
function notifyTest() {
  sendNotification({
    title: '🧪 Test Notification',
    message: 'AWS SSO Token Refresh notifications are working!',
    type: 'info',
  });
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Export notification functions for use by daemon
 * 
 * @exports notifier
 */
module.exports = {
  notifySuccess,
  notifyError,
  notifyStartup,
  notifyExpiringSoon,
  notifyReloginRequired,
  notifyShutdown,
  notifyTest,
};
