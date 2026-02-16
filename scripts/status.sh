#!/bin/bash
# Check status of AWS SSO Token Refresh daemon

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env for PM2_APP_NAME
if [ -f .env ]; then
    source .env
fi

APP_NAME="${PM2_APP_NAME:-aws-sso-refresh}"

echo "📊 AWS SSO Token Refresh - Status"
echo "================================="
echo ""

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ pm2 is not installed"
    exit 1
fi

# Check if daemon is running
if ! pm2 describe "$APP_NAME" &> /dev/null; then
    echo "❌ Daemon is not running"
    echo ""
    echo "To start: ./scripts/start.sh"
    exit 1
fi

# Show pm2 status
echo "🔧 Process Status:"
pm2 describe "$APP_NAME" | grep -E "status|uptime|restarts|memory|cpu" || pm2 list | grep "$APP_NAME"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show token status using Node.js
echo "🔑 Token Status:"
node -e "
const path = require('path');
require('dotenv').config();

(async () => {
  try {
    const cacheManager = require('./src/cache-manager');
    const status = await cacheManager.getTokenStatus();

    if (status.error) {
      console.log('  ❌ Error:', status.error);
    } else if (status.expired) {
      console.log('  ❌ Token expired!');
    } else if (status.needsRefresh) {
      console.log('  ⚠️  Token expires soon -', status.formattedTimeRemaining, 'remaining');
      console.log('  📅 Expires at:', new Date(status.expiresAt).toLocaleString());
    } else {
      console.log('  ✅ Token is valid');
      console.log('  ⏰ Time remaining:', status.formattedTimeRemaining);
      console.log('  📅 Expires at:', new Date(status.expiresAt).toLocaleString());
    }
  } catch (error) {
    console.log('  ❌ Error:', error.message);
  }
})();
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show recent log entries
if [ -f "logs/refresh.log" ]; then
    echo "📝 Recent Activity:"
    tail -n 5 logs/refresh.log 2>/dev/null | while IFS= read -r line; do
        echo "  $line"
    done
else
    echo "📝 No logs yet"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Commands:"
echo "  📝 View logs: ./scripts/logs.sh"
echo "  🔄 Restart: ./scripts/restart.sh"
echo "  🛑 Stop: ./scripts/stop.sh"
echo ""
