#!/usr/bin/env node
/*
 Create or update an admin user in the `kf8fvd` database.

 Usage examples:
  node scripts/create-admin.js --email=admin@example.com --password=Secret123 --name="Site Admin"
  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Secret123 node scripts/create-admin.js
*/

// Load environment from .env.local when running from project root
try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env.local') });
} catch (e) {
  // ignore if dotenv isn't available
}

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const readline = require('readline');

function getArg(name) {
  const arg = process.argv.find(a => a.startsWith(`${name}=`));
  if (!arg) return undefined;
  return arg.split('=')[1];
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function main() {
  const dbHost = getArg('--db-host') || process.env.DB_HOST || 'localhost';
  const dbPort = getArg('--db-port') ? parseInt(getArg('--db-port'), 10) : (process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306);
  const dbUser = getArg('--db-user') || process.env.DB_USER || 'root';
  const dbPassword = getArg('--db-password') || process.env.DB_PASSWORD || '';
  const dbName = getArg('--db-name') || process.env.DB_NAME || 'kf8fvd';

  const email = getArg('--email') || process.env.ADMIN_EMAIL || await prompt('Admin email: ');
  const password = getArg('--password') || process.env.ADMIN_PASSWORD || await prompt('Admin password: ');
  const name = getArg('--name') || process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.error('Email and password are required. Provide via args or ADMIN_EMAIL/ADMIN_PASSWORD env vars.');
    process.exit(1);
  }

  const hashed = bcrypt.hashSync(password, 12);

  const conn = await mysql.createConnection({ host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: dbName });
  try {
    // Check for existing user
    const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
    let userId;
    if (existing && existing.length > 0) {
      userId = existing[0].id;
      await conn.execute('UPDATE users SET name = ?, hashed_password = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, hashed, userId]);
      console.log('Updated existing user id', userId);
    } else {
      const [res] = await conn.execute('INSERT INTO users (name, email, hashed_password, is_active) VALUES (?, ?, ?, 1)', [name, email, hashed]);
      userId = res.insertId;
      console.log('Inserted new user id', userId);
    }

    // Ensure admin role exists
    const [roles] = await conn.execute('SELECT id FROM roles WHERE name = ?', ['admin']);
    let roleId;
    if (roles && roles.length > 0) {
      roleId = roles[0].id;
    } else {
      const [rres] = await conn.execute('INSERT INTO roles (name, description) VALUES (?, ?)', ['admin', 'Full administrator access']);
      roleId = rres.insertId;
    }

    // Assign role
    await conn.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    console.log('Assigned admin role to user id', userId);
    console.log('Done. You can now sign in with', email);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
