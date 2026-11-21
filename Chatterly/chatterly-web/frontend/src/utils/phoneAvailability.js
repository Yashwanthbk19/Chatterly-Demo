import { normalizePhone } from './formValidators.js';

const accountId = (user) => String(user?._id || user?.id || user?.userId || '').trim();

export const isPhoneAvailable = async (phone, currentUser, lookup, normalize = normalizePhone) => {
  let users;
  try {
    users = await lookup(phone);
  } catch (error) {
    const status = error?.status || error?.response?.status;
    // This lookup is advisory. Profile save enforces uniqueness; a gateway
    // outage or network timeout must not prevent Firebase from sending SMS.
    if (status >= 500 || (!status && ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error?.code))) {
      return true;
    }
    throw error;
  }

  const matches = users.filter((user) =>
    normalize(user?.phone || user?.phoneNumber || user?.mobile || '') === phone
  );
  return matches.every((user) => {
    const currentId = accountId(currentUser);
    const matchedId = accountId(user);
    if (currentId && matchedId) return currentId === matchedId;
    return !matchedId && normalize(currentUser?.phone || currentUser?.mobile || '') === phone;
  });
};
