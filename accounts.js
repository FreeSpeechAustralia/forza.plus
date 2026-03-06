const API_BASE_URL = (
  document.body.dataset.apiBaseUrl ||
  window.FORZA_API_BASE_URL ||
  'https://api.freespeechaustralia.org'
).replace(/\/$/, '');

const STORAGE_EMAIL_KEY = 'forza.accounts.email';
const STORAGE_SESSION_KEY = 'forza.accounts.sessionToken';
const TELEGRAM_LINK_POLL_INTERVAL_MS = 4000;
const TELEGRAM_LINK_POLL_MAX_DURATION_MS = 60000;
const STRIPE_MEMBERSHIP_TIER = 'supporter';
const STRIPE_CREATOR_SLUG = String(document.body.dataset.creatorSlug || 'forza').trim().toLowerCase() || 'forza';

let telegramLinkPollTimeoutId = null;
let telegramLinkPollStopAt = 0;
let telegramLinkPollInFlight = false;

const accountLookupForm = document.getElementById('accountLookupForm');
const accountEmailInput = document.getElementById('accountEmail');
const accountStatusPill = document.getElementById('accountStatusPill');
const accountEmailValue = document.getElementById('accountEmailValue');
const membershipCreator = document.getElementById('membershipCreator');
const membershipTier = document.getElementById('membershipTier');
const membershipStatus = document.getElementById('membershipStatus');
const telegramStatus = document.getElementById('telegramStatus');
const accountsMessage = document.getElementById('accountsMessage');
const logoutSessionButton = document.getElementById('logoutSession');
const telegramToolsSection = document.getElementById('telegramToolsSection');

const createTelegramLinkButton = document.getElementById('createTelegramLink');
const unlinkTelegramButton = document.getElementById('unlinkTelegram');
const telegramLinkResult = document.getElementById('telegramLinkResult');
const telegramTokenValue = document.getElementById('telegramTokenValue');
const telegramDeepLink = document.getElementById('telegramDeepLink');
const telegramExpiry = document.getElementById('telegramExpiry');
const startMembershipCheckoutButton = document.getElementById('startMembershipCheckout');

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
  logoutSessionButton.disabled = isLoading;
  createTelegramLinkButton.disabled = isLoading;
  unlinkTelegramButton.disabled = isLoading;
  if (startMembershipCheckoutButton) {
    startMembershipCheckoutButton.disabled = isLoading;
  }
}

function setCheckoutButtonLoading(isLoading) {
  if (!startMembershipCheckoutButton) {
    return;
  }

  startMembershipCheckoutButton.disabled = isLoading;
  startMembershipCheckoutButton.textContent = isLoading
    ? 'Redirecting...'
    : 'Start Membership - $10';
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

function setTelegramActionButtons(isLinked) {
  const linked = Boolean(isLinked);
  createTelegramLinkButton.hidden = linked;
  unlinkTelegramButton.hidden = !linked;
}

function hideTelegramToolsForSignedOutState() {
  telegramToolsSection.hidden = true;
  setTelegramActionButtons(false);
  clearTelegramTokenResult();
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
    setMessage('Still waiting for Telegram confirmation. Try opening the Telegram deep link again if needed.', 'info');
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
      hideTelegramToolsForSignedOutState();
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
  if (membershipCreator) {
    membershipCreator.textContent = '-';
  }
  membershipTier.textContent = '-';
  membershipStatus.textContent = '-';
  telegramStatus.textContent = 'Not linked';
}

function resolveMembershipForCreator(account) {
  const memberships = Array.isArray(account.memberships)
    ? account.memberships
    : [];

  if (memberships.length > 0) {
    const preferred = memberships.find((entry) => {
      const slug = String(entry?.creatorSlug || '').trim().toLowerCase();
      return slug && slug === STRIPE_CREATOR_SLUG;
    });

    if (preferred) {
      return preferred;
    }

    return memberships[0];
  }

  return account.membership || {};
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

function removeUrlQueryParams(paramNames) {
  const url = new URL(window.location.href);
  let changed = false;

  paramNames.forEach((paramName) => {
    if (!url.searchParams.has(paramName)) {
      return;
    }

    url.searchParams.delete(paramName);
    changed = true;
  });

  if (!changed) {
    return;
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function removeTokenQueryParam() {
  removeUrlQueryParams(['token']);
}

function getStripeReturnState() {
  const searchParams = new URLSearchParams(window.location.search);
  const status = String(searchParams.get('stripe') || '').trim().toLowerCase();
  if (status !== 'success' && status !== 'cancel') {
    return null;
  }

  return {
    status,
    sessionId: String(searchParams.get('session_id') || '').trim() || null,
  };
}

function removeStripeQueryParams() {
  removeUrlQueryParams(['stripe', 'session_id']);
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
  const membership = resolveMembershipForCreator(account);
  const telegram = account.telegram || { linked: false };
  const linked = Boolean(telegram.linked);

  accountEmailValue.textContent = account.user.email || '-';
  if (membershipCreator) {
    membershipCreator.textContent = membership.creatorDisplayName || membership.creatorSlug || '-';
  }
  membershipTier.textContent = membership.tier || 'No tier';
  membershipStatus.textContent = membership.status || 'No membership';
  telegramToolsSection.hidden = false;
  setTelegramActionButtons(linked);

  if (linked) {
    const username = telegram.telegramUsername ? `@${telegram.telegramUsername}` : telegram.telegramUserId;
    telegramStatus.textContent = `Linked (${username})`;
    clearTelegramTokenResult();
    setStatusPill('Linked', 'success');
  } else {
    telegramStatus.textContent = 'Not linked';
    setStatusPill('Loaded', 'neutral');
  }
}

async function startMembershipCheckout() {
  if (!getSessionToken()) {
    setStatusPill('Sign in required', 'neutral');
    setMessage('Sign in with a magic link first, then start membership checkout.', 'info');
    return;
  }

  setCheckoutButtonLoading(true);

  try {
    const payload = await requestJson('/api/v1/stripe/checkout-session', {
      method: 'POST',
      body: {
        tier: STRIPE_MEMBERSHIP_TIER,
        creatorSlug: STRIPE_CREATOR_SLUG,
      },
    });

    const checkoutUrl = payload?.session?.url;
    if (!checkoutUrl) {
      throw new Error('Stripe checkout session was created without a redirect URL.');
    }

    window.location.assign(checkoutUrl);
  } catch (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('session') || normalizedMessage.includes('authentication')) {
      hideTelegramToolsForSignedOutState();
      setStatusPill('Signed out', 'neutral');
      setMessage('Session expired. Sign in again, then retry membership checkout.', 'info');
      return;
    }

    setStatusPill('Error', 'error');
    setMessage(error.message, 'error');
  } finally {
    setCheckoutButtonLoading(false);
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
  hideTelegramToolsForSignedOutState();
  setLoading(true, 'Send sign-in link');

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
  const token = String(tokenOverride || '').trim();
  if (!token) {
    setStatusPill('Error', 'error');
    setMessage('Sign-in token missing. Open the latest sign-in link from your email.', 'error');
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

async function loadAccount({ stripeReturnStatus = null } = {}) {
  stopTelegramLinkPolling();
  if (!getSessionToken()) {
    hideTelegramToolsForSignedOutState();
    setStatusPill('Signed out', 'neutral');
    setMessage('Send a sign-in link and open it from your email to continue.', 'info');
    return;
  }

  setLoading(true, 'Send sign-in link');
  clearTelegramTokenResult();

  try {
    const payload = await requestJson('/api/v1/accounts/me');
    renderAccount(payload.account);

    if (stripeReturnStatus === 'success') {
      setMessage(`Stripe checkout completed. Loaded account for ${payload.account.user.email}`, 'success');
    } else if (stripeReturnStatus === 'cancel') {
      setMessage(`Stripe checkout was canceled. Loaded account for ${payload.account.user.email}`, 'info');
    } else {
      setMessage(`Loaded account for ${payload.account.user.email}`, 'success');
    }
  } catch (error) {
    if (!getSessionToken()) {
      hideTelegramToolsForSignedOutState();
      setStatusPill('Signed out', 'neutral');
      setMessage('Session expired. Send a new sign-in link.', 'info');
      return;
    }

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
    clearAccountView();
    hideTelegramToolsForSignedOutState();

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
      hideTelegramToolsForSignedOutState();
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
    if (error.message.toLowerCase().includes('session')) {
      hideTelegramToolsForSignedOutState();
      setStatusPill('Signed out', 'neutral');
    }

    setMessage(error.message, 'error');
  } finally {
    setLoading(false, 'Send sign-in link');
  }
}

accountLookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await sendMagicLink();
});

logoutSessionButton.addEventListener('click', async () => {
  await logoutSession();
});

createTelegramLinkButton.addEventListener('click', createTelegramLinkToken);
unlinkTelegramButton.addEventListener('click', unlinkTelegram);
if (startMembershipCheckoutButton) {
  startMembershipCheckoutButton.addEventListener('click', startMembershipCheckout);
}

(function init() {
  stopTelegramLinkPolling();
  const savedEmail = localStorage.getItem(STORAGE_EMAIL_KEY);
  accountEmailInput.value = savedEmail || accountEmailInput.placeholder || 'demo@freespeechaustralia.org';
  clearAccountView();
  hideTelegramToolsForSignedOutState();

  const stripeReturnState = getStripeReturnState();
  const tokenFromUrl = new URLSearchParams(window.location.search).get('token');
  if (tokenFromUrl) {
    if (stripeReturnState) {
      removeStripeQueryParams();
    }

    setStatusPill('Verifying', 'neutral');
    verifyMagicLink(tokenFromUrl);
    return;
  }

  if (stripeReturnState) {
    removeStripeQueryParams();
  }

  if (getSessionToken()) {
    setStatusPill('Session found', 'neutral');
    loadAccount({
      stripeReturnStatus: stripeReturnState ? stripeReturnState.status : null,
    });
    return;
  }

  if (stripeReturnState && stripeReturnState.status === 'success') {
    setStatusPill('Sign in required', 'neutral');
    setMessage('Stripe checkout completed. Sign in with your magic link to load updated membership status.', 'info');
    return;
  }

  if (stripeReturnState && stripeReturnState.status === 'cancel') {
    setStatusPill('Signed out', 'neutral');
    setMessage('Stripe checkout was canceled. Sign in or restart membership when ready.', 'info');
    return;
  }

  setStatusPill('Signed out', 'neutral');
  setMessage('Send a magic link to sign in.', 'info');
})();
