/**
 * Unit Tests for Token Refresher Module
 * 
 * Tests token refresh operations, retry logic, error handling, and API response sanitization.
 */

// Mock axios before requiring any modules
jest.mock('axios');

// Mock logger
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  refresh: jest.fn(),
  success: jest.fn(),
  failure: jest.fn(),
  warning: jest.fn(),
}));

const axios = require('axios');

describe('Token Refresher Module', () => {
  let tokenRefresher;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set up test environment
    process.env.AWS_SSO_PROFILE = 'test-profile';
    process.env.AWS_SSO_SESSION = 'test-session';
    process.env.AWS_REGION = 'ca-central-1';
    process.env.MAX_RETRY_ATTEMPTS = '3';
    process.env.RETRY_BACKOFF_SECONDS = '1'; // Faster tests
    
    // Clear module cache and reload
    jest.resetModules();
    jest.clearAllMocks();
    
    tokenRefresher = require('../../src/token-refresher');
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('refreshToken', () => {
    const mockCredentials = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      refreshToken: 'test-refresh-token',
    };

    test('should successfully refresh token', async () => {
      const mockResponse = {
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tokenRefresher.refreshToken(mockCredentials);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('expiresIn', 3600);
      
      // Verify OIDC endpoint was called correctly
      expect(axios.post).toHaveBeenCalledWith(
        'https://oidc.ca-central-1.amazonaws.com/token',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        })
      );
    });

    test('should use existing refresh token if new one not provided', async () => {
      const mockResponse = {
        data: {
          accessToken: 'new-access-token',
          // No new refreshToken
          expiresIn: 3600,
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tokenRefresher.refreshToken(mockCredentials);

      expect(result.refreshToken).toBe('test-refresh-token'); // Original token
    });

    test('should calculate correct expiry time', async () => {
      const mockResponse = {
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        },
      };

      const beforeTime = Date.now();
      axios.post.mockResolvedValue(mockResponse);

      const result = await tokenRefresher.refreshToken(mockCredentials);

      const expiryTime = new Date(result.expiresAt).getTime();
      const expectedExpiry = beforeTime + 3600000; // 3600 seconds in ms

      // Allow 1 second tolerance for test execution time
      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(expiryTime).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    test('should throw error for invalid response (missing accessToken)', async () => {
      const mockResponse = {
        data: {
          // Missing accessToken
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Invalid response from OIDC endpoint'
      );
    });

    test('should throw error for invalid response (missing expiresIn)', async () => {
      const mockResponse = {
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          // Missing expiresIn
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Invalid response from OIDC endpoint'
      );
    });

    test('should handle invalid_grant error (400)', async () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Token expired',
          },
        },
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Refresh token is invalid or expired'
      );
      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'aws sso login --profile test-profile'
      );
    });

    test('should handle unauthorized error (401)', async () => {
      const mockError = {
        response: {
          status: 401,
          data: {
            error: 'unauthorized',
          },
        },
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Client credentials are invalid'
      );
    });

    test('should sanitize API response in error messages', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {
            error: 'server_error',
            accessToken: 'should-be-redacted',
            clientSecret: 'should-be-redacted',
            password: 'should-be-redacted',
          },
        },
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow('[REDACTED]');
      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.not.toThrow(
        'should-be-redacted'
      );
    });

    test('should handle network connection errors', async () => {
      const mockError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Network error: Cannot reach OIDC endpoint'
      );
    });

    test('should handle DNS resolution errors', async () => {
      const mockError = {
        code: 'ENOTFOUND',
        message: 'DNS lookup failed',
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Network error: Cannot reach OIDC endpoint'
      );
    });

    test('should handle timeout errors', async () => {
      const mockError = {
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Request timeout: OIDC endpoint'
      );
    });

    test('should handle request abort errors', async () => {
      const mockError = {
        name: 'CanceledError',
        message: 'Request canceled',
      };

      axios.post.mockRejectedValue(mockError);

      await expect(tokenRefresher.refreshToken(mockCredentials)).rejects.toThrow(
        'Token refresh canceled due to shutdown'
      );
    });
  });

  describe('refreshTokenWithRetry', () => {
    const mockCredentials = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      refreshToken: 'test-refresh-token',
    };

    test('should succeed on first attempt', async () => {
      const mockResponse = {
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tokenRefresher.refreshTokenWithRetry(mockCredentials);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should retry on transient network errors', async () => {
      const networkError = {
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      };

      const successResponse = {
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        },
      };

      // Fail first two attempts, succeed on third
      axios.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const result = await tokenRefresher.refreshTokenWithRetry(mockCredentials);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(axios.post).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout for retry delays

    test('should NOT retry on invalid_grant errors', async () => {
      const invalidGrantError = {
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
          },
        },
      };

      axios.post.mockRejectedValue(invalidGrantError);

      await expect(tokenRefresher.refreshTokenWithRetry(mockCredentials)).rejects.toThrow(
        'invalid or expired'
      );
      
      // Should only attempt once (no retries)
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should NOT retry on unauthorized errors', async () => {
      const unauthorizedError = {
        response: {
          status: 401,
          data: {
            error: 'unauthorized',
          },
        },
      };

      axios.post.mockRejectedValue(unauthorizedError);

      await expect(tokenRefresher.refreshTokenWithRetry(mockCredentials)).rejects.toThrow(
        'credentials are invalid'
      );
      
      // Should only attempt once (no retries)
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should NOT retry on shutdown cancellation', async () => {
      const canceledError = {
        name: 'CanceledError',
        message: 'Request canceled',
      };

      axios.post.mockRejectedValue(canceledError);

      await expect(tokenRefresher.refreshTokenWithRetry(mockCredentials)).rejects.toThrow(
        'canceled due to shutdown'
      );
      
      // Should only attempt once (no retries)
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should fail after max retry attempts', async () => {
      const networkError = {
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      };

      axios.post.mockRejectedValue(networkError);

      await expect(
        tokenRefresher.refreshTokenWithRetry(mockCredentials, 3)
      ).rejects.toThrow('Request timeout');
      
      // Should attempt 3 times (max attempts)
      expect(axios.post).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout for retry delays

    test('should respect custom max attempts parameter', async () => {
      const networkError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      axios.post.mockRejectedValue(networkError);

      await expect(
        tokenRefresher.refreshTokenWithRetry(mockCredentials, 2)
      ).rejects.toThrow();
      
      // Should attempt 2 times (custom max)
      expect(axios.post).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  describe('getTokenInfo', () => {
    test('should return non-sensitive token metadata', () => {
      const tokenData = {
        accessToken: 'sensitive-access-token',
        refreshToken: 'sensitive-refresh-token',
        expiresAt: '2026-01-27T10:30:00Z',
        expiresIn: 3600,
      };

      const info = tokenRefresher.getTokenInfo(tokenData);

      expect(info).toHaveProperty('expiresAt', '2026-01-27T10:30:00Z');
      expect(info).toHaveProperty('expiresIn', 3600);
      expect(info).toHaveProperty('hasAccessToken', true);
      expect(info).toHaveProperty('hasRefreshToken', true);
      
      // Should not include actual token values
      expect(info).not.toHaveProperty('accessToken');
      expect(info).not.toHaveProperty('refreshToken');
    });

    test('should indicate when tokens are missing', () => {
      const tokenData = {
        expiresAt: '2026-01-27T10:30:00Z',
        expiresIn: 3600,
      };

      const info = tokenRefresher.getTokenInfo(tokenData);

      expect(info.hasAccessToken).toBe(false);
      expect(info.hasRefreshToken).toBe(false);
    });
  });

  describe('cleanup', () => {
    test('should cleanup gracefully when called', () => {
      // Cleanup should not throw
      expect(() => tokenRefresher.cleanup()).not.toThrow();
    });
  });
});
