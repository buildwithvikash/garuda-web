// Expected values were produced by calling WrapperAvatar.encrypt in the original Avatar.dll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPassword, decryptPassword, isStrongPassword } from '../src/modules/auth/password.js';

const key = process.env.PASSWORD_AES_KEY;
const vectors = [
  ['admin', '2PfFBqheBNZ7yywvT6KrDA=='],
  ['Pass@123', 'a49aUNYu/a+jgkVF8PTtfZNDSK/B6b0voUoCqSEVoko='],
  ['वि', 'Gl7UQLaCUFUqMqoePaoL3A=='],
  ['', 'xUg7bVKt5By52q1BHLrJNA=='],
];

test('encryptPassword matches the original Avatar.dll output', { skip: !key && 'PASSWORD_AES_KEY not set' }, () => {
  for (const [plain, expected] of vectors) {
    assert.equal(encryptPassword(plain, key), expected, plain);
    assert.equal(decryptPassword(expected, key), plain);
  }
});

test('password strength rule (ValidatePasswordStrength)', () => {
  assert.equal(isStrongPassword('x', 0), true); // UserManagement off: anything goes
  assert.equal(isStrongPassword('Pass@123', 1), true);
  assert.equal(isStrongPassword('Pass@12', 1), false); // < 8
  assert.equal(isStrongPassword('Password1', 1), false); // no special char
  assert.equal(isStrongPassword('Pass@word', 1), false); // no digit
  assert.equal(isStrongPassword('Pass @123', 1), false); // space
});
