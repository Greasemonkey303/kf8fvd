#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const secretsDir = '/run/secrets';
const secretFiles = ['nextauth_secret','encryption_key','db_password','redis_url'];

for (const name of secretFiles) {
  const p = path.join(secretsDir, name);
  if (fs.existsSync(p)) {
    try {
      process.env[name.toUpperCase()] = fs.readFileSync(p, 'utf8').trim();
    } catch (e) {
      // continue
    }
  }
}

// Forward remaining envs like NEXT_PUBLIC_* should already be set by Docker run args if needed

const cmd = process.env.NPM_COMMAND || 'start';
console.log('docker-entrypoint: starting npm command=', cmd);
console.log('docker-entrypoint: env preview', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
  DB_HOST: process.env.DB_HOST ? true : false,
  DB_USER: process.env.DB_USER ? true : false,
});

const child = spawn('npm', ['run', cmd], { stdio: 'inherit' });

// Heartbeat so `docker compose up` shows activity during long-running start
let heartbeatInterval = setInterval(() => {
  try {
    const mem = process.memoryUsage();
    console.log(`docker-entrypoint: heartbeat ${new Date().toISOString()} PID=${process.pid} rss=${Math.round(mem.rss/1024/1024)}MB`);
  } catch (e) {
    console.log(`docker-entrypoint: heartbeat ${new Date().toISOString()}`);
  }
}, 5000);

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

child.on('error', (err) => {
  stopHeartbeat();
  console.error('docker-entrypoint: child process error', err && err.stack ? err.stack : err);
});

child.on('exit', (code, signal) => {
  stopHeartbeat();
  console.log('docker-entrypoint: child exited', { code, signal });
  if (signal) process.kill(process.pid, signal);
  process.exit(code);
});

child.on('close', (code, signal) => {
  stopHeartbeat();
  console.log('docker-entrypoint: child closed', { code, signal });
});
