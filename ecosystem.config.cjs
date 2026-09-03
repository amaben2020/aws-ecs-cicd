module.exports = {
  apps: [
    {
      name: 'my-app',
      script: './server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx', // no build step in this project — run TS directly, same as `npm run dev`
      instances: 2, // or 'max' for all cores
      exec_mode: 'cluster', // required for multi-instance load balancing
      watch: false, // never true in production — that's nodemon's job
      max_memory_restart: '500M', // auto-restart if a process leaks past this
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
