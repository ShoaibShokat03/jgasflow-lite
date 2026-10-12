// Creates (or resets) the platform Super Admin account.
//   npm run admin:create -- --login admin@example.com [--name "Super Admin"] [--password secret]
// Without --password a random one is generated. The login details are written to
// storage/super-admin.txt (not printed). Start the API once first so tables exist.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';

const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const login = (arg('login') || '').trim().toLowerCase();
if (!login.includes('@')) {
  console.error('Use --login with an email address');
  process.exit(1);
}
const name = arg('name') || 'Super Admin';
const password = arg('password') || `Adm-${randomBytes(9).toString('base64url')}`;

const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jgasflow',
});
const hash = await bcrypt.hash(password, 10);
const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [login]);
if (rows.length) {
  await db.query('UPDATE users SET password_hash = ?, is_super = 1, tenant_id = NULL, active = 1, name = ? WHERE id = ?', [hash, name, rows[0].id]);
  await db.query('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [rows[0].id]);
} else {
  await db.query("INSERT INTO users (tenant_id, name, email, password_hash, role, is_super) VALUES (NULL, ?, ?, ?, 'owner', 1)", [name, login, hash]);
}
await db.end();
mkdirSync('storage', { recursive: true });
writeFileSync('storage/super-admin.txt', `JGasFlow Super Admin\nLogin: ${login}\nPassword: ${password}\n`);
console.log(`Super Admin ${rows.length ? 'updated' : 'created'} for ${login}. Login details saved in storage/super-admin.txt`);
