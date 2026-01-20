module.exports = {
  apps: [
    {
      name: 'workflow-engine-backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 10000,
      },
      error_file: '/tmp/logs/err.log',
      out_file: '/tmp/logs/out.log',
      log_file: '/tmp/logs/combined.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
    },
  ],
};