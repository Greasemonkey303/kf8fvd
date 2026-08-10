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
    } catch {
      // continue
    }
  }
}

const requiredEnv = [
  'NEXTAUTH_SECRET',
  'ENCRYPTION_KEY',
  'CF_TURNSTILE_SECRET',
  'NEXT_PUBLIC_CF_TURNSTILE_SITEKEY',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'REDIS_URL',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'NEXT_PUBLIC_S3_BUCKET',
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`docker-entrypoint: missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const command = process.argv[2] || 'node';
const args = process.argv.slice(3);
if (args.length === 0) args.push('server.js');
console.log('docker-entrypoint: starting application');

const child = spawn(command, args, { stdio: 'inherit' });
let stopping = false;

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    if (!child.killed) child.kill(signal);
  });
}

child.on('error', (err) => {
  console.error('docker-entrypoint: child process error', err && err.stack ? err.stack : err);
});

child.on('exit', (code, signal) => {
  console.log('docker-entrypoint: child exited', { code, signal });
  process.exit(code ?? (signal ? 1 : 0));
});
