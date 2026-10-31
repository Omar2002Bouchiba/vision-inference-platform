import jwt from 'jsonwebtoken';

function requiredBase64(name: string): Buffer {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Run the RSA key setup script.`);
  return Buffer.from(value, 'base64');
}

export const jwtPrivateKey = requiredBase64('JWT_PRIVATE_KEY_B64');
export const jwtPublicKey = requiredBase64('JWT_PUBLIC_KEY_B64');
export const jwtOptions: jwt.SignOptions = { algorithm: 'RS256', issuer: 'vision-inference-platform', expiresIn: '2h' };
