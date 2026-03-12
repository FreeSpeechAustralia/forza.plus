const API_BASE_URL = (
  document.body.dataset.apiBaseUrl
  || window.FORZA_API_BASE_URL
  || 'https://api.freespeechaustralia.org'
).replace(/\/$/, '');

const STORAGE_SESSION_KEY = 'forza.accounts.sessionToken';
const STRIPE_MEMBERSHIP_TIER = 'supporter';
const STRIPE_CREATOR_SLUG = String(document.body.dataset.creatorSlug || 'forza').trim().toLowerCase() || 'forza';

const startMembershipCheckoutLink = document.getElementById('exclusiveStartMembershipCheckout');
const membershipCheckoutMessage = document.getElementById('membershipCheckoutMessage');

function getSessionToken() {
  return String(localStorage.getItem(STORAGE_SESSION_KEY) || '').trim();
}

function setCheckoutMessage(text, tone = 'info') {
  if (!membershipCheckoutMessage) {
    return;
  }

  membershipCheckoutMessage.hidden = !text;
  membershipCheckoutMessage.textContent = text;
  membershipCheckoutMessage.dataset.tone = tone;
}

function setCheckoutLoading(isLoading) {
  if (!startMembershipCheckoutLink) {
    return;
  }

  startMembershipCheckoutLink.dataset.loading = String(isLoading);
  startMembershipCheckoutLink.style.pointerEvents = isLoading ? 'none' : '';
  startMembershipCheckoutLink.textContent = isLoading
    ? 'Redirecting...'
    : 'Start Membership - $10';
}

async function requestCheckoutSession(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/stripe/checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tier: STRIPE_MEMBERSHIP_TIER,
      creatorSlug: STRIPE_CREATOR_SLUG,
    }),
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
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }

    throw new Error(apiMessage);
  }

  const checkoutUrl = payload && payload.session ? payload.session.url : null;
  if (!checkoutUrl) {
    throw new Error('Stripe checkout session was created without a redirect URL.');
  }

  return checkoutUrl;
}

async function handleStartMembership(event) {
  event.preventDefault();

  const sessionToken = getSessionToken();
  if (!sessionToken) {
    window.location.assign('/accounts');
    return;
  }

  setCheckoutLoading(true);
  setCheckoutMessage('', 'info');

  try {
    const checkoutUrl = await requestCheckoutSession(sessionToken);
    window.location.assign(checkoutUrl);
  } catch (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('session') || normalizedMessage.includes('authentication')) {
      window.location.assign('/accounts');
      return;
    }

    setCheckoutMessage(error.message, 'error');
  } finally {
    setCheckoutLoading(false);
  }
}

if (startMembershipCheckoutLink) {
  startMembershipCheckoutLink.addEventListener('click', handleStartMembership);
}
