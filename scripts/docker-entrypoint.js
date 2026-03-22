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
const child = spawn('npm', ['run', cmd], { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code);
});
