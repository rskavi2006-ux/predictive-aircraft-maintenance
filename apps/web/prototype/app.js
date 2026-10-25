// AeroGuard prototype UI: plain JavaScript, no build step. It talks to the real API.
// Tab files (tabs-*.js) register themselves with registerTab().
const API = 'http://localhost:4000/api/v1';
const TABS = [];
const state = {
  token: sessionStorage.getItem('ag_token'),
  user: JSON.parse(sessionStorage.getItem('ag_user') || 'null'),
  tab: null,
};

const esc = (v) =>
  String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function registerTab(tab) {
  TABS.push(tab);
}

function notify(msg, bad) {
  const n = document.getElementById('notice');
  n.textContent = msg;
  n.className = 'notice ' + (bad ? 'bad' : 'ok');
}

function clearNotice() {
  const n = document.getElementById('notice');
  n.textContent = '';
  n.className = 'notice';
}

async function api(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (state.token) headers.authorization = 'Bearer ' + state.token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (res.status === 401 && state.token) {
    signOut();
    throw new Error('Session expired, please sign in again');
  }
  if (!res.ok) {
    const e = data && data.error;
    throw new Error(e ? e.message + (e.code ? ' (' + e.code + ')' : '') : 'HTTP ' + res.status);
  }
  return data;
}

function signOut() {
  sessionStorage.clear();
  state.token = null;
  state.user = null;
  state.tab = null;
  render();
}

function renderLogin(app) {
  app.innerHTML =
    '<form id="login" class="card login"><h2>AeroGuard</h2>' +
    '<p class="muted">Predict. Plan. Comply. All data is simulated.</p>' +
    '<label>Username</label><input id="u" autocomplete="username" autofocus>' +
    '<label>Password</label><input id="p" type="password" autocomplete="current-password">' +
    '<button>Sign in</button><p id="loginerr" class="err"></p>' +
    '</form>';
  document.getElementById('login').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('POST', '/auth/login', {
        username: document.getElementById('u').value.trim(),
        password: document.getElementById('p').value,
      });
      state.token = r.token;
      state.user = r.user;
      sessionStorage.setItem('ag_token', r.token);
      sessionStorage.setItem('ag_user', JSON.stringify(r.user));
      render();
    } catch (e2) {
      document.getElementById('loginerr').textContent = e2.message;
    }
  };
}

function render() {
  clearNotice();
  const app = document.getElementById('app');
  if (!state.user) return renderLogin(app);
  const u = state.user;
  const tabs = TABS.filter((t) => !t.roles || t.roles.includes(u.role));
  if (!tabs.find((t) => t.id === state.tab) && tabs.length) state.tab = tabs[0].id;
  app.innerHTML =
    '<header class="top"><h2 style="margin:0">AeroGuard</h2><div>' +
    esc(u.name) + ' (' + esc(u.username) + ') &middot; ' + esc(u.role) +
    (u.licenseCategory ? ' ' + esc(u.licenseCategory) : '') +
    ' <button id="signout" type="button">Sign out</button></div></header>' +
    '<div class="tabs">' +
    tabs.map((t) => '<button type="button" class="' + (t.id === state.tab ? 'active' : '') + '" data-tab="' + esc(t.id) + '">' + esc(t.label) + '</button>').join('') +
    '</div><div id="content"></div>';
  document.getElementById('signout').onclick = signOut;
  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => {
      state.tab = b.dataset.tab;
      render();
    };
  });
  const tab = tabs.find((t) => t.id === state.tab);
  if (tab) {
    const el = document.getElementById('content');
    el.textContent = 'Loading...';
    tab.render(el).catch((e) => {
      el.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
    });
  }
}

// Optional tab files load in this order; a missing file is skipped.
const MODULES = ['tabs-predict.js', 'tabs-plan.js', 'tabs-admin.js'];
function loadModule(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}
(async () => {
  for (const m of MODULES) await loadModule(m);
  render();
})();
