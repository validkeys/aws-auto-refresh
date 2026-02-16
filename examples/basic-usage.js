/**
 * Basic Usage Example
 *
 * Demonstrates the simplest way to start the token refresh daemon.
 * This is the equivalent of running: npm start
 *
 * Usage:
 *   node examples/basic-usage.js
 *
 * Prerequisites:
 *   - .env file configured with AWS_SSO_PROFILE and AWS_SSO_SESSION
 *   - Initial SSO login: aws sso login --profile your-profile
 */

const { startMonitoring, stopMonitoring } = require('../src/index');

async function main() {
  console.log('AWS SSO Token Refresh - Basic Usage Example');
  console.log('==========================================\n');

  try {
    // Start the monitoring loop
    // This will:
    // 1. Validate configuration
    // 2. Perform initial token check
    // 3. Start periodic checks (every 60s by default)
    // 4. Send macOS notification on startup
    await startMonitoring();

    console.log('✅ Daemon is now running!');
    console.log('📊 Tokens will be checked every 60 seconds');
    console.log('🔔 You\'ll receive notifications for important events');
    console.log('\nPress Ctrl+C to stop.\n');

    // Setup graceful shutdown
    // When user presses Ctrl+C (SIGINT), stop the daemon cleanly
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Stopping daemon...');
      stopMonitoring();

      // Give time for cleanup operations
      setTimeout(() => {
        console.log('✅ Daemon stopped successfully');
        process.exit(0);
      }, 1000);
    });

    // Keep the process running
    // Without this, the Node.js process would exit immediately
    process.stdin.resume();

  } catch (error) {
    // Handle startup errors
    console.error('❌ Failed to start daemon:', error.message);
    console.error('\nPossible issues:');
    console.error('  - Missing AWS_SSO_PROFILE or AWS_SSO_SESSION in .env');
    console.error('  - Haven\'t run: aws sso login --profile your-profile');
    console.error('  - AWS config file (~/.aws/config) not found\n');

    process.exit(1);
  }
}

// Run the example
main();
