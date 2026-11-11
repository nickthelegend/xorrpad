import '@fontsource-variable/manrope';
import './style.css';

export async function request(path, options) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(20000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Service unavailable. Please try again later.'); }
  if (!response.ok) throw new Error(data.error || 'Service unavailable. Please try again later.');
  return data;
}

const waitlistForm = document.querySelector('#waitlist-form');
const waitlistMessage = document.querySelector('#waitlist-message');
const waitlistButton = waitlistForm.querySelector('button');
const count = document.querySelector('#waitlist-count');
function showCount(value) {
  if (Number.isSafeInteger(value) && value >= 0) count.textContent = `${value.toLocaleString()} ${value === 1 ? 'person' : 'people'} on the waitlist · live from our signup service`;
}
waitlistButton.disabled = false;
waitlistMessage.textContent = '';
request('/api/waitlist').then(data => showCount(data.count)).catch(error => {
  count.textContent = 'Waitlist count unavailable.';
  waitlistMessage.textContent = error.message;
});
waitlistForm.addEventListener('submit', async event => {
  event.preventDefault();
  waitlistButton.disabled = true;
  waitlistButton.textContent = 'Joining…';
  waitlistMessage.textContent = 'Saving your signup…';
  try {
    const data = await request('/api/waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(waitlistForm))),
    });
    showCount(data.count);
    waitlistMessage.textContent = data.message;
    waitlistForm.reset();
  } catch (error) { waitlistMessage.textContent = error.message; }
  finally { waitlistButton.disabled = false; waitlistButton.textContent = 'Join the waitlist ↗'; }
});
