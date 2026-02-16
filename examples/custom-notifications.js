/**
 * Custom Notifications Example
 *
 * Demonstrates implementing custom notification handlers beyond macOS notifications.
 * Shows how to send notifications to Slack, email, SMS, or custom webhooks.
 *
 * Usage:
 *   node examples/custom-notifications.js
 *
 * Prerequisites:
 *   - .env file configured
 *   - Configure webhook URLs or API keys for notification services
 */

const { startMonitoring, stopMonitoring } = require('../src/index');
const cacheManager = require('../src/cache-manager');
const logger = require('../src/logger');

/**
 * Custom Notification Handler
 *
 * This class demonstrates how to implement custom notification logic
 * that runs alongside or instead of macOS notifications.
 */
class CustomNotificationHandler {
  constructor(options = {}) {
    this.slackWebhook = options.slackWebhook;
    this.emailEnabled = options.emailEnabled;
    this.smsEnabled = options.smsEnabled;
  }

  /**
   * Send notification to Slack
   */
  async sendSlackNotification(message, severity = 'info') {
    if (!this.slackWebhook) {
      logger.debug('Slack webhook not configured');
      return;
    }

    const colors = {
      success: '#36a64f', // Green
      error: '#ff0000',   // Red
      warning: '#ff9900', // Orange
      info: '#0099ff',    // Blue
    };

    const payload = {
      attachments: [{
        color: colors[severity] || colors.info,
        title: 'AWS SSO Token Refresh',
        text: message,
        footer: 'AWS Auto-Refresh Daemon',
        ts: Math.floor(Date.now() / 1000),
      }],
    };

    try {
      // Simulated Slack webhook call
      // In production, use: await axios.post(this.slackWebhook, payload);
      logger.info('📤 Would send to Slack:', { message, severity });
      console.log(`  [SLACK] ${severity.toUpperCase()}: ${message}`);
    } catch (error) {
      logger.error('Failed to send Slack notification', { error: error.message });
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(subject, body) {
    if (!this.emailEnabled) {
      logger.debug('Email notifications not enabled');
      return;
    }

    try {
      // Simulated email send
      // In production, use nodemailer or AWS SES:
      // await transporter.sendMail({ to: 'admin@example.com', subject, text: body });
      logger.info('📧 Would send email:', { subject });
      console.log(`  [EMAIL] ${subject}`);
      console.log(`          ${body.substring(0, 60)}...`);
    } catch (error) {
      logger.error('Failed to send email notification', { error: error.message });
    }
  }

  /**
   * Send SMS notification (for critical alerts only)
   */
  async sendSMSNotification(message) {
    if (!this.smsEnabled) {
      logger.debug('SMS notifications not enabled');
      return;
    }

    try {
      // Simulated SMS send
      // In production, use Twilio or AWS SNS:
      // await sns.publish({ PhoneNumber: '+1234567890', Message: message });
      logger.info('📱 Would send SMS:', { message });
      console.log(`  [SMS] ${message}`);
    } catch (error) {
      logger.error('Failed to send SMS notification', { error: error.message });
    }
  }

  /**
   * Custom webhook notification
   */
  async sendWebhook(event, data) {
    try {
      // Simulated webhook POST
      // In production, use: await axios.post('https://your-webhook.com', { event, data });
      logger.info('🔗 Would POST to webhook:', { event, data });
      console.log(`  [WEBHOOK] Event: ${event}`);
    } catch (error) {
      logger.error('Failed to send webhook notification', { error: error.message });
    }
  }
}

/**
 * Monitor token status and send custom notifications
 */
async function monitorWithCustomNotifications() {
  console.log('AWS SSO Token Refresh - Custom Notifications Example');
  console.log('====================================================\n');

  // Initialize custom notification handler
  const notifier = new CustomNotificationHandler({
    slackWebhook: process.env.SLACK_WEBHOOK_URL || null,
    emailEnabled: true,
    smsEnabled: false, // Only for critical alerts
  });

  console.log('📋 Notification Channels:');
  console.log(`  Slack: ${notifier.slackWebhook ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Email: ${notifier.emailEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  SMS: ${notifier.smsEnabled ? '✅ Enabled (critical only)' : '❌ Disabled'}`);
  console.log();

  console.log('🔄 Starting custom monitoring loop...\n');

  let lastStatus = null;
  let consecutiveFailures = 0;

  // Custom monitoring loop
  const monitoringInterval = setInterval(async () => {
    try {
      const status = await cacheManager.getTokenStatus();

      // Token successfully checked - reset failure counter
      if (!status.error) {
        consecutiveFailures = 0;
      }

      // Handle different token states
      if (status.error) {
        consecutiveFailures++;
        console.log(`❌ Error reading token: ${status.error}`);

        // Send notification on first error
        if (consecutiveFailures === 1) {
          await notifier.sendSlackNotification(
            `Token error: ${status.error}`,
            'error'
          );

          await notifier.sendEmailNotification(
            'AWS SSO Token Error',
            `The token refresh daemon encountered an error:\n\n${status.error}\n\nPlease run: aws sso login --profile ${process.env.AWS_SSO_PROFILE}`
          );
        }

        // Send SMS for persistent errors (3+ consecutive failures)
        if (consecutiveFailures >= 3) {
          await notifier.sendSMSNotification(
            `CRITICAL: AWS SSO token error persists after ${consecutiveFailures} attempts. Immediate action required.`
          );
        }

      } else if (status.expired) {
        console.log('❌ Token expired - re-login required');

        // Send notification if status changed
        if (lastStatus !== 'expired') {
          await notifier.sendSlackNotification(
            'AWS SSO token has expired. Re-login required.',
            'error'
          );

          await notifier.sendEmailNotification(
            'AWS SSO Token Expired',
            `Your AWS SSO token has expired.\n\nPlease run: aws sso login --profile ${process.env.AWS_SSO_PROFILE}`
          );

          await notifier.sendWebhook('token_expired', {
            profile: process.env.AWS_SSO_PROFILE,
            timestamp: new Date().toISOString(),
          });
        }

        lastStatus = 'expired';

      } else if (status.needsRefresh) {
        console.log(`🔄 Token needs refresh (${status.formattedTimeRemaining} remaining)`);

        // Send notification if status changed
        if (lastStatus !== 'refreshing') {
          await notifier.sendSlackNotification(
            `Token refresh starting (${status.formattedTimeRemaining} remaining)`,
            'warning'
          );
        }

        lastStatus = 'refreshing';

      } else {
        console.log(`✅ Token valid (${status.formattedTimeRemaining} remaining)`);

        // Send notification if status changed to valid
        if (lastStatus !== 'valid') {
          await notifier.sendSlackNotification(
            `Token is valid (${status.formattedTimeRemaining} remaining)`,
            'success'
          );

          // Send webhook on successful refresh
          if (lastStatus === 'refreshing') {
            await notifier.sendWebhook('token_refreshed', {
              profile: process.env.AWS_SSO_PROFILE,
              expiresAt: status.expiresAt,
              timestamp: new Date().toISOString(),
            });
          }
        }

        lastStatus = 'valid';
      }

      console.log();

    } catch (error) {
      console.error('❌ Monitoring error:', error.message);

      await notifier.sendSlackNotification(
        `Monitoring error: ${error.message}`,
        'error'
      );
    }
  }, 10000); // Check every 10 seconds

  console.log('Press Ctrl+C to stop monitoring.\n');

  // Keep process alive
  process.stdin.resume();

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping custom monitoring...');
    clearInterval(monitoringInterval);
    console.log('✅ Monitoring stopped\n');

    // Send shutdown notification
    notifier.sendSlackNotification('Token monitoring daemon stopped', 'info');

    process.exit(0);
  });
}

/**
 * Example: Integration with external monitoring systems
 */
async function integrateWithMonitoring() {
  console.log('Integration with External Monitoring');
  console.log('====================================\n');

  console.log('💡 This example shows how to integrate with:');
  console.log('  - Prometheus (metrics export)');
  console.log('  - Datadog (APM tracing)');
  console.log('  - PagerDuty (incident alerts)');
  console.log('  - New Relic (application monitoring)');
  console.log();

  console.log('Example integration patterns:\n');

  console.log('1. Prometheus Metrics:');
  console.log('   - Expose /metrics endpoint with token status');
  console.log('   - Track refresh success/failure rates');
  console.log('   - Monitor time until expiry\n');

  console.log('2. Datadog APM:');
  console.log('   - Trace token refresh operations');
  console.log('   - Log errors with context');
  console.log('   - Custom metrics for token lifecycle\n');

  console.log('3. PagerDuty:');
  console.log('   - Trigger incidents on persistent failures');
  console.log('   - Escalate critical token errors');
  console.log('   - Auto-resolve when token refreshes\n');

  console.log('4. New Relic:');
  console.log('   - Application performance monitoring');
  console.log('   - Error tracking and analysis');
  console.log('   - Custom events for token lifecycle\n');
}

/**
 * Main function
 */
async function main() {
  const mode = process.argv[2] || 'monitor';

  if (mode === 'integrate') {
    await integrateWithMonitoring();
  } else {
    await monitorWithCustomNotifications();
  }
}

// Run the example
if (require.main === module) {
  main();
}

// Export for use in other code
module.exports = {
  CustomNotificationHandler,
  monitorWithCustomNotifications,
  integrateWithMonitoring,
};
