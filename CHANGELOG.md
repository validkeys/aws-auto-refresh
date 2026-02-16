# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive architecture documentation in `docs/ARCHITECTURE.md`
- TypeScript type definitions for all modules
- Examples directory with practical usage patterns
- Testing documentation in README
- CHANGELOG.md for version tracking
- CONTRIBUTING.md with developer guidelines
- Full ISC license text
- Error reference guide in README

## [1.0.0] - 2026-01-24

### Fixed
- Token refresh API format for AWS SSO OIDC endpoint
  - Fixed request body format to match AWS OIDC specification
  - Added proper Content-Type header (application/x-www-form-urlencoded)
  - Updated grant_type parameter formatting
- Cache lookup logic for SSO session configuration
  - Fixed SHA1 hash computation of SSO start URL
  - Improved error handling for missing cache files
  - Fixed failure warning messages for better clarity

### Changed
- Improved error messages for cache file operations
- Enhanced logging for token refresh failures

## [0.1.0] - 2026-01-20

### Added
- Initial release of AWS SSO Token Auto-Refresh daemon
- Core features:
  - Automatic token refresh monitoring and execution
  - AWS SSO cache integration (reads/writes `~/.aws/sso/cache/`)
  - OIDC token refresh with retry logic
  - macOS notification support
  - pm2 process management
  - Winston logging with daily rotation
  - Configurable refresh intervals and thresholds
  - Comprehensive error handling

- Configuration system:
  - Environment variable based configuration
  - `.env` file support with `.env.example` template
  - Validation of required settings
  - Sensible defaults for optional settings

- CLI scripts:
  - `install.sh` - Automated installation
  - `start.sh` - Start daemon with pm2
  - `stop.sh` - Stop daemon gracefully
  - `restart.sh` - Restart daemon
  - `status.sh` - Check daemon and token status
  - `logs.sh` - View daemon logs

- Documentation:
  - Comprehensive README with setup guide
  - Quick start guide
  - Configuration reference
  - Troubleshooting section
  - Security best practices
  - FAQ section

- Components:
  - `config.js` - Configuration loader and validator (192 lines)
  - `logger.js` - Winston logging setup (153 lines)
  - `cache-manager.js` - AWS cache file operations (372 lines)
  - `token-refresher.js` - OIDC token refresh logic (239 lines)
  - `notifier.js` - macOS notification manager (172 lines)
  - `index.js` - Main daemon process (227 lines)

- Testing infrastructure:
  - Jest test framework setup
  - 70% code coverage threshold
  - Unit tests for all major components

### Security
- No credential storage - uses AWS CLI cache directly
- Atomic file writes with backup/restore
- No tokens in logs - only metadata
- Secure file permissions (600)
- HTTPS-only OIDC API calls
- Input validation
- Safe error messages

[unreleased]: https://github.com/yourusername/aws-auto-refresh/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/aws-auto-refresh/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/yourusername/aws-auto-refresh/releases/tag/v0.1.0
