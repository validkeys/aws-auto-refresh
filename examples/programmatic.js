/**
 * Programmatic Usage Example
 *
 * Demonstrates using aws-auto-refresh as a library in your own code.
 * This is useful for integrating token refresh into custom applications.
 *
 * Usage:
 *   node examples/programmatic.js
 *
 * Prerequisites:
 *   - .env file configured with AWS_SSO_PROFILE and AWS_SSO_SESSION
 *   - Initial SSO login: aws sso login --profile your-profile
 */

const { startMonitoring, stopMonitoring, refreshTokenIfNeeded } = require('../src/index');
const cacheManager = require('../src/cache-manager');
const logger = require('../src/logger');

/**
 * Example 1: Start daemon programmatically with custom configuration
 */
async function example1_StartDaemon() {
  console.log('Example 1: Starting Daemon Programmatically');
  console.log('===========================================\n');

  try {
    // You can override environment variables before starting
    // (Useful for testing or multi-profile scenarios)
    process.env.LOG_LEVEL = 'debug';
    process.env.REFRESH_CHECK_INTERVAL = '30'; // 30 seconds

    console.log('Starting daemon with custom settings...');
    console.log('  - Log level: debug');
    console.log('  - Check interval: 30 seconds\n');

    await startMonitoring();

    console.log('✅ Daemon started successfully!\n');

    // Simulate running for 10 seconds, then stop
    console.log('Running for 10 seconds...');
    setTimeout(() => {
      console.log('\nStopping daemon...');
      stopMonitoring();
      console.log('✅ Daemon stopped\n');
    }, 10000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Example 2: Check token status without starting daemon
 */
async function example2_CheckStatus() {
  console.log('Example 2: Checking Token Status');
  console.log('=================================\n');

  try {
    const status = await cacheManager.getTokenStatus();

    if (status.error) {
      console.log('❌ Error reading token:', status.error);
      return;
    }

    console.log('📊 Token Status:');
    console.log(`  Expires at: ${status.expiresAt}`);
    console.log(`  Time remaining: ${status.formattedTimeRemaining}`);
    console.log(`  Expired: ${status.expired ? 'Yes ❌' : 'No ✅'}`);
    console.log(`  Needs refresh: ${status.needsRefresh ? 'Yes 🔄' : 'No ✅'}`);
    console.log();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Example 3: Manually trigger token refresh
 */
async function example3_ManualRefresh() {
  console.log('Example 3: Manual Token Refresh');
  console.log('================================\n');

  try {
    console.log('Checking if token needs refresh...');

    // This function checks token and refreshes if needed
    await refreshTokenIfNeeded();

    console.log('✅ Token refresh check completed\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Example 4: Monitor token and perform action when refresh needed
 */
async function example4_CustomMonitoring() {
  console.log('Example 4: Custom Token Monitoring');
  console.log('===================================\n');

  try {
    console.log('Setting up custom monitoring loop...\n');

    let checkCount = 0;

    // Custom monitoring loop (runs 3 times)
    const interval = setInterval(async () => {
      checkCount++;
      console.log(`Check #${checkCount}:`);

      const status = await cacheManager.getTokenStatus();

      if (status.error) {
        console.log(`  ❌ Error: ${status.error}`);
      } else if (status.expired) {
        console.log('  ❌ Token expired - re-login required');
      } else if (status.needsRefresh) {
        console.log(`  🔄 Token needs refresh (${status.formattedTimeRemaining} remaining)`);
        console.log('  Refreshing now...');
        await refreshTokenIfNeeded();
        console.log('  ✅ Refresh completed');
      } else {
        console.log(`  ✅ Token valid (${status.formattedTimeRemaining} remaining)`);
      }

      console.log();

      // Stop after 3 checks
      if (checkCount >= 3) {
        clearInterval(interval);
        console.log('Custom monitoring completed\n');
      }
    }, 5000); // Check every 5 seconds

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Example 5: Integration with application lifecycle
 */
async function example5_ApplicationIntegration() {
  console.log('Example 5: Application Integration');
  console.log('===================================\n');

  try {
    console.log('Simulating application startup...\n');

    // 1. Ensure token is valid before starting application
    console.log('Step 1: Verify token is valid');
    const status = await cacheManager.getTokenStatus();

    if (status.error || status.expired) {
      throw new Error('Token invalid or expired. Please run: aws sso login');
    }

    console.log('  ✅ Token is valid\n');

    // 2. Start token refresh daemon
    console.log('Step 2: Start token refresh daemon');
    await startMonitoring();
    console.log('  ✅ Daemon running\n');

    // 3. Run your application
    console.log('Step 3: Run application logic');
    console.log('  (Your application code runs here)');
    console.log('  Tokens will be refreshed automatically in background\n');

    // 4. Cleanup on shutdown
    console.log('Simulating application shutdown in 5 seconds...');
    setTimeout(() => {
      console.log('\nStep 4: Cleanup on shutdown');
      stopMonitoring();
      console.log('  ✅ Daemon stopped');
      console.log('  ✅ Application shutdown complete\n');
    }, 5000);

  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    console.error('Application cannot start without valid AWS credentials\n');
  }
}

/**
 * Main function - runs all examples sequentially
 */
async function main() {
  console.log('AWS SSO Token Refresh - Programmatic Usage Examples');
  console.log('===================================================\n');

  console.log('This example demonstrates various ways to use aws-auto-refresh');
  console.log('as a library in your own code.\n');

  console.log('Choose an example to run:');
  console.log('  1. Start daemon programmatically');
  console.log('  2. Check token status');
  console.log('  3. Manual token refresh');
  console.log('  4. Custom monitoring loop');
  console.log('  5. Application integration pattern\n');

  // Get example number from command line args, default to 2 (status check)
  const exampleNum = parseInt(process.argv[2]) || 2;

  console.log(`Running Example ${exampleNum}...\n`);
  console.log('='.repeat(60));
  console.log();

  switch (exampleNum) {
    case 1:
      await example1_StartDaemon();
      // Keep process alive for daemon
      process.stdin.resume();
      break;
    case 2:
      await example2_CheckStatus();
      break;
    case 3:
      await example3_ManualRefresh();
      break;
    case 4:
      await example4_CustomMonitoring();
      // Keep process alive for monitoring loop
      process.stdin.resume();
      break;
    case 5:
      await example5_ApplicationIntegration();
      // Keep process alive for daemon
      process.stdin.resume();
      break;
    default:
      console.log('Invalid example number. Choose 1-5.');
  }

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n✅ Example completed');
    stopMonitoring();
    process.exit(0);
  });
}

// Run the main function
if (require.main === module) {
  main();
}

// Export functions for use in other code
module.exports = {
  example1_StartDaemon,
  example2_CheckStatus,
  example3_ManualRefresh,
  example4_CustomMonitoring,
  example5_ApplicationIntegration,
};
