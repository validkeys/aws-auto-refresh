# AWS SSO Token Auto-Refresh

Automatically refresh AWS SSO tokens in the background, eliminating the need for frequent manual re-authentication during your workday.

## Overview

When using AWS SSO, access tokens typically expire after 1 hour, forcing you to repeatedly run `aws sso login`. This daemon monitors your AWS SSO token and automatically refreshes it before expiration, keeping you authenticated throughout the day.

### Features

- 🔄 **Automatic token refresh** - No more "SSO token expired" errors mid-work
- 🔔 **macOS notifications** - Get notified on refresh success/failure
- 📊 **Comprehensive monitoring** - Track token status and refresh history
- ⚙️ **Fully configurable** - All settings via environment variables
- 🛡️ **Secure** - Works directly with AWS CLI cache, no credential storage
- 🚀 **Production-ready** - pm2 managed with auto-restart and logging
- 📝 **Rich logging** - Structured logs with automatic rotation

## How It Works

```
┌─────────────────┐
│   AWS CLI       │
│  aws sso login  │ (one-time manual login)
└────────┬────────┘
         │ writes tokens
         ▼
┌─────────────────────────────┐
│ ~/.aws/sso/cache/           │
│ <sha1-hash>.json            │ ◄────┐
│ (SHA1 of SSO start URL)     │      │
│                             │      │
│  - accessToken              │      │
│  - refreshToken             │      │
│  - clientId/clientSecret    │      │
│  - expiresAt                │      │
└─────────────────────────────┘      │
         ▲                            │
         │ reads & updates            │ refreshes
         │                            │
┌────────┴─────────┐                 │
│  Daemon Process  │─────────────────┘
│  (pm2 managed)   │
│                  │
│  - Monitors      │
│  - Refreshes     │
│  - Notifies      │
└──────────────────┘
```

## Prerequisites

- **Node.js** v14 or higher
- **AWS CLI** configured with SSO
- **macOS** (for notifications - works on Linux/Windows without notifications)
- Existing AWS SSO profile configured

## Quick Start

### 1. Installation

```bash
# Clone or download this repository
cd ~/Sites/aws-auto-refresh

# Run installation script
./scripts/install.sh
```

This will:
- Install npm dependencies
- Install pm2 globally
- Create `.env` from template
- Make scripts executable

### 2. Configuration

Edit `.env` and set your AWS profile:

```bash
vim .env
```

**Required settings:**
```bash
AWS_SSO_PROFILE=my-aws-profile
AWS_SSO_SESSION=my-sso-session
```

You can find these values in `~/.aws/config`:
```ini
[profile my-aws-profile]
sso_session = my-sso-session
sso_account_id = 123456789012
sso_role_name = MyRoleName
region = us-east-1

[sso-session my-sso-session]
sso_start_url = https://my-organization.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

### 3. Login to AWS SSO (one-time)

```bash
aws sso login --profile my-aws-profile
```

This creates the initial token cache that the daemon will maintain.

### 4. Start the Daemon

```bash
./scripts/start.sh
```

That's it! The daemon is now running and will keep your tokens fresh.

## Usage

### Check Status

```bash
./scripts/status.sh
```

Output:
```
📊 AWS SSO Token Refresh - Status
=================================

🔧 Process Status:
  status            : online
  uptime            : 2h 15m
  restarts          : 0
  memory            : 45.2MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 Token Status:
  ✅ Token is valid
  ⏰ Time remaining: 45m
  📅 Expires at: 1/24/2026, 2:30:00 PM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Recent Activity:
  2026-01-24 13:45:23 [info] 🔄 Token expires in 4 minutes - refreshing now
  2026-01-24 13:45:24 [info] ✅ Token refresh successful
```

### View Logs

```bash
# View last 50 lines
./scripts/logs.sh

# Follow logs in real-time
./scripts/logs.sh --follow

# View last 100 lines
./scripts/logs.sh --lines 100
```

### Restart Daemon

```bash
./scripts/restart.sh
```

Useful after changing `.env` configuration.

### Stop Daemon

```bash
./scripts/stop.sh
```

### Use AWS CLI

Just use AWS CLI normally - tokens are kept fresh automatically!

```bash
# No need to run aws sso login anymore!
aws s3 ls --profile my-aws-profile
aws sts get-caller-identity --profile my-aws-profile
aws ec2 describe-instances --profile my-aws-profile
```

## Configuration Reference

All configuration is done via environment variables in `.env`:

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_SSO_PROFILE` | Your AWS profile name | `my-aws-profile` |
| `AWS_SSO_SESSION` | Your SSO session name | `my-sso-session` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_SSO_CACHE_DIR` | AWS SSO cache directory | `~/.aws/sso/cache` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `REFRESH_CHECK_INTERVAL` | Check interval (seconds) | `60` |
| `REFRESH_THRESHOLD` | Refresh before expiry (seconds) | `300` (5 min) |
| `MAX_RETRY_ATTEMPTS` | Retry failed refreshes | `3` |
| `RETRY_BACKOFF_SECONDS` | Wait between retries | `10` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `LOG_FILE` | Log file path | `./logs/refresh.log` |
| `LOG_MAX_SIZE` | Max log file size | `10M` |
| `LOG_MAX_FILES` | Number of log files to keep | `5` |
| `NOTIFY_ON_SUCCESS` | Notify on refresh success | `false` |
| `NOTIFY_ON_ERROR` | Notify on refresh error | `true` |
| `NOTIFY_ON_STARTUP` | Notify when daemon starts | `true` |
| `NOTIFY_SOUND` | macOS notification sound | `default` |

## Notifications

The daemon sends macOS notifications for important events:

- ✅ **Token Refreshed** - When token is successfully refreshed (optional)
- ❌ **Refresh Failed** - When token refresh fails
- ⚠️ **Expiring Soon** - When token is about to expire
- 🔐 **Re-login Required** - When refresh token has expired
- 🚀 **Daemon Started** - When daemon starts (optional)

## Troubleshooting

### Daemon won't start

**Check configuration:**
```bash
cat .env
# Ensure AWS_SSO_PROFILE and AWS_SSO_SESSION are set correctly
```

**Check if already running:**
```bash
pm2 list
```

**View error logs:**
```bash
./scripts/logs.sh
```

### Token not refreshing

**Verify cache file exists:**
```bash
ls -la ~/.aws/sso/cache/
```

**Check daemon logs:**
```bash
./scripts/logs.sh --follow
```

**Try manual login:**
```bash
aws sso login --profile <your-profile>
./scripts/restart.sh
```

### AWS CLI still says token expired

**Check profile name matches:**
```bash
grep AWS_SSO_PROFILE .env
cat ~/.aws/config | grep profile
```

**Verify cache file is being updated:**
```bash
./scripts/status.sh
```

### "Refresh token invalid" error

The refresh token has expired (typically 90 days). Re-login:

```bash
aws sso login --profile <your-profile>
./scripts/restart.sh
```

### High CPU or memory usage

Check for issues:
```bash
pm2 monit
```

Restart daemon:
```bash
./scripts/restart.sh
```

### Multiple AWS Profiles

**Q: How do I monitor multiple AWS profiles simultaneously?**

A: Run a separate daemon instance for each profile. Here's a complete setup guide:

**Step 1: Create separate directories**
```bash
# Create parent directory for all profile instances
mkdir -p ~/aws-refresh

# Create directory for each profile
mkdir -p ~/aws-refresh/profile-dev
mkdir -p ~/aws-refresh/profile-prod
mkdir -p ~/aws-refresh/profile-staging
```

**Step 2: Copy project to each directory**
```bash
# Copy entire project to each profile directory
cp -r ~/Sites/aws-auto-refresh ~/aws-refresh/profile-dev/
cp -r ~/Sites/aws-auto-refresh ~/aws-refresh/profile-prod/
cp -r ~/Sites/aws-auto-refresh ~/aws-refresh/profile-staging/
```

**Step 3: Configure each instance**
```bash
# Configure dev profile
cd ~/aws-refresh/profile-dev/aws-auto-refresh
cp .env.example .env
vim .env
```

Edit `.env` for dev profile:
```bash
# Required: Set your dev profile details
AWS_SSO_PROFILE=my-aws-dev-profile
AWS_SSO_SESSION=my-sso-session

# IMPORTANT: Use unique PM2 app name to avoid conflicts
PM2_APP_NAME=aws-sso-refresh-dev

# Optional: Use different log file
LOG_FILE=./logs/refresh-dev.log
```

Repeat for prod profile:
```bash
cd ~/aws-refresh/profile-prod/aws-auto-refresh
cp .env.example .env
vim .env
```

Edit `.env` for prod profile:
```bash
AWS_SSO_PROFILE=my-aws-prod-profile
AWS_SSO_SESSION=my-sso-session

# Different PM2 app name
PM2_APP_NAME=aws-sso-refresh-prod

LOG_FILE=./logs/refresh-prod.log
```

**Step 4: Login to each profile**
```bash
# Login to dev
aws sso login --profile my-aws-dev-profile

# Login to prod  
aws sso login --profile my-aws-prod-profile

# Login to staging
aws sso login --profile my-aws-staging-profile
```

**Step 5: Start all daemons**
```bash
# Start dev daemon
cd ~/aws-refresh/profile-dev/aws-auto-refresh && ./scripts/start.sh

# Start prod daemon
cd ~/aws-refresh/profile-prod/aws-auto-refresh && ./scripts/start.sh

# Start staging daemon
cd ~/aws-refresh/profile-staging/aws-auto-refresh && ./scripts/start.sh
```

**Step 6: Verify all instances are running**
```bash
pm2 list
```

Expected output:
```
┌─────┬──────────────────────────┬─────────┬─────────┬─────────┐
│ id  │ name                     │ status  │ cpu     │ memory  │
├─────┼──────────────────────────┼─────────┼─────────┼─────────┤
│ 0   │ aws-sso-refresh-dev      │ online  │ 0%      │ 45.2 MB │
│ 1   │ aws-sso-refresh-prod     │ online  │ 0%      │ 44.8 MB │
│ 2   │ aws-sso-refresh-staging  │ online  │ 0%      │ 45.5 MB │
└─────┴──────────────────────────┴─────────┴─────────┴─────────┘
```

**Managing multiple instances:**
```bash
# Check status of specific profile
cd ~/aws-refresh/profile-dev/aws-auto-refresh && ./scripts/status.sh

# View logs for specific profile
pm2 logs aws-sso-refresh-dev
pm2 logs aws-sso-refresh-prod

# Restart specific profile
pm2 restart aws-sso-refresh-dev

# Stop specific profile
pm2 stop aws-sso-refresh-prod

# Stop all profiles
pm2 stop all
```

**Troubleshooting multi-profile setup:**

**Profile names conflict:**
```bash
# Ensure PM2_APP_NAME is unique in each .env file
grep PM2_APP_NAME ~/aws-refresh/*/aws-auto-refresh/.env

# If duplicates found, edit and use unique names
```

**Wrong tokens being refreshed:**
```bash
# Verify each daemon is using correct profile
pm2 logs aws-sso-refresh-dev --lines 20 | grep "AWS_SSO_PROFILE"

# Check .env configuration
cat ~/aws-refresh/profile-dev/aws-auto-refresh/.env | grep AWS_SSO_PROFILE
```

**Cache file conflicts:**
Each profile uses a different cache file (based on SHA1 of SSO start URL), so there should be no conflicts. Verify:
```bash
# List all cache files
ls -la ~/.aws/sso/cache/

# Each profile should have its own cache file
```

**Alternative: Docker containers (advanced)**

For cleaner isolation, run each profile in a Docker container:

```bash
# Create Dockerfile
cat > Dockerfile <<EOF
FROM node:14-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "src/index.js"]
EOF

# Run dev profile container
docker run -d \
  --name aws-sso-dev \
  -v ~/.aws:/root/.aws \
  -e AWS_SSO_PROFILE=my-aws-dev-profile \
  -e AWS_SSO_SESSION=my-sso-session \
  aws-sso-refresh

# Run prod profile container  
docker run -d \

  --name aws-sso-prod \
  -v ~/.aws:/root/.aws \
  -e AWS_SSO_PROFILE=my-aws-prod-profile \
  -e AWS_SSO_SESSION=my-sso-session \
  aws-sso-refresh
```

Note: macOS notifications won't work inside Docker containers.

## Advanced Usage

### Auto-start on boot (macOS)

```bash
# Save pm2 configuration
pm2 save

# Setup startup script
pm2 startup
# Follow the instructions shown

# Verify
pm2 list
```

Now the daemon will start automatically when you login.

### Debug mode

For verbose logging:

```bash
# Edit .env
LOG_LEVEL=debug

# Restart daemon
./scripts/restart.sh

# View detailed logs
./scripts/logs.sh --follow
```

### Custom refresh interval

To check tokens more/less frequently:

```bash
# Edit .env
REFRESH_CHECK_INTERVAL=30  # Check every 30 seconds

# Or less frequently
REFRESH_CHECK_INTERVAL=120  # Check every 2 minutes

# Restart
./scripts/restart.sh
```

### Custom refresh threshold

To refresh earlier/later before expiration:

```bash
# Edit .env
REFRESH_THRESHOLD=600  # Refresh 10 minutes before expiry

# Or later
REFRESH_THRESHOLD=60  # Refresh 1 minute before expiry

# Restart
./scripts/restart.sh
```

## Architecture

### Project Structure

```
aws-auto-refresh/
├── .env                      # Your configuration (git-ignored)
├── .env.example              # Configuration template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies
├── ecosystem.config.js      # pm2 configuration
├── src/
│   ├── index.js            # Main daemon entry point (227 lines)
│   ├── config.js           # Config loader & validator (192 lines)
│   ├── logger.js           # Winston logging setup (153 lines)
│   ├── cache-manager.js    # AWS SSO cache reader/writer (372 lines)
│   ├── token-refresher.js  # OIDC token refresh logic (239 lines)
│   └── notifier.js         # macOS notification manager (172 lines)
├── scripts/
│   ├── install.sh          # Installation script
│   ├── start.sh            # Start daemon
│   ├── stop.sh             # Stop daemon
│   ├── restart.sh          # Restart daemon
│   ├── status.sh           # Check status
│   └── logs.sh             # View logs
├── logs/                    # Log files (auto-created, git-ignored)
└── README.md               # This file
```

### Components

**config.js** - Configuration Management
- Loads and validates environment variables from `.env`
- Applies sensible defaults for optional settings
- Validates required fields (profile, session, region)
- Expands home directory paths (`~/.aws/sso/cache`)
- Converts time intervals to milliseconds
- Provides configuration summary for logging

**logger.js** - Logging Infrastructure  
- Winston-based structured logging with JSON format
- Daily log rotation with configurable retention
- Separate console (human-readable) and file (JSON) formats
- Custom log methods (startup, success, failure, refresh, token)
- Exception and rejection handling
- Log levels: debug, info, warn, error

**cache-manager.js** - AWS Cache Integration
- Reads AWS config file (`~/.aws/config`) to find SSO settings
- Computes cache filename (SHA1 of SSO start URL)
- Reads/validates cache file structure
- Atomic writes with backup/restore on failure
- Token expiry calculations and threshold checking
- Human-readable time formatting

**token-refresher.js** - OIDC Token Refresh
- Posts to AWS OIDC endpoint with refresh token grant
- Validates response structure before using
- Comprehensive error handling (network, auth, timeout)
- Retry logic with linear backoff
- Distinguishes retryable vs non-retryable errors
- Never logs sensitive token data

**notifier.js** - User Notifications
- Native macOS notification center integration
- Configurable notification types (success, error, warning, info)
- Auto-dismiss after timeout
- Custom sounds per notification type
- Configuration-based filtering

**index.js** - Main Daemon Process
- Validates configuration on startup
- Sets up signal handlers (SIGINT, SIGTERM)
- Implements monitoring loop with configurable interval
- Coordinates all modules to refresh tokens
- Tracks consecutive failures
- Handles graceful shutdown

### Data Flow

1. **Startup**: Validate config → Setup handlers → Start monitoring
2. **Check Loop**: Read cache → Check expiry → Refresh if needed
3. **Refresh**: Extract credentials → Call OIDC API → Update cache
4. **Notify**: Send macOS notification based on outcome
5. **Repeat**: Wait for next interval and check again
6. **Shutdown**: Stop monitoring → Notify user → Exit

## Security

### Security Best Practices

This daemon follows enterprise security best practices:

- ✅ **No credential storage** - Uses AWS CLI cache directly, never stores credentials
- ✅ **Atomic file writes** - Prevents cache corruption with backup/restore mechanism
- ✅ **No tokens in logs** - Only metadata logged, never actual token values
- ✅ **Secure file permissions** - Cache files kept at 600 (user read/write only)
- ✅ **Process isolation** - Runs as your user, no elevated privileges required
- ✅ **HTTPS only** - All OIDC API calls use HTTPS
- ✅ **Input validation** - All configuration validated before use
- ✅ **Safe error messages** - Error messages never expose sensitive data

### What Gets Logged

**Safe to log (metadata only):**
- Token expiry timestamps
- Token validity flags (hasAccessToken: true/false)
- Refresh success/failure status
- Configuration values (non-sensitive)

**Never logged:**
- Actual access tokens
- Refresh tokens  
- Client secrets
- Any JWT token contents

### Git Security

The `.gitignore` file excludes:
- `.env` - Contains your profile/session names
- `logs/` - May contain operational data
- `*.backup` - Cache backup files
- `*.tmp` - Temporary cache files
- `.pm2/` - PM2 runtime data

**Never commit:**
- Your `.env` file
- AWS credentials or tokens
- Log files
- Cache files

## FAQ

**Q: Does this work with multiple AWS profiles?**  
A: Yes! To monitor multiple profiles simultaneously, run a separate daemon instance for each profile. See the [Multiple AWS Profiles](#multiple-aws-profiles) section in Troubleshooting for a complete setup guide including:
- Directory structure setup
- Configuration with unique PM2_APP_NAME per profile
- Starting and managing multiple instances
- Docker alternative for cleaner isolation

**Q: What happens if my laptop sleeps?**  
A: The daemon will check the token immediately when it wakes up and refresh if needed. Token expiry is based on absolute timestamps, not elapsed runtime.

**Q: Does this work on Linux/Windows?**  
A: Yes! All functionality works except macOS notifications. On Linux, you could adapt `notifier.js` to use `libnotify`. On Windows, use Windows notification API.

**Q: Can I use this in CI/CD?**  
A: Not recommended. This is designed for developer workstations. For CI/CD, use:
- IAM roles (recommended)
- GitHub OIDC provider
- AWS temporary credentials via STS

**Q: How much resources does it use?**  
A: Minimal:
- Memory: ~40-50MB RAM
- CPU: Negligible (only active during token checks, ~1 second per minute)
- Disk: Log files rotate, max ~50MB with default settings
- Network: One HTTPS request per token refresh

**Q: What if the refresh token expires?**  
A: Refresh tokens typically last 90 days. When expired:
1. You'll get a notification: "Re-login Required"
2. Run: `aws sso login --profile <profile>`
3. Daemon will automatically pick up new tokens

**Q: Can I refresh tokens manually while daemon is running?**  
A: Yes! If you run `aws sso login` manually, the daemon will detect and use the new tokens on its next check cycle.

**Q: What happens if AWS OIDC endpoint is down?**  
A: The daemon will:
1. Retry up to MAX_RETRY_ATTEMPTS times with backoff
2. Log the errors
3. Send notification
4. Continue monitoring (will retry on next interval)

**Q: How do I know if it's working?**  
A: Multiple ways:
- Check status: `./scripts/status.sh`
- Watch logs: `./scripts/logs.sh --follow`
- Check notifications (if NOTIFY_ON_SUCCESS=true)
- Verify token expiry extends after refresh: `./scripts/status.sh`

**Q: Can I run this in Docker?**  
A: Possible but not ideal because:
- Needs access to `~/.aws/` directory
- macOS notifications won't work in container
- Better to run natively for development use

**Q: Does this work with AWS IAM Identity Center (successor to SSO)?**  
A: Yes! AWS IAM Identity Center uses the same SSO cache structure and OIDC endpoints. Just configure your profile name and session name.

## Contributing

This project is designed for personal use. Feel free to fork and customize for your needs.

## License

ISC

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. View logs: `./scripts/logs.sh --follow`
3. Check configuration: `cat .env`
4. Verify AWS SSO is working: `aws sso login --profile <your-profile>`

---

**Built with:** Node.js, pm2, Winston, Axios, node-notifier
