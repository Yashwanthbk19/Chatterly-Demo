// The chat list, its per-chat previews and the group previews are each loaded once
// after sign-in. A single hiccup (a 502 while the server is busy, a dropped
// connection, a timeout) used to leave those rows on "No messages" - or the whole
// list empty - until the user reloaded. These helpers retry only failures that
// can pass on their own.

// No response at all (network error / timeout) or a server-side hiccup. Anything
// else - a cancelled request, 401/403/404 - will not change by asking again.
export const isTransientRequestError = (error) => {
  if (!error) return false;

  if (
    error.code === 'ERR_CANCELED' ||
    error.name === 'CanceledError' ||
    error.name === 'AbortError'
  ) {
    return false;
  }

  const status = Number(error.status || error.response?.status || 0);
  if (!status) return true;

  return status === 408 || status === 425 || status === 429 || status >= 500;
};

const getSessionToken = () => {
  try {
    return String(localStorage.getItem('token') || '');
  } catch {
    return '';
  }
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const retryTransient = async (
  task,
  {
    retries = 2,
    delaysMs = [800, 2000],
    // A request that hangs until its timeout must not be asked again and again.
    budgetMs = 35000,
    shouldRetry = isTransientRequestError,
  } = {}
) => {
  const startedAt = Date.now();
  const startedSessionToken = getSessionToken();
  let attempt = 0;

  for (;;) {
    try {
      return await task(attempt);
    } catch (error) {
      const delayMs = delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? 1000;
      const isSameSession = getSessionToken() === startedSessionToken;
      if (
        attempt >= retries ||
        !isSameSession ||
        !shouldRetry(error) ||
        Date.now() - startedAt + delayMs > budgetMs
      ) {
        throw error;
      }

      await wait(delayMs);
      attempt += 1;
    }
  }
};
