# Contributing to AWS SSO Token Auto-Refresh

Thank you for your interest in contributing! This document provides guidelines and standards for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Project Architecture](#project-architecture)
- [Security Guidelines](#security-guidelines)

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize the project's goals and user experience
- Assume good intentions
- Welcome newcomers and help them learn

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or trolling
- Publishing others' private information
- Other conduct inappropriate in a professional setting

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- Node.js v14 or higher
- npm or yarn
- Git
- AWS CLI configured with SSO
- macOS (for notification testing) or Linux/Windows (core features)

### Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/yourusername/aws-auto-refresh.git
cd aws-auto-refresh

# Add upstream remote
git remote add upstream https://github.com/original/aws-auto-refresh.git
```

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Development Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your AWS profile details
vim .env
```

### 3. Login to AWS SSO

```bash
aws sso login --profile your-profile
```

### 4. Run in Development Mode

```bash
# Run with debug logging
npm run dev

# Or run directly
LOG_LEVEL=debug node src/index.js
```

### 5. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check
```

## Coding Standards

### JavaScript Style Guide

This project follows standard JavaScript conventions with these specifics:

#### Code Formatting

- **Indentation:** 2 spaces (no tabs)
- **Line length:** 100 characters max
- **Quotes:** Single quotes for strings (except to avoid escaping)
- **Semicolons:** Always use semicolons
- **Trailing commas:** Use in multi-line arrays/objects

#### Naming Conventions

```javascript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_REGION = 'us-east-1';

// Functions: camelCase, descriptive verbs
function refreshToken() { }
function calculateExpiryTime() { }
function validateConfiguration() { }

// Variables: camelCase, descriptive nouns
const tokenData = {};
const expiryTime = Date.now();
const isValid = true;

// Private functions: prefix with underscore
function _internalHelper() { }
function _computeHash() { }

// Classes: PascalCase (if added in future)
class TokenManager { }
```

#### Function Design

- Keep functions focused and single-purpose
- Max 50 lines per function (prefer shorter)
- Max 4 parameters (use options object if more needed)
- Return early for error conditions

```javascript
// Good: Early return pattern
function validateToken(token) {
  if (!token) {
    return { valid: false, error: 'Token missing' };
  }

  if (token.expiresAt < Date.now()) {
    return { valid: false, error: 'Token expired' };
  }

  return { valid: true };
}

// Bad: Nested conditions
function validateToken(token) {
  if (token) {
    if (token.expiresAt >= Date.now()) {
      return { valid: true };
    } else {
      return { valid: false, error: 'Token expired' };
    }
  } else {
    return { valid: false, error: 'Token missing' };
  }
}
```

#### Error Handling

Always use try-catch for async operations:

```javascript
// Good: Comprehensive error handling
async function refreshToken() {
  try {
    const response = await oidcClient.post('/token', data);
    return { success: true, data: response.data };
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// Bad: Unhandled promise rejection
async function refreshToken() {
  const response = await oidcClient.post('/token', data);
  return response.data;
}
```

#### Comments

- Use JSDoc for all exported functions
- Explain "why", not "what"
- Keep comments up-to-date with code changes

```javascript
/**
 * Refreshes an AWS SSO token using the OIDC refresh token grant flow.
 *
 * @param {Object} tokenData - Current token data from cache
 * @param {string} tokenData.refreshToken - OIDC refresh token
 * @param {string} tokenData.clientId - OAuth client ID
 * @param {string} tokenData.clientSecret - OAuth client secret
 * @returns {Promise<Object>} New token data or error
 */
async function refreshToken(tokenData) {
  // AWS OIDC requires form-encoded body, not JSON
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenData.refreshToken,
    client_id: tokenData.clientId,
    client_secret: tokenData.clientSecret
  });

  // ... implementation
}
```

### File Organization

Each module should follow this structure:

```javascript
// 1. Imports - group by: Node.js built-ins, npm packages, local modules
const fs = require('fs');
const path = require('path');

const axios = require('axios');
const winston = require('winston');

const logger = require('./logger');
const config = require('./config');

// 2. Constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 10000;

// 3. Private helper functions
function _formatError(error) {
  // ...
}

// 4. Exported functions
async function refreshToken(tokenData) {
  // ...
}

function validateToken(token) {
  // ...
}

// 5. Exports
module.exports = {
  refreshToken,
  validateToken
};
```

### TypeScript Definitions

When adding new modules or modifying existing ones, update corresponding `.d.ts` files:

```typescript
// Keep type definitions in sync with implementation
export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  clientId?: string;
  clientSecret?: string;
}

export function refreshToken(tokenData: TokenData): Promise<RefreshResult>;
```

## Testing Requirements

### Test Coverage

- Maintain **minimum 70%** coverage for all metrics:
  - Branches: 70%
  - Functions: 70%
  - Lines: 70%
  - Statements: 70%

### Writing Tests

Create tests in `tests/unit/` with `.test.js` suffix:

```javascript
const { refreshToken } = require('../../src/token-refresher');

describe('token-refresher', () => {
  describe('refreshToken()', () => {
    it('should successfully refresh token with valid credentials', async () => {
      const tokenData = {
        refreshToken: 'valid-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      };

      const result = await refreshToken(tokenData);

      expect(result.success).toBe(true);
      expect(result.newAccessToken).toBeDefined();
    });

    it('should handle expired refresh token', async () => {
      const tokenData = {
        refreshToken: 'expired-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      };

      const result = await refreshToken(tokenData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });
  });
});
```

### Test Organization

- Group related tests with `describe()` blocks
- Use descriptive test names: `should [expected behavior] when [condition]`
- Test both success and failure paths
- Mock external dependencies (file system, network calls)
- Clean up test resources in `afterEach()` hooks

### Running Tests Before Commits

```bash
# Always run tests before committing
npm test

# Check coverage
npm run test:coverage

# Type check
npm run type-check
```

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types

- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation changes
- **style:** Code style changes (formatting, missing semicolons)
- **refactor:** Code refactoring without feature changes
- **test:** Adding or updating tests
- **chore:** Maintenance tasks (deps, build, etc.)

#### Examples

```
feat(cache): add support for custom cache directory

Allow users to specify custom AWS cache directory via
AWS_SSO_CACHE_DIR environment variable. Falls back to
default ~/.aws/sso/cache if not specified.

Closes #45
```

```
fix(refresh): handle network timeout errors

Add timeout handling to OIDC refresh requests. Previously
network timeouts would hang indefinitely. Now times out
after 30 seconds and retries with backoff.

Fixes #32
```

```
docs(readme): add multi-profile setup guide

Add comprehensive documentation for running multiple daemon
instances to monitor different AWS profiles simultaneously.

Co-authored-by: Jane Smith <jane@example.com>
```

### Commit Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commit history clean (squash WIP commits before PR)

## Pull Request Process

### Before Submitting

1. **Update your fork:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks:**
   ```bash
   npm test                  # All tests must pass
   npm run test:coverage     # Coverage must be >= 70%
   npm run type-check        # No TypeScript errors
   ```

3. **Update documentation:**
   - Update README if adding features or changing behavior
   - Update JSDoc comments in code
   - Update TypeScript definitions if applicable
   - Add examples if helpful

4. **Update CHANGELOG:**
   - Add entry under `[Unreleased]` section
   - Follow Keep a Changelog format
   - Link to issue/PR numbers

### Creating the Pull Request

1. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open PR on GitHub** with this template:

   ```markdown
   ## Summary
   Brief description of what this PR does and why.

   ## Changes
   - Bullet list of specific changes
   - Include any breaking changes
   - Note any new dependencies

   ## Testing
   - [ ] All existing tests pass
   - [ ] Added new tests for new functionality
   - [ ] Manual testing performed (describe scenarios)
   - [ ] Coverage maintained at >= 70%

   ## Documentation
   - [ ] README updated if needed
   - [ ] CHANGELOG updated
   - [ ] Code comments added where helpful
   - [ ] TypeScript definitions updated

   ## Related Issues
   Closes #123
   Related to #456

   ## Screenshots (if applicable)
   Add screenshots for UI changes or notifications.
   ```

3. **Respond to review feedback:**
   - Address all reviewer comments
   - Push additional commits or amend as needed
   - Re-request review when ready

### PR Review Process

Your PR will be reviewed for:

- **Functionality:** Does it work as intended?
- **Code quality:** Follows coding standards?
- **Tests:** Adequate test coverage?
- **Documentation:** Changes documented?
- **Security:** No security vulnerabilities introduced?
- **Performance:** No significant performance degradation?

### Merging

- PRs require at least one approval
- All CI checks must pass
- Maintainers will merge using "Squash and merge" strategy
- Delete your branch after merging

## Project Architecture

### Core Components

Understanding the architecture helps you contribute effectively:

```
┌─────────────┐
│  index.js   │  Main daemon - coordination & monitoring loop
└──────┬──────┘
       │
       ├─────► config.js          Configuration loading & validation
       ├─────► logger.js          Winston logging setup
       ├─────► cache-manager.js   AWS cache file operations
       ├─────► token-refresher.js OIDC token refresh logic
       └─────► notifier.js        macOS notifications
```

### Module Responsibilities

- **config.js:** Own configuration. Other modules import config, not env vars
- **logger.js:** Own all logging. Other modules use logger methods, not console
- **cache-manager.js:** Own cache file I/O. Other modules never touch cache directly
- **token-refresher.js:** Own OIDC protocol. Other modules don't know about OIDC details
- **notifier.js:** Own notifications. Other modules don't know about node-notifier
- **index.js:** Coordinate modules. Contains no business logic itself

### Adding New Features

When adding features, consider:

1. **Which module owns this functionality?**
2. **Does it need a new module or fit in existing one?**
3. **What's the interface between modules?**
4. **How does it affect the monitoring loop in index.js?**
5. **What configuration options are needed?**

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for detailed architecture documentation.

## Security Guidelines

### Security Principles

1. **Never log sensitive data:**
   - No access tokens
   - No refresh tokens
   - No client secrets
   - No JWT contents

2. **Atomic file operations:**
   - Use `write-file-atomic` for cache writes
   - Always create backups before modifying
   - Restore on failure

3. **Validate all inputs:**
   - Validate configuration on startup
   - Validate cache file structure before using
   - Validate API responses before trusting

4. **Fail securely:**
   - Don't expose sensitive data in error messages
   - Don't leave cache in corrupted state
   - Don't continue with partial credentials

### Security Checklist for PRs

- [ ] No credentials in logs
- [ ] No credentials in error messages
- [ ] File operations are atomic
- [ ] Input validation added for new config options
- [ ] API responses validated before use
- [ ] Error messages are safe to display to users
- [ ] No secrets in test fixtures or examples

### Reporting Security Issues

**Do not open public issues for security vulnerabilities.**

Instead, email security concerns privately to the maintainers. Include:

- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

## Development Tips

### Debugging

```bash
# Run with debug logging
LOG_LEVEL=debug node src/index.js

# Use Node.js inspector
node --inspect src/index.js

# Then open chrome://inspect in Chrome
```

### Testing Specific Scenarios

```bash
# Test token refresh with near-expiry token
# (Manually edit cache file to set expiresAt to 2 minutes from now)
vim ~/.aws/sso/cache/<hash>.json

# Run daemon and watch it refresh
npm run dev
```

### Local pm2 Testing

```bash
# Start with pm2 locally
pm2 start ecosystem.config.js

# Watch logs
pm2 logs

# Monitor resources
pm2 monit

# Clean up
pm2 delete all
```

## Questions or Need Help?

- Read the [README](./README.md) and [ARCHITECTURE](./docs/ARCHITECTURE.md) docs
- Check [existing issues](https://github.com/yourusername/aws-auto-refresh/issues)
- Open a new issue with the `question` label

## License

By contributing, you agree that your contributions will be licensed under the same [ISC License](./LICENSE) that covers this project.

---

Thank you for contributing to AWS SSO Token Auto-Refresh!
