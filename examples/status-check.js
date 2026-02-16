/**
 * Status Check Example
 *
 * Demonstrates checking token status programmatically without starting the daemon.
 * Useful for monitoring scripts, health checks, and status dashboards.
 *
 * Usage:
 *   node examples/status-check.js
 *
 * Exit codes:
 *   0 - Token is valid
 *   1 - Token expired or needs refresh
 *   2 - Error reading token
 */

const cacheManager = require('../src/cache-manager');
const logger = require('../src/logger');

/**
 * Simple status check (for scripts)
 */
async function simpleStatusCheck() {
  console.log('AWS SSO Token Status Check');
  console.log('=========================\n');

  try {
    const status = await cacheManager.getTokenStatus();

    if (status.error) {
      console.log('❌ Error:', status.error);
      console.log('\nToken cannot be read. Please run:');
      console.log(`  aws sso login --profile ${process.env.AWS_SSO_PROFILE}`);
      process.exit(2);
    }

    if (status.expired) {
      console.log('❌ Token expired');
      console.log(`   Expired at: ${status.expiresAt}`);
      console.log('\nPlease run:');
      console.log(`  aws sso login --profile ${process.env.AWS_SSO_PROFILE}`);
      process.exit(1);
    }

    if (status.needsRefresh) {
      console.log('⚠️  Token needs refresh');
      console.log(`   Expires in: ${status.formattedTimeRemaining}`);
      console.log(`   Expires at: ${status.expiresAt}`);
      process.exit(1);
    }

    console.log('✅ Token is valid');
    console.log(`   Time remaining: ${status.formattedTimeRemaining}`);
    console.log(`   Expires at: ${status.expiresAt}`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Failed to check status:', error.message);
    process.exit(2);
  }
}

/**
 * Detailed status report
 */
async function detailedStatusReport() {
  console.log('AWS SSO Token - Detailed Status Report');
  console.log('======================================\n');

  try {
    // Get token status
    const status = await cacheManager.getTokenStatus();

    // Get cache file path
    const cachePath = await cacheManager.getCacheFilePath();

    console.log('📋 Configuration:');
    console.log(`   Profile: ${process.env.AWS_SSO_PROFILE || 'Not set'}`);
    console.log(`   Session: ${process.env.AWS_SSO_SESSION || 'Not set'}`);
    console.log(`   Region: ${process.env.AWS_REGION || 'Not set'}`);
    console.log(`   Cache: ${cachePath}`);
    console.log();

    console.log('🔑 Token Status:');

    if (status.error) {
      console.log(`   Status: ❌ Error`);
      console.log(`   Error: ${status.error}`);
      console.log();
      console.log('🔧 Troubleshooting:');
      console.log('   1. Ensure AWS CLI is installed');
      console.log('   2. Run initial SSO login:');
      console.log(`      aws sso login --profile ${process.env.AWS_SSO_PROFILE}`);
      console.log('   3. Verify ~/.aws/config has correct SSO configuration');
      process.exit(2);
    }

    console.log(`   Status: ${status.expired ? '❌ Expired' : status.needsRefresh ? '⚠️  Needs Refresh' : '✅ Valid'}`);
    console.log(`   Expires at: ${status.expiresAt}`);
    console.log(`   Time remaining: ${status.formattedTimeRemaining}`);
    console.log(`   Milliseconds until expiry: ${status.timeUntilExpiry}`);
    console.log();

    if (status.expired) {
      console.log('❌ Action Required:');
      console.log(`   Run: aws sso login --profile ${process.env.AWS_SSO_PROFILE}`);
      process.exit(1);
    }

    if (status.needsRefresh) {
      console.log('⚠️  Recommendation:');
      console.log('   Token should be refreshed soon');
      console.log('   Start the daemon to auto-refresh: ./scripts/start.sh');
      process.exit(1);
    }

    console.log('✅ No action needed - token is valid');
    process.exit(0);

  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(2);
  }
}

/**
 * JSON status output (for automation)
 */
async function jsonStatusOutput() {
  try {
    const status = await cacheManager.getTokenStatus();
    const cachePath = await cacheManager.getCacheFilePath().catch(() => 'unknown');

    const output = {
      profile: process.env.AWS_SSO_PROFILE,
      session: process.env.AWS_SSO_SESSION,
      cachePath,
      timestamp: new Date().toISOString(),
      status: {
        valid: !status.error && !status.expired && !status.needsRefresh,
        expired: status.expired,
        needsRefresh: status.needsRefresh,
        error: status.error || null,
      },
      token: {
        expiresAt: status.expiresAt || null,
        timeUntilExpiry: status.timeUntilExpiry || null,
        formattedTimeRemaining: status.formattedTimeRemaining || null,
      },
    };

    console.log(JSON.stringify(output, null, 2));

    // Exit code based on status
    if (output.status.error) {
      process.exit(2);
    } else if (output.status.expired || output.status.needsRefresh) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (error) {
    const errorOutput = {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(errorOutput, null, 2));
    process.exit(2);
  }
}

/**
 * Continuous status monitoring
 */
async function continuousMonitoring() {
  console.log('AWS SSO Token - Continuous Status Monitoring');
  console.log('============================================\n');

  console.log('Press Ctrl+C to stop\n');

  let checkCount = 0;

  const interval = setInterval(async () => {
    checkCount++;

    try {
      const status = await cacheManager.getTokenStatus();
      const timestamp = new Date().toLocaleTimeString();

      const statusIcon = status.error ? '❌' :
                        status.expired ? '❌' :
                        status.needsRefresh ? '⚠️' : '✅';

      const statusText = status.error ? 'Error' :
                        status.expired ? 'Expired' :
                        status.needsRefresh ? 'Needs Refresh' : 'Valid';

      console.log(`[${timestamp}] Check #${checkCount}: ${statusIcon} ${statusText}`, {
        timeRemaining: status.formattedTimeRemaining || 'N/A',
        expiresAt: status.expiresAt || 'N/A',
      });

    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Error:`, error.message);
    }
  }, 5000); // Check every 5 seconds

  // Keep process alive
  process.stdin.resume();

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\nMonitoring stopped');
    clearInterval(interval);
    process.exit(0);
  });
}

/**
 * Main function
 */
async function main() {
  const mode = process.argv[2] || 'simple';

  switch (mode) {
    case 'simple':
      await simpleStatusCheck();
      break;
    case 'detailed':
      await detailedStatusReport();
      break;
    case 'json':
      await jsonStatusOutput();
      break;
    case 'monitor':
      await continuousMonitoring();
      break;
    default:
      console.log('Usage: node examples/status-check.js [mode]');
      console.log();
      console.log('Modes:');
      console.log('  simple   - Quick status check (default)');
      console.log('  detailed - Detailed status report');
      console.log('  json     - JSON output for automation');
      console.log('  monitor  - Continuous monitoring');
      console.log();
      console.log('Exit codes:');
      console.log('  0 - Token is valid');
      console.log('  1 - Token expired or needs refresh');
      console.log('  2 - Error reading token');
      process.exit(0);
  }
}

// Run the example
if (require.main === module) {
  main();
}

// Export for use in other code
module.exports = {
  simpleStatusCheck,
  detailedStatusReport,
  jsonStatusOutput,
  continuousMonitoring,
};
