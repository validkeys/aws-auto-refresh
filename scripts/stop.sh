#!/bin/bash
# Stop AWS SSO Token Refresh daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env for PM2_APP_NAME
if [ -f .env ]; then
    source .env
fi

APP_NAME="${PM2_APP_NAME:-aws-sso-refresh}"

echo "🛑 Stopping AWS SSO Token Refresh Daemon"
echo "========================================"

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ pm2 is not installed"
    exit 1
fi

# Check if daemon is running
if ! pm2 describe "$APP_NAME" &> /dev/null; then
    echo "⚠️  Daemon is not running"
    exit 0
fi

# Stop the daemon
echo "Stopping daemon..."
pm2 stop "$APP_NAME"

echo ""
echo "✅ Daemon stopped successfully!"
echo ""
echo "To start again: ./scripts/start.sh"
echo ""
