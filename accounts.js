const API_BASE_URL = (
  document.body.dataset.apiBaseUrl ||
  window.FORZA_API_BASE_URL ||
  'https://api.freespeechaustralia.org'
).replace(/\/$/, '');

const STORAGE_EMAIL_KEY = 'forza.accounts.email';
const STORAGE_SESSION_KEY = 'forza.accounts.sessionToken';
const TELEGRAM_LINK_POLL_INTERVAL_MS = 4000;
const TELEGRAM_LINK_POLL_MAX_DURATION_MS = 60000;

let telegramLinkPollTimeoutId = null;
let telegramLinkPollStopAt = 0;
let telegramLinkPollInFlight = false;

const accountLookupForm = document.getElementById('accountLookupForm');
const accountEmailInput = document.getElementById('accountEmail');
const magicLinkTokenInput = document.getElementById('magicLinkToken');
const accountStatusPill = document.getElementById('accountStatusPill');
const accountEmailValue = document.getElementById('accountEmailValue');
const membershipTier = document.getElementById('membershipTier');
const membershipStatus = document.getElementById('membershipStatus');
const telegramStatus = document.getElementById('telegramStatus');
const accountsMessage = document.getElementById('accountsMessage');
const verifyMagicLinkButton = document.getElementById('verifyMagicLink');
const loadAccountButton = document.getElementById('loadAccount');
const logoutSessionButton = document.getElementById('logoutSession');

const createTelegramLinkButton = document.getElementById('createTelegramLink');
const unlinkTelegramButton = document.getElementById('unlinkTelegram');
const telegramLinkResult = document.getElementById('telegramLinkResult');
const telegramTokenValue = document.getElementById('telegramTokenValue');
const telegramDeepLink = document.getElementById('telegramDeepLink');
const telegramExpiry = document.getElementById('telegramExpiry');

function getActiveEmail() {
  return String(accountEmailInput.value || '').trim().toLowerCase();
}

function setMessage(text, tone = 'info') {
  accountsMessage.textContent = text;
  accountsMessage.dataset.tone = tone;
}

function setLoading(isLoading, submitLabel = 'Send sign-in link') {
  const label = isLoading ? 'Working...' : submitLabel;
  const submitButton = accountLookupForm.querySelector('button[type="submit"]');
  submitButton.textContent = label;
  submitButton.disabled = isLoading;
  verifyMagicLinkButton.disabled = isLoading;
  loadAccountButton.disabled = isLoading;
  logoutSessionButton.disabled = isLoading;
  createTelegramLinkButton.disabled = isLoading;
  unlinkTelegramButton.disabled = isLoading;
}

function setStatusPill(text, tone = 'neutral') {
  accountStatusPill.textContent = text;
  accountStatusPill.dataset.tone = tone;
}

function clearTelegramTokenResult() {
  telegramLinkResult.hidden = true;
  telegramTokenValue.textContent = '';
  telegramDeepLink.removeAttribute('href');
  telegramDeepLink.textContent = 'Open bot link';
  telegramExpiry.textContent = '-';
}

function stopTelegramLinkPolling() {
  if (telegramLinkPollTimeoutId) {
    window.clearTimeout(telegramLinkPollTimeoutId);
  }

  telegramLinkPollTimeoutId = null;
  telegramLinkPollStopAt = 0;
  telegramLinkPollInFlight = false;
}

async function pollTelegramLinkStatus() {
  if (!telegramLinkPollTimeoutId) {
    return;
  }

  if (Date.now() >= telegramLinkPollStopAt) {
    stopTelegramLinkPolling();
    setMessage('Still waiting for Telegram confirmation. If you already completed it, click "Load account".', 'info');
    return;
  }

  if (telegramLinkPollInFlight) {
    telegramLinkPollTimeoutId = window.setTimeout(pollTelegramLinkStatus, TELEGRAM_LINK_POLL_INTERVAL_MS);
    return;
  }

  telegramLinkPollInFlight = true;

  try {
    const payload = await requestJson('/api/v1/accounts/me');
    const telegram = payload && payload.account ? payload.account.telegram : null;

    if (telegram && telegram.linked) {
      renderAccount(payload.account);
      const identity = telegram.telegramUsername ? `@${telegram.telegramUsername}` : telegram.telegramUserId;
      setMessage(`Telegram linked successfully (${identity}).`, 'success');
      stopTelegramLinkPolling();
      return;
    }
  } catch (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('session') || normalizedMessage.includes('authentication')) {
      stopTelegramLinkPolling();
      setStatusPill('Signed out', 'neutral');
      setMessage('Session expired while checking Telegram link. Sign in again and retry.', 'info');
      return;
    }
  } finally {
    telegramLinkPollInFlight = false;
  }

  if (!telegramLinkPollStopAt) {
    return;
  }

  telegramLinkPollTimeoutId = window.setTimeout(pollTelegramLinkStatus, TELEGRAM_LINK_POLL_INTERVAL_MS);
}

function startTelegramLinkPolling(expiresAtInput) {
  stopTelegramLinkPolling();

  const tokenExpiryMs = new Date(expiresAtInput).getTime();
  const fallbackStopAt = Date.now() + TELEGRAM_LINK_POLL_MAX_DURATION_MS;
  telegramLinkPollStopAt = Number.isFinite(tokenExpiryMs)
    ? Math.min(tokenExpiryMs, fallbackStopAt)
    : fallbackStopAt;

  telegramLinkPollTimeoutId = window.setTimeout(pollTelegramLinkStatus, TELEGRAM_LINK_POLL_INTERVAL_MS);
}

function clearAccountView() {
  accountEmailValue.textContent = '-';
  membershipTier.textContent = '-';
  membershipStatus.textContent = '-';
  telegramStatus.textContent = 'Not linked';
}

function getSessionToken() {
  return String(localStorage.getItem(STORAGE_SESSION_KEY) || '').trim();
}

function setSessionToken(token) {
  localStorage.setItem(STORAGE_SESSION_KEY, String(token || ''));
}

function clearSessionToken() {
  localStorage.removeItem(STORAGE_SESSION_KEY);
}

function removeTokenQueryParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('token')) {
    return;
  }

  url.searchParams.delete('token');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function buildHeaders({ includeAuth = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getSessionToken();
    if (!token) {
      throw new Error('You need to sign in with a magic link first.');
    }

    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function requestJson(path, options = {}) {
  const includeAuth = options.includeAuth !== false;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...buildHeaders({ includeAuth }),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage = payload && payload.error && payload.error.message
      ? payload.error.message
      : `Request failed (${response.status})`;

    if (response.status === 401) {
      clearSessionToken();
    }

    throw new Error(apiMessage);
  }

  return payload;
}

function renderAccount(account) {
  const membership = account.membership || {};
  const telegram = account.telegram || { linked: false };

  accountEmailValue.textContent = account.user.email || '-';
  membershipTier.textContent = membership.tier || 'No tier';
  membershipStatus.textContent = membership.status || 'No membership';

  if (telegram.linked) {
    const username = telegram.telegramUsername ? `@${telegram.telegramUsername}` : telegram.telegramUserId;
    telegramStatus.textContent = `Linked (${username})`;
    setStatusPill('Linked', 'success');
  } else {
    telegramStatus.textContent = 'Not linked';
    setStatusPill('Loaded', 'neutral');
  }
}

async function sendMagicLink() {
  const email = getActiveEmail();
  if (!email) {
    setStatusPill('Error', 'error');
    setMessage('Enter an account email first.', 'error');
    return;
  }

  stopTelegramLinkPolling();
  localStorage.setItem(STORAGE_EMAIL_KEY, email);
  clearSessionToken();
  clearAccountView();
  setLoading(true, 'Send sign-in link');
  clearTelegramTokenResult();

  try {
    await requestJson('/api/v1/auth/email/start', {
      method: 'POST',
      includeAuth: false,
      body: { email },
    });

    setStatusPill('Link sent', 'neutral');
    setMessage(`Sign-in link sent to ${email}. Check your inbox and click the link.`, 'success');
  } catch (error) {
    setStatusPill('Error', 'error');
    setMessage(error.message, 'error');
  } finally {
    setLoading(false, 'Send sign-in link');
  }
}

async function verifyMagicLink(tokenOverride) {
  const token = String(tokenOverride || magicLinkTokenInput.value || '').trim();
  if (!token) {
    setStatusPill('Error', 'error');
    setMessage('Paste a magic-link token or open accounts page from your email link.', 'error');
    return;
  }

  stopTelegramLinkPolling();
  setLoading(true, 'Send sign-in link');

  try {
    const payload = await requestJson('/api/v1/auth/email/verify', {
      method: 'POST',
      includeAuth: false,
      body: { token },
    });

    setSessionToken(payload.session.token);
    renderAccount(payload.account);
    magicLinkTokenInput.value = '';
    removeTokenQueryParam();

    if (payload.createdAccount) {
      setMessage(`Signed in and created account for ${payload.account.user.email}.`, 'success');
    } else {
      setMessage(`Signed in as ${payload.account.user.email}.`, 'success');
    }

    setStatusPill('Authenticated', 'success');
  } catch (error) {
    setStatusPill('Error', 'error');
    setMessage(error.message, 'error');
  } finally {
    setLoading(false, 'Send sign-in link');
  }
}

async function loadAccount() {
  stopTelegramLinkPolling();
  if (!getSessionToken()) {
    setStatusPill('Signed out', 'neutral');
    setMessage('Send and verify a magic link before loading account details.', 'info');
    return;
  }

  setLoading(true, 'Send sign-in link');
  clearTelegramTokenResult();

  try {
    const payload = await requestJson('/api/v1/accounts/me');
    renderAccount(payload.account);
    setMessage(`Loaded account for ${payload.account.user.email}`, 'success');
  } catch (error) {
    setStatusPill('Error', 'error');
    setMessage(error.message, 'error');
  } finally {
    setLoading(false, 'Send sign-in link');
  }
}

async function logoutSession() {
  const hasSession = Boolean(getSessionToken());
  let logoutError = null;

  stopTelegramLinkPolling();
  setLoading(true, 'Send sign-in link');

  try {
    if (hasSession) {
      await requestJson('/api/v1/auth/logout', {
        method: 'POST',
        body: {},
      });
    }
  } catch (error) {
    logoutError = error;
  } finally {
    clearSessionToken();
    clearTelegramTokenResult();
    clearAccountView();

    if (logoutError) {
      setStatusPill('Signed out', 'neutral');
      setMessage(`Signed out locally. Server response: ${logoutError.message}`, 'info');
    } else {
      setStatusPill('Signed out', 'neutral');
      setMessage('Signed out. Send a new magic link to continue.', 'info');
    }

    setLoading(false, 'Send sign-in link');
  }
}

async function createTelegramLinkToken() {
  stopTelegramLinkPolling();
  setLoading(true, 'Send sign-in link');

  try {
    const payload = await requestJson('/api/v1/accounts/telegram/link/start', {
      method: 'POST',
      body: {},
    });

    const linkToken = payload.linkToken;
    telegramTokenValue.textContent = linkToken.telegramStartToken || linkToken.token;

    if (linkToken.telegramDeepLink) {
      telegramDeepLink.href = linkToken.telegramDeepLink;
      telegramDeepLink.textContent = linkToken.telegramDeepLink;
    } else {
      telegramDeepLink.removeAttribute('href');
      telegramDeepLink.textContent = 'No TELEGRAM_BOT_USERNAME configured on API';
    }

    telegramExpiry.textContent = new Date(linkToken.expiresAt).toLocaleString();
    telegramLinkResult.hidden = false;

    setMessage('Telegram link token created. Open the deep link in Telegram; we will auto-check link status for about a minute.', 'success');
    startTelegramLinkPolling(linkToken.expiresAt);
  } catch (error) {
    if (error.message.toLowerCase().includes('session')) {
      setStatusPill('Signed out', 'neutral');
    }
    setMessage(error.message, 'error');
  } finally {
    setLoading(false, 'Send sign-in link');
  }
}

async function unlinkTelegram() {
  stopTelegramLinkPolling();
  setLoading(true, 'Send sign-in link');

  try {
    const payload = await requestJson('/api/v1/accounts/telegram/unlink', {
      method: 'POST',
      body: {},
    });

    setMessage(payload.message, 'success');
    clearTelegramTokenResult();
    await loadAccount();
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    setLoading(false, 'Send sign-in link');
  }
}

accountLookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await sendMagicLink();
});

verifyMagicLinkButton.addEventListener('click', async () => {
  await verifyMagicLink();
});

loadAccountButton.addEventListener('click', async () => {
  await loadAccount();
});

logoutSessionButton.addEventListener('click', async () => {
  await logoutSession();
});

createTelegramLinkButton.addEventListener('click', createTelegramLinkToken);
unlinkTelegramButton.addEventListener('click', unlinkTelegram);

(function init() {
  stopTelegramLinkPolling();
  const savedEmail = localStorage.getItem(STORAGE_EMAIL_KEY);
  accountEmailInput.value = savedEmail || accountEmailInput.placeholder || 'demo@freespeechaustralia.org';
  clearAccountView();
  clearTelegramTokenResult();

  const tokenFromUrl = new URLSearchParams(window.location.search).get('token');
  if (tokenFromUrl) {
    magicLinkTokenInput.value = tokenFromUrl;
    setStatusPill('Verifying', 'neutral');
    verifyMagicLink(tokenFromUrl);
    return;
  }

  if (getSessionToken()) {
    setStatusPill('Session found', 'neutral');
    loadAccount();
    return;
  }

  setStatusPill('Signed out', 'neutral');
  setMessage('Send a magic link to sign in.', 'info');
})();
