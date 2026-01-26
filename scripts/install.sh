#!/bin/bash
# Installation script for AWS SSO Token Refresh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 AWS SSO Token Refresh - Installation"
echo "========================================"
echo ""

cd "$PROJECT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm $(npm --version) found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Install pm2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "📦 Installing pm2 globally..."
    npm install -g pm2
else
    echo "✅ pm2 $(pm2 --version) already installed"
fi

# Create .env file if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo ""
    echo "📝 Creating .env file from template..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: You need to configure your .env file:"
    echo "   1. Edit .env: vim $PROJECT_DIR/.env"
    echo "   2. Set AWS_SSO_PROFILE to your profile name"
    echo "   3. Set AWS_SSO_SESSION to your SSO session name"
    echo ""
else
    echo "✅ .env file already exists"
fi

# Make scripts executable
echo ""
echo "🔧 Making scripts executable..."
chmod +x "$SCRIPT_DIR"/*.sh

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure .env file: vim .env"
echo "   2. Login to AWS SSO: aws sso login --profile <your-profile>"
echo "   3. Start the daemon: ./scripts/start.sh"
echo "   4. Check status: ./scripts/status.sh"
echo ""
