/**
 * Unit Tests for Cache Manager Module
 * 
 * Tests cache file operations, token expiry calculations, and AWS config parsing.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock dependencies before requiring the module
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  token: jest.fn(),
  success: jest.fn(),
  failure: jest.fn(),
  refresh: jest.fn(),
}));

describe('Cache Manager Module', () => {
  let cacheManager;
  let mockCacheDir;
  let mockConfigPath;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temporary test directories
    mockCacheDir = path.join(os.tmpdir(), `aws-test-cache-${Date.now()}`);
    fs.mkdirSync(mockCacheDir, { recursive: true });
    
    // Set up test environment
    process.env.AWS_SSO_PROFILE = 'test-profile';
    process.env.AWS_SSO_SESSION = 'test-session';
    process.env.AWS_REGION = 'ca-central-1';
    process.env.AWS_SSO_CACHE_DIR = mockCacheDir;
    process.env.REFRESH_THRESHOLD = '300'; // 5 minutes
    
    // Create mock AWS config file  
    const awsConfigDir = path.join(mockCacheDir, '.aws');
    fs.mkdirSync(awsConfigDir, { recursive: true });
    mockConfigPath = path.join(awsConfigDir, 'config');
    
    const mockAwsConfig = `[profile test-profile]
sso_session = test-session
sso_account_id = 123456789012

[sso-session test-session]
sso_start_url = https://test-sso.awsapps.com/start/#
sso_region = ca-central-1
`;
    fs.writeFileSync(mockConfigPath, mockAwsConfig);
    
    // Mock os.homedir to return our test directory's parent
    jest.spyOn(os, 'homedir').mockReturnValue(mockCacheDir);
    
    // Clear module cache and reload
    jest.resetModules();
    cacheManager = require('../../src/cache-manager');
  });

  afterEach(() => {
    // Clean up temp directories
    if (fs.existsSync(mockCacheDir)) {
      fs.rmSync(mockCacheDir, { recursive: true, force: true });
    }
    
    // Restore environment
    process.env = originalEnv;
    
    // Restore mocks
    jest.restoreAllMocks();
  });

  describe('readTokenCache', () => {
    test('should read valid cache file successfully', async () => {
      const cacheData = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        expiresAt: '2026-01-27T10:30:00Z',
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));
      
      const result = await cacheManager.readTokenCache();
      
      expect(result).toEqual(cacheData);
      expect(result.accessToken).toBe('test-access-token');
      expect(result.expiresAt).toBe('2026-01-27T10:30:00Z');
    });

    test('should throw error when cache file missing required fields', async () => {
      const invalidData = {
        accessToken: 'test-token',
        expiresAt: '2026-01-27T10:30:00Z',
        // Missing: refreshToken, clientId, clientSecret
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(invalidData));
      
      await expect(cacheManager.readTokenCache()).rejects.toThrow('missing required fields');
    });

    test('should throw error when expiresAt is invalid date format', async () => {
      const invalidData = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        expiresAt: 'invalid-date-format',
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(invalidData));
      
      await expect(cacheManager.readTokenCache()).rejects.toThrow('invalid expiry date');
    });

    test('should throw error when cache file does not exist', async () => {
      // Don't create cache file
      await expect(cacheManager.readTokenCache()).rejects.toThrow('Cache file not found');
    });

    test('should throw error with helpful message suggesting aws sso login', async () => {
      await expect(cacheManager.readTokenCache()).rejects.toThrow('aws sso login --profile test-profile');
    });
  });

  describe('writeTokenCache', () => {
    test('should write cache file atomically with new tokens', async () => {
      // Create initial cache file
      const initialData = {
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        expiresAt: '2026-01-27T08:00:00Z',
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(initialData));
      
      // Write new tokens
      const newTokens = {
        accessToken: 'new-access-token',
        expiresAt: '2026-01-27T10:30:00Z',
        refreshToken: 'new-refresh-token',
      };
      
      await cacheManager.writeTokenCache(newTokens);
      
      // Read back and verify
      const updated = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      
      expect(updated.accessToken).toBe('new-access-token');
      expect(updated.expiresAt).toBe('2026-01-27T10:30:00Z');
      expect(updated.refreshToken).toBe('new-refresh-token');
      expect(updated.clientId).toBe('test-client'); // Preserved
      expect(updated.clientSecret).toBe('test-secret'); // Preserved
    });

    test('should preserve clientId and clientSecret from original cache', async () => {
      const initialData = {
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        clientId: 'preserve-this-client-id',
        clientSecret: 'preserve-this-secret',
        expiresAt: '2026-01-27T08:00:00Z',
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(initialData));
      
      await cacheManager.writeTokenCache({
        accessToken: 'new-token',
        expiresAt: '2026-01-27T10:00:00Z',
      });
      
      const updated = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      
      expect(updated.clientId).toBe('preserve-this-client-id');
      expect(updated.clientSecret).toBe('preserve-this-secret');
    });

    test('should set file permissions to 0600 (owner read/write only)', async () => {
      // Skip on Windows (different permission model)
      if (process.platform === 'win32') {
        return;
      }

      const initialData = {
        accessToken: 'token',
        refreshToken: 'refresh',
        clientId: 'client',
        clientSecret: 'secret',
        expiresAt: '2026-01-27T10:00:00Z',
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(initialData));
      
      await cacheManager.writeTokenCache({
        accessToken: 'new-token',
        expiresAt: '2026-01-27T11:00:00Z',
      });
      
      const stats = fs.statSync(cacheFilePath);
      const mode = stats.mode & 0o777; // Extract permission bits
      
      expect(mode).toBe(0o600);
    });
  });

  describe('getTimeUntilExpiry', () => {
    test('should calculate positive time for future expiry', () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const timeRemaining = cacheManager.getTimeUntilExpiry(futureTime);
      
      expect(timeRemaining).toBeGreaterThan(0);
      expect(timeRemaining).toBeLessThanOrEqual(3600000);
    });

    test('should calculate negative time for past expiry', () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const timeRemaining = cacheManager.getTimeUntilExpiry(pastTime);
      
      expect(timeRemaining).toBeLessThan(0);
    });

    test('should throw error for invalid date format', () => {
      expect(() => cacheManager.getTimeUntilExpiry('invalid-date')).toThrow('Invalid date format');
    });

    test('should handle ISO 8601 date strings correctly', () => {
      const isoDate = '2026-01-27T10:30:00Z';
      
      expect(() => cacheManager.getTimeUntilExpiry(isoDate)).not.toThrow();
    });
  });

  describe('shouldRefresh', () => {
    test('should return true when token expires within threshold', () => {
      // Token expires in 4 minutes (threshold is 5 minutes)
      const expiresAt = new Date(Date.now() + 240000).toISOString();
      
      expect(cacheManager.shouldRefresh(expiresAt)).toBe(true);
    });

    test('should return false when token expires after threshold', () => {
      // Token expires in 10 minutes (threshold is 5 minutes)
      const expiresAt = new Date(Date.now() + 600000).toISOString();
      
      expect(cacheManager.shouldRefresh(expiresAt)).toBe(false);
    });

    test('should return true for already expired tokens', () => {
      const expiresAt = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      
      expect(cacheManager.shouldRefresh(expiresAt)).toBe(true);
    });

    test('should return true when exactly at threshold', () => {
      // Token expires in exactly 5 minutes (at threshold)
      const expiresAt = new Date(Date.now() + 300000).toISOString();
      
      expect(cacheManager.shouldRefresh(expiresAt)).toBe(true);
    });
  });

  describe('formatTimeRemaining', () => {
    test('should format time as hours and minutes for > 1 hour', () => {
      const expiresAt = new Date(Date.now() + 7500000).toISOString(); // 2h 5m
      const formatted = cacheManager.formatTimeRemaining(expiresAt);
      
      expect(formatted).toMatch(/2h \d+m/);
    });

    test('should format time as minutes only for < 1 hour', () => {
      const expiresAt = new Date(Date.now() + 1800000).toISOString(); // 30 minutes
      const formatted = cacheManager.formatTimeRemaining(expiresAt);
      
      expect(formatted).toMatch(/30m/);
      expect(formatted).not.toContain('h');
    });

    test('should handle negative time (expired)', () => {
      const expiresAt = new Date(Date.now() - 600000).toISOString(); // 10 minutes ago
      const formatted = cacheManager.formatTimeRemaining(expiresAt);
      
      // Should still return a formatted string (negative minutes)
      expect(formatted).toContain('m');
    });
  });

  describe('getTokenStatus', () => {
    test('should return complete status for valid cache', async () => {
      const cacheData = {
        accessToken: 'token',
        refreshToken: 'refresh',
        clientId: 'client',
        clientSecret: 'secret',
        expiresAt: new Date(Date.now() + 600000).toISOString(), // 10 minutes
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData));
      
      const status = await cacheManager.getTokenStatus();
      
      expect(status).toHaveProperty('expiresAt');
      expect(status).toHaveProperty('timeUntilExpiry');
      expect(status).toHaveProperty('expired');
      expect(status).toHaveProperty('needsRefresh');
      expect(status).toHaveProperty('formattedTimeRemaining');
      
      expect(status.expired).toBe(false);
      expect(status.timeUntilExpiry).toBeGreaterThan(0);
    });

    test('should indicate expired status for past tokens', async () => {
      const cacheData = {
        accessToken: 'token',
        refreshToken: 'refresh',
        clientId: 'client',
        clientSecret: 'secret',
        expiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const cacheFileName = crypto.createHash('sha1').update(startUrl).digest('hex') + '.json';
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData));
      
      const status = await cacheManager.getTokenStatus();
      
      expect(status.expired).toBe(true);
      expect(status.needsRefresh).toBe(true);
    });

    test('should return error status when cache file missing', async () => {
      // Don't create cache file
      const status = await cacheManager.getTokenStatus();
      
      expect(status).toHaveProperty('error');
      expect(status.expired).toBe(true);
      expect(status.needsRefresh).toBe(true);
    });
  });

  describe('getCacheFilePath', () => {
    test('should compute correct cache file path using SHA1', async () => {
      const cacheData = {
        accessToken: 'token',
        refreshToken: 'refresh',
        clientId: 'client',
        clientSecret: 'secret',
        expiresAt: '2026-01-27T10:00:00Z',
      };
      
      const crypto = require('crypto');
      const startUrl = 'https://test-sso.awsapps.com/start/#';
      const expectedHash = crypto.createHash('sha1').update(startUrl).digest('hex');
      const cacheFileName = `${expectedHash}.json`;
      const cacheFilePath = path.join(mockCacheDir, cacheFileName);
      
      // Create the cache file
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData));
      
      const computedPath = await cacheManager.getCacheFilePath();
      
      expect(computedPath).toContain(expectedHash);
      expect(computedPath).toContain('.json');
      expect(computedPath).toBe(cacheFilePath);
    });

    test('should throw error when cache file does not exist', async () => {
      // Don't create cache file
      await expect(cacheManager.getCacheFilePath()).rejects.toThrow('Cache file not found');
    });
  });
});
