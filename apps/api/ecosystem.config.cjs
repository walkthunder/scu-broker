module.exports = {
  apps: [
    {
      name: 'scu-api',
      cwd: __dirname,
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
    },
  ],
};
