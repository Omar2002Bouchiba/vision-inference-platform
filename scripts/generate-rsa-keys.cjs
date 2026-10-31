const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('Copy .env.example to .env first.');
  process.exit(1);
}
const existing = fs.readFileSync(envPath, 'utf8').replace(/\r?\n/g, '\n');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const lines = existing.split('\n').filter((line) => !line.startsWith('JWT_PRIVATE_KEY_B64=') && !line.startsWith('JWT_PUBLIC_KEY_B64='));
lines.push(`JWT_PRIVATE_KEY_B64=${Buffer.from(privateKey).toString('base64')}`);
lines.push(`JWT_PUBLIC_KEY_B64=${Buffer.from(publicKey).toString('base64')}`);
fs.writeFileSync(envPath, `${lines.filter(Boolean).join('\n')}\n`, { mode: 0o600 });
console.log('Generated local RS256 keys and saved them to .env (do not commit .env).');
