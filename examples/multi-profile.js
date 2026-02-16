/**
 * Multi-Profile Example
 *
 * Demonstrates managing multiple AWS profiles simultaneously.
 * Each profile gets its own monitoring loop with independent token refresh.
 *
 * Usage:
 *   node examples/multi-profile.js
 *
 * Prerequisites:
 *   - Multiple AWS profiles configured in ~/.aws/config
 *   - SSO login performed for each profile
 *
 * Note: This example shows conceptual multi-profile support.
 * For production use, run separate daemon instances per profile
 * (see README "Multiple AWS Profiles" section).
 */

const { startMonitoring, stopMonitoring } = require('../src/index');

// Configuration for multiple profiles
// In production, these would come from environment variables or config files
const profiles = [
  {
    name: 'dev-profile',
    profile: 'AWS-Dev-Account',
    session: 'dev-session',
  },
  {
    name: 'staging-profile',
    profile: 'AWS-Staging-Account',
    session: 'staging-session',
  },
  {
    name: 'prod-profile',
    profile: 'AWS-Prod-Account',
    session: 'prod-session',
  },
];

/**
 * Simulates monitoring multiple profiles
 *
 * IMPORTANT: This is a conceptual example only!
 *
 * The current daemon is designed for single-profile monitoring.
 * For actual multi-profile support, you should:
 *
 * 1. Run separate daemon instances (recommended):
 *    - Copy project to separate directories
 *    - Configure each with unique PM2_APP_NAME
 *    - Start each instance independently
 *
 * 2. OR modify the daemon to support profile arrays:
 *    - Requires architectural changes
 *    - Need to track state per profile
 *    - More complex error handling
 */
async function monitorMultipleProfiles() {
  console.log('AWS SSO Token Refresh - Multi-Profile Example');
  console.log('=============================================\n');

  console.log('📋 Profiles to monitor:');
  profiles.forEach((profile, index) => {
    console.log(`  ${index + 1}. ${profile.name} (${profile.profile})`);
  });
  console.log();

  console.log('⚠️  IMPORTANT: Multi-profile monitoring requires running');
  console.log('    separate daemon instances. This example demonstrates');
  console.log('    the concept only.\n');

  console.log('📖 For actual multi-profile setup, see:');
  console.log('    README.md > Troubleshooting > Multiple AWS Profiles\n');

  console.log('🔧 Recommended approach:');
  console.log('    1. Create separate directories for each profile');
  console.log('    2. Copy aws-auto-refresh to each directory');
  console.log('    3. Configure unique PM2_APP_NAME in each .env');
  console.log('    4. Start each daemon independently:\n');

  profiles.forEach((profile) => {
    console.log(`       cd ~/aws-refresh/${profile.name}/aws-auto-refresh`);
    console.log(`       ./scripts/start.sh\n`);
  });

  console.log('    5. Verify all instances running:');
  console.log('       pm2 list\n');

  console.log('📊 Expected PM2 output:');
  console.log('┌─────┬──────────────────────────┬─────────┐');
  console.log('│ id  │ name                     │ status  │');
  console.log('├─────┼──────────────────────────┼─────────┤');
  profiles.forEach((profile, index) => {
    console.log(`│ ${index}   │ aws-sso-refresh-${profile.name.padEnd(7)} │ online  │`);
  });
  console.log('└─────┴──────────────────────────┴─────────┘\n');

  console.log('💡 Benefits of separate instances:');
  console.log('    - Clean isolation per profile');
  console.log('    - Independent failure handling');
  console.log('    - Simple to manage (standard PM2 commands)');
  console.log('    - Easy to add/remove profiles\n');

  console.log('Press Ctrl+C to exit this example.');

  // Keep process alive
  process.stdin.resume();

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n✅ Example completed');
    process.exit(0);
  });
}

// Run the example
monitorMultipleProfiles();
