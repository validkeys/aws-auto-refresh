# Security Policy

## Overview

`aws-auto-refresh` handles sensitive AWS credentials and tokens. Security is a top priority for this project. This document outlines our security practices, supported versions, and vulnerability reporting procedures.

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

Security patches will be backported to the latest minor version of supported major releases.

## Security Considerations

### Credential Storage

`aws-auto-refresh` interacts with AWS credentials stored by the AWS CLI:

- **Cache Location**: `~/.aws/sso/cache/` - Contains OAuth tokens
- **Config Location**: `~/.aws/config` - Contains SSO configuration
- **Permissions**: Cache files should be `0600` (user read/write only)

**Best Practices:**
- Never commit cache files to version control
- Use encrypted filesystems for home directories
- Regularly rotate SSO sessions
- Enable CloudTrail logging for SSO activities

### Token Security

- Tokens are read from and written to AWS CLI cache files
- No tokens are logged (even in debug mode)
- Tokens are only held in memory during refresh operations
- Process runs with user privileges (no elevation required)

### Process Security

- Daemon runs as the current user
- No network listeners (outbound HTTPS only to AWS endpoints)
- Minimal dependencies to reduce attack surface
- No eval() or dynamic code execution

### AWS Permissions

The tool requires AWS SSO OIDC permissions:
- `sso-oauth:CreateToken` - To refresh access tokens
- No AWS account permissions needed (operates at identity level)

**IAM Policy (if using IAM-authenticated profiles):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sso-oauth:CreateToken"
      ],
      "Resource": "*"
    }
  ]
}
```

## Reporting a Vulnerability

### Where to Report

**DO NOT** create public GitHub issues for security vulnerabilities.

Please report security vulnerabilities privately via:

1. **GitHub Security Advisories** (preferred):
   - Go to the [Security tab](../../security/advisories)
   - Click "Report a vulnerability"
   - Fill out the advisory form

2. **Email** (alternative):
   - Send details to: [security@example.com] (TODO: Update with actual contact)
   - Use PGP key: [KEY_ID] (TODO: Add PGP key if available)
   - Include "SECURITY" in the subject line

### What to Include

Help us understand and resolve the issue quickly by including:

- **Type of vulnerability** (e.g., credential exposure, token theft, injection)
- **Affected versions** (or "latest" if using main branch)
- **Steps to reproduce** (PoC code or detailed description)
- **Impact assessment** (who is affected, what can be compromised)
- **Suggested fixes** (optional, but appreciated)
- **Your contact info** (for follow-up questions)

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Initial Response | Within 48 hours |
| Vulnerability Confirmation | Within 1 week |
| Fix Development | Varies by severity |
| Security Release | ASAP after fix testing |
| Public Disclosure | 90 days or after fix release |

### Disclosure Policy

- We follow **coordinated disclosure** principles
- You'll receive credit in release notes (unless you prefer anonymity)
- We'll work with you on disclosure timing
- Public disclosure only after a fix is available

## Security Updates

### How Updates are Delivered

1. **Security Advisories**: Published on GitHub Security tab
2. **Release Notes**: Tagged releases with `[SECURITY]` prefix
3. **CHANGELOG.md**: Security fixes prominently documented
4. **NPM Advisories**: Automated via npm audit

### Upgrade Recommendations

When a security release is published:

1. **Read the advisory** to assess if you're affected
2. **Update immediately** for critical vulnerabilities:
   ```bash
   npm update aws-auto-refresh
   ```
3. **Restart the daemon** to apply changes:
   ```bash
   # Stop existing daemon
   pkill -f "node.*aws-auto-refresh"

   # Start with new version
   aws-auto-refresh start
   ```
4. **Verify the fix** by checking logs for the new version

## Security Testing

### Local Testing

We recommend running security scans periodically:

```bash
# NPM vulnerability scan
npm audit

# Check for outdated dependencies
npm outdated

# Filesystem permissions audit
ls -la ~/.aws/sso/cache/

# Process inspection
ps aux | grep aws-auto-refresh
```

### Dependency Management

- Dependencies are reviewed before updates
- We use `npm audit` in CI/CD
- Dependabot alerts are monitored and acted upon
- Minimal dependency tree to reduce exposure

## Known Security Limitations

### By Design

1. **Local Filesystem Trust**: We trust `~/.aws/` filesystem permissions
   - **Mitigation**: Ensure proper file permissions (0600)

2. **AWS Endpoint Trust**: We trust AWS SSO OIDC endpoints
   - **Mitigation**: HTTPS with certificate validation

3. **Refresh Token Storage**: AWS CLI stores refresh tokens in plaintext
   - **Mitigation**: This is an AWS CLI design decision, not specific to this tool
   - **Recommendation**: Use short-lived sessions and encrypted filesystems

### Out of Scope

The following are **not** in scope for this project:

- AWS CLI vulnerabilities (report to AWS)
- OS-level privilege escalation
- Physical access attacks
- Social engineering attacks
- AWS SSO service vulnerabilities (report to AWS)

## Security-Related Configuration

### Recommended Settings

```json
{
  "profiles": ["your-profile"],
  "refreshBeforeMinutes": 5,
  "checkIntervalMinutes": 1,
  "failureRetryDelaySeconds": 60,
  "maxConsecutiveFailures": 3,
  "notifications": {
    "enabled": true,
    "onSuccess": false,
    "onFailure": true,
    "onWarning": true
  },
  "logging": {
    "level": "info",
    "enableFileLogging": true
  }
}
```

**Security rationale:**
- `refreshBeforeMinutes: 5` - Ensures tokens remain valid
- `maxConsecutiveFailures: 3` - Prevents infinite retry loops
- `notifications.onFailure: true` - Alerts you to potential issues
- `logging.level: "info"` - Adequate visibility without verbose output

### Sensitive Data in Logs

Even at `debug` level, we **never log**:
- Access tokens
- Refresh tokens
- Client secrets
- Full cache file contents

We **do log** (sanitized):
- Token expiry timestamps
- Profile names
- SSO start URLs (domain only)
- Error messages (sanitized)

## Additional Resources

- [AWS SSO Security Best Practices](https://docs.aws.amazon.com/singlesignon/latest/userguide/security-best-practices.html)
- [AWS CLI Configuration Security](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- [OWASP Credential Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Storage_Cheat_Sheet.html)

## Contact

For security-related questions that are not vulnerabilities:
- Open a [GitHub Discussion](../../discussions)
- Tag with `security` label

For urgent security matters, use the vulnerability reporting process above.

---

**Last Updated**: 2026-02-15
**Policy Version**: 1.0
