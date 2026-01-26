/**
 * PM2 Ecosystem Configuration
 * https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

require('dotenv').config();

module.exports = {
  apps: [{
    name: process.env.PM2_APP_NAME || 'aws-sso-refresh',
    script: './src/index.js',
    instances: parseInt(process.env.PM2_INSTANCES || '1', 10),
    exec_mode: 'fork', // Use 'fork' mode for single instance
    autorestart: process.env.PM2_AUTORESTART !== 'false',
    watch: false,
    max_memory_restart: '200M',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
    },
    
    // Logging configuration
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Restart behavior
    max_restarts: 10, // Max 10 restarts in min_uptime window
    min_uptime: '60s', // Must stay up for 60s to be considered stable
    restart_delay: 4000, // Wait 4s before restarting
    
    // Graceful shutdown
    kill_timeout: 5000, // Wait 5s for graceful shutdown
    listen_timeout: 3000, // Wait 3s for app to be ready
    
    // Time-based restart (optional - restart daily at 3 AM)
    // cron_restart: '0 3 * * *',
    
    // Process management
    wait_ready: false,
    shutdown_with_message: true,
  }]
};
