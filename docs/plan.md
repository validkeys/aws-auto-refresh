# AWS SSO Token Refresh Automation - Implementation Plan

## Overview

Automate AWS SSO OIDC token refresh using a Node.js script that runs in the background, eliminating the need for frequent re-authentication.

## Prerequisites

- Node.js installed (v14 or higher)
- AWS SSO already configured and working
- Existing `clientId`, `clientSecret`, and `refreshToken` from AWS SSO
- Basic familiarity with terminal commands

## Implementation Steps

### Step 1: Create Project Directory

```bash
mkdir -p ~/aws-sso-token-refresh
cd ~/aws-sso-token-refresh
```

### Step 2: Initialize Node.js Project

```bash
npm init -y
npm install axios dotenv
```

### Step 3: Create Environment File

Create `.env` file with your AWS SSO credentials:

```bash
cat > .env << 'EOF'
AWS_SSO_CLIENT_ID=your-client-id
AWS_SSO_CLIENT_SECRET=your-client-secret
AWS_SSO_REFRESH_TOKEN=your-refresh-token
AWS_SSO_REGION=ca-central-1
EOF
```

**Note:** Replace the placeholder values with your actual credentials.

### Step 4: Create Token Refresh Script

Create `refresh-token.js`:

```javascript
require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TOKEN_FILE = path.join(__dirname, "token.json");
const API_ENDPOINT = `https://oidc.${process.env.AWS_SSO_REGION}.amazonaws.com/token`;

// Load existing tokens or initialize
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    }
  } catch (error) {
    console.error("Error loading tokens:", error.message);
  }
  return null;
}

// Save tokens to file
function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log("Tokens saved successfully");
  } catch (error) {
    console.error("Error saving tokens:", error.message);
  }
}

// Refresh access token
async function refreshToken() {
  const currentTokens = loadTokens();

  if (!currentTokens || !currentTokens.refreshToken) {
    console.error("No refresh token available. Please authenticate first.");
    return false;
  }

  try {
    const response = await axios.post(
      API_ENDPOINT,
      {
        grantType: "refresh_token",
        clientId: process.env.AWS_SSO_CLIENT_ID,
        clientSecret: process.env.AWS_SSO_CLIENT_SECRET,
        refreshToken: currentTokens.refreshToken,
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    const newTokens = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken || currentTokens.refreshToken,
      tokenType: response.data.tokenType,
      expiresIn: response.data.expiresIn,
      expiresAt: Date.now() + response.data.expiresIn * 1000,
      updatedAt: new Date().toISOString(),
    };

    saveTokens(newTokens);
    console.log(`✅ Token refreshed successfully at ${newTokens.updatedAt}`);
    console.log(
      `   Expires in ${response.data.expiresIn}s (${Math.round(response.data.expiresIn / 60)} minutes)`,
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Token refresh failed:",
      error.response?.data || error.message,
    );

    // If refresh token is invalid, user needs to re-authenticate
    if (error.response?.data?.error === "invalid_grant") {
      console.error(
        "⚠️  Refresh token expired or invalid. Please run initial authentication.",
      );
    }

    return false;
  }
}

// Check if token needs refresh
function shouldRefresh() {
  const tokens = loadTokens();
  if (!tokens) return true;

  // Refresh 5 minutes before expiration
  const timeUntilExpiry = tokens.expiresAt - Date.now();
  const refreshThreshold = 5 * 60 * 1000; // 5 minutes

  return timeUntilExpiry <= refreshThreshold;
}

// Main execution
async function main() {
  console.log("🔄 AWS SSO Token Refresh Service Started");
  console.log(`📍 Region: ${process.env.AWS_SSO_REGION}`);
  console.log(`⏰ Checking tokens every minute...\n`);

  // Initial refresh if needed
  if (shouldRefresh()) {
    await refreshToken();
  } else {
    const tokens = loadTokens();
    const minutesRemaining = Math.round(
      (tokens.expiresAt - Date.now()) / 60000,
    );
    console.log(`✅ Token is valid for ${minutesRemaining} minutes`);
  }

  // Check every minute
  setInterval(async () => {
    if (shouldRefresh()) {
      console.log(`\n⚠️  Token expiring soon, refreshing...`);
      await refreshToken();
    }
  }, 60 * 1000);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down token refresh service...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down token refresh service...");
  process.exit(0);
});

// Run the service
main().catch(console.error);
```

### Step 5: Create Initial Authentication Script

Create `auth.js` for initial setup:

```javascript
require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const TOKEN_FILE = path.join(__dirname, "token.json");
const API_ENDPOINT = `https://oidc.${process.env.AWS_SSO_REGION}.amazonaws.com/token`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function authorize() {
  console.log("🔐 AWS SSO Initial Authentication");
  console.log("Please provide the authorization code from the login flow.\n");

  const authCode = await new Promise((resolve) => {
    rl.question("Authorization Code: ", resolve);
  });

  try {
    const response = await axios.post(
      API_ENDPOINT,
      {
        grantType: "authorization_code",
        clientId: process.env.AWS_SSO_CLIENT_ID,
        clientSecret: process.env.AWS_SSO_CLIENT_SECRET,
        code: authCode,
        redirectUri:
          process.env.AWS_SSO_REDIRECT_URI || "http://localhost:8080",
      },
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    const tokens = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      tokenType: response.data.tokenType,
      expiresIn: response.data.expiresIn,
      expiresAt: Date.now() + response.data.expiresIn * 1000,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log("\n✅ Authentication successful!");
    console.log(`   Access token expires in ${response.data.expiresIn}s`);
    console.log(`   Refresh token saved to ${TOKEN_FILE}`);
    console.log(
      "\n🚀 You can now start the refresh service with: node refresh-token.js",
    );
  } catch (error) {
    console.error(
      "\n❌ Authentication failed:",
      error.response?.data || error.message,
    );
  }

  rl.close();
}

authorize();
```

### Step 6: Create Helper Scripts

#### `start.sh` - Start the service in background

```bash
#!/bin/bash
cd ~/aws-sso-token-refresh
nohup node refresh-token.js > refresh-token.log 2>&1 &
echo $! > refresh-token.pid
echo "✅ Token refresh service started (PID: $(cat refresh-token.pid))"
echo "📝 Logs: ~/aws-sso-token-refresh/refresh-token.log"
```

#### `stop.sh` - Stop the service

```bash
#!/bin/bash
cd ~/aws-sso-token-refresh
if [ -f refresh-token.pid ]; then
  kill $(cat refresh-token.pid)
  rm refresh-token.pid
  echo "✅ Token refresh service stopped"
else
  echo "⚠️  No PID file found. Service may not be running."
fi
```

#### `status.sh` - Check service status

```bash
#!/bin/bash
cd ~/aws-sso-token-refresh
if [ -f refresh-token.pid ]; then
  if ps -p $(cat refresh-token.pid) > /dev/null 2>&1; then
    echo "✅ Token refresh service is running (PID: $(cat refresh-token.pid))"
    if [ -f refresh-token.log ]; then
      echo "\n📝 Recent logs:"
      tail -n 10 refresh-token.log
    fi
    if [ -f token.json ]; then
      echo "\n🔑 Token status:"
      node -e "const t=require('./token.json'); const mins=Math.round((t.expiresAt-Date.now())/60000); console.log('  Expires in:', mins, 'minutes');"
    fi
  else
    echo "❌ Token refresh service is not running"
    rm refresh-token.pid
  fi
else
  echo "❌ Token refresh service is not running"
fi
```

#### `get-token.sh` - Get current access token

```bash
#!/bin/bash
cd ~/aws-sso-token-refresh
if [ -f token.json ]; then
  node -e "console.log(require('./token.json').accessToken)"
else
  echo "❌ No token file found. Please authenticate first."
  exit 1
fi
```

### Step 7: Make Scripts Executable

```bash
chmod +x start.sh stop.sh status.sh get-token.sh
```

## Usage Guide

### Initial Setup (One-time)

```bash
# 1. Complete steps 1-6 above

# 2. Authenticate to get initial tokens
node auth.js

# 3. Start the background service
./start.sh
```

### Daily Usage

```bash
# Check service status
./status.sh

# Get current access token for API calls
./get-token.sh

# Stop the service (if needed)
./stop.sh

# Restart the service
./stop.sh && ./start.sh
```

### View Logs

```bash
# Live log monitoring
tail -f ~/aws-sso-token-refresh/refresh-token.log

# View last 50 lines
tail -n 50 ~/aws-sso-token-refresh/refresh-token.log
```

## Integration with AWS CLI

### Option A: Use in scripts

```bash
#!/bin/bash
export AWS_ACCESS_TOKEN=$(~/aws-sso-token-refresh/get-token.sh)
# Use $AWS_ACCESS_TOKEN in your API calls
```

### Option B: Profile with token source

Add to `~/.aws/config`:

```ini
[profile sso-oidc]
credential_source = Http
token_url = http://localhost:8080/token
```

## Security Considerations

### Best Practices

- ✅ Store `.env` file securely (chmod 600)
- ✅ Use environment-specific credentials
- ✅ Regularly rotate client secrets
- ✅ Monitor token.json for unauthorized access
- ✅ Use appropriate file permissions (chmod 600 on sensitive files)

### File Permissions

```bash
chmod 600 ~/aws-sso-token-refresh/.env
chmod 600 ~/aws-sso-token-refresh/token.json
```

## Troubleshooting

### Issue: "No refresh token available"

**Cause:** Initial authentication not completed
**Solution:** Run `node auth.js` to get initial tokens

### Issue: "Refresh token expired or invalid"

**Cause:** Refresh token has expired (typically 30-90 days)
**Solution:** Run `node auth.js` to re-authenticate

### Issue: Service won't start

**Cause:** Port conflict or previous instance still running
**Solution:**

```bash
./stop.sh
./start.sh
```

### Issue: Token refresh failing

**Cause:** Invalid credentials or network issues
**Solution:**

1. Check `.env` credentials
2. Verify region is correct
3. Check network connectivity
4. Review logs: `tail -f refresh-token.log`

### Issue: "invalid_client" error

**Cause:** Incorrect clientId or clientSecret
**Solution:** Verify credentials in `.env` file

### Issue: "invalid_grant" error

**Cause:** Authorization code expired or refresh token invalid
**Solution:** Run `node auth.js` to get new tokens

## Monitoring and Maintenance

### Daily Checks

- Verify service is running: `./status.sh`
- Check logs for errors: `tail -n 50 refresh-token.log`
- Ensure tokens are refreshing correctly

### Monthly Maintenance

- Rotate client secrets in AWS SSO
- Update `.env` with new credentials
- Restart service: `./stop.sh && ./start.sh`

### When to Re-authenticate

- Refresh token expires (check `expiresAt` in token.json)
- Changed client credentials
- Security concerns about compromised tokens

## Alternative: Use AWS CLI Built-in Refresh

If you prefer not to maintain a custom script, AWS CLI v1.27.10+ and v2.9.0+ handle token refresh automatically:

```bash
# Update AWS CLI
brew upgrade awscli  # macOS
# or
pip install --upgrade awscli

# Configure profile
aws configure sso

# Use profile - auto-refreshes tokens
aws s3 ls --profile your-sso-profile
```

## Additional Resources

- [AWS SSO OIDC API Reference](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/Welcome.html)
- [AWS CLI Session Configuration](https://docs.aws.amazon.com/singlesignon/latest/userguide/configure-user-session.html)
- [OAuth 2.0 Refresh Tokens](https://oauth.net/2/refresh-tokens/)

## Success Criteria

- ✅ Service runs continuously in background
- ✅ Tokens refresh automatically before expiration
- ✅ No manual re-authentication required
- ✅ Logs available for troubleshooting
- ✅ Easy start/stop/status commands
- ✅ Secure credential storage

## Next Steps

1. Complete implementation steps 1-7
2. Run initial authentication: `node auth.js`
3. Start service: `./start.sh`
4. Monitor logs: `tail -f refresh-token.log`
5. Verify token refresh works by waiting > 1 hour
6. Integrate with your existing workflows

---

**Document Version:** 1.0
**Last Updated:** 2025-01-23
**Maintained By:** [Your Name]
