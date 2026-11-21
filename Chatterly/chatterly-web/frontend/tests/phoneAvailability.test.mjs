import test from 'node:test';
import assert from 'node:assert/strict';
import { isPhoneAvailable } from '../src/utils/phoneAvailability.js';

const phone = '+918438309017';
const currentUser = { _id: 'current' };

test('a gateway failure or network timeout does not block SMS verification', async () => {
  for (const details of [{ status: 502 }, { status: 503 }, { code: 'ERR_NETWORK' }, { code: 'ECONNABORTED' }]) {
    const lookup = async () => { throw Object.assign(new Error('Lookup failed'), details); };
    assert.equal(await isPhoneAvailable(phone, currentUser, lookup), true);
  }
});

test('duplicate numbers are rejected and the current account is allowed', async () => {
  assert.equal(await isPhoneAvailable(phone, currentUser, async () => []), true);
  assert.equal(await isPhoneAvailable(phone, currentUser, async () => [{ _id: 'other', phone: '8438309017' }]), false);
  assert.equal(await isPhoneAvailable(phone, currentUser, async () => [{ _id: 'current', phone }]), true);
  assert.equal(await isPhoneAvailable(phone, currentUser, async () => [{ _id: 'other', phone: '+919999999999' }]), true);
});

test('authentication and validation failures are still surfaced', async () => {
  for (const status of [400, 401, 403, 404]) {
    const error = Object.assign(new Error('Lookup rejected'), { status });
    await assert.rejects(isPhoneAvailable(phone, currentUser, async () => { throw error; }), (caught) => caught === error);
  }
});
