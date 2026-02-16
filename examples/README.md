# Examples

This directory contains practical examples for using aws-auto-refresh.

## Available Examples

- **[basic-usage.js](./basic-usage.js)** - Simple daemon setup and monitoring
- **[multi-profile.js](./multi-profile.js)** - Managing multiple AWS profiles simultaneously
- **[programmatic.js](./programmatic.js)** - Using aws-auto-refresh as a library in your code
- **[custom-notifications.js](./custom-notifications.js)** - Implementing custom notification handlers
- **[status-check.js](./status-check.js)** - Checking token status programmatically

## Running Examples

```bash
# Make sure you've configured .env first
cp .env.example .env
vim .env

# Run an example
node examples/basic-usage.js
```

## Prerequisites

Before running examples, ensure:

1. **AWS CLI is configured** with SSO:
   ```bash
   aws configure sso
   ```

2. **Initial SSO login** has been performed:
   ```bash
   aws sso login --profile your-profile
   ```

3. **Dependencies installed**:
   ```bash
   npm install
   ```

4. **Environment configured** in `.env` file with your AWS profile details

## Example Use Cases

### Development Workflow
Use `basic-usage.js` to keep tokens fresh during long development sessions:
```bash
node examples/basic-usage.js
```

### Multi-Account Operations
Use `multi-profile.js` when working across multiple AWS accounts:
```bash
node examples/multi-profile.js
```

### CI/CD Integration
Use `programmatic.js` to integrate token refresh into your build pipelines:
```javascript
const refresher = require('./examples/programmatic.js');
await refresher.ensureValidToken();
```

### Status Dashboard
Use `status-check.js` to build monitoring dashboards:
```bash
node examples/status-check.js
```

## Troubleshooting

**Example won't start:**
- Check `.env` file has `AWS_SSO_PROFILE` and `AWS_SSO_SESSION` set
- Verify you've run `aws sso login --profile your-profile`
- Check logs: `./scripts/logs.sh`

**Import errors:**
- Run from project root: `node examples/basic-usage.js`
- Don't run from examples directory

**Token not refreshing:**
- Verify cache file exists: `ls ~/.aws/sso/cache/`
- Check daemon logs for errors
- Try manual login: `aws sso login --profile your-profile`

## Contributing Examples

When adding new examples:

1. Add clear comments explaining each step
2. Include error handling
3. Demonstrate a specific use case
4. Update this README with example description
5. Test that example runs without modification

## License

ISC - Same as main project
