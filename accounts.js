const API_BASE_URL = (
  document.body.dataset.apiBaseUrl ||
  window.FORZA_API_BASE_URL ||
  'https://api.freespeechaustralia.org'
).replace(/\/$/, '');

const STORAGE_KEY = 'forza.accounts.email';

const accountLookupForm = document.getElementById('accountLookupForm');
const accountEmailInput = document.getElementById('accountEmail');
const accountStatusPill = document.getElementById('accountStatusPill');
const accountDisplayName = document.getElementById('accountDisplayName');
const accountEmailValue = document.getElementById('accountEmailValue');
const membershipTier = document.getElementById('membershipTier');
const membershipStatus = document.getElementById('membershipStatus');
const telegramStatus = document.getElementById('telegramStatus');
const accountsMessage = document.getElementById('accountsMessage');

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

function setLoading(isLoading) {
  const label = isLoading ? 'Loading...' : 'Load account';
  const submitButton = accountLookupForm.querySelector('button[type="submit"]');
  submitButton.textContent = label;
  submitButton.disabled = isLoading;
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

function buildHeaders() {
  const email = getActiveEmail();
  if (!email) {
    throw new Error('Enter an account email first.');
  }

  return {
    'Content-Type': 'application/json',
    'x-user-email': email,
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...buildHeaders(),
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
    throw new Error(apiMessage);
  }

  return payload;
}

function renderAccount(account) {
  const membership = account.membership || {};
  const telegram = account.telegram || { linked: false };

  accountDisplayName.textContent = account.user.displayName || '-';
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

async function loadAccount() {
  const email = getActiveEmail();
  if (!email) {
    setStatusPill('Error', 'error');
    setMessage('Enter an account email first.', 'error');
    return;
  }

  localStorage.setItem(STORAGE_KEY, email);
  setLoading(true);
  clearTelegramTokenResult();

  try {
    const payload = await requestJson('/api/v1/accounts/me');
    renderAccount(payload.account);
    setMessage(`Loaded account for ${payload.account.user.email}`, 'success');
  } catch (error) {
    setStatusPill('Error', 'error');
    setMessage(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function createTelegramLinkToken() {
  setLoading(true);

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

    setMessage('Telegram link token created. Open the deep link to continue.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function unlinkTelegram() {
  setLoading(true);

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
    setLoading(false);
  }
}

accountLookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadAccount();
});

createTelegramLinkButton.addEventListener('click', createTelegramLinkToken);
unlinkTelegramButton.addEventListener('click', unlinkTelegram);

(function init() {
  const savedEmail = localStorage.getItem(STORAGE_KEY);
  accountEmailInput.value = savedEmail || accountEmailInput.placeholder || 'demo@freespeechaustralia.org';
  clearTelegramTokenResult();
  setStatusPill('Not loaded');
  loadAccount();
})();
