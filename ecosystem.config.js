module.exports = {
  apps: [{
    name: 'essl-zoho',
    script: 'src/app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      ESSL_POLL_INTERVAL: '20000'
    },
    env_production: {
      NODE_ENV: 'production',
      ESSL_POLL_INTERVAL: '20000'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    restart_delay: 4000,
    max_restarts: 10
  }]
};