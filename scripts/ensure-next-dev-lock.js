#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const lockPath = path.join(process.cwd(), '.next', 'dev', 'lock');

function log(...args) {
  console.log('[ensure-next-dev-lock]', ...args);
}

if (!fs.existsSync(lockPath)) {
  log('No .next/dev/lock present.');
  process.exit(0);
}

let content = '';
try {
  content = fs.readFileSync(lockPath, 'utf8').trim();
} catch (err) {
  console.error('[ensure-next-dev-lock] Error reading lock file, attempting to remove:', err && err.message ? err.message : err);
  try { fs.unlinkSync(lockPath); log('Removed .next/dev/lock'); process.exit(0); } catch (e) { console.error('[ensure-next-dev-lock] Failed to remove .next/dev/lock:', e && e.message ? e.message : e); process.exit(1); }
}

const pid = parseInt(content, 10);
if (!isNaN(pid) && pid > 0) {
  try {
    process.kill(pid, 0);
    log(`.next/dev/lock appears held by running PID ${pid}; leaving it in place.`);
    process.exit(1);
  } catch (err) {
    if (err && err.code === 'ESRCH') {
      // process not found - stale lock
      try { fs.unlinkSync(lockPath); log('Removed stale .next/dev/lock'); process.exit(0); } catch (e) { console.error('[ensure-next-dev-lock] Failed to remove stale lock:', e && e.message ? e.message : e); process.exit(1); }
    } else if (err && err.code === 'EPERM') {
      console.error('[ensure-next-dev-lock] Insufficient permissions to check PID. Aborting to avoid removing a live lock.');
      process.exit(1);
    } else {
      console.error('[ensure-next-dev-lock] Error checking PID:', err);
      process.exit(1);
    }
  }
} else {
  // Content isn't a PID — remove it safely
  try { fs.unlinkSync(lockPath); log('Removed .next/dev/lock (non-PID content)'); process.exit(0); } catch (e) { console.error('[ensure-next-dev-lock] Failed to remove lock:', e && e.message ? e.message : e); process.exit(1); }
}
