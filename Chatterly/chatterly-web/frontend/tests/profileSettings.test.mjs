import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load the production Vite modules in Node; only browser assets and build-time
// env values need shims. Requests use the real Axios client with a test adapter.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/frontend/src/')) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(`${url.href}.js`))) {
        return nextResolve(`${url.href}.js`, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.png')) {
      return { format: 'module', source: 'export default "/test-avatar.png";', shortCircuit: true };
    }
    if (url.includes('/frontend/src/') && url.endsWith('.js')) {
      return {
        format: 'module',
        source: readFileSync(new URL(url), 'utf8').replaceAll('import.meta.env', '{}'),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const createStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => Array.from(values.keys())[index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};
globalThis.localStorage = createStorage();
globalThis.sessionStorage = createStorage();
globalThis.window = {
  location: new URL('http://localhost:5173/profile/edit'),
  addEventListener() {},
  setTimeout,
  clearTimeout,
};

const { getProfile, updateProfile } = await import('../src/api/contactapi.js');
const { default: axiosInstance } = await import('../src/api/axios.js');
const { getStoredUser, persistProfileToStorage, PROFILE_DOB_CACHE_STORAGE_KEY } = await import('../src/utils/profile.js');
const { clearLogoutCache } = await import('../src/utils/logoutCache.js');
const { resolveApiBaseUrl } = await import('../src/utils/backendUrl.js');
const {
  buildProfileSettingsUpdatePayload,
  normalizeDatePickerValue,
  validateDatePickerValue,
  getCurrentDatePickerValue,
  saveProfileSettingsFields,
} = await import('../src/utils/profileSettings.js');

const savedUser = {
  _id: 'current-user', name: 'Ajith', status: 'Trust Your Instinct.',
  email: 'user@example.com', phone: '+919655970277', dob: '1999-01-22',
};

test('DOB-only requests avoid duplicate-name validation on localhost and live origins', async () => {
  for (const origin of ['http://localhost:5173', 'https://chatterly.stacklycloud.com']) {
    window.location = new URL(`${origin}/profile/edit`);
    axiosInstance.defaults.baseURL = resolveApiBaseUrl('http://localhost:5000');
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify(savedUser));

    axiosInstance.defaults.adapter = async (config) => {
      const data = JSON.parse(config.data);
      assert.equal(axiosInstance.getUri(config), `${origin}/api/auth/update-profile`);
      assert.equal(config.method, 'patch');
      assert.equal(config.headers.Authorization, 'Bearer test-token');
      // The previous full-profile payload failed for accounts sharing a name.
      assert.deepEqual(data, { dob: '2000-05-06', dateOfBirth: '2000-05-06' });
      return { status: 200, headers: {}, config, data: { user: savedUser } };
    };

    const nextProfile = await saveProfileSettingsFields({ raw: savedUser }, { dob: '2000-05-06' });
    assert.equal(nextProfile.dob, '2000-05-06');
    assert.equal(getStoredUser().dob, '2000-05-06');
    assert.equal(getStoredUser().dateOfBirth, '2000-05-06');
    assert.equal(getStoredUser().name, savedUser.name);
    assert.equal(getStoredUser().status, savedUser.status);
    assert.equal(getStoredUser().phone, savedUser.phone);
  }
});

test('partial JSON and multipart updates do not invent names or clear the bio', async () => {
  for (const fields of [
    { email: 'updated@example.com' },
    { phone: '+919876543210' },
    { dob: '1999-01-22', dateOfBirth: '1999-01-22' },
    { language: 'Hindi' },
    { timeZone: 'GMT+00:00 - UTC' },
    { profilePic: null, removeProfilePic: 'true' },
  ]) {
    for (const multipart of [false, true]) {
      const payload = multipart ? new FormData() : fields;
      if (multipart) Object.entries(fields).forEach(([key, value]) => payload.append(key, value));
      axiosInstance.defaults.adapter = async (config) => {
        const data = multipart ? Object.fromEntries(config.data.entries()) : JSON.parse(config.data);
        const expected = multipart
          ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]))
          : fields;
        assert.deepEqual(data, expected);
        return { status: 200, headers: {}, config, data: { user: savedUser } };
      };
      await updateProfile(payload);
    }
  }
});

test('explicit name and bio edits still map to the backend contract', async () => {
  axiosInstance.defaults.adapter = async (config) => {
    const data = JSON.parse(config.data);
    assert.equal(data.name, 'Updated Name');
    assert.equal(data.firstName, 'Updated');
    assert.equal(data.lastName, 'Name');
    assert.equal(data.status, 'Updated status');
    assert.equal(data.bio, 'Updated status');
    assert.equal('username' in data, false);
    return { status: 200, headers: {}, config, data: { user: savedUser } };
  };
  await updateProfile({ username: 'Updated Name', bio: 'Updated status' });
});

test('failed requests reject without updating the cached DOB or using create-profile', async () => {
  const cachedDob = getStoredUser().dob;
  let requests = 0;
  axiosInstance.defaults.adapter = async (config) => {
    requests += 1;
    throw Object.assign(new Error('Request failed'), {
      config, response: { status: 500, data: { message: 'Server error' } },
    });
  };
  await assert.rejects(saveProfileSettingsFields({ raw: savedUser }, { dob: '2001-08-12' }), /Server error/);
  assert.equal(requests, 1);
  assert.equal(getStoredUser().dob, cachedDob);
});

test('dates from both screenshots, ISO timestamps, and DD-MM-YYYY retain the calendar day', () => {
  for (const [input, expected] of [
    ['1999-01-22', '1999-01-22'],
    ['2000-05-06', '2000-05-06'],
    ['22-01-1999', '1999-01-22'],
    ['1999-01-22T00:00:00.000Z', '1999-01-22'],
    ['2000-05-06T00:00:00+05:30', '2000-05-06'],
  ]) {
    assert.equal(normalizeDatePickerValue(input), expected);
    assert.equal(validateDatePickerValue(input), '');
    assert.deepEqual(buildProfileSettingsUpdatePayload({ dob: input }), { dob: expected, dateOfBirth: expected });
  }
});

test('invalid calendar dates, future dates, and years before 1900 are rejected', () => {
  for (const date of ['2001-02-29', '2000-02-30', '2000-13-01', '2000-01-32', '2000-05-06garbage', 'invalid']) {
    assert.equal(validateDatePickerValue(date), 'Enter a valid date of birth.');
  }
  assert.equal(validateDatePickerValue('2000-02-29'), '');
  assert.equal(validateDatePickerValue('1899-12-31'), 'Year must be 1900 or later.');
  assert.equal(validateDatePickerValue('9999-01-01'), 'Date of birth cannot be in the future.');
  assert.equal(validateDatePickerValue('', { badInput: true }), 'Enter a valid date of birth.');
});

test('today uses the local calendar date near midnight in positive and negative time zones', () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Kolkata';
    assert.equal(getCurrentDatePickerValue(new Date('2026-10-05T19:00:00Z')), '2026-10-06');
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(getCurrentDatePickerValue(new Date('2026-10-06T01:00:00Z')), '2026-10-05');
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test('selected DOB survives logout and login hydration on localhost and live origins', async () => {
  for (const origin of ['http://localhost:5173', 'https://chatterly.stacklycloud.com']) {
    window.location = new URL(`${origin}/profile/edit`);
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify(savedUser));
    localStorage.setItem('chatterly_chat_messages', 'private messages');
    sessionStorage.setItem('chatterly_pending_login_2fa', 'pending login');
    axiosInstance.defaults.adapter = async (config) => ({
      status: 200, headers: {}, config, data: { user: savedUser },
    });
    await saveProfileSettingsFields({ raw: savedUser }, { dob: '2000-05-06' });
    await clearLogoutCache();

    assert.equal(getStoredUser(), null);
    assert.equal(localStorage.getItem('token'), null);
    assert.equal(localStorage.getItem('user'), null);
    assert.equal(localStorage.getItem('chatterly_profile_cache'), null);
    assert.equal(localStorage.getItem('chatterly_chat_messages'), null);
    assert.equal(sessionStorage.getItem('chatterly_pending_login_2fa'), null);
    assert.deepEqual(JSON.parse(localStorage.getItem(PROFILE_DOB_CACHE_STORAGE_KEY)), {
      'id:current-user': '2000-05-06',
    });

    // Exercise both normal hydration and the login page's fallback path.
    for (const incomingDob of [undefined, '', null, '1999-01-22']) {
      const loginUser = { ...savedUser, dob: incomingDob };
      localStorage.setItem('user', JSON.stringify(loginUser));
      assert.equal((await getProfile()).dob, '2000-05-06');
      const hydrated = persistProfileToStorage(loginUser);
      assert.equal(hydrated.dob, '2000-05-06');
      assert.equal(hydrated.dateOfBirth, '2000-05-06');
      assert.equal(normalizeDatePickerValue(getStoredUser().dob), '2000-05-06');
      await clearLogoutCache();
    }
  }
});

test('logout preserves a date saved before this fix, and account switching keeps dates separate', async () => {
  localStorage.clear();
  localStorage.setItem('user', JSON.stringify({ ...savedUser, dob: '2000-05-06' }));
  await clearLogoutCache();
  // Contact details may change or be reused; the account ID owns the date.
  const otherUser = { ...savedUser, _id: 'other-user', dob: undefined };
  localStorage.setItem('user', JSON.stringify(otherUser));
  assert.equal(getStoredUser().dob, undefined);
  persistProfileToStorage({ ...otherUser, dob: '2002-08-12' });
  await clearLogoutCache();

  localStorage.setItem('user', JSON.stringify({ id: savedUser._id, email: 'changed@example.com' }));
  assert.equal((await getProfile()).dob, '2000-05-06');
  await clearLogoutCache();
  localStorage.setItem('user', JSON.stringify({ userId: otherUser._id }));
  assert.equal((await getProfile()).dob, '2002-08-12');
});

test('successful later DOB edits replace the retained preference without losing it on the next logout', async () => {
  localStorage.clear();
  localStorage.setItem('user', JSON.stringify(savedUser));
  axiosInstance.defaults.adapter = async (config) => ({
    status: 200, headers: {}, config, data: { user: savedUser },
  });
  for (const dob of ['2000-05-06', '2001-08-12']) {
    const nextProfile = await saveProfileSettingsFields({ raw: getStoredUser() }, { dob });
    assert.equal(nextProfile.dob, dob);
    await clearLogoutCache();
    localStorage.setItem('user', JSON.stringify(savedUser));
    assert.equal((await getProfile()).dob, dob);
  }
});
