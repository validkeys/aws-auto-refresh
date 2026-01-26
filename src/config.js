// @ts-check

/**
 * Configuration Management Module
 * 
 * @module config
 * @description Centralized configuration loader and validator for AWS SSO token refresh daemon.
 * Loads environment variables from .env file, applies defaults, and validates required settings.
 * 
 * @example
 * const { config, validateConfig, getOidcEndpoint } = require('./config');
 * 
 * validateConfig(); // Throws if required config is missing
 * console.log(config.awsSsoProfile); // => 'AWS-CWP-Developers-Dev-442294689084'
 * console.log(getOidcEndpoint()); // => 'https://oidc.ca-central-1.amazonaws.com/token'
 * 
 * @requires dotenv - Loads .env file into process.env
 * @requires path - Path manipulation utilities
 * @requires os - Operating system utilities
 */

require('dotenv').config();
const path = require('path');
const os = require('os');
const { expandHomeDir } = require('./utils');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Application constants used throughout the codebase
 * 
 * @constant {Object} CONSTANTS
 * @property {number} EXPIRY_WARNING_THRESHOLD_MINUTES - Notify user if token expires within this many minutes
 * @property {number} MAX_CONSECUTIVE_FAILURES - Maximum failed refresh attempts before warning
 * @property {number} GRACEFUL_SHUTDOWN_DELAY_MS - Milliseconds to wait for cleanup during shutdown
 * @property {number} OIDC_REQUEST_TIMEOUT_MS - HTTP timeout for OIDC API requests
 * @property {number} NOTIFICATION_TIMEOUT_SECONDS - Auto-dismiss notifications after this many seconds
 */
const CONSTANTS = {
  // Token expiry warnings
  EXPIRY_WARNING_THRESHOLD_MINUTES: 10, // Notify if token expires in 10 minutes or less
  
  // Failure tracking
  MAX_CONSECUTIVE_FAILURES: 5, // Warn after 5 consecutive failed refresh attempts
  
  // Shutdown timing
  GRACEFUL_SHUTDOWN_DELAY_MS: 1000, // Wait 1 second for cleanup operations during shutdown
  
  // HTTP timeouts
  OIDC_REQUEST_TIMEOUT_MS: 30000, // 30 second timeout for OIDC token API requests
  
  // Notification display
  NOTIFICATION_TIMEOUT_SECONDS: 10, // Auto-dismiss notifications after 10 seconds
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parses string environment variable to boolean
 * 
 * @function parseBoolean
 * @param {string|undefined|null} value - String value to parse
 * @param {boolean} [defaultValue=false] - Default if value is null/undefined
 * @returns {boolean} Parsed boolean value
 * 
 * @example
 * parseBoolean('true') // => true
 * parseBoolean('1') // => true
 * parseBoolean('false') // => false
 * parseBoolean(undefined, true) // => true (uses default)
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parses string environment variable to integer with default fallback
 * 
 * @function parseIntWithDefault
 * @param {string|undefined} value - String value to parse
 * @param {number} defaultValue - Default if value is invalid/missing
 * @returns {number} Parsed integer value
 * 
 * @example
 * parseIntWithDefault('60', 30) // => 60
 * parseIntWithDefault('invalid', 30) // => 30 (uses default)
 * parseIntWithDefault(undefined, 30) // => 30 (uses default)
 */
function parseIntWithDefault(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// CONFIGURATION OBJECT
// ============================================================================

/**
 * Application configuration loaded from environment variables with defaults
 * 
 * @constant {Object} config
 * @property {string} awsSsoProfile - AWS SSO profile name from ~/.aws/config (REQUIRED)
 * @property {string} awsSsoSession - AWS SSO session name from ~/.aws/config (REQUIRED)
 * @property {string} awsSsoCacheDir - Directory where AWS CLI stores SSO cache files
 * @property {string} awsRegion - AWS region for OIDC endpoint
 * @property {string|null} oidcEndpoint - AWS OIDC token endpoint (auto-detected if null)
 * @property {number} refreshCheckInterval - How often to check token status (milliseconds)
 * @property {number} refreshThreshold - Refresh token when this close to expiry (milliseconds)
 * @property {number} maxRetryAttempts - Maximum retry attempts for failed refreshes
 * @property {number} retryBackoffSeconds - Seconds to wait between retry attempts
 * @property {string} logLevel - Winston log level (debug|info|warn|error)
 * @property {string} logFile - Path to log file
 * @property {string} logMaxSize - Maximum log file size before rotation (e.g., '10M')
 * @property {number} logMaxFiles - Number of rotated log files to keep
 * @property {boolean} notifyOnSuccess - Send macOS notification on successful refresh
 * @property {boolean} notifyOnError - Send macOS notification on refresh error
 * @property {boolean} notifyOnStartup - Send macOS notification when daemon starts
 * @property {string} notifySound - macOS notification sound name
 * @property {string} pm2AppName - PM2 process name
 * @property {number} pm2Instances - Number of PM2 instances (should be 1 for this app)
 * @property {boolean} pm2Autorestart - Enable PM2 auto-restart on crashes
 */
const config = {
  // Required Configuration - Must be set in .env file
  awsSsoProfile: process.env.AWS_SSO_PROFILE,
  awsSsoSession: process.env.AWS_SSO_SESSION,

  // AWS Configuration
  awsSsoCacheDir: expandHomeDir(process.env.AWS_SSO_CACHE_DIR || '~/.aws/sso/cache'),
  awsRegion: process.env.AWS_REGION || 'ca-central-1',
  oidcEndpoint: process.env.OIDC_ENDPOINT || null, // Auto-detected from region if not set

  // Daemon Behavior - All intervals converted from seconds to milliseconds
  refreshCheckInterval: parseIntWithDefault(process.env.REFRESH_CHECK_INTERVAL, 60) * 1000, // Default: 60s
  refreshThreshold: parseIntWithDefault(process.env.REFRESH_THRESHOLD, 300) * 1000, // Default: 5min
  maxRetryAttempts: parseIntWithDefault(process.env.MAX_RETRY_ATTEMPTS, 3),
  retryBackoffSeconds: parseIntWithDefault(process.env.RETRY_BACKOFF_SECONDS, 10),

  // Logging Configuration
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || './logs/refresh.log',
  logMaxSize: process.env.LOG_MAX_SIZE || '10M',
  logMaxFiles: parseIntWithDefault(process.env.LOG_MAX_FILES, 5),

  // Notification Settings
  notifyOnSuccess: parseBoolean(process.env.NOTIFY_ON_SUCCESS, false),
  notifyOnError: parseBoolean(process.env.NOTIFY_ON_ERROR, true),
  notifyOnStartup: parseBoolean(process.env.NOTIFY_ON_STARTUP, true),
  notifySound: process.env.NOTIFY_SOUND || 'default',

  // PM2 Process Manager Configuration
  pm2AppName: process.env.PM2_APP_NAME || 'aws-sso-refresh',
  pm2Instances: parseIntWithDefault(process.env.PM2_INSTANCES, 1),
  pm2Autorestart: parseBoolean(process.env.PM2_AUTORESTART, true),
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates AWS profile name format to prevent injection attacks
 * 
 * SECURITY: Profile names are used in error messages, log files, and potentially
 * in shell commands. This validation prevents malicious input containing shell
 * metacharacters, path traversal sequences, or other dangerous patterns.
 * 
 * AWS profile names should follow AWS CLI conventions:
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Hyphens (-)
 * - Underscores (_)
 * 
 * @function validateProfileName
 * @param {string} name - Profile name to validate
 * @returns {string} Validated profile name (unchanged if valid)
 * @throws {Error} If name is missing or contains invalid characters
 * @private
 * 
 * @example
 * validateProfileName('AWS-CWP-Developers-Dev-442294689084');
 * // => 'AWS-CWP-Developers-Dev-442294689084'
 * 
 * validateProfileName('profile; rm -rf /');
 * // => throws Error: Invalid profile name format
 */
function validateProfileName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Profile name is required and must be a string');
  }
  
  // AWS profile names should be alphanumeric, hyphens, underscores only
  // This prevents shell injection, path traversal, and other attacks
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(
      `Invalid AWS_SSO_PROFILE format: "${name}". ` +
      'Profile names must contain only letters, numbers, hyphens, and underscores. ' +
      'Special characters and spaces are not allowed.'
    );
  }
  
  // Reasonable length limit to prevent buffer overflow or DoS
  if (name.length > 128) {
    throw new Error(
      `AWS_SSO_PROFILE is too long (${name.length} characters). ` +
      'Profile names must be 128 characters or less.'
    );
  }
  
  return name;
}

/**
 * Validates AWS SSO session name format to prevent injection attacks
 * 
 * SECURITY: Session names are used in error messages, log files, and to locate
 * configuration sections in ~/.aws/config. This validation prevents malicious
 * input that could cause security issues or config parsing errors.
 * 
 * AWS SSO session names should follow AWS CLI conventions:
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Hyphens (-)
 * - Underscores (_)
 * 
 * @function validateSessionName
 * @param {string} name - Session name to validate
 * @returns {string} Validated session name (unchanged if valid)
 * @throws {Error} If name is missing or contains invalid characters
 * @private
 * 
 * @example
 * validateSessionName('kyleclaude');
 * // => 'kyleclaude'
 * 
 * validateSessionName('session$(malicious)');
 * // => throws Error: Invalid session name format
 */
function validateSessionName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Session name is required and must be a string');
  }
  
  // AWS session names should be alphanumeric, hyphens, underscores only
  // This prevents shell injection, path traversal, and other attacks
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(
      `Invalid AWS_SSO_SESSION format: "${name}". ` +
      'Session names must contain only letters, numbers, hyphens, and underscores. ' +
      'Special characters and spaces are not allowed.'
    );
  }
  
  // Reasonable length limit to prevent buffer overflow or DoS
  if (name.length > 128) {
    throw new Error(
      `AWS_SSO_SESSION is too long (${name.length} characters). ` +
      'Session names must be 128 characters or less.'
    );
  }
  
  return name;
}

/**
 * Validates that all required configuration is present and valid
 * 
 * This function performs comprehensive validation of the configuration object,
 * checking for:
 * - Required fields (AWS_SSO_PROFILE, AWS_SSO_SESSION, AWS_REGION)
 * - Valid log level values
 * - Positive interval values
 * 
 * @function validateConfig
 * @throws {Error} If any required configuration is missing or invalid
 * @returns {void}
 * 
 * @example
 * try {
 *   validateConfig();
 *   console.log('Configuration is valid');
 * } catch (error) {
 *   console.error('Configuration errors:', error.message);
 *   process.exit(1);
 * }
 */
function validateConfig() {
  const errors = [];

  // Validate required fields with input sanitization
  if (!config.awsSsoProfile) {
    errors.push('AWS_SSO_PROFILE is required');
  } else {
    try {
      validateProfileName(config.awsSsoProfile);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (!config.awsSsoSession) {
    errors.push('AWS_SSO_SESSION is required');
  } else {
    try {
      validateSessionName(config.awsSsoSession);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (!config.awsRegion) {
    errors.push('AWS_REGION is required');
  }

  // Validate log level against Winston's allowed values
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logLevel)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }

  // Validate that intervals are positive numbers
  if (config.refreshCheckInterval <= 0) {
    errors.push('REFRESH_CHECK_INTERVAL must be greater than 0');
  }

  if (config.refreshThreshold <= 0) {
    errors.push('REFRESH_THRESHOLD must be greater than 0');
  }

  // If any validation errors, throw with comprehensive message
  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n  - ${errors.join('\n  - ')}\n\n` +
      `Please check your .env file or environment variables.`
    );
  }
}

/**
 * Gets the AWS OIDC token endpoint URL for the configured region
 * 
 * If OIDC_ENDPOINT is explicitly set in environment, uses that value.
 * Otherwise, constructs the endpoint URL based on the AWS_REGION.
 * 
 * @function getOidcEndpoint
 * @returns {string} OIDC token endpoint URL
 * 
 * @example
 * // With AWS_REGION=ca-central-1
 * getOidcEndpoint() 
 * // => 'https://oidc.ca-central-1.amazonaws.com/token'
 * 
 * // With explicit OIDC_ENDPOINT in .env
 * // => Returns the explicit endpoint value
 */
function getOidcEndpoint() {
  if (config.oidcEndpoint) {
    return config.oidcEndpoint;
  }
  return `https://oidc.${config.awsRegion}.amazonaws.com/token`;
}

/**
 * Returns configuration summary for display (excludes sensitive data)
 * 
 * Useful for logging configuration at startup without exposing secrets.
 * All returned values are safe to log or display to users.
 * 
 * @function printConfig
 * @returns {Object} Non-sensitive configuration values as key-value pairs
 * 
 * @example
 * const summary = printConfig();
 * console.log('Configuration:', summary);
 * // Output:
 * // {
 * //   'AWS SSO Profile': 'AWS-CWP-Developers-Dev-442294689084',
 * //   'AWS SSO Session': 'kyleclaude',
 * //   'Check Interval': '60s',
 * //   ...
 * // }
 */
function printConfig() {
  return {
    'AWS SSO Profile': config.awsSsoProfile,
    'AWS SSO Session': config.awsSsoSession,
    'AWS Region': config.awsRegion,
    'Cache Directory': config.awsSsoCacheDir,
    'OIDC Endpoint': getOidcEndpoint(),
    'Check Interval': `${config.refreshCheckInterval / 1000}s`,
    'Refresh Threshold': `${config.refreshThreshold / 1000}s`,
    'Max Retries': config.maxRetryAttempts,
    'Log Level': config.logLevel,
    'Log File': config.logFile,
    'Notify on Success': config.notifyOnSuccess,
    'Notify on Error': config.notifyOnError,
  };
}

// ============================================================================
// ERROR MESSAGE HELPERS
// ============================================================================

/**
 * Returns the AWS SSO login command for the current profile
 * 
 * This helper ensures consistent formatting of login commands throughout
 * the application. The command is used in error messages when users need
 * to re-authenticate.
 * 
 * @function getLoginCommand
 * @returns {string} AWS CLI login command for current profile
 * 
 * @example
 * getLoginCommand()
 * // => 'aws sso login --profile AWS-CWP-Developers-Dev-442294689084'
 */
function getLoginCommand() {
  return `aws sso login --profile ${config.awsSsoProfile}`;
}

/**
 * Returns formatted error message with login instructions
 * 
 * Creates a consistent error message format that includes the error context
 * and instructions for re-authenticating. Used when token refresh fails due
 * to invalid or expired credentials.
 * 
 * @function getReloginErrorMessage
 * @param {string} message - Error context or description
 * @returns {string} Complete error message with login instructions
 * 
 * @example
 * getReloginErrorMessage('Refresh token is invalid')
 * // => 'Refresh token is invalid\nPlease run: aws sso login --profile AWS-CWP-Developers-Dev-442294689084'
 */
function getReloginErrorMessage(message) {
  return `${message}\nPlease run: ${getLoginCommand()}`;
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  config,
  CONSTANTS,
  validateConfig,
  getOidcEndpoint,
  printConfig,
  getLoginCommand,
  getReloginErrorMessage,
};
