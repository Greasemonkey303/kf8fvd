const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env.docker');
const secretsDir = path.resolve(__dirname, '..', 'secrets');

function parseEnv(file) {
  const data = fs.readFileSync(file, 'utf8');
  const lines = data.split(/\r?\n/);
  const out = {};
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    // remove surrounding quotes if any
    if (v.startsWith("\"") && v.endsWith("\"")) v = v.slice(1, -1);
    if (v.startsWith("'" ) && v.endsWith("'")) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeSecret(filename, value) {
  const p = path.join(secretsDir, filename);
  fs.writeFileSync(p, value || '', { encoding: 'utf8', flag: 'w' });
  console.log('wrote', p);
}

function main() {
  if (!fs.existsSync(envPath)) {
    console.error('.env.docker not found at', envPath);
    process.exit(1);
  }
  const env = parseEnv(envPath);
  ensureDir(secretsDir);

  // Map env keys -> secret filenames
  const mapping = {
    NEXTAUTH_SECRET: 'nextauth_secret',
    ENCRYPTION_KEY: 'encryption_key',
    DB_PASSWORD: 'db_password',
    REDIS_URL: 'redis_url',
    ADMIN_BASIC_USER: 'admin_basic_user',
    ADMIN_BASIC_PASSWORD: 'admin_basic_password',
    ADMIN_API_KEY: 'admin_api_key'
  };


  Object.entries(mapping).forEach(([envKey, secretFile]) => {
    if (env[envKey]) {
      writeSecret(secretFile, env[envKey]);
    } else {
      console.log('warning:', envKey, 'not found in .env.docker; creating empty file for', secretFile);
      writeSecret(secretFile, '');
    }
  });

  console.log('secrets created in', secretsDir);
}

main();
