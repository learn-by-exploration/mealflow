let isRegister = false;
const form = document.getElementById('login-form');
const toggleLink = document.getElementById('toggle-link');
const toggleText = document.getElementById('toggle-text');
const nameGroup = document.getElementById('name-group');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const rememberGroup = document.getElementById('remember-group');

// Issue 14: Redirect already-authenticated users
(async () => {
  try {
    const r = await fetch('/api/auth/session');
    if (r.ok) window.location.href = '/';
  } catch {}
})();

toggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  isRegister = !isRegister;
  nameGroup.style.display = isRegister ? 'block' : 'none';
  rememberGroup.style.display = isRegister ? 'none' : 'flex';
  submitBtn.textContent = isRegister ? 'Register' : 'Login';
  toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  toggleLink.textContent = isRegister ? 'Login' : 'Register';
  errorMsg.style.display = 'none';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.style.display = 'none';

  // Issue 13: Disable button during submit
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Please wait...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
  const body = { email, password };
  if (isRegister) body.display_name = document.getElementById('display_name').value.trim();
  else body.remember = document.getElementById('remember').checked;

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      errorMsg.textContent = data.error || 'Something went wrong';
      errorMsg.style.display = 'block';
      return;
    }
    window.location.href = '/';
  } catch {
    errorMsg.textContent = 'Network error — please try again';
    errorMsg.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});
