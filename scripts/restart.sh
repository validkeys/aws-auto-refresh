#!/bin/bash
# Restart AWS SSO Token Refresh daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env for PM2_APP_NAME
if [ -f .env ]; then
    source .env
fi

APP_NAME="${PM2_APP_NAME:-aws-sso-refresh}"

echo "🔄 Restarting AWS SSO Token Refresh Daemon"
echo "=========================================="

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ pm2 is not installed"
    echo "   Please run: ./scripts/install.sh"
    exit 1
fi

# Check if daemon is running
if ! pm2 describe "$APP_NAME" &> /dev/null; then
    echo "⚠️  Daemon is not running - starting instead..."
    ./scripts/start.sh
    exit 0
fi

# Restart the daemon
echo "Restarting daemon..."
pm2 restart "$APP_NAME"

echo ""
echo "✅ Daemon restarted successfully!"
echo ""

# Show status
./scripts/status.sh

echo ""
echo "📝 View logs: ./scripts/logs.sh"
echo ""
