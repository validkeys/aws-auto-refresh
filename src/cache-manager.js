// @ts-check

/**
 * AWS SSO Cache Manager Module
 * 
 * @module cache-manager
 * @description Manages AWS SSO cache file operations including reading, writing, and validating
 * token cache files. Implements atomic write operations to prevent cache corruption and
 * integrates with AWS CLI's SSO cache structure.
 * 
 * AWS CLI Cache Structure:
 * - Location: ~/.aws/sso/cache/
 * - Filename: SHA1 hash of SSO start URL (e.g., a1b2c3d4e5f6.json)
 * - Format: JSON with accessToken, refreshToken, clientId, clientSecret, expiresAt
 * 
 * Key Features:
 * - Atomic cache file writes with backup/restore capability
 * - AWS config file parsing to locate correct cache file
 * - Token expiry calculation and threshold checking
 * - Thread-safe operations with temporary file writes
 * - Comprehensive error handling with helpful messages
 * 
 * Cache File Example:
 * {
 *   "accessToken": "eyJ...",
 *   "refreshToken": "Atzr|...",
 *   "expiresAt": "2026-01-24T14:30:00Z",
 *   "region": "ca-central-1",
 *   "startUrl": "https://cix-sso.awsapps.com/start/#",
 *   "clientId": "abc123",
 *   "clientSecret": "def456"
 * }
 * 
 * @example
 * const cacheManager = require('./cache-manager');
 * 
 * // Read current token
 * const cache = await cacheManager.readTokenCache();
 * console.log('Token expires:', cache.expiresAt);
 * 
 * // Check if refresh needed
 * if (cacheManager.shouldRefresh(cache.expiresAt)) {
 *   // Perform refresh...
 *   await cacheManager.writeTokenCache(newTokens);
 * }
 * 
 * // Get status
 * const status = await cacheManager.getTokenStatus();
 * console.log('Time remaining:', status.formattedTimeRemaining);
 * 
 * @requires fs - File system operations
 * @requires path - Path manipulation
 * @requires crypto - SHA1 hashing for cache filenames
 * @requires os - Operating system utilities
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const writeFileAtomic = require('write-file-atomic');
const { config, getReloginErrorMessage } = require('./config');
const { expandHomeDir } = require('./utils');
const logger = require('./logger');

// ============================================================================
// MODULE-LEVEL CONFIG CACHE
// ============================================================================

/**
 * Cache for parsed AWS config to avoid repeated file reads
 * @type {Object<string, Object<string, string>>|null}
 * @private
 */
let cachedAwsConfig = null;

/**
 * Modification time of cached config file (milliseconds since epoch)
 * Used to detect when config file has changed
 * @type {number|null}
 * @private
 */
let configFileMtime = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Computes SHA1 hash of input data
 * 
 * Used to compute AWS SSO cache filenames, which are SHA1 hashes of the SSO start URL.
 * This matches AWS CLI's cache file naming convention.
 * 
 * @function sha1
 * @param {string} data - Data to hash
 * @returns {string} Lowercase hexadecimal SHA1 hash
 * @private
 * 
 * @example
 * sha1('https://cix-sso.awsapps.com/start/#')
 * // => 'a1b2c3d4e5f6789012345678901234567890abcd'
 */
function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * Validates and parses ISO 8601 date string
 * 
 * Ensures that date strings are valid before using them in calculations.
 * This prevents subtle bugs from NaN values when date parsing fails.
 * 
 * @function validateAndParseDate
 * @param {string} dateString - ISO 8601 date string
 * @returns {Date} Parsed date object
 * @throws {Error} If date is invalid or missing
 * @private
 * 
 * @example
 * validateAndParseDate('2026-01-24T14:30:00Z')
 * // => Date object
 * 
 * validateAndParseDate('invalid')
 * // => throws Error: Invalid date format: invalid. Expected ISO 8601 format.
 */
function validateAndParseDate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error('Date string is required and must be a string');
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid date format: "${dateString}". Expected ISO 8601 format (e.g., "2026-01-24T14:30:00Z").`
    );
  }
  
  return date;
}

// ============================================================================
// AWS CONFIG FILE PARSING
// ============================================================================

/**
 * Reads and parses AWS CLI config file (~/.aws/config) with caching
 * 
 * Parses INI-style configuration file with sections and key-value pairs.
 * Implements file-based caching with mtime checking to avoid repeated parsing.
 * 
 * The cache is automatically invalidated when the config file is modified.
 * This is detected by comparing the file's modification time (mtime) with
 * the cached mtime value.
 * 
 * Config File Format:
 * [profile AWS-CWP-Developers-Dev-442294689084]
 * sso_session = kyleclaude
 * sso_account_id = 442294689084
 * 
 * [sso-session kyleclaude]
 * sso_start_url = https://cix-sso.awsapps.com/start/#
 * sso_region = ca-central-1
 * 
 * @async
 * @function readAwsConfig
 * @returns {Promise<Object<string, Object<string, string>>>} Parsed config as section -> key-value map
 * @throws {Error} If config file doesn't exist
 * @private
 * 
 * @example
 * const config = await readAwsConfig();
 * console.log(config['sso-session kyleclaude'].sso_start_url);
 * // => 'https://cix-sso.awsapps.com/start/#'
 */
async function readAwsConfig() {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  
  try {
    await fsPromises.access(configPath);
  } catch (error) {
    throw new Error(`AWS config file not found at ${configPath}`);
  }

  // Check if cache is valid by comparing file modification time
  const stats = await fsPromises.stat(configPath);
  const currentMtime = stats.mtimeMs;
  
  if (cachedAwsConfig && configFileMtime === currentMtime) {
    logger.debug('Using cached AWS config');
    return cachedAwsConfig;
  }
  
  // Parse config file
  logger.debug('Parsing AWS config file', { configPath });
  const configContent = await fsPromises.readFile(configPath, 'utf8');
  const lines = configContent.split('\n');
  
  let currentSection = null;
  const sections = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Parse section headers: [profile name] or [sso-session name]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      sections[currentSection] = {};
      continue;
    }
    
    // Parse key-value pairs: key = value
    if (currentSection && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      sections[currentSection][key.trim()] = value;
    }
  }
  
  // Cache the result
  cachedAwsConfig = sections;
  configFileMtime = currentMtime;
  
  return sections;
}

/**
 * Extracts SSO start URL from AWS config file for the configured session
 * 
 * The start URL is needed to compute the cache filename (SHA1 of start URL).
 * 
 * @async
 * @function getSsoStartUrl
 * @returns {Promise<string>} SSO start URL (e.g., 'https://cix-sso.awsapps.com/start/#')
 * @throws {Error} If SSO session not found or start URL is missing
 * 
 * @example
 * const startUrl = await getSsoStartUrl();
 * // => 'https://cix-sso.awsapps.com/start/#'
 */
async function getSsoStartUrl() {
  const awsConfig = await readAwsConfig();
  const ssoSessionKey = `sso-session ${config.awsSsoSession}`;
  
  if (!awsConfig[ssoSessionKey]) {
    throw new Error(
      `SSO session "${config.awsSsoSession}" not found in ~/.aws/config\n` +
      `Available sections: ${Object.keys(awsConfig).join(', ')}`
    );
  }
  
  const startUrl = awsConfig[ssoSessionKey].sso_start_url;
  if (!startUrl) {
    throw new Error(
      `sso_start_url not found in [sso-session ${config.awsSsoSession}]`
    );
  }
  
  logger.debug('Found SSO start URL', { startUrl });
  return startUrl;
}

/**
 * Computes the full path to the AWS SSO cache file for the configured session
 *
 * AWS CLI stores cache files with filenames that are SHA1 hashes of the SSO start URL.
 * This function replicates that logic to find the correct cache file.
 *
 * If the computed filename doesn't exist, this function will scan all cache files
 * in the directory to find one with a matching startUrl. This handles cases where
 * AWS CLI versions compute the hash differently.
 *
 * @async
 * @function getCacheFilePath
 * @returns {Promise<string>} Absolute path to cache file
 * @throws {Error} If cache file doesn't exist (user needs to run aws sso login)
 *
 * @example
 * const cachePath = await getCacheFilePath();
 * // => '/Users/username/.aws/sso/cache/a1b2c3d4e5f6.json'
 */
async function getCacheFilePath() {
  const cacheDir = expandHomeDir(config.awsSsoCacheDir);
  const startUrl = await getSsoStartUrl();

  // Try computed filename first (standard behavior)
  const computedFilename = `${sha1(startUrl)}.json`;
  const computedPath = path.join(cacheDir, computedFilename);

  logger.debug('Computed cache file path', { cachePath: computedPath, startUrl });

  try {
    await fsPromises.access(computedPath);
    return computedPath;
  } catch (error) {
    // Computed path doesn't exist, search for cache file with matching startUrl
    logger.debug('Computed cache path not found, searching directory for matching startUrl');

    try {
      const files = await fsPromises.readdir(cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Search each cache file for matching startUrl
      for (const filename of jsonFiles) {
        const filePath = path.join(cacheDir, filename);
        try {
          const content = await fsPromises.readFile(filePath, 'utf8');
          const data = JSON.parse(content);

          if (data.startUrl === startUrl) {
            logger.debug('Found cache file with matching startUrl', {
              cachePath: filePath,
              startUrl
            });
            return filePath;
          }
        } catch (err) {
          // Skip files that can't be read or parsed
          logger.debug('Skipping invalid cache file', { filename, error: err.message });
          continue;
        }
      }

      // No matching cache file found
      throw new Error(getReloginErrorMessage(
        `Cache file not found: ${computedPath}\n` +
        `No cache file in ${cacheDir} matches startUrl: ${startUrl}`
      ));
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(getReloginErrorMessage(
          `Cache directory not found: ${cacheDir}\n` +
          `Please ensure AWS CLI is installed and run: aws sso login --profile ${config.awsSsoProfile}`
        ));
      }
      throw err;
    }
  }
}

// ============================================================================
// CACHE READ/WRITE OPERATIONS
// ============================================================================

/**
 * Reads AWS SSO token cache file and validates required fields
 * 
 * Reads the JSON cache file created by AWS CLI and validates it contains all
 * required fields for token refresh operations.
 * 
 * Required Cache Fields:
 * - accessToken: Current AWS access token
 * - refreshToken: Token used to get new access tokens
 * - clientId: OIDC client identifier
 * - clientSecret: OIDC client secret
 * - expiresAt: ISO 8601 timestamp when access token expires
 * 
 * SECURITY: This function handles sensitive credentials. Token values are never logged,
 * only metadata (expiry time, presence flags).
 * 
 * @async
 * @function readTokenCache
 * @returns {Promise<Object>} Cache data containing tokens and client credentials
 * @returns {string} returns.accessToken - Current access token
 * @returns {string} returns.refreshToken - Refresh token
 * @returns {string} returns.clientId - OIDC client ID
 * @returns {string} returns.clientSecret - OIDC client secret
 * @returns {string} returns.expiresAt - Token expiry timestamp (ISO 8601)
 * @throws {Error} If cache file not found or missing required fields
 * 
 * @example
 * const cache = await readTokenCache();
 * console.log('Token expires:', cache.expiresAt);
 * // => 'Token expires: 2026-01-24T14:30:00Z'
 * 
 * // NEVER log actual token values:
 * console.log('Has access token:', !!cache.accessToken); // ✅ OK
 * console.log('Access token:', cache.accessToken); // ❌ NEVER DO THIS
 */
async function readTokenCache() {
  try {
    const cachePath = await getCacheFilePath();
    const cacheContent = await fsPromises.readFile(cachePath, 'utf8');
    const cacheData = JSON.parse(cacheContent);
    
    // Validate required fields are present
    const required = ['accessToken', 'refreshToken', 'clientId', 'clientSecret', 'expiresAt'];
    const missing = required.filter(field => !cacheData[field]);
    
    if (missing.length > 0) {
      throw new Error(
        getReloginErrorMessage(`Cache file missing required fields: ${missing.join(', ')}`)
      );
    }
    
    // Validate expiresAt is a valid ISO 8601 date
    try {
      validateAndParseDate(cacheData.expiresAt);
    } catch (dateError) {
      throw new Error(
        getReloginErrorMessage(`Cache file has invalid expiry date: ${dateError.message}`)
      );
    }
    
    // Log only non-sensitive metadata
    logger.token('Token cache read successfully', {
      expiresAt: cacheData.expiresAt,
      hasAccessToken: !!cacheData.accessToken,
      hasRefreshToken: !!cacheData.refreshToken,
    });
    
    return cacheData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const cachePath = await getCacheFilePath();
      throw new Error(getReloginErrorMessage(`Cache file not found: ${cachePath}`));
    }
    throw error;
  }
}

/**
 * Writes updated tokens to cache file using atomic write operation
 * 
 * Implements atomic file write using write-file-atomic package to prevent cache corruption.
 * The atomic write ensures:
 * - File is never in a partial/invalid state
 * - Write either succeeds completely or fails completely (no partial writes)
 * - Safe against process crashes and concurrent writes
 * - Automatic cleanup of temporary files
 * 
 * SECURITY: Preserves all fields from original cache (clientId, clientSecret, etc.)
 * and only updates token values. Never logs sensitive token values. Sets file permissions
 * to 0600 (owner read/write only) for security.
 * 
 * @async
 * @function writeTokenCache
 * @param {Object} newTokens - New token data to write
 * @param {string} newTokens.accessToken - New access token
 * @param {string} newTokens.expiresAt - New expiry timestamp (ISO 8601)
 * @param {string} [newTokens.refreshToken] - Optional new refresh token
 * @returns {Promise<boolean>} True on success
 * @throws {Error} If write fails
 * 
 * @example
 * await writeTokenCache({
 *   accessToken: 'eyJ...',
 *   expiresAt: '2026-01-24T15:30:00Z',
 *   refreshToken: 'Atzr|...' // Optional
 * });
 */
async function writeTokenCache(newTokens) {
  try {
    const cachePath = await getCacheFilePath();
    
    // Read current cache to preserve other fields (clientId, clientSecret, etc.)
    const currentCache = JSON.parse(await fsPromises.readFile(cachePath, 'utf8'));
    
    // Merge new tokens with current cache, preserving all other fields
    const updatedCache = {
      ...currentCache,
      accessToken: newTokens.accessToken,
      expiresAt: newTokens.expiresAt,
      // Only update refreshToken if a new one is provided by OIDC
      ...(newTokens.refreshToken && { refreshToken: newTokens.refreshToken }),
    };
    
    // Atomic write with secure file permissions (0600 = owner read/write only)
    // The write-file-atomic library creates a temp file with the specified mode,
    // then atomically renames it to the target path. This ensures:
    // 1. Temp file is created with secure permissions from the start
    // 2. Final cache file inherits these permissions after atomic rename
    // 3. No window where sensitive data is readable by others
    await writeFileAtomic(cachePath, JSON.stringify(updatedCache, null, 2), {
      mode: 0o600,
      encoding: 'utf8',
    });
    
    // Explicitly verify and set permissions on final cache file
    // This is a defense-in-depth measure to ensure permissions are correct
    // even if the cache file was created with different permissions by AWS CLI
    await fsPromises.chmod(cachePath, 0o600);
    
    logger.success('Token cache updated successfully', {
      expiresAt: updatedCache.expiresAt,
    });
    
    return true;
  } catch (error) {
    logger.failure('Failed to write token cache', { error: error.message });
    throw error;
  }
}

// ============================================================================
// TOKEN EXPIRY CALCULATIONS
// ============================================================================

/**
 * Calculates time remaining until token expires
 * 
 * @function getTimeUntilExpiry
 * @param {string} expiresAt - ISO 8601 timestamp when token expires
 * @returns {number} Milliseconds until token expires (negative if already expired)
 * @throws {Error} If expiresAt is not a valid ISO 8601 date
 * 
 * @example
 * const timeRemaining = getTimeUntilExpiry('2026-01-24T14:30:00Z');
 * const minutes = Math.floor(timeRemaining / 60000);
 * console.log(`Token expires in ${minutes} minutes`);
 */
function getTimeUntilExpiry(expiresAt) {
  const expiryDate = validateAndParseDate(expiresAt);
  const expiryTime = expiryDate.getTime();
  const now = Date.now();
  return expiryTime - now;
}

/**
 * Determines if token should be refreshed based on configured threshold
 * 
 * Returns true when token expiry is within the configured REFRESH_THRESHOLD.
 * For example, with REFRESH_THRESHOLD=300 (5 minutes), this returns true when
 * the token expires in 5 minutes or less.
 * 
 * @function shouldRefresh
 * @param {string} expiresAt - ISO 8601 timestamp when token expires
 * @returns {boolean} True if refresh is needed
 * 
 * @example
 * // With REFRESH_THRESHOLD=300 (5 minutes)
 * shouldRefresh('2026-01-24T14:04:30Z'); // 4 minutes away => true
 * shouldRefresh('2026-01-24T14:10:00Z'); // 10 minutes away => false
 */
function shouldRefresh(expiresAt) {
  const timeUntilExpiry = getTimeUntilExpiry(expiresAt);
  const shouldRefreshNow = timeUntilExpiry <= config.refreshThreshold;
  
  if (shouldRefreshNow) {
    const minutesRemaining = Math.round(timeUntilExpiry / 60000);
    logger.refresh(`Token expires in ${minutesRemaining} minutes - refresh needed`);
  }
  
  return shouldRefreshNow;
}

/**
 * Formats time remaining in human-readable format
 * 
 * @function formatTimeRemaining
 * @param {string} expiresAt - ISO 8601 timestamp when token expires
 * @returns {string} Formatted time (e.g., '2h 15m' or '45m')
 * 
 * @example
 * formatTimeRemaining('2026-01-24T14:30:00Z');
 * // => '45m' (if 45 minutes remain)
 * 
 * formatTimeRemaining('2026-01-24T16:15:00Z');
 * // => '2h 15m' (if 2 hours 15 minutes remain)
 */
function formatTimeRemaining(expiresAt) {
  const timeUntilExpiry = getTimeUntilExpiry(expiresAt);
  const minutes = Math.floor(timeUntilExpiry / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Gets comprehensive token status information
 * 
 * Provides a complete status snapshot including expiry time, time remaining,
 * and whether refresh is needed. Useful for status commands and monitoring.
 * 
 * @async
 * @function getTokenStatus
 * @returns {Promise<Object>} Token status information
 * @returns {string} returns.expiresAt - ISO 8601 expiry timestamp
 * @returns {number} returns.timeUntilExpiry - Milliseconds until expiry
 * @returns {boolean} returns.expired - True if token is already expired
 * @returns {boolean} returns.needsRefresh - True if refresh is needed
 * @returns {string} returns.formattedTimeRemaining - Human-readable time (e.g., '45m')
 * @returns {string} [returns.error] - Error message if cache read fails
 * 
 * @example
 * const status = await getTokenStatus();
 * if (status.needsRefresh) {
 *   console.log(`Token needs refresh - ${status.formattedTimeRemaining} remaining`);
 * }
 * 
 * @example
 * // Handle error case
 * const status = await getTokenStatus();
 * if (status.error) {
 *   console.error('Cannot read token status:', status.error);
 * }
 */
async function getTokenStatus() {
  try {
    const cache = await readTokenCache();
    const timeUntilExpiry = getTimeUntilExpiry(cache.expiresAt);
    const expired = timeUntilExpiry <= 0;
    const needsRefresh = shouldRefresh(cache.expiresAt);
    
    return {
      expiresAt: cache.expiresAt,
      timeUntilExpiry,
      expired,
      needsRefresh,
      formattedTimeRemaining: formatTimeRemaining(cache.expiresAt),
    };
  } catch (error) {
    return {
      error: error.message,
      expired: true,
      needsRefresh: true,
    };
  }
}

// ============================================================================
// CONFIG CACHE MANAGEMENT
// ============================================================================

/**
 * Clears the AWS config cache
 * 
 * Forces the next call to readAwsConfig() to re-read and re-parse the config file.
 * Useful for testing or when the config file is known to have changed and the
 * cache needs to be invalidated immediately.
 * 
 * Note: Under normal circumstances, the cache automatically invalidates when
 * the config file's modification time changes, so manual clearing is rarely needed.
 * 
 * @function clearConfigCache
 * @returns {void}
 * 
 * @example
 * // Manually invalidate config cache after making changes
 * await fs.writeFile('~/.aws/config', newConfigContent);
 * clearConfigCache();
 * const config = await readAwsConfig(); // Will re-parse the file
 */
function clearConfigCache() {
  cachedAwsConfig = null;
  configFileMtime = null;
  logger.debug('AWS config cache cleared');
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Export cache management functions
 * 
 * @exports cache-manager
 */
module.exports = {
  readTokenCache,
  writeTokenCache,
  shouldRefresh,
  getTimeUntilExpiry,
  formatTimeRemaining,
  getTokenStatus,
  getCacheFilePath,
  clearConfigCache,
};
