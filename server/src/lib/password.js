// Port of WrapperAvatar.encrypt: the stored Users.Password values depend on it, so it must match byte for byte.
// .NET: Rfc2898DeriveBytes(key, salt) = PBKDF2-HMAC-SHA1, 1000 iterations; Key = first 32 bytes, IV = next 16;
// Aes defaults = CBC + PKCS7; plaintext Encoding.Unicode = UTF-16LE; output Base64.
import { pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

const SALT = Buffer.from([73, 118, 97, 110, 32, 77, 101, 100, 118, 101, 100, 101, 118]);

function keyIv(key) {
  const b = pbkdf2Sync(key, SALT, 1000, 48, 'sha1');
  return [b.subarray(0, 32), b.subarray(32, 48)];
}

export function encryptPassword(plain, key) {
  const [k, iv] = keyIv(key);
  const c = createCipheriv('aes-256-cbc', k, iv);
  return Buffer.concat([c.update(Buffer.from(plain, 'utf16le')), c.final()]).toString('base64');
}

export function decryptPassword(cipherText, key) {
  const [k, iv] = keyIv(key);
  const d = createDecipheriv('aes-256-cbc', k, iv);
  return Buffer.concat([d.update(Buffer.from(cipherText, 'base64')), d.final()]).toString('utf16le');
}

/** WrapperAvatar.ValidatePasswordStrength. */
export function isStrongPassword(pw, userManagement) {
  if (userManagement === 0) return true;
  if (pw.length < 8 || pw.includes(' ')) return false;
  const special = [...'~!@#$%^&*()_-<>,.?/:;\'{}[]"'];
  return special.some((c) => pw.includes(c)) && /[0-9]/.test(pw);
}
