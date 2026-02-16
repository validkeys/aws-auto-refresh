/**
 * Configuration Management Module Type Definitions
 *
 * @module config
 */

/**
 * Application constants used throughout the codebase
 */
export interface Constants {
  /** Notify user if token expires within this many minutes */
  EXPIRY_WARNING_THRESHOLD_MINUTES: number;
  /** Maximum failed refresh attempts before warning */
  MAX_CONSECUTIVE_FAILURES: number;
  /** Milliseconds to wait for cleanup during shutdown */
  GRACEFUL_SHUTDOWN_DELAY_MS: number;
  /** HTTP timeout for OIDC API requests in milliseconds */
  OIDC_REQUEST_TIMEOUT_MS: number;
  /** Auto-dismiss notifications after this many seconds */
  NOTIFICATION_TIMEOUT_SECONDS: number;
}

/**
 * Application configuration loaded from environment variables with defaults
 */
export interface Config {
  /** AWS SSO profile name from ~/.aws/config (REQUIRED) */
  awsSsoProfile: string;
  /** AWS SSO session name from ~/.aws/config (REQUIRED) */
  awsSsoSession: string;
  /** Directory where AWS CLI stores SSO cache files */
  awsSsoCacheDir: string;
  /** AWS region for OIDC endpoint */
  awsRegion: string;
  /** AWS OIDC token endpoint (auto-detected if null) */
  oidcEndpoint: string | null;
  /** How often to check token status (milliseconds) */
  refreshCheckInterval: number;
  /** Refresh token when this close to expiry (milliseconds) */
  refreshThreshold: number;
  /** Maximum retry attempts for failed refreshes */
  maxRetryAttempts: number;
  /** Seconds to wait between retry attempts */
  retryBackoffSeconds: number;
  /** Winston log level (debug|info|warn|error) */
  logLevel: string;
  /** Path to log file */
  logFile: string;
  /** Maximum log file size before rotation (e.g., '10M') */
  logMaxSize: string;
  /** Number of rotated log files to keep */
  logMaxFiles: number;
  /** Send macOS notification on successful refresh */
  notifyOnSuccess: boolean;
  /** Send macOS notification on refresh error */
  notifyOnError: boolean;
  /** Send macOS notification when daemon starts */
  notifyOnStartup: boolean;
  /** macOS notification sound name */
  notifySound: string;
  /** PM2 process name */
  pm2AppName: string;
  /** Number of PM2 instances (should be 1 for this app) */
  pm2Instances: number;
  /** Enable PM2 auto-restart on crashes */
  pm2Autorestart: boolean;
}

/**
 * Configuration summary for display (non-sensitive values)
 */
export interface ConfigSummary {
  'AWS SSO Profile': string;
  'AWS SSO Session': string;
  'AWS Region': string;
  'Cache Directory': string;
  'OIDC Endpoint': string;
  'Check Interval': string;
  'Refresh Threshold': string;
  'Max Retries': number;
  'Log Level': string;
  'Log File': string;
  'Notify on Success': boolean;
  'Notify on Error': boolean;
}

/**
 * Application constants
 */
export const CONSTANTS: Constants;

/**
 * Application configuration
 */
export const config: Config;

/**
 * Validates that all required configuration is present and valid
 *
 * @throws {Error} If any required configuration is missing or invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateConfig();
 *   console.log('Configuration is valid');
 * } catch (error) {
 *   console.error('Configuration errors:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function validateConfig(): void;

/**
 * Gets the AWS OIDC token endpoint URL for the configured region
 *
 * @returns OIDC token endpoint URL
 *
 * @example
 * ```typescript
 * const endpoint = getOidcEndpoint();
 * // => 'https://oidc.ca-central-1.amazonaws.com/token'
 * ```
 */
export function getOidcEndpoint(): string;

/**
 * Returns configuration summary for display (excludes sensitive data)
 *
 * @returns Non-sensitive configuration values as key-value pairs
 *
 * @example
 * ```typescript
 * const summary = printConfig();
 * console.log('Configuration:', summary);
 * ```
 */
export function printConfig(): ConfigSummary;

/**
 * Returns the AWS SSO login command for the current profile
 *
 * @returns AWS CLI login command for current profile
 *
 * @example
 * ```typescript
 * const cmd = getLoginCommand();
 * // => 'aws sso login --profile my-profile'
 * ```
 */
export function getLoginCommand(): string;

/**
 * Returns formatted error message with login instructions
 *
 * @param message - Error context or description
 * @returns Complete error message with login instructions
 *
 * @example
 * ```typescript
 * const msg = getReloginErrorMessage('Refresh token expired');
 * // => 'Refresh token expired\nPlease run: aws sso login --profile my-profile'
 * ```
 */
export function getReloginErrorMessage(message: string): string;
