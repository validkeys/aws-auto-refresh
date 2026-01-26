/**
 * Unit Tests for Notifier Module
 * 
 * Tests notification functionality and configuration-based filtering.
 */

// Mock node-notifier before requiring the module
jest.mock('node-notifier', () => ({
  notify: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('Notifier Module', () => {
  let notifier;
  let mockNotify;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set up test environment
    process.env.AWS_SSO_PROFILE = 'test-profile';
    process.env.AWS_SSO_SESSION = 'test-session';
    process.env.AWS_REGION = 'ca-central-1';
    process.env.NOTIFY_ON_SUCCESS = 'true';
    process.env.NOTIFY_ON_ERROR = 'true';
    process.env.NOTIFY_ON_STARTUP = 'true';
    process.env.REFRESH_CHECK_INTERVAL = '60';
    
    // Clear module cache and reload
    jest.resetModules();
    jest.clearAllMocks();
    
    mockNotify = require('node-notifier').notify;
    notifier = require('../../src/notifier');
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('notifySuccess', () => {
    test('should send success notification when enabled', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const expiresIn = 3600;
      
      notifier.notifySuccess(expiresAt, expiresIn);
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Refreshed'),
          message: expect.stringContaining('test-profile'),
        })
      );
    });

    test('should NOT send notification when NOTIFY_ON_SUCCESS is false', () => {
      process.env.NOTIFY_ON_SUCCESS = 'false';
      jest.resetModules();
      const disabledNotifier = require('../../src/notifier');
      jest.clearAllMocks();
      
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const expiresIn = 3600;
      
      disabledNotifier.notifySuccess(expiresAt, expiresIn);
      
      expect(mockNotify).not.toHaveBeenCalled();
    });

    test('should format time correctly in notification', () => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const expiresIn = 3600;
      
      notifier.notifySuccess(expiresAt, expiresIn);
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.message).toContain('60 minutes');
    });
  });

  describe('notifyError', () => {
    test('should send error notification when enabled', () => {
      notifier.notifyError('Test error message');
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Failed'),
          message: expect.stringContaining('Test error message'),
          sound: 'Basso',
        })
      );
    });

    test('should NOT send notification when NOTIFY_ON_ERROR is false', () => {
      process.env.NOTIFY_ON_ERROR = 'false';
      jest.resetModules();
      const disabledNotifier = require('../../src/notifier');
      jest.clearAllMocks();
      
      disabledNotifier.notifyError('Test error');
      
      expect(mockNotify).not.toHaveBeenCalled();
    });

    test('should include profile name in error notification', () => {
      notifier.notifyError('Network timeout');
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.message).toContain('test-profile');
    });
  });

  describe('notifyStartup', () => {
    test('should send startup notification when enabled', () => {
      notifier.notifyStartup();
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Started'),
          message: expect.stringContaining('test-profile'),
        })
      );
    });

    test('should NOT send notification when NOTIFY_ON_STARTUP is false', () => {
      process.env.NOTIFY_ON_STARTUP = 'false';
      jest.resetModules();
      const disabledNotifier = require('../../src/notifier');
      jest.clearAllMocks();
      
      disabledNotifier.notifyStartup();
      
      expect(mockNotify).not.toHaveBeenCalled();
    });

    test('should include check interval in startup notification', () => {
      notifier.notifyStartup();
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.message).toContain('60s');
    });
  });

  describe('notifyExpiringSoon', () => {
    test('should send expiring soon notification', () => {
      notifier.notifyExpiringSoon(5);
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Expiring Soon'),
          message: expect.stringContaining('5 minutes'),
        })
      );
    });

    test('should include profile name', () => {
      notifier.notifyExpiringSoon(10);
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.message).toContain('test-profile');
    });
  });

  describe('notifyReloginRequired', () => {
    test('should send relogin notification with command', () => {
      notifier.notifyReloginRequired();
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Re-login Required'),
          message: expect.stringContaining('aws sso login'),
          sound: 'Basso',
        })
      );
    });

    test('should include correct profile in aws sso login command', () => {
      notifier.notifyReloginRequired();
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.message).toContain('--profile test-profile');
    });
  });

  describe('notifyShutdown', () => {
    test('should send shutdown notification', () => {
      notifier.notifyShutdown();
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Stopped'),
          message: expect.stringContaining('test-profile'),
        })
      );
    });
  });

  describe('notifyTest', () => {
    test('should send test notification', () => {
      notifier.notifyTest();
      
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Test'),
          message: expect.stringContaining('working'),
        })
      );
    });
  });

  describe('Notification Properties', () => {
    test('should set timeout on notifications', () => {
      notifier.notifyTest();
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.timeout).toBe(10);
    });

    test('should set wait to false for auto-dismiss', () => {
      notifier.notifyTest();
      
      const callArg = mockNotify.mock.calls[0][0];
      expect(callArg.wait).toBe(false);
    });
  });
});
