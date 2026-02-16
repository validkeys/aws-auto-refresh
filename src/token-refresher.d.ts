/**
 * Token Refresh Module Type Definitions
 *
 * @module token-refresher
 */

/**
 * OIDC credentials required for token refresh
 */
export interface RefreshCredentials {
  /** OIDC client ID */
  clientId: string;
  /** OIDC client secret */
  clientSecret: string;
  /** Current refresh token */
  refreshToken: string;
}

/**
 * Token data returned from successful refresh
 */
export interface RefreshedTokens {
  /** New JWT access token */
  accessToken: string;
  /** Refresh token (new or same) */
  refreshToken: string;
  /** ISO 8601 expiry timestamp */
  expiresAt: string;
  /** Seconds until expiry */
  expiresIn: number;
}

/**
 * Non-sensitive token metadata for logging/display
 */
export interface TokenInfo {
  /** Token expiry timestamp */
  expiresAt: string;
  /** Seconds until expiry */
  expiresIn: number;
  /** Whether access token is present */
  hasAccessToken: boolean;
  /** Whether refresh token is present */
  hasRefreshToken: boolean;
}

/**
 * Refreshes AWS SSO access token using refresh token via OIDC endpoint
 *
 * @param credentials - Client credentials and refresh token
 * @returns New token data
 * @throws {Error} If refresh fails (network, invalid token, etc.)
 *
 * @example
 * ```typescript
 * const newTokens = await refreshToken({
 *   clientId: 'abc123',
 *   clientSecret: 'def456',
 *   refreshToken: 'Atzr|...'
 * });
 * console.log('Token expires in', newTokens.expiresIn, 'seconds');
 * ```
 */
export function refreshToken(credentials: RefreshCredentials): Promise<RefreshedTokens>;

/**
 * Refreshes token with automatic retry on transient failures
 *
 * @param credentials - Client credentials and refresh token
 * @param maxAttempts - Maximum retry attempts (defaults to config value)
 * @returns New token data
 * @throws {Error} If all retry attempts fail or error is non-retryable
 *
 * @example
 * ```typescript
 * try {
 *   const newTokens = await refreshTokenWithRetry(credentials);
 *   console.log('Success after retries');
 * } catch (error) {
 *   if (error.message.includes('invalid or expired')) {
 *     console.error('Please run: aws sso login');
 *   } else {
 *     console.error('Refresh failed:', error.message);
 *   }
 * }
 * ```
 */
export function refreshTokenWithRetry(
  credentials: RefreshCredentials,
  maxAttempts?: number
): Promise<RefreshedTokens>;

/**
 * Extracts safe metadata from token data for logging/display
 *
 * SECURITY: Returns only non-sensitive metadata. Never includes actual token values.
 *
 * @param tokenData - Token data from refresh operation
 * @returns Non-sensitive token metadata
 *
 * @example
 * ```typescript
 * const tokenInfo = getTokenInfo(newTokens);
 * logger.info('Token info:', tokenInfo); // Safe to log
 * ```
 */
export function getTokenInfo(tokenData: RefreshedTokens): TokenInfo;

/**
 * Cleanup function for graceful shutdown
 *
 * Aborts any in-flight HTTP requests to prevent unclean shutdown.
 * Should be called from stopMonitoring() in index.js before process exits.
 *
 * @example
 * ```typescript
 * cleanup(); // Cancel any pending HTTP requests
 * ```
 */
export function cleanup(): void;
