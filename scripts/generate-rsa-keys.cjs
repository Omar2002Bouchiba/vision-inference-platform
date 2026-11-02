const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const envPath = path.resolve(__dirname, '..', '.env');
const examplePath = path.resolve(__dirname, '..', '.env.example');
if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error('.env.example is missing; cannot create the local environment file.');
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envPath);
  console.log('Created .env from .env.example.');
}
const existing = fs.readFileSync(envPath, 'utf8').replace(/\r?\n/g, '\n');
const privateKeyValue = existing.match(/^JWT_PRIVATE_KEY_B64=(.*)$/m)?.[1]?.trim();
const publicKeyValue = existing.match(/^JWT_PUBLIC_KEY_B64=(.*)$/m)?.[1]?.trim();
if (privateKeyValue && publicKeyValue) {
  console.log('RS256 keys already exist in .env; keeping them unchanged.');
  process.exit(0);
}

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
