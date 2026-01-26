#!/bin/bash
# View logs for AWS SSO Token Refresh daemon

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env for PM2_APP_NAME
if [ -f .env ]; then
    source .env
fi

APP_NAME="${PM2_APP_NAME:-aws-sso-refresh}"

echo "📝 AWS SSO Token Refresh - Logs"
echo "==============================="
echo ""

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ pm2 is not installed"
    exit 1
fi

# Parse arguments
LINES=50
FOLLOW=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            LINES="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: ./scripts/logs.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --follow       Follow log output"
            echo "  -n, --lines NUM    Number of lines to show (default: 50)"
            echo "  -h, --help         Show this help message"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show logs
if [ "$FOLLOW" = true ]; then
    echo "Following logs (Ctrl+C to stop)..."
    echo ""
    pm2 logs "$APP_NAME" --lines "$LINES"
else
    echo "Showing last $LINES lines..."
    echo ""
    pm2 logs "$APP_NAME" --lines "$LINES" --nostream
fi
