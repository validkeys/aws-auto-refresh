// @ts-check

/**
 * Logging Module
 * 
 * @module logger
 * @description Enterprise-grade logging using Winston with daily rotation, multiple transports,
 * and structured JSON output. Provides both console and file logging with different formats
 * optimized for development and production use.
 * 
 * Features:
 * - Daily log rotation with configurable retention
 * - Separate transports for console (human-readable) and file (JSON)
 * - Custom log methods for common event types (startup, success, failure, etc.)
 * - Automatic exception and rejection handling
 * - Configurable log levels (debug, info, warn, error)
 * 
 * @example
 * const logger = require('./logger');
 * 
 * logger.info('Standard log message');
 * logger.debug('Debug information', { userId: 123 });
 * logger.startup('Application starting');
 * logger.success('Token refreshed', { expiresIn: 3600 });
 * logger.failure('Token refresh failed', { error: 'Network timeout' });
 * 
 * @requires winston - Core logging library
 * @requires winston-daily-rotate-file - Daily log rotation transport
 * @requires path - Path manipulation
 * @requires fs - File system operations
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const { config } = require('./config');

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the logger by ensuring the log directory exists
 * 
 * This function is called at module load time to ensure the log directory
 * exists before Winston transports are created. If the directory cannot
 * be created, an error is thrown with a helpful message.
 * 
 * @function initializeLogDirectory
 * @throws {Error} If log directory cannot be created
 * @private
 */
function initializeLogDirectory() {
  const logDir = path.dirname(config.logFile);
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      // Note: Can't use logger here since it's not created yet
      console.log(`[logger] Created log directory: ${logDir}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to create log directory: ${logDir}\n` +
      `Error: ${error.message}\n` +
      'Please check directory permissions and try again.'
    );
  }
}

// Initialize log directory before creating transports
initializeLogDirectory();
const logDir = path.dirname(config.logFile);

// ============================================================================
// LOG FORMATS
// ============================================================================

/**
 * Console log format - Human-readable with colors
 * 
 * Format: YYYY-MM-DD HH:mm:ss [LEVEL] message {metadata}
 * Example: 2026-01-24 10:30:45 [info] Token refreshed successfully { expiresIn: 3600 }
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

/**
 * File log format - Structured JSON with full stack traces
 * 
 * Each log entry is a complete JSON object on a single line, suitable for:
 * - Log aggregation tools (Splunk, ELK, etc.)
 * - Parsing and analysis
 * - Error tracking with full stack traces
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }), // Include stack traces for errors
  winston.format.json()
);

// ============================================================================
// TRANSPORTS
// ============================================================================

/**
 * File transport with daily rotation
 * 
 * Automatically rotates log files:
 * - Daily: New file each day (YYYY-MM-DD)
 * - Size-based: New file when reaching maxSize
 * - Retention: Keeps only configured number of old files
 * 
 * Example filenames:
 * - refresh-2026-01-24.log (today)
 * - refresh-2026-01-23.log (yesterday)
 * - refresh-2026-01-22.log (2 days ago)
 */
const fileTransport = new DailyRotateFile({
  filename: config.logFile.replace('.log', '-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: config.logMaxSize,
  maxFiles: config.logMaxFiles,
  format: fileFormat,
  level: config.logLevel,
});

/**
 * Console transport for development and PM2 logs
 * 
 * Outputs to stdout/stderr with colors for easy reading.
 * PM2 captures this output and stores it in pm2-out.log / pm2-error.log
 */
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  level: config.logLevel,
});

// ============================================================================
// LOGGER INSTANCE
// ============================================================================

/**
 * Main Winston logger instance configured with file and console transports
 * 
 * @constant {winston.Logger} logger
 */
const logger = winston.createLogger({
  level: config.logLevel,
  transports: [fileTransport, consoleTransport],
  exitOnError: false, // Don't exit on handled exceptions
});

// ============================================================================
// CUSTOM LOG METHODS
// ============================================================================

/**
 * Log application startup events
 * 
 * @method startup
 * @param {string} message - Startup message
 * @param {Object} [meta={}] - Additional metadata
 * 
 * @example
 * logger.startup('AWS SSO Token Refresh Daemon Starting');
 */
logger.startup = (message, meta = {}) => {
  logger.info(`🚀 ${message}`, meta);
};

/**
 * Log successful operations
 * 
 * @method success
 * @param {string} message - Success message
 * @param {Object} [meta={}] - Additional metadata
 * 
 * @example
 * logger.success('Token refresh successful', { expiresIn: 3600 });
 */
logger.success = (message, meta = {}) => {
  logger.info(`✅ ${message}`, meta);
};

/**
 * Log failed operations
 * 
 * @method failure
 * @param {string} message - Failure message
 * @param {Object} [meta={}] - Additional metadata including error details
 * 
 * @example
 * logger.failure('Token refresh failed', { error: error.message });
 */
logger.failure = (message, meta = {}) => {
  logger.error(`❌ ${message}`, meta);
};

/**
 * Log warning events
 * 
 * @method warning
 * @param {string} message - Warning message
 * @param {Object} [meta={}] - Additional metadata
 * 
 * @example
 * logger.warning('Token expires in 5 minutes', { expiresAt: '2026-01-24T14:30:00Z' });
 */
logger.warning = (message, meta = {}) => {
  logger.warn(`⚠️  ${message}`, meta);
};

/**
 * Log token refresh operations
 * 
 * @method refresh
 * @param {string} message - Refresh operation message
 * @param {Object} [meta={}] - Additional metadata
 * 
 * @example
 * logger.refresh('Attempting token refresh', { endpoint: 'https://oidc.ca-central-1.amazonaws.com/token' });
 */
logger.refresh = (message, meta = {}) => {
  logger.info(`🔄 ${message}`, meta);
};

/**
 * Log token-related debug information
 * 
 * SECURITY: Never logs actual token values, only metadata
 * 
 * @method token
 * @param {string} message - Token operation message
 * @param {Object} [meta={}] - Non-sensitive metadata only
 * 
 * @example
 * logger.token('Token cache read successfully', { 
 *   expiresAt: '2026-01-24T14:30:00Z',
 *   hasAccessToken: true,
 *   hasRefreshToken: true
 * });
 */
logger.token = (message, meta = {}) => {
  logger.debug(`🔑 ${message}`, meta);
};

// ============================================================================
// EXCEPTION HANDLING
// ============================================================================

/**
 * Configure Winston to handle uncaught exceptions
 * 
 * Exceptions are logged to a separate file for easy debugging.
 * This ensures critical errors are captured even if the application crashes.
 */
logger.exceptions.handle(
  new winston.transports.File({ 
    filename: path.join(logDir, 'exceptions.log'),
    format: fileFormat,
  })
);

/**
 * Configure Winston to handle unhandled promise rejections
 * 
 * Promise rejections that aren't caught will be logged to a separate file.
 * This is critical for async/await code where errors might be missed.
 * 
 * Using Winston's built-in rejection handler instead of manual process.on()
 * prevents duplicate handlers and memory leaks.
 */
logger.rejections.handle(
  new winston.transports.File({ 
    filename: path.join(logDir, 'rejections.log'),
    format: fileFormat,
  })
);

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Export configured logger instance
 * 
 * @exports logger
 * @type {winston.Logger}
 */
module.exports = logger;
