// @ts-check

/**
 * Token Refresh Module
 * 
 * @module token-refresher
 * @description Handles AWS SSO OIDC token refresh operations with comprehensive error handling
 * and retry logic. Communicates with AWS OIDC endpoint to exchange refresh tokens for new
 * access tokens.
 * 
 * OIDC Token Refresh Flow:
 * 1. Extract credentials (clientId, clientSecret, refreshToken) from cache
 * 2. POST to AWS OIDC endpoint with grant_type=refresh_token
 * 3. Receive new accessToken and optionally new refreshToken
 * 4. Calculate expiry time from expiresIn seconds
 * 5. Update cache with new tokens
 * 
 * Error Handling:
 * - Network errors: Retry with exponential backoff
 * - Invalid grant (400): Don't retry, user needs to re-login
 * - Unauthorized (401): Don't retry, credentials invalid
 * - Timeout: Retry with backoff
 * 
 * SECURITY: 
 * - Never logs actual token values, only metadata
 * - Uses HTTPS for all API calls
 * - Validates response structure before using
 * 
 * @example
 * const { refreshTokenWithRetry } = require('./token-refresher');
 * 
 * const credentials = {
 *   clientId: 'abc123',
 *   clientSecret: 'def456',
 *   refreshToken: 'Atzr|...'
 * };
 * 
 * const newTokens = await refreshTokenWithRetry(credentials);
 * console.log('New token expires:', newTokens.expiresAt);
 * 
 * @requires axios - HTTP client for OIDC API calls
 */

const axios = require('axios');
const { config, CONSTANTS, getOidcEndpoint, getReloginErrorMessage } = require('./config');
const logger = require('./logger');

// ============================================================================
// ABORT CONTROLLER FOR GRACEFUL SHUTDOWN
// ============================================================================

/**
 * AbortController instance for the current HTTP request
 * 
 * Used to cancel in-flight HTTP requests during graceful shutdown.
 * This prevents unclean shutdowns and dangling promises when the daemon is stopped.
 * 
 * @type {AbortController|null}
 * @private
 */
let abortController = null;

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Timestamp of the last OIDC API request
 * 
 * Used to implement rate limiting to prevent hammering the AWS OIDC endpoint
 * if the daemon gets into a bad state or error loop.
 * 
 * @type {number}
 * @private
 */
let lastRequestTime = 0;

/**
 * Minimum interval between OIDC API requests in milliseconds
 * 
 * This prevents the daemon from making too many requests in a short period,
 * which could trigger rate limiting on the AWS side or indicate a problem
 * with the daemon's configuration or state.
 * 
 * @constant {number}
 * @default 5000 (5 seconds)
 * @private
 */
const MIN_REQUEST_INTERVAL_MS = 5000;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Utility function to pause execution
 * 
 * Used for implementing retry backoff delays.
 * 
 * @function sleep
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after delay
 * @private
 * 
 * @example
 * await sleep(5000); // Wait 5 seconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitizes API response data by removing sensitive fields
 * 
 * SECURITY: Prevents accidental logging of tokens, secrets, and passwords
 * in API error responses. All sensitive fields are replaced with '[REDACTED]'.
 * 
 * This function is crucial for security compliance and prevents credentials
 * from being leaked into log files, which may be stored long-term or shared
 * with monitoring services.
 * 
 * @function sanitizeApiResponse
 * @param {*} data - API response data (object, string, or primitive)
 * @returns {*} Sanitized data safe for logging
 * @private
 * 
 * @example
 * const errorData = {
 *   error: 'invalid_grant',
 *   accessToken: 'eyJ...',
 *   message: 'Token expired'
 * };
 * sanitizeApiResponse(errorData);
 * // => { error: 'invalid_grant', accessToken: '[REDACTED]', message: 'Token expired' }
 * 
 * @example
 * // Handles non-object data safely
 * sanitizeApiResponse('Error message');
 * // => 'Error message'
 */
function sanitizeApiResponse(data) {
  // Handle non-object data (strings, numbers, null, undefined)
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // Create shallow copy to avoid mutating original
  const sanitized = { ...data };
  
  // List of field names that contain sensitive data
  // Uses both camelCase and snake_case to catch all variants
  const sensitiveFields = [
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'token',
    'clientSecret',
    'client_secret',
    'secret',
    'password',
    'apiKey',
    'api_key',
    'authorization',
  ];
  
  // Replace all sensitive fields with [REDACTED]
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// ============================================================================
// TOKEN REFRESH OPERATIONS
// ============================================================================

/**
 * Refreshes AWS SSO access token using refresh token via OIDC endpoint
 * 
 * Makes a POST request to AWS OIDC token endpoint following AWS SSO OIDC token refresh flow.
 * The endpoint validates the refresh token and client credentials, then returns a new access token.
 *
 * Request Format (application/json):
 * - grantType: 'refresh_token'
 * - clientId: OIDC client identifier
 * - clientSecret: OIDC client secret
 * - refreshToken: Current refresh token
 * 
 * Response Format (JSON):
 * - accessToken: New access token (JWT)
 * - expiresIn: Seconds until new token expires (typically 3600 = 1 hour)
 * - refreshToken: Optional new refresh token (if rotated)
 * 
 * SECURITY: Never logs sensitive credentials or tokens, only metadata.
 * 
 * @function refreshToken
 * @param {Object} credentials - Client credentials and refresh token
 * @param {string} credentials.clientId - OIDC client ID
 * @param {string} credentials.clientSecret - OIDC client secret
 * @param {string} credentials.refreshToken - Current refresh token
 * @returns {Promise<Object>} New token data
 * @returns {string} returns.accessToken - New access token
 * @returns {string} returns.refreshToken - Refresh token (new or same)
 * @returns {string} returns.expiresAt - ISO 8601 expiry timestamp
 * @returns {number} returns.expiresIn - Seconds until expiry
 * @throws {Error} If refresh fails (network, invalid token, etc.)
 * 
 * @example
 * const newTokens = await refreshToken({
 *   clientId: 'abc123',
 *   clientSecret: 'def456',
 *   refreshToken: 'Atzr|...'
 * });
 * console.log('Token expires in', newTokens.expiresIn, 'seconds');
 */
async function refreshToken(credentials) {
  const { clientId, clientSecret, refreshToken } = credentials;
  const endpoint = getOidcEndpoint();
  
  // =========================================================================
  // RATE LIMITING: Enforce minimum interval between requests
  // =========================================================================
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    logger.debug(`Rate limiting: waiting ${waitTime}ms before OIDC request to prevent hammering endpoint`);
    await sleep(waitTime);
  }
  
  // Update last request time
  lastRequestTime = Date.now();
  
  logger.refresh('Attempting token refresh', { endpoint });
  
  // Create new AbortController for this request
  abortController = new AbortController();
  
  try {
    // Make POST request to OIDC token endpoint
    // AWS SSO OIDC expects JSON format with camelCase field names
    const response = await axios.post(
      endpoint,
      {
        clientId: clientId,
        clientSecret: clientSecret,
        grantType: 'refresh_token',
        refreshToken: refreshToken,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: CONSTANTS.OIDC_REQUEST_TIMEOUT_MS, // 30 second timeout
        signal: abortController.signal, // Enable request cancellation
      }
    );
    
    const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data;
    
    // Clear the abort controller since request completed successfully
    abortController = null;
    
    // Validate response structure
    if (!accessToken || !expiresIn) {
      throw new Error('Invalid response from OIDC endpoint: missing accessToken or expiresIn');
    }
    
    // Calculate absolute expiry time
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    
    logger.success('Token refresh successful', {
      expiresIn: `${expiresIn}s (${Math.round(expiresIn / 60)} minutes)`,
      expiresAt,
    });
    
    return {
      accessToken,
      refreshToken: newRefreshToken || refreshToken, // Use new refresh token if provided
      expiresAt,
      expiresIn,
    };
  } catch (error) {
    // Clear the abort controller since request failed/completed
    abortController = null;
    
    // ========================================================================
    // ENHANCED ERROR HANDLING
    // ========================================================================
    
    // Request Abort - Graceful shutdown in progress
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      throw new Error('Token refresh canceled due to shutdown');
    }
    
    // HTTP Response Errors (4xx, 5xx)
    if (error.response) {
      const { status, data } = error.response;
      
      // 400 Bad Request - Invalid grant (refresh token expired/invalid)
      if (status === 400 && data.error === 'invalid_grant') {
        throw new Error(getReloginErrorMessage('Refresh token is invalid or expired'));
      }
      
      // 401 Unauthorized - Client credentials invalid
      if (status === 401) {
        throw new Error(getReloginErrorMessage('Client credentials are invalid'));
      }
      
      // Other HTTP errors
      throw new Error(
        `OIDC API error (${status}): ${JSON.stringify(sanitizeApiResponse(data))}`
      );
    }
    
    // Network Errors - Connection refused/DNS failure
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error(
        `Network error: Cannot reach OIDC endpoint at ${endpoint}. ` +
        'Check your internet connection.'
      );
    }
    
    // Timeout Errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      throw new Error(
        `Request timeout: OIDC endpoint at ${endpoint} did not respond in time.`
      );
    }
    
    // Unknown errors
    throw new Error(`Token refresh failed: ${error.message}`);
  }
}

/**
 * Refreshes token with automatic retry on transient failures
 * 
 * Implements retry logic with linear backoff for handling transient network failures.
 * Non-retryable errors (invalid grant, invalid credentials) fail immediately without retries.
 * 
 * Retry Strategy:
 * - Linear backoff: Wait attempt * RETRY_BACKOFF_SECONDS between retries
 * - Example with MAX_RETRY_ATTEMPTS=3, RETRY_BACKOFF_SECONDS=10:
 *   - Attempt 1: Immediate
 *   - Attempt 2: Wait 10s
 *   - Attempt 3: Wait 20s
 * 
 * Non-Retryable Errors (fail immediately):
 * - Invalid grant (refresh token expired)
 * - Invalid credentials (client ID/secret wrong)
 * - Any error containing "invalid or expired"
 * 
 * Retryable Errors:
 * - Network timeouts
 * - Connection refused
 * - HTTP 5xx errors
 * - Temporary DNS failures
 * 
 * @function refreshTokenWithRetry
 * @param {Object} credentials - Client credentials and refresh token
 * @param {string} credentials.clientId - OIDC client ID
 * @param {string} credentials.clientSecret - OIDC client secret
 * @param {string} credentials.refreshToken - Current refresh token
 * @param {number} [maxAttempts=config.maxRetryAttempts] - Maximum retry attempts
 * @returns {Promise<Object>} New token data
 * @throws {Error} If all retry attempts fail or error is non-retryable
 * 
 * @example
 * try {
 *   const newTokens = await refreshTokenWithRetry(credentials);
 *   console.log('Success after', attempts, 'attempts');
 * } catch (error) {
 *   if (error.message.includes('invalid or expired')) {
 *     // User needs to re-login
 *     console.error('Please run: aws sso login');
 *   } else {
 *     // Retryable error that failed after max attempts
 *     console.error('Refresh failed:', error.message);
 *   }
 * }
 */
async function refreshTokenWithRetry(credentials, maxAttempts = config.maxRetryAttempts) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await refreshToken(credentials);
      
      // If we succeeded after retries, log it
      if (attempt > 1) {
        logger.success(`Token refresh succeeded on attempt ${attempt}/${maxAttempts}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // ======================================================================
      // DETERMINE IF ERROR IS RETRYABLE
      // ======================================================================
      
      // List of error patterns that should NOT be retried
      const nonRetryableErrors = [
        'invalid_grant',
        'invalid or expired',
        'credentials are invalid',
        'canceled due to shutdown', // Don't retry during shutdown
      ];
      
      const isNonRetryable = nonRetryableErrors.some(msg => 
        error.message.toLowerCase().includes(msg.toLowerCase())
      );
      
      if (isNonRetryable) {
        // Don't log as failure if it's a graceful shutdown
        if (!error.message.includes('canceled due to shutdown')) {
          logger.failure('Token refresh failed with non-retryable error', {
            error: error.message,
          });
        }
        throw error; // Don't retry, fail immediately
      }
      
      // ======================================================================
      // RETRY LOGIC WITH BACKOFF
      // ======================================================================
      
      // If not the last attempt, wait and retry
      if (attempt < maxAttempts) {
        const backoffSeconds = config.retryBackoffSeconds * attempt; // Linear backoff
        logger.warning(
          `Token refresh attempt ${attempt}/${maxAttempts} failed - retrying in ${backoffSeconds}s`,
          { error: error.message }
        );
        await sleep(backoffSeconds * 1000);
      } else {
        // Last attempt failed
        logger.failure(`Token refresh failed after ${maxAttempts} attempts`, {
          error: error.message,
        });
      }
    }
  }
  
  // All attempts exhausted
  throw lastError;
}

/**
 * Extracts safe metadata from token data for logging/display
 * 
 * SECURITY: Returns only non-sensitive metadata. Never includes actual token values.
 * Safe for logging, display, or transmission.
 * 
 * @function getTokenInfo
 * @param {Object} tokenData - Token data from refresh operation
 * @returns {Object} Non-sensitive token metadata
 * @returns {string} returns.expiresAt - Token expiry timestamp
 * @returns {number} returns.expiresIn - Seconds until expiry
 * @returns {boolean} returns.hasAccessToken - Whether access token is present
 * @returns {boolean} returns.hasRefreshToken - Whether refresh token is present
 * 
 * @example
 * const tokenInfo = getTokenInfo(newTokens);
 * logger.info('Token info:', tokenInfo);
 * // Safe to log - no sensitive data
 */
function getTokenInfo(tokenData) {
  return {
    expiresAt: tokenData.expiresAt,
    expiresIn: tokenData.expiresIn,
    hasAccessToken: !!tokenData.accessToken,
    hasRefreshToken: !!tokenData.refreshToken,
  };
}

/**
 * Cleanup function for graceful shutdown
 * 
 * Aborts any in-flight HTTP requests to prevent unclean shutdown.
 * Should be called from stopMonitoring() in index.js before process exits.
 * 
 * @function cleanup
 * @returns {void}
 * 
 * @example
 * // In index.js stopMonitoring():
 * const { cleanup } = require('./token-refresher');
 * cleanup(); // Cancel any pending HTTP requests
 */
function cleanup() {
  if (abortController) {
    logger.debug('Aborting in-flight HTTP request for graceful shutdown');
    abortController.abort();
    abortController = null;
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Export token refresh functions
 * 
 * @exports token-refresher
 */
module.exports = {
  refreshToken,
  refreshTokenWithRetry,
  getTokenInfo,
  cleanup,
};
