#!/bin/bash
# Start AWS SSO Token Refresh daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 Starting AWS SSO Token Refresh Daemon"
echo "========================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    echo "   Please run: ./scripts/install.sh"
    exit 1
fi

# Load .env to validate required vars
source .env

if [ -z "$AWS_SSO_PROFILE" ] || [ "$AWS_SSO_PROFILE" = "your-profile-name-here" ]; then
    echo "❌ AWS_SSO_PROFILE not configured in .env"
    echo "   Please edit .env and set your AWS profile name"
    exit 1
fi

if [ -z "$AWS_SSO_SESSION" ] || [ "$AWS_SSO_SESSION" = "your-sso-session-here" ]; then
    echo "❌ AWS_SSO_SESSION not configured in .env"
    echo "   Please edit .env and set your AWS SSO session name"
    exit 1
fi

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ pm2 is not installed"
    echo "   Please run: ./scripts/install.sh"
    exit 1
fi

# Check if already running
if pm2 describe "${PM2_APP_NAME:-aws-sso-refresh}" &> /dev/null; then
    echo "⚠️  Daemon is already running"
    echo "   Use ./scripts/restart.sh to restart"
    echo "   Use ./scripts/stop.sh to stop"
    exit 0
fi

# Start with pm2
echo ""
echo "Starting daemon..."
pm2 start ecosystem.config.js

echo ""
echo "✅ Daemon started successfully!"
echo ""

# Show status
./scripts/status.sh

echo ""
echo "📝 View logs: ./scripts/logs.sh"
echo "🛑 Stop daemon: ./scripts/stop.sh"
echo ""
