/**
 * AWS SSO Cache Manager Module Type Definitions
 *
 * @module cache-manager
 */

/**
 * AWS SSO cache data structure
 */
export interface CacheData {
  /** Short-lived access token (1 hour), used by AWS CLI for API calls */
  accessToken: string;
  /** When accessToken expires (ISO 8601 UTC timestamp) */
  expiresAt: string;
  /** Long-lived token (90 days), used to get new access tokens */
  refreshToken: string;
  /** OIDC client identifier for this SSO session */
  clientId: string;
  /** OIDC client secret for authentication */
  clientSecret: string;
  /** When OIDC client registration expires (optional) */
  registrationExpiresAt?: string;
  /** AWS region for OIDC endpoint (optional) */
  region?: string;
  /** SSO portal URL (used to compute cache filename) (optional) */
  startUrl?: string;
}

/**
 * New token data received from OIDC refresh
 */
export interface NewTokens {
  /** New JWT access token */
  accessToken: string;
  /** New expiry timestamp (ISO 8601) */
  expiresAt: string;
  /** Optional new refresh token (if rotated by AWS) */
  refreshToken?: string;
}

/**
 * Token status information
 */
export interface TokenStatus {
  /** ISO 8601 expiry timestamp */
  expiresAt?: string;
  /** Milliseconds until expiry */
  timeUntilExpiry?: number;
  /** True if token is already expired */
  expired: boolean;
  /** True if refresh is needed */
  needsRefresh: boolean;
  /** Human-readable time (e.g., '45m') */
  formattedTimeRemaining?: string;
  /** Error message if cache read fails */
  error?: string;
}

/**
 * Reads AWS SSO token cache file and validates required fields
 *
 * @returns Cache data containing tokens and client credentials
 * @throws {Error} If cache file not found or missing required fields
 *
 * @example
 * ```typescript
 * const cache = await readTokenCache();
 * console.log('Token expires:', cache.expiresAt);
 * ```
 */
export function readTokenCache(): Promise<CacheData>;

/**
 * Writes updated tokens to cache file using atomic write operation
 *
 * @param newTokens - New token data to write
 * @returns True on success
 * @throws {Error} If write fails
 *
 * @example
 * ```typescript
 * await writeTokenCache({
 *   accessToken: 'eyJ...',
 *   expiresAt: '2026-01-24T15:30:00Z',
 *   refreshToken: 'Atzr|...' // Optional
 * });
 * ```
 */
export function writeTokenCache(newTokens: NewTokens): Promise<boolean>;

/**
 * Determines if token should be refreshed based on configured threshold
 *
 * @param expiresAt - ISO 8601 timestamp when token expires
 * @returns True if refresh is needed
 *
 * @example
 * ```typescript
 * if (shouldRefresh(cache.expiresAt)) {
 *   // Perform refresh
 * }
 * ```
 */
export function shouldRefresh(expiresAt: string): boolean;

/**
 * Calculates time remaining until token expires
 *
 * @param expiresAt - ISO 8601 timestamp when token expires
 * @returns Milliseconds until token expires (negative if already expired)
 * @throws {Error} If expiresAt is not a valid ISO 8601 date
 *
 * @example
 * ```typescript
 * const timeRemaining = getTimeUntilExpiry('2026-01-24T14:30:00Z');
 * const minutes = Math.floor(timeRemaining / 60000);
 * ```
 */
export function getTimeUntilExpiry(expiresAt: string): number;

/**
 * Formats time remaining in human-readable format
 *
 * @param expiresAt - ISO 8601 timestamp when token expires
 * @returns Formatted time (e.g., '2h 15m' or '45m')
 *
 * @example
 * ```typescript
 * const formatted = formatTimeRemaining('2026-01-24T14:30:00Z');
 * // => '45m' (if 45 minutes remain)
 * ```
 */
export function formatTimeRemaining(expiresAt: string): string;

/**
 * Gets comprehensive token status information
 *
 * @returns Token status information
 *
 * @example
 * ```typescript
 * const status = await getTokenStatus();
 * if (status.needsRefresh) {
 *   console.log(`Token needs refresh - ${status.formattedTimeRemaining} remaining`);
 * }
 * ```
 */
export function getTokenStatus(): Promise<TokenStatus>;

/**
 * Computes the full path to the AWS SSO cache file for the configured session
 *
 * @returns Absolute path to cache file
 * @throws {Error} If cache file doesn't exist (user needs to run aws sso login)
 *
 * @example
 * ```typescript
 * const cachePath = await getCacheFilePath();
 * // => '/Users/username/.aws/sso/cache/a1b2c3d4e5f6.json'
 * ```
 */
export function getCacheFilePath(): Promise<string>;

/**
 * Clears the AWS config cache
 *
 * Forces the next call to readAwsConfig() to re-read and re-parse the config file.
 *
 * @example
 * ```typescript
 * clearConfigCache();
 * const config = await readAwsConfig(); // Will re-parse the file
 * ```
 */
export function clearConfigCache(): void;
