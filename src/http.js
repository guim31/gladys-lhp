// -----------------------------------------------------------------------------
// The one HTTP helper of the integration: GET (or POST a form) to the flood
// portals of the German states, with a timeout and an identifying User-Agent.
// Every source is public and keyless: no header ever carries a secret.
// -----------------------------------------------------------------------------

export const USER_AGENT =
  'gladys-lhp (Gladys Assistant integration; +https://github.com/guim31/gladys-lhp)';

export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {number|null} status HTTP status, null for a network error or a bad body
   */
  constructor(message, status = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Fetch `url` and return its body as text (UTF-8).
 * @param {Function} fetchImpl fetch
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {Record<string, string>} [options.form] POST these fields (urlencoded)
 * @param {string} [options.accept]
 * @returns {Promise<string>}
 */
export async function getText(fetchImpl, url, { timeoutMs = 30000, form, accept = '*/*' } = {}) {
  const host = new URL(url).host;
  const init = {
    headers: { Accept: accept, 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (form) {
    init.method = 'POST';
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : err.message;
    throw new HttpError(`${host}: ${reason}`);
  }
  if (response.status !== 200) {
    throw new HttpError(`${host}: HTTP ${response.status}`, response.status);
  }
  return response.text();
}

/** Same as getText, the body parsed as JSON. */
export async function getJson(fetchImpl, url, options = {}) {
  const text = await getText(fetchImpl, url, { accept: 'application/json', ...options });
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(`${new URL(url).host}: the answer is not JSON`, 200);
  }
}
