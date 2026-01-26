/**
 * Unit Tests for Logger Module
 * 
 * Tests logging functionality, custom log methods, and exception handling.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Logger Module', () => {
  let logger;
  let testLogDir;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temp log directory
    testLogDir = path.join(os.tmpdir(), `test-logs-${Date.now()}`);
    
    // Set up test environment
    process.env.AWS_SSO_PROFILE = 'test-profile';
    process.env.AWS_SSO_SESSION = 'test-session';
    process.env.AWS_REGION = 'ca-central-1';
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FILE = path.join(testLogDir, 'test.log');
    
    // Clear module cache and reload
    jest.resetModules();
    logger = require('../../src/logger');
  });

  afterEach(() => {
    // Clean up temp log directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    
    // Restore environment
    process.env = originalEnv;
  });

  describe('Logger Instance', () => {
    test('should create logger instance successfully', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    test('should create log directory if it does not exist', () => {
      expect(fs.existsSync(testLogDir)).toBe(true);
    });
  });

  describe('Custom Log Methods', () => {
    test('should have startup method', () => {
      expect(typeof logger.startup).toBe('function');
      expect(() => logger.startup('Test startup')).not.toThrow();
    });

    test('should have success method', () => {
      expect(typeof logger.success).toBe('function');
      expect(() => logger.success('Test success')).not.toThrow();
    });

    test('should have failure method', () => {
      expect(typeof logger.failure).toBe('function');
      expect(() => logger.failure('Test failure')).not.toThrow();
    });

    test('should have warning method', () => {
      expect(typeof logger.warning).toBe('function');
      expect(() => logger.warning('Test warning')).not.toThrow();
    });

    test('should have refresh method', () => {
      expect(typeof logger.refresh).toBe('function');
      expect(() => logger.refresh('Test refresh')).not.toThrow();
    });

    test('should have token method', () => {
      expect(typeof logger.token).toBe('function');
      expect(() => logger.token('Test token')).not.toThrow();
    });

    test('should accept metadata objects', () => {
      expect(() => logger.success('Test', { key: 'value' })).not.toThrow();
      expect(() => logger.failure('Test', { error: 'Something failed' })).not.toThrow();
    });
  });

  describe('Log Levels', () => {
    test('should log info level messages', () => {
      expect(() => logger.info('Info message')).not.toThrow();
    });

    test('should log debug level messages', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
    });

    test('should log warn level messages', () => {
      expect(() => logger.warn('Warning message')).not.toThrow();
    });

    test('should log error level messages', () => {
      expect(() => logger.error('Error message')).not.toThrow();
    });
  });

  describe('Metadata Logging', () => {
    test('should handle objects as metadata', () => {
      expect(() => 
        logger.info('Message with object', { userId: 123, action: 'test' })
      ).not.toThrow();
    });

    test('should handle nested objects as metadata', () => {
      expect(() => 
        logger.info('Nested metadata', { 
          user: { id: 123, name: 'test' },
          details: { timestamp: Date.now() }
        })
      ).not.toThrow();
    });

    test('should handle empty metadata objects', () => {
      expect(() => logger.info('Message', {})).not.toThrow();
    });
  });

  describe('Exception Handling', () => {
    test('should have exception handler configured', () => {
      expect(logger.exceptions).toBeDefined();
    });

    test('should have rejection handler configured', () => {
      expect(logger.rejections).toBeDefined();
    });
  });
});
