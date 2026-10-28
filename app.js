/* Digital Legacy — secure web workspace.
   This front end contains no secrets and no security decisions. Authentication,
   OTP verification, identity approval, security codes and document access are
   enforced entirely by the backend at /api; the server session lives in an
   HttpOnly cookie, so this file never handles passwords or tokens directly. */
const $ = (selector, root = document) => (typeof root === 'string' ? (document.querySelector(root) || document) : root).querySelector(selector);
const $$ = (selector, root = document) => [...(typeof root === 'string' ? (document.querySelector(root) || document) : root).querySelectorAll(selector)];
const THEME_KEY = 'digitalLegacy:theme';
function readStoredTheme() { try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') return t; } catch (e) {} return 'dark'; }
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#eef3f8' : '#071521');
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  if (app.user) toast(next === 'light' ? 'Light mode on.' : 'Dark mode on.');
}

const app = {
  user: null,
  capability: null,
  nominees: [],
  documents: [],
  access: null,      // GET /api/owners/access aggregate
  audit: [],
  page: 'dashboard',
  timers: [],        // intervals cleared on every render
  cooldowns: {},     // nomineeId -> timestamp when resend unlocks
  portal: { mobile: '', session: null }
};

const pageTitles = {
  dashboard: 'Overview', legacy: 'My Documents', nominees: 'Nominees & Access',
  portal: 'Nominee Access', security: 'Security & Privacy',
  notifications: 'Activity', settings: 'Profile & Settings'
};
const RELATIONS = ['Family member', 'Partner', 'Friend', 'Legal representative', 'Other'];
const docMeta = {
  'Financial account': { icon: '₹', tone: 'blue', desc: 'Banking and financial records' },
  'Insurance': { icon: '◇', tone: 'blue', desc: 'Policies and certificates' },
  'Important documents': { icon: '▤', tone: 'orange', desc: 'Wills, deeds and key documents' },
  'Social media': { icon: '◎', tone: 'orange', desc: 'Social account records' },
  'Investment': { icon: '↗', tone: 'mint', desc: 'Property, trading and portfolio records' },
  'Digital service': { icon: '⌘', tone: 'blue', desc: 'Subscriptions and online services' },
  'Other': { icon: '＋', tone: 'mint', desc: 'Everything else you choose to keep' }
};
const auditLabels = {
  account_created: ['Account created', 'Your Digital Legacy account was created.'],
  login_success: ['Signed in', 'A new session was opened for your account.'],
  login_failed: ['Failed sign-in attempt', 'An incorrect email or password was used.'],
  profile_updated: ['Profile updated', 'Your account details were changed.'],
  nominee_added: ['Nominee added', 'A trusted nominee was added to your plan.'],
  nominee_updated: ['Nominee updated', 'A nominee record was changed.'],
  nominee_removed: ['Nominee removed', 'A nominee was removed from your plan.'],
  nominee_otp_requested: ['Verification code sent', 'An SMS verification code was requested for a nominee.'],
  nominee_otp_failed: ['Verification failed', 'An incorrect verification code was entered.'],
  nominee_verified: ['Nominee mobile verified', 'A nominee confirmed their mobile number with a valid OTP.'],
  identity_doc_uploaded: ['Identity document uploaded', 'An identity document was uploaded and is awaiting your review.'],
  identity_doc_approved: ['Identity document approved', 'You approved a nominee identity document.'],
  identity_doc_rejected: ['Identity document rejected', 'An identity document was sent back.'],
  identity_doc_deleted: ['Identity document removed', 'An identity document record was deleted.'],
  identity_doc_accessed: ['Identity document opened', 'An identity document was viewed or downloaded.'],
  document_uploaded: ['Document uploaded', 'A document was added to your secure vault.'],
  document_updated: ['Document updated', 'A document record was changed.'],
  document_deleted: ['Document deleted', 'A document was removed from your vault.'],
  document_viewed: ['Document opened', 'One of your documents was previewed.'],
  document_downloaded: ['Document downloaded', 'One of your documents was downloaded.'],
  security_code_blocked: ['Code blocked', 'A security code request was blocked until identity is approved.'],
  security_code_generated: ['Security code generated', 'A new nominee security code was issued.'],
  security_code_revoked: ['Security code revoked', 'A security code was cancelled.'],
  portal_granted: ['Nominee access granted', 'A nominee redeemed a security code.'],
  portal_denied: ['Nominee access refused', 'A security code redemption did not grant access.'],
  portal_unknown_code: ['Unknown security code', 'A redemption attempt used a code that does not exist.'],
  portal_no_code: ['Code requested by nominee', 'A registered nominee asked for their security code.'],
  portal_invalid_number: ['Invalid portal number', 'An invalid mobile number was entered on the access portal.'],
  portal_document_accessed: ['Shared document opened', 'A nominee opened a document released to them.'],
  portal_document_denied: ['Document access denied', 'A nominee tried to open a document outside their permission.']
};

/* ---------- small UI helpers (kept from the original design system) ---------- */
function toast(message, ms = 3000) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__dlToastTimer);
  window.__dlToastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function esc(value = '') { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function attr(value = '') { return esc(value).replace(/`/g, '&#96;'); }
function dateLabel(value = new Date()) { return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function dateTimeLabel(value) { return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
function sizeLabel(bytes) { if (!bytes) return ''; const kb = bytes / 1024; return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`; }
function setHidden(selector, hidden) { const el = $(selector); if (el) el.classList.toggle('hidden', !!hidden); }
function closeModal() { $('#modalBackdrop').classList.add('hidden'); $('#modalContent').innerHTML = ''; }
function openModal(html) {
  $('#modalContent').innerHTML = html;
  $('#modalBackdrop').classList.remove('hidden');
  const firstHeading = $('#modalContent h2');
  if (firstHeading) firstHeading.id = 'modalTitle';
  setTimeout(() => $('#modalContent input:not([type=hidden]), #modalContent select, #modalContent textarea, #modalContent button')?.focus(), 60);
}
function showAuthPanel(which = 'welcome') {
  ['welcomePanel', 'loginPanel', 'registerPanel'].forEach(id => $('#' + id).classList.toggle('hidden', id !== which + 'Panel'));
}
function pageHeader(kicker, title, description, actions = '') {
  return `<div class="page-heading"><div><div class="page-kicker">${esc(kicker)}</div><h1>${title}</h1><p>${esc(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
function iconMark(icon, tone = 'blue') { return `<span class="record-icon ${tone}">${icon}</span>`; }
function emptyState(icon, title, description, buttonText = '', action = '') {
  return `<div class="empty-state"><div class="empty-symbol">${icon}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${buttonText ? `<button class="primary-btn" ${action}>${esc(buttonText)} <span>→</span></button>` : ''}</div>`;
}
function statusClass(status = '') {
  if (/approved|verified|active|complete|granted/i.test(status)) return 'success';
  if (/pending|waiting|awaiting|review|not submitted|registered/i.test(status)) return 'pending';
  if (/revoked|expired|used|failed|removed|inactive|refused/i.test(status)) return 'danger';
  return 'info';
}
function statusPill(status) { return `<span class="status-pill ${statusClass(status)}">${esc(status || 'Not submitted')}</span>`; }
function spinner(label = 'Loading…') { return `<div class="empty-state"><div class="empty-symbol dl-spin">◌</div><h3>${esc(label)}</h3></div>`; }
function relTime(ts) {
  const t = Date.parse(ts); if (!Number.isFinite(t)) return 'Recently';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  if (s < 604800) return Math.floor(s / 86400) + ' days ago';
  return dateLabel(new Date(t));
}

/* ---------- API layer ---------- */
class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error && body.error.message) || 'The server could not be reached.');
    this.status = status;
    this.code = body && body.error ? body.error.code : 'network';
    this.reason = body && body.error ? body.error.reason : null;
    this.field = body && body.error ? body.error.field : null;
    this.attemptsLeft = body && body.error ? body.error.attemptsLeft : undefined;
    this.retryAfter = body && body.error ? body.error.retryAfter : 0;
  }
}
async function api(method, url, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  let body;
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
  else if (opts.form !== undefined) { body = opts.form; }
  const res = await fetch(url, { method, headers, body, credentials: 'same-origin' });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON (file responses use direct links) */ }
  if (!res.ok || (json && json.ok === false)) {
    const err = new ApiError(res.status, json || { error: { message: `Request failed (${res.status})` } });
    if (res.status === 401 && app.user && url !== '/api/auth/me') forceSignedOut(err.message);
    throw err;
  }
  return json;
}
function forceSignedOut(message) {
  app.user = null; app.nominees = []; app.documents = []; app.access = null; app.audit = [];
  $('#appView').classList.add('hidden'); $('#portalView').classList.add('hidden');
  $('#authView').classList.remove('hidden'); showAuthPanel('login');
  toast(message || 'Your session has expired. Please sign in again.', 4500);
}

/* ---------- data loading ---------- */
async function loadCapability() {
  try { const r = await api('GET', '/api/capability'); app.capability = r.capability; } catch (e) { app.capability = null; }
}
async function loadNominees() {
  const r = await api('GET', '/api/nominees'); app.nominees = r.nominees || [];
  if (r.capability) app.capability = r.capability;
}
async function loadDocuments() { const r = await api('GET', '/api/documents'); app.documents = r.documents || []; }
async function loadAccess() { const r = await api('GET', '/api/owners/access'); app.access = r; app.audit = r.audit || []; }
async function loadAudit() { const r = await api('GET', '/api/owners/audit'); app.audit = r.audit || []; }

function updateGlobalUI() {
  if (!app.user) return;
  const first = (app.user.name || 'User').trim().split(/\s+/)[0] || 'User';
  $('#sidebarUserName').textContent = app.user.name || 'Your account';
  $('#sidebarAvatar').textContent = first.slice(0, 1).toUpperCase();
  $('#topbarAvatar').textContent = first.slice(0, 1).toUpperCase();
  $('#topbarUserName').textContent = first;
  // Activity is server-recorded; the badge simply marks whether any events exist.
  $('#navNotificationCount').classList.add('hidden');
  $('#bnavNotifCount').classList.add('hidden');
  $('#topbarUnreadDot').classList.toggle('show', false);
}

/* ---------- auth (server-side sessions) ---------- */
$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#regName').value.trim(), email = $('#regEmail').value.trim().toLowerCase();
  const mobile = $('#regMobile').value.trim(), password = $('#regPassword').value, confirm = $('#regConfirm').value;
  if (name.length < 2) { toast('Enter your full name.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address.'); return; }
  if (!/^\d{10}$/.test(mobile)) { toast('Enter a 10-digit mobile number.'); return; }
  if (password.length < 8) { toast('Use at least 8 characters for your password.'); return; }
  if (password !== confirm) { toast('Passwords do not match.'); return; }
  if (!$('#consent').checked) { toast('Please accept the privacy principles to continue.'); return; }
  const btn = $('#registerForm button[type=submit]'); btn.disabled = true;
  try {
    await api('POST', '/api/auth/register', { json: { name, email, mobile, password } });
    await enterApp();
    toast('Your account is ready. Welcome to Digital Legacy.', 4000);
  } catch (err) { toast(err.message, 4500); }
  finally { btn.disabled = false; }
});
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase(), password = $('#loginPassword').value;
  const btn = $('#loginForm button[type=submit]'); btn.disabled = true;
  try {
    await api('POST', '/api/auth/login', { json: { email, password } });
    try { if ($('#rememberEmail').checked) localStorage.setItem('digitalLegacy:rememberEmail', email); else localStorage.removeItem('digitalLegacy:rememberEmail'); } catch (e2) {}
    await enterApp();
    toast('Welcome back. Your secure session is open.');
  } catch (err) { toast(err.message, 4500); }
  finally { btn.disabled = false; }
});
async function signOut() {
  try { await api('POST', '/api/auth/logout'); } catch (e) {}
  app.user = null; app.nominees = []; app.documents = []; app.access = null; app.audit = [];
  closeModal(); $('#appView').classList.add('hidden'); $('#portalView').classList.add('hidden');
  $('#authView').classList.remove('hidden'); $('#loginPassword').value = ''; $('#profileMenu').classList.add('hidden');
  showAuthPanel('welcome');
  toast('Signed out. Your server-side session was closed.');
}
async function enterApp(destination = 'dashboard') {
  const r = await api('GET', '/api/auth/me');
  app.user = r.user;
  $('#authView').classList.add('hidden'); $('#portalView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  $('#profileMenu').classList.add('hidden');
  updateGlobalUI();
  await loadCapability();
  renderPage(destination);
}

/* ---------- nominee access portal (dedicated nominee experience) ---------- */
function openPortalView() {
  $('#authView').classList.add('hidden');
  // The portal is a full-screen experience: never leave the workspace stacked under it.
  $('#appView').classList.add('hidden');
  $('#portalView').classList.remove('hidden');
  setPortalPanel('mobile');
  $('#portalMobile').value = app.portal.mobile || '';
}
function closePortalView() {
  $('#portalView').classList.add('hidden');
  if (app.user) { renderPage(app.page); } else { $('#authView').classList.remove('hidden'); showAuthPanel('welcome'); }
  setPortalPanel('mobile');
}
function setPortalPanel(which) {
  const active = 'portal' + which.charAt(0).toUpperCase() + which.slice(1) + 'Panel';
  ['portalMobilePanel', 'portalCodePanel', 'portalSessionPanel'].forEach(id => $('#' + id).classList.toggle('hidden', id !== active));
  portalClearErrors();
}
function portalClearErrors() { $$('#portalView .portal-err').forEach(b => b.remove()); }
function portalError(html) {
  const active = ['portalMobilePanel', 'portalCodePanel', 'portalSessionPanel'].find(id => !$('#' + id).classList.contains('hidden')) || 'portalMobilePanel';
  let box = $('#' + active + ' .portal-err');
  if (!box) { box = document.createElement('div'); box.className = 'portal-err'; $('#' + active).append(box); }
  box.innerHTML = `<div class="notice warning">${html}</div>`;
}
async function portalIdentify(e) {
  e.preventDefault();
  const mobile = $('#portalMobile').value.trim();
  if (!/^\d{10}$/.test(mobile)) { portalError('Enter the 10-digit mobile number the owner registered for you.'); return; }
  const btn = $('#portalIdentifyBtn'); btn.disabled = true;
  try {
    const r = await api('POST', '/api/portal/identify', { json: { mobile } });
    app.portal.mobile = mobile;
    if (!r.found) { portalError(esc(r.message)); return; }
    if (r.reason === 'missing_code') { portalError(esc(r.message)); return; }
    $('#portalCodeMobile').textContent = `Mobile: ${mobile}`;
    setPortalPanel('code');
    $('#portalCode').value = '';
  } catch (err) { portalError(esc(err.message)); }
  finally { btn.disabled = false; }
}
async function portalRedeem(e) {
  e.preventDefault();
  const code = $('#portalCode').value.trim().toUpperCase();
  if (!code) { portalError('Enter the security code exactly as the owner provided it.'); return; }
  const btn = $('#portalRedeemBtn'); btn.disabled = true;
  try {
    const r = await api('POST', '/api/portal/redeem', { json: { mobile: app.portal.mobile, code } });
    app.portal.session = { expiresAt: r.expiresAt, owner: r.owner, nominee: r.nominee, permissions: r.permissions, documents: r.documents };
    renderPortalSession();
    setPortalPanel('session');
    toast('Access granted. This session expires automatically.', 4500);
  } catch (err) {
    const why = { revoked: 'This security code has been revoked by the owner.', used: 'This code has already been used.', expired: 'This code has expired. Ask the owner for a new one.', activation_pending: 'The owner has not released this access yet.', mismatch: 'The number and code combination is not valid.', locked: 'Too many incorrect attempts — please wait before trying again.', rate_limited: 'Too many attempts — please wait before trying again.' }[err.reason || err.code] || err.message;
    portalError(esc(why));
  } finally { btn.disabled = false; }
}
function renderPortalSession() {
  const s = app.portal.session; if (!s) return;
  const remaining = Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000));
  $('#portalSessionBody').innerHTML = `
    <div class="record-detail-list">
      <div class="record-detail-row"><span>Shared by</span><span>${esc(s.owner.name)}</span></div>
      <div class="record-detail-row"><span>You are</span><span>${esc(s.nominee.name)}</span></div>
      <div class="record-detail-row"><span>Permission</span><span>${s.permissions.map(p => `<span class="permission-tag">${esc(p)}</span>`).join(' ')}</span></div>
      <div class="record-detail-row"><span>Session ends</span><span><span id="portalCountdown">${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}</span> left</span></div>
    </div>
    <div class="notice info">${esc(s.documents.length ? `You can open only the documents the owner authorised for this code (${s.documents.length} available).` : 'No documents are available under this permission yet. The owner may share more later.')}</div>
    ${s.documents.length ? `<div class="record-grid" style="margin-top:14px">${s.documents.map(portalDocCard).join('')}</div>` : ''}
    <div class="form-actions"><button class="outline-btn" id="portalEndBtn">End access</button></div>`;
  clearInterval(app.portalTimer);
  app.portalTimer = setInterval(() => {
    const el = $('#portalCountdown'); if (!el) return clearInterval(app.portalTimer);
    const secs = Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000));
    el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (secs === 0) { clearInterval(app.portalTimer); app.portal.session = null; closeModal(); setPortalPanel('mobile'); toast('Your nominee session expired.', 4500); }
  }, 1000);
}
function portalDocCard(d) {
  const meta = docMeta[d.category] || docMeta.Other;
  return `<article class="record-card"><div class="record-card-top">${iconMark(meta.icon, meta.tone)}<div class="record-title-group"><h3>${esc(d.title)}</h3><p>${esc(d.category)}</p></div></div><div class="record-card-body"><div class="record-meta-row"><span>Type</span><span>${esc((d.kind || '').toUpperCase())} · ${esc(sizeLabel(d.sizeBytes))}</span></div><div class="record-meta-row"><span>Shared</span><span>${esc(dateLabel(d.createdAt))}</span></div></div><div class="record-card-footer"><small>Released to you by the owner</small><div class="record-card-actions"><button class="tiny-icon-btn" title="Preview" aria-label="Preview ${attr(d.title)}" data-portal-preview="${attr(d.id)}">↗</button><button class="tiny-icon-btn" title="Download" aria-label="Download ${attr(d.title)}" data-portal-download="${attr(d.id)}">⇩</button></div></div></article>`;
}
async function portalLogout() {
  try { await api('POST', '/api/portal/logout'); } catch (e) {}
  clearInterval(app.portalTimer);
  app.portal.session = null;
  closeModal(); setPortalPanel('mobile');
  toast('Nominee session ended.');
}

/* ---------- shell navigation ---------- */
function renderPage(page) {
  if (!app.user) return;
  app.page = pageTitles[page] ? page : 'dashboard';
  // The workspace shell must always be visible here — the portal and auth
  // screens are mutually exclusive full-screen views and may have hidden it.
  $('#appView').classList.remove('hidden');
  $('#authView').classList.add('hidden');
  $('#portalView').classList.add('hidden');
  app.timers.forEach(clearInterval); app.timers = [];
  $('#breadcrumbTitle').textContent = pageTitles[app.page];
  $$('.nav-item').forEach(b => { b.classList.toggle('active', b.dataset.page === app.page); b.setAttribute('aria-current', b.dataset.page === app.page ? 'page' : 'false'); });
  $$('.bottom-nav-item').forEach(b => { b.classList.toggle('active', b.dataset.page === app.page); b.setAttribute('aria-current', b.dataset.page === app.page ? 'page' : 'false'); });
  $('#sidebar').classList.remove('open'); $('#sidebarOverlay').classList.remove('show'); $('#profileMenu').classList.add('hidden');
  updateGlobalUI();
  const renderers = { dashboard: dashboardPage, legacy: documentsPage, nominees: nomineesPage, security: securityPage, notifications: notificationsPage, settings: settingsPage };
  const load = { dashboard: () => Promise.all([loadAccess(), loadDocuments()]), legacy: loadDocuments, nominees: loadNominees, security: loadAudit, notifications: loadAudit, settings: () => Promise.resolve() }[app.page] || loadAccess;
  $('#pageContent').innerHTML = spinner();
  Promise.resolve(load()).then(() => {
    $('#pageContent').innerHTML = (renderers[app.page] || dashboardPage)();
    if (app.page === 'nominees') startResendCountdowns();
  }).catch(err => { $('#pageContent').innerHTML = `<div class="notice warning">Could not load this page: ${esc(err.message)}</div>`; });
  $('#pageContent').focus({ preventScroll: true });
}

/* ---------- Overview ---------- */
function dashboardPage() {
  const noms = app.access ? app.access.nominees : [];
  const verified = noms.filter(n => (n.verification ? n.verification.mobileVerified : n.mobileVerified)).length;
  const activeCodes = noms.reduce((sum, n) => sum + (n.activeCodes || 0), 0);
  const docs = app.documents.length;
  const checks = [!!app.user.mobile, docs > 0, noms.length > 0, verified > 0];
  const percent = Math.round(checks.filter(Boolean).length / checks.length * 100);
  const act = (app.audit || []).slice(0, 5);
  return `${pageHeader('YOUR DIGITAL LIFE, IN ONE PLACE', `Welcome back, ${esc((app.user.name || 'there').trim().split(/\s+/)[0])}.`, 'A little planning today can make things clearer for the people you care about.', `<button class="primary-btn small" data-action="add-document">＋ Add document</button>`)}
    <section class="welcome-hero"><div class="welcome-hero-copy"><div class="hero-label">YOUR INFORMATION. YOUR CHOICE.</div><h2>Your legacy starts<br>with <span>a thoughtful plan.</span></h2><p>Keep important documents in a secure vault, verify the people you trust, and release access only through codes you control.</p><div class="hero-actions"><button class="primary-btn" data-page="legacy">View my documents →</button><button class="outline-btn" data-page="nominees">Manage nominees</button></div></div><div class="hero-emblem" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="M26 14h31l18 18v52H26z" fill="#102f43" stroke="#6dcaef" stroke-width="2.5" stroke-linejoin="round"/><path d="M57 14v18h18" fill="none" stroke="#6dcaef" stroke-width="2.5"/><path d="M38 45h25M38 55h25M38 65h16" stroke="#d7eef8" stroke-width="3" stroke-linecap="round"/><circle cx="70" cy="72" r="15" fill="#ff784f" stroke="#102f43" stroke-width="3"/><path d="m63 72 5 5 9-10" fill="none" stroke="#102f43" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div></section>
    <div class="stats-grid"><div class="stat-card"><div class="stat-card-top">Secure documents <span class="stat-icon">▤</span></div><div class="stat-value">${docs}</div><div class="stat-note">Stored on the server, never public</div></div><div class="stat-card"><div class="stat-card-top">Trusted nominees <span class="stat-icon orange">♙</span></div><div class="stat-value">${noms.length}</div><div class="stat-note">${verified} with a verified mobile</div></div><div class="stat-card"><div class="stat-card-top">Active access codes <span class="stat-icon mint">◇</span></div><div class="stat-value">${activeCodes}</div><div class="stat-note">Revocable at any moment</div></div><div class="stat-card"><div class="stat-card-top">Plan readiness <span class="stat-icon orange">✦</span></div><div class="stat-value">${percent}<small style="font-size:12px;color:#6e8e9a">%</small></div><div class="stat-note">Setup checklist progress</div></div></div>
    <div class="dashboard-columns"><section class="panel"><div class="panel-heading"><div><h3>Recent activity</h3><p>Recorded by the server, visible to you only</p></div><button class="link-button" data-page="notifications">View all →</button></div><div class="activity-list">${act.length ? act.map(a => { const [title] = auditLabels[a.action] || [prettifyAction(a.action), '']; return `<div class="activity-row"><span class="activity-symbol">${/failed|denied|blocked|revoked/.test(a.action) ? '!' : '✓'}</span><div class="activity-copy"><strong>${esc(title)}</strong><p>${esc(a.detail || '')}</p></div><span class="activity-time">${esc(relTime(a.createdAt))}</span></div>`; }).join('') : `<div class="empty-state"><div class="empty-symbol">◷</div><h3>No activity yet</h3><p>Changes you make in your workspace will appear here.</p></div>`}</div></section><section class="panel"><div class="panel-heading"><div><h3>Quick actions</h3><p>Keep your plan moving forward</p></div></div><div class="quick-actions"><button class="quick-action" data-action="add-document"><span class="qa-icon">＋</span><strong>Upload a document</strong><small>PDF or image, stored securely.</small></button><button class="quick-action" data-page="nominees"><span class="qa-icon">♙</span><strong>Verify a nominee</strong><small>SMS OTP + identity review.</small></button><button class="quick-action" data-page="nominees"><span class="qa-icon">◇</span><strong>Issue an access code</strong><small>Only after identity is approved.</small></button><button class="quick-action" data-page="security"><span class="qa-icon">⚙</span><strong>Security centre</strong><small>See how the system protects you.</small></button></div></section></div>
    <section class="panel readiness-panel"><div class="readiness-top"><strong>Plan setup checklist</strong><span>${percent}% complete</span></div><div class="progress-track"><div class="progress-bar" style="width:${percent}%"></div></div><p class="readiness-tip">${percent === 100 ? 'Your setup is complete. Review your documents and nominees regularly.' : 'Add a document, register a nominee, verify their mobile, approve their identity document, then issue an access code.'}</p></section>`;
}
function prettifyAction(a = '') { return a.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }

/* ---------- My Documents ---------- */
function documentsPage() {
  const actions = `<button class="primary-btn small" data-action="add-document">＋ Upload document</button>`;
  const content = app.documents.length ? `<div class="toolbar"><div class="search-field"><span>⌕</span><input type="search" id="docSearch" placeholder="Search documents by title or category"></div><select id="docFilter" aria-label="Filter documents by category"><option value="all">All categories</option>${Object.keys(docMeta).map(t => `<option value="${attr(t)}">${esc(t)}</option>`).join('')}</select></div><div class="record-grid" id="docGrid">${app.documents.map(docCard).join('')}</div>` : emptyState('▤', 'Your secure vault is empty', 'Upload the PDFs and images your plan depends on — wills, policies, deeds. Files are validated, renamed and stored on the server, never in a public folder.', 'Upload your first document', 'data-action="add-document"');
  return `${pageHeader('YOUR INFORMATION, SECURED', 'My Documents', 'Files live on the server behind authentication. Sharing with verified nominees is opt-in, per document.', actions)}
    <div class="section-note"><span class="note-glyph">◇</span><div><strong>Server-side protection:</strong> uploads are validated by content (PDF/JPG/PNG only, executables rejected), stored with random names outside the web root, and only ever served back to accounts the backend authorises.</div></div>${content}`;
}
function docCard(d) {
  const meta = docMeta[d.category] || docMeta.Other;
  const shared = d.visibility === 'shared' && d.shareWithVerified;
  return `<article class="record-card" data-doc-id="${attr(d.id)}"><div class="record-card-top">${iconMark(meta.icon, meta.tone)}<div class="record-title-group"><h3>${esc(d.title)}</h3><p>${esc(d.category)} · ${(d.kind || '').toUpperCase()} · ${esc(sizeLabel(d.sizeBytes))}</p></div></div><div class="record-card-body"><div class="record-meta-row"><span>File</span><span>${esc(d.originalName)}</span></div>${d.description ? `<div class="record-meta-row"><span>Notes</span><span>${esc(d.description)}</span></div>` : ''}<div class="record-meta-row"><span>Added</span><span>${esc(dateLabel(d.createdAt))}</span></div><div class="record-meta-row"><span>Access</span><span>${shared ? '<span class="status-pill success">Shared with verified nominees</span>' : '<span class="status-pill neutral">Private</span>'}</span></div></div><div class="record-card-footer"><small>Stored on secure server</small><div class="record-card-actions"><button class="tiny-icon-btn" title="Preview" aria-label="Preview ${attr(d.title)}" data-doc-preview="${attr(d.id)}">↗</button><button class="tiny-icon-btn" title="Download" aria-label="Download ${attr(d.title)}" data-doc-download="${attr(d.id)}">⇩</button><button class="tiny-icon-btn" title="${shared ? 'Make private' : 'Share with verified nominees'}" aria-label="Toggle sharing" data-doc-share="${attr(d.id)}">${shared ? '⊘' : '⇗'}</button><button class="tiny-icon-btn" title="Delete" aria-label="Delete ${attr(d.title)}" data-doc-delete="${attr(d.id)}">⌫</button></div></div></article>`;
}
function documentUploadModal() {
  openModal(`<div class="card-kicker">SECURE VAULT</div><h2>Upload a document</h2><p>PDF, JPG or PNG up to ${app.capability ? Math.round(app.capability.uploads.maxBytes / 1048576) : 10} MB. The file is validated by its actual contents, not its name.</p>
    <form id="docUploadForm"><div class="form-grid">
      <div class="field"><label for="docFile">Choose file</label><input id="docFile" class="file-input" type="file" accept=".pdf,.jpg,.jpeg,.png" required><small class="password-hint">Executable and archive files are rejected automatically.</small></div>
      <div class="field"><label for="docTitle">Document title</label><input id="docTitle" type="text" maxlength="120" required placeholder="e.g. Last will and testament"></div>
      <div class="field"><label for="docCategory">Category</label><select id="docCategory">${Object.keys(docMeta).map(t => `<option value="${attr(t)}">${esc(t)}</option>`).join('')}</select><small class="password-hint">Nominee permissions use the same categories.</small></div>
      <div class="field"><label for="docVisibility">Access</label><select id="docVisibility"><option value="private">Private — only I can open it</option><option value="shared">Shared — eligible verified nominees may see it</option></select></div>
      <div class="field full-field"><label for="docNotes">Notes (optional)</label><textarea id="docNotes" maxlength="1000" placeholder="Where the original is kept, issuer references, and similar reminders."></textarea></div>
    </div>
    <label class="check-line"><input id="docShareVerified" type="checkbox" checked> Share with verified nominees whose permission covers this category</label>
    <div class="notice info">Sharing is never automatic: a nominee can only open this if their mobile is verified, their identity is approved, and the owner issues them a code that includes this category.</div>
    <div class="form-actions"><button type="button" class="outline-btn" data-close>Cancel</button><button type="submit" class="primary-btn">Upload securely →</button></div></form>`);
  // Keep the access select and the share checkbox consistent (the server
  // requires BOTH shared visibility and the flag before anyone can see a file).
  const syncShare = () => {
    const shared = $('#docVisibility').value === 'shared';
    const cb = $('#docShareVerified');
    cb.disabled = !shared;
    cb.checked = shared;
    cb.closest('.check-line').style.opacity = shared ? '1' : '.5';
  };
  $('#docVisibility').addEventListener('change', syncShare);
  syncShare();
}
async function submitDocumentUpload() {
  const file = $('#docFile').files[0];
  if (!file) { toast('Choose a file first.'); return; }
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('title', $('#docTitle').value.trim());
  form.append('category', $('#docCategory').value);
  form.append('description', $('#docNotes').value.trim());
  form.append('visibility', $('#docVisibility').value);
  form.append('shareWithVerified', $('#docShareVerified').checked ? 'true' : 'false');
  const btn = $('#docUploadForm button[type=submit]'); btn.disabled = true;
  try {
    await api('POST', '/api/documents', { form });
    closeModal(); await loadDocuments(); renderPage('legacy');
    toast('Document stored securely.');
  } catch (err) { toast(err.message, 4500); btn.disabled = false; }
}
function previewDocument(id) {
  const d = app.documents.find(x => x.id === id); if (!d) return;
  openModal(`<div class="card-kicker">DOCUMENT PREVIEW</div><h2 style="margin-bottom:4px">${esc(d.title)}</h2><p>${esc(d.category)} · ${esc(d.originalName)} · ${esc(sizeLabel(d.sizeBytes))}</p>
    <iframe class="doc-preview-frame" src="/api/documents/${attr(id)}/content" title="${attr(d.title)} preview"></iframe>
    <div class="form-actions"><button class="outline-btn" data-close>Close</button><a class="primary-btn" href="/api/documents/${attr(id)}/download">Download <span>⇩</span></a></div>`);
}

/* ---------- Nominees: security & access ---------- */
function nomineesPage() {
  const actions = `<button class="primary-btn small" data-action="add-nominee">＋ Add nominee</button>`;
  const live = app.capability && app.capability.sms.live;
  const content = app.nominees.length ? `<div class="nominee-grid">${app.nominees.map(nomineeCard).join('')}</div>` : emptyState('♙', 'No nominees yet', 'Add a trusted person, verify their mobile with a real SMS code, review their identity document, then issue an access code you control.', 'Add a trusted nominee', 'data-action="add-nominee"');
  return `${pageHeader('PEOPLE YOU TRUST · VERIFIED ACCESS', 'Nominees &amp; Access', 'A nominee is a contact until YOU complete verification: SMS OTP on their number, your review of their identity document, and a revocable security code.', actions)}
    <div class="section-note ${live ? '' : 'note-warning'}"><span class="note-glyph">${live ? '✓' : '!'}</span><div><strong>SMS status:</strong> ${live ? 'A live provider is configured — verification codes are delivered by SMS.' : 'No live SMS provider is configured yet. Codes are generated, hashed and verified by the server, but real SMS delivery is not active. The status below always tells you the truth.'}</div></div>${content}`;
}
function nomineeCard(n) {
  const id = attr(n.id);
  const identity = n.identity && n.identity.doc;
  // /api/owners/access returns flat nominee rows; /api/nominees returns a verification object.
  const ver = n.verification || { mobileVerified: !!n.mobileVerified, identityStatus: n.identityStatus, label: n.identityStatus === 'approved' ? n.status || 'Verified' : n.status || 'Registered' };
  const identityStatus = (n.identity && n.identity.status) || ver.identityStatus || (identity && identity.status) || 'none';
  const statusChip = statusPill(ver.label);
  const otpBtn = ver.mobileVerified
    ? `<span class="status-pill success">Mobile verified</span>`
    : `<button class="outline-btn small" data-nom-otp="${id}">Verify mobile (OTP)</button>`;
  const identityBtn = !identity || identityStatus === 'none'
    ? `<button class="outline-btn small" data-nom-identity="${id}">Upload identity</button>`
    : identityStatus === 'pending'
      ? `<button class="primary-btn small" data-nom-review="${id}">Review identity (${esc(identity.docType)})</button>`
      : identityStatus === 'approved'
        ? `<span class="status-pill success">Identity approved</span>`
        : `<button class="outline-btn small" data-nom-identity="${id}">Re-upload identity</button>`;
  return `<article class="nominee-card"><div class="entity-card-top"><span class="entity-icon orange">♙</span><div class="entity-title-group"><h3>${esc(n.name)}</h3><p>${esc(n.relation)} · ${esc(n.mobile || n.email || 'No contact')} · ${esc(n.status)}</p></div>${statusChip}</div>
    <div class="entity-subtext">${ver.authorizedForAccess ? 'This nominee can access the documents you have released under an active code.' : 'No access is granted by being listed — verification and codes are required.'}${identity && identity.maskedNumber ? `<br>Identity: ${esc(identity.docType)} ${esc(identity.maskedNumber)}` : ''}</div>
    <div class="permission-list">${(n.permissions || []).map(p => `<span class="permission-tag">${esc(p)}</span>`).join('')}</div>
    <div class="owner-status-row"><small>Active codes: ${n.activeCodes} · ${esc(n.accessStatus === 'codes_issued' ? 'access available' : 'awaiting access')}</small></div>
    <div class="entity-actions" style="margin-top:13px; display:flex; gap:8px; flex-wrap:wrap">${otpBtn}${identityBtn}<button class="primary-btn small" data-nom-codes="${id}">Access codes (${n.activeCodes})</button><button class="outline-btn small" data-nom-edit="${id}">Edit</button><button class="tiny-icon-btn" aria-label="Remove ${attr(n.name)}" data-nom-delete="${id}">⌫</button></div></article>`;
}
function nomineeModal(id = null) {
  const n = id ? app.nominees.find(x => x.id === id) : null;
  const v = n || { name: '', email: '', mobile: '', relation: 'Family member', permissions: ['Important documents'] };
  openModal(`<div class="card-kicker">TRUSTED CONTACTS</div><h2>${n ? 'Edit nominee' : 'Add a trusted nominee'}</h2><p>${n ? 'Changes never grant extra access — permissions narrow what a code could share, they never widen it.' : 'The mobile number must be theirs: it is how they will verify with SMS and redeem your security code.'}</p>
    <form id="nomineeForm"><input type="hidden" id="nomineeId" value="${attr(n ? n.id : '')}"><div class="form-grid">
      <div class="field"><label for="nomineeName">Full name</label><input id="nomineeName" type="text" maxlength="80" required value="${attr(v.name)}" placeholder="Nominee full name"></div>
      <div class="field"><label for="nomineeRelation">Relationship</label><select id="nomineeRelation">${RELATIONS.map(t => `<option ${v.relation === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="nomineeEmail">Email address</label><input id="nomineeEmail" type="email" value="${attr(v.email || '')}" placeholder="nominee@example.com"></div>
      <div class="field"><label for="nomineeMobile">Mobile number</label><input id="nomineeMobile" type="tel" pattern="[0-9]{10}" maxlength="10" required value="${attr(v.mobile || '')}" placeholder="10-digit mobile"></div>
      <div class="field full-field"><label>Allowed categories</label><div class="check-grid">${Object.keys(docMeta).map(t => `<label class="check-option"><input type="checkbox" name="nomineePermission" value="${attr(t)}" ${(v.permissions || []).includes(t) ? 'checked' : ''}><span>${esc(t)}<small>Only documents shared with verified nominees in this category can ever be seen.</small></span></label>`).join('')}</div></div>
    </div>
    <div class="notice info">Adding a nominee sends an SMS verification code to their number. Nothing is granted until that code is entered correctly.</div>
    <div class="form-actions"><button type="button" class="outline-btn" data-close>Cancel</button><button type="submit" class="primary-btn">${n ? 'Save changes' : 'Add nominee & send OTP'} →</button></div></form>`);
}
async function submitNomineeForm() {
  const id = $('#nomineeId').value;
  const payload = {
    name: $('#nomineeName').value.trim(),
    email: $('#nomineeEmail').value.trim(),
    mobile: $('#nomineeMobile').value.trim(),
    relation: $('#nomineeRelation').value,
    permissions: $$('[name=nomineePermission]:checked').map(x => x.value)
  };
  if (payload.name.length < 2) { toast('Enter the nominee name.'); return; }
  if (!/^\d{10}$/.test(payload.mobile)) { toast('Enter a valid 10-digit mobile number.'); return; }
  if (!payload.permissions.length) { toast('Choose at least one allowed category.'); return; }
  const btn = $('#nomineeForm button[type=submit]'); btn.disabled = true;
  try {
    if (id) {
      await api('PATCH', `/api/nominees/${id}`, { json: payload });
      closeModal(); await loadNominees(); renderPage('nominees'); toast('Nominee updated.');
    } else {
      const r = await api('POST', '/api/nominees', { json: payload });
      closeModal(); await loadNominees(); renderPage('nominees');
      otpModal(r.nominee, r.otp);
    }
  } catch (err) { toast(err.message, 4500); btn.disabled = false; }
}
function otpDeliveryNote(otp) {
  const live = app.capability && app.capability.sms.live;
  if (otp.sent && live) return `<div class="notice success">A verification code was sent by SMS to the nominee's number.</div>`;
  if (otp.sent && !live) return `<div class="notice warning"><strong>No live SMS provider is configured.</strong> The code was generated and verified by the server${otp.dev_otp ? `, and (because this deployment has the local test reveal enabled) it is <span class="mono">${esc(otp.dev_otp)}</span>` : ''}. Real delivery activates once MSG91 credentials are set — the UI never pretends a message was sent when it was not.</div>`;
  if (!otp.sent && otp.reason === 'cooldown') return `<div class="notice warning">Please wait before requesting another code.</div>`;
  if (!otp.sent && otp.reason === 'max_resends') return `<div class="notice warning">The resend limit for this code has been reached. The code stays usable until it expires.</div>`;
  if (!otp.sent && otp.reason === 'delivery_failed') return `<div class="notice warning">The SMS transport refused the message, so no code is active. Check the provider configuration and try again.</div>`;
  return '';
}
function otpModal(n, otp) {
  const policy = otp.policy || (app.capability ? app.capability.otpPolicy : {});
  app.cooldowns[n.id] = Date.now() + (otp.resendAfter || policy.resendAfterSeconds || 60) * 1000;
  openModal(`<div class="card-kicker">MOBILE VERIFICATION</div><h2>Verify ${esc(n.name)}</h2>
    <p>Enter the 6-digit code delivered by SMS to <strong>${esc(n.mobile)}</strong>. Codes are hashed on the server, expire in ${esc(policy.ttlSeconds ? Math.round(policy.ttlSeconds / 60) + ' minutes' : '5 minutes')}, and allow ${esc(policy.maxAttempts || 5)} attempts.</p>
    <div id="otpNote">${otpDeliveryNote(otp)}</div>
    <form id="otpForm"><div class="field"><label for="otpCode">Verification code</label><input id="otpCode" class="otp-code mono" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required></div>
    <div id="otpStatus"></div>
    <div class="form-actions">
      <button type="button" class="outline-btn" id="otpResendBtn" data-nom="${attr(n.id)}">Resend code</button>
      <button type="submit" class="primary-btn">Verify now →</button>
    </div></form>
    <small class="password-hint" id="otpCountdownHint"></small>`);
  startResendCountdown(n.id);
}
function startResendCountdown(nomineeId) {
  const tick = () => {
    const btn = $('#otpResendBtn'); if (!btn || btn.dataset.nom !== nomineeId) return clearInterval(app.otpTimer);
    const left = Math.ceil(((app.cooldowns[nomineeId] || 0) - Date.now()) / 1000);
    if (left > 0) { btn.disabled = true; const hint = $('#otpCountdownHint'); if (hint) hint.textContent = `You can request a new code in ${left}s.`; }
    else { btn.disabled = false; const hint = $('#otpCountdownHint'); if (hint) hint.textContent = 'Code expired after its window? Request a new one.'; }
  };
  clearInterval(app.otpTimer); app.otpTimer = setInterval(tick, 1000); tick();
}
function startResendCountdowns() { /* page-level; the OTP modal manages its own timer */ }
async function resendOtp(nomineeId, btn) {
  btn.disabled = true;
  try {
    const r = await api('POST', `/api/nominees/${nomineeId}/otp/send`);
    if (r.alreadyVerified) { closeModal(); await loadNominees(); renderPage('nominees'); toast('This nominee is already verified.'); return; }
    $('#otpNote').innerHTML = otpDeliveryNote(r.otp);
    app.cooldowns[nomineeId] = Date.now() + (r.otp.resendAfter || 60) * 1000;
    if (r.otp.sent) toast('New code requested.');
    else if (r.otp.retryAfter) app.cooldowns[nomineeId] = Date.now() + r.otp.retryAfter * 1000;
    else if (r.otp.reason === 'max_resends') toast('Resend limit reached for this code.', 4000);
  } catch (err) { toast(err.message, 4500); btn.disabled = false; }
}
async function submitOtpVerification(e) {
  e.preventDefault();
  const btn = $('#otpResendBtn');
  const nomineeId = btn ? btn.dataset.nom : null;
  const code = $('#otpCode').value.trim();
  if (!nomineeId || !/^\d{6}$/.test(code)) { toast('Enter the 6-digit code.'); return; }
  const status = $('#otpStatus');
  status.innerHTML = spinner('Checking with the server…');
  try {
    const r = await api('POST', `/api/nominees/${nomineeId}/otp/verify`, { json: { code } });
    closeModal(); await loadNominees(); renderPage('nominees');
    toast(`${r.nominee.name}'s mobile is now verified.`, 4000);
  } catch (err) {
    if (status) status.innerHTML = `<div class="notice warning">${esc(err.message)}${err.attemptsLeft !== undefined ? ` <strong>${err.attemptsLeft} attempt${err.attemptsLeft === 1 ? '' : 's'}</strong> remain.` : ''}</div>`;
    $('#otpCode').value = '';
  }
}
function identityModal(nomineeId) {
  const n = app.nominees.find(x => x.id === nomineeId); if (!n) return;
  openModal(`<div class="card-kicker">IDENTITY DOCUMENT</div><h2>Identity proof for ${esc(n.name)}</h2><p>Upload the document the nominee provided (front of Aadhaar, PAN, passport…). It is stored privately and stays <strong>pending</strong> until you personally approve it — approval is what unlocks access codes.</p>
    <form id="identityForm"><input type="hidden" id="identityNominee" value="${attr(nomineeId)}">
    <div class="form-grid">
      <div class="field"><label for="identityFile">Document file</label><input id="identityFile" class="file-input" type="file" accept=".pdf,.jpg,.jpeg,.png" required></div>
      <div class="field"><label for="identityType">Document type</label><select id="identityType">${(app.capability ? app.capability.identity.docTypes : ['Aadhaar Card', 'PAN Card', 'Voter ID', 'Passport', 'Driving Licence', 'Other']).map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
      <div class="field full-field"><label for="identityMasked">Document number (optional)</label><input id="identityMasked" type="text" maxlength="24" placeholder="e.g. 4321 — last digits only"><small class="password-hint">The server stores it masked automatically — a full number is never kept.</small></div>
    </div>
    <div class="notice info">Identity numbers are always masked on the server (only the last digits are stored). The document file itself is kept privately in the server vault, visible only to you.</div>
    <div class="form-actions"><button type="button" class="outline-btn" data-close>Cancel</button><button type="submit" class="primary-btn">Upload for review →</button></div></form>`);
}
async function submitIdentityForm() {
  const nomineeId = $('#identityNominee').value;
  const file = $('#identityFile').files[0];
  if (!file) { toast('Choose the identity document file.'); return; }
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('docType', $('#identityType').value);
  form.append('maskedNumber', $('#identityMasked').value.trim());
  const btn = $('#identityForm button[type=submit]'); btn.disabled = true;
  try {
    await api('POST', `/api/nominees/${nomineeId}/identity-document`, { form });
    closeModal(); await loadNominees(); renderPage('nominees');
    toast('Document uploaded — review it to approve or reject.');
  } catch (err) { toast(err.message, 4500); btn.disabled = false; }
}
function reviewIdentityModal(nomineeId) {
  const n = app.nominees.find(x => x.id === nomineeId); const doc = n && n.identity && n.identity.doc;
  if (!doc) { toast('No identity document on file.'); return; }
  openModal(`<div class="card-kicker">HUMAN REVIEW</div><h2>Review ${esc(n.name)}'s identity</h2>
    <div class="record-detail-list">
      <div class="record-detail-row"><span>Type</span><span>${esc(doc.docType)}</span></div>
      <div class="record-detail-row"><span>Masked number</span><span class="mono">${esc(doc.maskedNumber || '—')}</span></div>
      <div class="record-detail-row"><span>File</span><span>${esc(doc.originalName)} · ${esc(sizeLabel(doc.sizeBytes))}</span></div>
      <div class="record-detail-row"><span>Uploaded</span><span>${esc(dateLabel(doc.createdAt))}</span></div>
      <div class="record-detail-row"><span>Status</span><span>${statusPill(doc.status)}</span></div>
    </div>
    <div class="field" style="margin-top:12px"><label for="reviewNote">Review note (optional, kept on record)</label><input id="reviewNote" type="text" maxlength="300" placeholder="e.g. Verified against original in person"></div>
    <iframe class="doc-preview-frame" src="/api/nominees/${attr(nomineeId)}/identity-document/${attr(doc.id)}/download" title="identity document preview"></iframe>
    <div class="notice warning">Approving marks this identity as verified and allows an access code to be issued. Only approve if the document is genuinely the nominee's.</div>
    <div class="form-actions"><button class="outline-btn" id="identityRejectBtn" data-nom="${attr(nomineeId)}" data-doc="${attr(doc.id)}">Reject</button><a class="outline-btn" href="/api/nominees/${attr(nomineeId)}/identity-document/${attr(doc.id)}/download?download=1">Download <span>⇩</span></a><button class="primary-btn" id="identityApproveBtn" data-nom="${attr(nomineeId)}" data-doc="${attr(doc.id)}">Approve identity →</button></div>`);
}
async function decideIdentity(approve) {
  const btn = approve ? $('#identityApproveBtn') : $('#identityRejectBtn');
  const nomineeId = btn.dataset.nom, docId = btn.dataset.doc;
  btn.disabled = true;
  try {
    await api('POST', `/api/nominees/${nomineeId}/identity-document/${docId}/${approve ? 'approve' : 'reject'}`, { json: { note: $('#reviewNote').value.trim() } });
    closeModal(); await loadNominees(); renderPage('nominees');
    toast(approve ? 'Identity approved — access codes can now be issued.' : 'Identity rejected. The nominee can upload another document.');
  } catch (err) { toast(err.message, 4500); btn.disabled = false; }
}
async function codesModal(nomineeId) {
  const n = app.nominees.find(x => x.id === nomineeId); if (!n) return;
  let codes = [];
  try { codes = (await api('GET', `/api/owners/nominees/${nomineeId}/codes`)).codes; } catch (err) { toast(err.message); return; }
  const eligible = n.verification.identityStatus === 'approved';
  openModal(`<div class="card-kicker">SECURITY CODES</div><h2>Access for ${esc(n.name)}</h2>
    ${eligible ? '' : `<div class="notice warning">Codes can only be issued after ${esc(n.name)}'s identity document is approved. ${esc(n.name)}'s current identity status: ${esc(n.verification.identityStatus)}.</div>`}
    <div class="record-detail-list">${codes.length ? codes.map(c => `<div class="record-detail-row"><span><span class="mono">${esc(c.codeHint)}</span><br><small>${c.permissions.map(p => esc(p)).join(', ')}${c.singleUse ? ' · single use' : ''} · ends ${esc(dateTimeLabel(c.expiresAt))}</small></span><span>${statusPill(c.displayStatus)}${c.displayStatus === 'active' || c.displayStatus === 'gated' ? ` <button class="outline-btn small" data-revoke-code="${attr(c.id)}">Revoke</button>` : ''}</span></div>`).join('') : '<div class="record-detail-row"><span>No codes yet</span><span>Generate one when you are ready to release access</span></div>'}</div>
    <div class="form-actions">${eligible ? `<button class="primary-btn" id="genCodeBtn" data-nom="${attr(nomineeId)}">Generate security code →</button>` : ''}<button class="outline-btn" data-close>Close</button></div>`);
}
function generateCodeModal(nomineeId) {
  const n = app.nominees.find(x => x.id === nomineeId); if (!n) return;
  openModal(`<div class="card-kicker">NEW SECURITY CODE</div><h2>Issue an access code for ${esc(n.name)}</h2>
    <form id="codeForm"><input type="hidden" id="codeNominee" value="${attr(nomineeId)}">
    <div class="form-grid">
      <div class="field"><label for="codeTtl">Valid for</label><select id="codeTtl"><option value="1440">1 day</option><option value="4320">3 days</option><option value="10080" selected>7 days</option><option value="60">1 hour (quick handover)</option></select></div>
      <div class="field"><label for="codeSingle">Use limit</label><select id="codeSingle"><option value="false">Reusable until expiry</option><option value="true">Single use</option></select></div>
      <div class="field full-field"><label>Categories this code unlocks</label><div class="check-grid">${(n.permissions || []).map(p => `<label class="check-option"><input type="checkbox" name="codePermission" value="${attr(p)}" checked><span>${esc(p)}<small>Sharing stays per-document too — private documents are never included.</small></span></label>`).join('')}</div></div>
    </div>
    <div class="notice info">The code is random, shown once, stored only as a hash, bound to ${esc(n.name)}'s mobile number, and revocable instantly.</div>
    <div class="form-actions"><button type="button" class="outline-btn" data-close>Cancel</button><button type="submit" class="primary-btn">Generate code →</button></div></form>`);
}
async function submitCodeForm() {
  const nomineeId = $('#codeNominee').value;
  const permissions = $$('[name=codePermission]:checked').map(x => x.value);
  if (!permissions.length) { toast('Select at least one category for this code.'); return; }
  const btn = $('#codeForm button[type=submit]'); btn.disabled = true;
  try {
    const r = await api('POST', '/api/owners/codes', { json: { nomineeId, permissions, ttlMinutes: Number($('#codeTtl').value), singleUse: $('#codeSingle').value === 'true' } });
    showCodeOnce(r.plaintextCode, new Date(Date.now() + r.ttlMinutes * 60000), r.code.permissions);
  } catch (err) { toast(err.message, 5000); btn.disabled = false; }
}
function showCodeOnce(plaintext, expiresAt, permissions) {
  openModal(`<div class="card-kicker">SHOW THIS ONCE</div><h2>Security code ready</h2>
    <div class="code-reveal mono" id="revealCode">${esc(plaintext)}</div>
    <div class="notice warning">This code is shown <strong>one time only</strong> — the server stores just its hash. Share it with the nominee through a channel you trust, and tell them it is valid until <strong>${esc(dateTimeLabel(expiresAt))}</strong> for: ${permissions.map(p => esc(p)).join(', ')}.</div>
    <div class="form-actions"><button class="outline-btn" id="copyCodeBtn" data-code="${attr(plaintext)}">Copy code</button><button class="primary-btn" data-close>Done</button></div>`);
  loadNominees().then(() => { if (app.page === 'nominees') renderPage('nominees'); });
}
async function revokeCode(codeId) {
  try {
    await api('POST', `/api/owners/codes/${codeId}/revoke`);
    toast('Code revoked — any nominee session using it is cut off immediately.');
    closeModal();
    renderPage(app.page);
  } catch (err) { toast(err.message, 4500); }
}

/* ---------- Security & Privacy / Activity ---------- */
function securityPage() {
  const cap = app.capability || {};
  const sms = cap.sms || {};
  const otp = cap.otpPolicy || {};
  const up = cap.uploads || {};
  return `${pageHeader('CONTROL AND TRANSPARENCY', 'Security & Privacy', 'How this workspace protects your information — reported live from the server, not hardcoded here.')}
    <div class="security-badge"><span class="security-badge-icon">◇</span><div><strong>Server-enforced security</strong><small>Passwords use scrypt hashing, sessions use HttpOnly cookies, OTP and access codes are stored only as hashes, and every document request is authorised on the server.</small></div></div>
    <div class="setting-grid"><section class="panel"><div class="panel-heading"><div><h3>Live service status</h3><p>Read directly from the backend</p></div></div><div class="record-detail-list">
      <div class="record-detail-row"><span>SMS delivery</span><span>${sms.live ? '<span class="status-pill success">Live provider</span>' : '<span class="status-pill pending">Test transport — no real SMS</span>'}</span></div>
      <div class="record-detail-row"><span>OTP policy</span><span>${esc(otp.length || 6)} digits · ${esc(Math.round((otp.ttlSeconds || 300) / 60))} min · ${esc(otp.maxAttempts || 5)} attempts · ${esc(otp.maxResends || 3)} resends</span></div>
      <div class="record-detail-row"><span>Uploads</span><span>${(up.allowedTypes || []).join(', ').toUpperCase()} · max ${esc(Math.round((up.maxBytes || 0) / 1048576))} MB · validated by content</span></div>
      <div class="record-detail-row"><span>Identity review</span><span>${esc(cap.identity ? (cap.identity.verificationModel === 'owner_review' ? 'Approved only by you, the account owner' : cap.identity.verificationModel) : '')}</span></div>
      <div class="record-detail-row"><span>Session</span><span>HttpOnly · SameSite=Strict cookie</span></div>
    </div></section><section class="panel"><div class="panel-heading"><div><h3>How access is released</h3><p>The full chain, every step server-checked</p></div></div><div class="info-list">
      <div class="info-list-item"><span>1</span><div><strong>Add the nominee.</strong> Nothing is granted — they become a contact on your plan.</div></div>
      <div class="info-list-item"><span>2</span><div><strong>SMS OTP.</strong> The code is generated, hashed and verified on the server. It expires, locks after wrong attempts, and cannot be reused.</div></div>
      <div class="info-list-item"><span>3</span><div><strong>Identity document.</strong> Uploaded privately. It stays pending until you personally approve it.</div></div>
      <div class="info-list-item"><span>4</span><div><strong>Security code.</strong> Random, shown once, stored hashed, bound to their number, revocable. Blocked until identity approval.</div></div>
      <div class="info-list-item"><span>5</span><div><strong>Scoped access.</strong> The nominee portal session can open only shared documents inside the code's categories — nothing else, ever.</div></div>
    </div><div class="form-actions"><button class="outline-btn" data-action="lock-vault">Sign out</button></div></section></div>
    <section class="panel" style="margin-top:16px"><div class="panel-heading"><div><h3>Recent security events</h3><p>The server records every sensitive action under your account</p></div><button class="link-button" data-page="notifications">Full activity →</button></div>
    <div class="record-detail-list">${(app.audit || []).slice(0, 8).map(a => `<div class="record-detail-row"><span>${esc((auditLabels[a.action] || [prettifyAction(a.action)])[0])}<br><small>${esc(a.detail || '')}</small></span><span>${esc(relTime(a.createdAt))}</span></div>`).join('') || '<div class="record-detail-row"><span>No events yet</span><span>—</span></div>'}</div></section>`;
}
function notificationsPage() {
  const items = app.audit || [];
  const content = items.length ? `<section class="panel"><div class="panel-heading"><div><h3>Activity log</h3><p>Recorded by the server for your account only</p></div></div>${items.map(a => { const [title = prettifyAction(a.action), detail = a.detail || ''] = auditLabels[a.action] || []; return `<div class="notification-card"><span class="notification-icon ${/failed|denied|blocked|revoked/.test(a.action) ? 'pending' : ''}">${/failed|denied|blocked|revoked/.test(a.action) ? '!' : '✓'}</span><div class="notification-body"><strong>${esc(title)}</strong><p>${esc(detail)}${a.detail ? ` <em>(${esc(a.detail)})</em>` : ''}</p><small>${esc(relTime(a.createdAt))}</small></div></div>`; }).join('')}</section>` : emptyState('◷', 'No activity yet', 'Sign-ins, verifications, uploads and code events will appear here.');
  return `${pageHeader('STAY INFORMED', 'Activity', 'A complete, server-side log of everything happening in your workspace.')}${content}`;
}

/* ---------- Settings ---------- */
function settingsPage() {
  const u = app.user;
  return `${pageHeader('YOUR ACCOUNT', 'Profile & Settings', 'Update your details and manage your account.')}
    <div class="setting-grid"><section class="panel"><div class="panel-heading"><div><h3>Profile details</h3><p>Stored on your secure server account</p></div></div>
      <form id="profileForm" class="profile-form"><div class="field full-field"><label for="profileName">Full name</label><input id="profileName" type="text" value="${attr(u.name)}" required maxlength="80"></div>
      <div class="field full-field"><label for="profileEmail">Email address</label><input id="profileEmail" type="email" value="${attr(u.email)}" disabled><small class="password-hint">Your sign-in email cannot be changed.</small></div>
      <div class="field full-field"><label for="profileMobile">Mobile number</label><input id="profileMobile" type="tel" pattern="[0-9]{10}" maxlength="10" value="${attr(u.mobile || '')}" required></div>
      <div class="field full-field"><button class="primary-btn" type="submit">Save profile changes →</button></div></form></section>
    <section class="panel"><div class="panel-heading"><div><h3>Account information</h3><p>Live counts from the server</p></div></div>
      <div class="record-detail-list"><div class="record-detail-row"><span>Account email</span><span>${esc(u.email)}</span></div>
      <div class="record-detail-row"><span>Documents</span><span>${app.documents.length}</span></div>
      <div class="record-detail-row"><span>Trusted nominees</span><span>${app.nominees.length}</span></div>
      <div class="record-detail-row"><span>Password</span><span>scrypt-hashed on the server — never stored in plaintext</span></div>
      <div class="record-detail-row"><span>Sessions</span><span>HttpOnly cookie · expires automatically</span></div></div>
      <div class="notice info" style="margin-top:16px">Password reset: because the server never stores your password, reset is handled by the account owner process on the server side. Keep your password safe.</div>
      <div class="form-actions"><button class="outline-btn" data-action="lock-vault">Sign out</button></div></section></div>`;
}
async function saveProfile(e) {
  e.preventDefault();
  const name = $('#profileName').value.trim(), mobile = $('#profileMobile').value.trim();
  if (name.length < 2) { toast('Enter your full name.'); return; }
  if (!/^\d{10}$/.test(mobile)) { toast('Enter a valid 10-digit mobile number.'); return; }
  try {
    const r = await api('PATCH', '/api/auth/profile', { json: { name, mobile } });
    app.user = r.user; updateGlobalUI(); renderPage('settings'); toast('Profile updated on the server.');
  } catch (err) { toast(err.message, 4500); }
}

/* ---------- event delegation ---------- */
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle-input]');
  if (toggle) { const input = $('#' + toggle.dataset.toggleInput); if (!input) return; input.type = input.type === 'password' ? 'text' : 'password'; toggle.textContent = input.type === 'password' ? 'Show' : 'Hide'; return; }

  const page = e.target.closest('[data-page]');
  if (page) { if (page.dataset.page === 'portal') { openPortalView(); } else if (app.user) { renderPage(page.dataset.page); } return; }
  const closeBtn = e.target.closest('[data-close]'); if (closeBtn) { closeModal(); return; }
  const backWelcome = e.target.closest('[data-back-welcome]'); if (backWelcome) { showAuthPanel('welcome'); return; }
  const openAuth = e.target.closest('[data-open-auth]'); if (openAuth) { showAuthPanel(openAuth.dataset.openAuth); return; }

  if (e.target.closest('#nomineeChoice')) { openPortalView(); return; }
  if (e.target.closest('#portalBackBtn')) { closePortalView(); return; }
  if (e.target.closest('[data-portal-back]')) { setPortalPanel('mobile'); return; }
  if (e.target.closest('#portalEndBtn')) { portalLogout(); return; }
  if (e.target.closest('#copyCodeBtn')) { const b = e.target.closest('#copyCodeBtn'); navigator.clipboard?.writeText(b.dataset.code).then(() => toast('Code copied.')).catch(() => toast('Copy is unavailable — select the code manually.')); return; }
  // Portal session actions run while SIGNED OUT as the nominee — must precede the owner gate below.
  const portalPreview = e.target.closest('[data-portal-preview]');
  if (portalPreview) { const id = portalPreview.dataset.portalPreview; const d = (app.portal.session || {}).documents?.find(x => x.id === id); openModal(`<div class="card-kicker">SHARED DOCUMENT</div><h2>${esc(d ? d.title : 'Document')}</h2><iframe class="doc-preview-frame" src="/api/portal/documents/${attr(id)}/content" title="shared document preview"></iframe><div class="form-actions"><button class="outline-btn" data-close>Close</button><button class="primary-btn" data-portal-download="${attr(id)}">Download <span>⇩</span></button></div>`); return; }
  const portalDownload = e.target.closest('[data-portal-download]'); if (portalDownload) { window.location.href = `/api/portal/documents/${portalDownload.dataset.portalDownload}/content?download=1`; return; }
  if (e.target.closest('#identityApproveBtn')) { decideIdentity(true); return; }
  if (e.target.closest('#identityRejectBtn')) { decideIdentity(false); return; }
  if (e.target.closest('#otpResendBtn')) { const b = e.target.closest('#otpResendBtn'); resendOtp(b.dataset.nom, b); return; }
  if (e.target.closest('#genCodeBtn')) { generateCodeModal(e.target.closest('#genCodeBtn').dataset.nom); return; }
  const revoke = e.target.closest('[data-revoke-code]'); if (revoke) { revokeCode(revoke.dataset.revokeCode); return; }

  if (!app.user) return;
  const action = e.target.closest('[data-action]');
  if (action) {
    switch (action.dataset.action) {
      case 'add-document': documentUploadModal(); return;
      case 'add-nominee': nomineeModal(); return;
      case 'lock-vault': signOut(); return;
    }
  }
  const nomOtp = e.target.closest('[data-nom-otp]');
  if (nomOtp) { const n = app.nominees.find(x => x.id === nomOtp.dataset.nomOtp); if (n) openModalFromOtpSend(n); return; }
  const nomId = e.target.closest('[data-nom-identity]'); if (nomId) { identityModal(nomId.dataset.nomIdentity); return; }
  const nomReview = e.target.closest('[data-nom-review]'); if (nomReview) { reviewIdentityModal(nomReview.dataset.nomReview); return; }
  const nomCodes = e.target.closest('[data-nom-codes]'); if (nomCodes) { codesModal(nomCodes.dataset.nomCodes); return; }
  const nomEdit = e.target.closest('[data-nom-edit]'); if (nomEdit) { nomineeModal(nomEdit.dataset.nomEdit); return; }
  const nomDel = e.target.closest('[data-nom-delete]');
  if (nomDel) { const n = app.nominees.find(x => x.id === nomDel.dataset.nomDelete); if (n && confirm(`Remove ${n.name} from your nominees? Their codes stop working immediately.`)) { api('DELETE', `/api/nominees/${n.id}`).then(() => { toast('Nominee removed.'); renderPage('nominees'); }).catch(err => toast(err.message, 4500)); } return; }
  const preview = e.target.closest('[data-doc-preview]'); if (preview) { previewDocument(preview.dataset.docPreview); return; }
  const download = e.target.closest('[data-doc-download]'); if (download) { window.location.href = `/api/documents/${download.dataset.docDownload}/download`; return; }
  const share = e.target.closest('[data-doc-share]');
  if (share) { const d = app.documents.find(x => x.id === share.dataset.docShare); if (d) { const toShared = !(d.visibility === 'shared' && d.shareWithVerified); api('PATCH', `/api/documents/${d.id}`, { json: { visibility: toShared ? 'shared' : 'private', shareWithVerified: toShared } }).then(() => { toast(toShared ? 'Now shareable with eligible verified nominees.' : 'Document is private again.'); renderPage('legacy'); }).catch(err => toast(err.message, 4500)); } return; }
  const del = e.target.closest('[data-doc-delete]');
  if (del) { const d = app.documents.find(x => x.id === del.dataset.docDelete); if (d && confirm(`Delete “${d.title}”? The file is removed from the server permanently.`)) { api('DELETE', `/api/documents/${d.id}`).then(() => { toast('Document deleted.'); renderPage('legacy'); }).catch(err => toast(err.message, 4500)); } return; }
});
async function openModalFromOtpSend(n) {
  try {
    const r = await api('POST', `/api/nominees/${n.id}/otp/send`, { json: {} });
    if (r.alreadyVerified) { toast('This nominee is already verified.'); renderPage('nominees'); return; }
    otpModal(n, r.otp);
  } catch (err) { toast(err.message, 4500); }
}
document.addEventListener('submit', (e) => {
  if (e.target.id === 'portalIdentifyForm') { e.preventDefault(); portalIdentify(e); return; }
  if (e.target.id === 'portalRedeemForm') { e.preventDefault(); portalRedeem(e); return; }
  if (e.target.id === 'otpForm') { submitOtpVerification(e); return; }
  if (!app.user) return;
  e.preventDefault();
  if (e.target.id === 'nomineeForm') submitNomineeForm();
  else if (e.target.id === 'docUploadForm') submitDocumentUpload();
  else if (e.target.id === 'identityForm') submitIdentityForm();
  else if (e.target.id === 'codeForm') submitCodeForm();
  else if (e.target.id === 'profileForm') saveProfile(e);
});
$('#pageContent').addEventListener('input', (e) => { if (e.target.id === 'docSearch') filterDocuments(); });
$('#pageContent').addEventListener('change', (e) => { if (e.target.id === 'docFilter' || e.target.id === 'docSearch') filterDocuments(); });
function filterDocuments() {
  const search = ($('#docSearch')?.value || '').trim().toLowerCase(), filter = $('#docFilter')?.value || 'all';
  $$('.record-card', $('#docGrid')).forEach(card => {
    const d = app.documents.find(x => x.id === card.dataset.docId);
    const matches = !!d && (filter === 'all' || d.category === filter) && [d.title, d.category, d.description, d.originalName].join(' ').toLowerCase().includes(search);
    card.classList.toggle('hidden', !matches);
  });
}

/* ---------- shell wiring ---------- */
$('#mainNav').addEventListener('click', e => { const btn = e.target.closest('[data-page]'); if (btn) { if (btn.dataset.page === 'portal') openPortalView(); else renderPage(btn.dataset.page); } });
$('#bottomNav').addEventListener('click', e => { const btn = e.target.closest('[data-page]'); if (btn) renderPage(btn.dataset.page); });
$('#topbarNotifications').addEventListener('click', () => renderPage('notifications'));
$('#sidebarProfileBtn').addEventListener('click', () => renderPage('settings'));
$('#profileMenuToggle').addEventListener('click', () => $('#profileMenu').classList.toggle('hidden'));
$('#profileMenu').addEventListener('click', e => { const btn = e.target.closest('[data-go-page]'); if (btn) renderPage(btn.dataset.goPage); });
$('#topbarSignOut').addEventListener('click', signOut);
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', e => { if (e.target === $('#modalBackdrop')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modalBackdrop').classList.contains('hidden')) closeModal(); });
function quickGuideModal() {
  const step = (n, title, body) => `<div class="guide-step"><span class="guide-step-num">${n}</span><div><strong>${title}</strong><p>${body}</p></div></div>`;
  openModal(`<div class="form-symbol">?</div><h2 id="modalTitle">How Digital Legacy works</h2><p>A complete chain, every step enforced by the secure backend.</p>
    ${step(1, 'My Documents', 'Upload the PDFs and images your plan depends on. Files are validated by content, stored privately, and stay private until you share them.')}
    ${step(2, 'Add a nominee', 'Register the person and the categories they may access. Being listed grants nothing on its own.')}
    ${step(3, 'Verify their mobile', 'The server sends a real SMS OTP to their number — hashed, five-minute expiry, attempt-limited.')}
    ${step(4, 'Review identity', 'They give you an identity document; you upload it and approve or reject it personally. Codes are blocked until then.')}
    ${step(5, 'Issue & share a code', 'A random one-time-shown code bound to their mobile. Revoke it any time — access stops instantly.')}
    ${step(6, 'Nominee access', 'They open the Nominee Access page, confirm their mobile and code, and see only the shared documents their code allows.')}
    <div class="notice info">Everything above is verified on the server for every request. Nothing in the website itself can bypass a step.</div>
    <div class="form-actions"><button class="outline-btn" data-close>Close</button><button class="primary-btn" data-page="legacy">Go to my documents →</button></div>`);
}
$('#helpGuideBtn').addEventListener('click', quickGuideModal);
$('#privacyPrinciplesBtn').addEventListener('click', () => openModal(`<h2>Privacy principles</h2><p>Digital Legacy is built around consent, minimum necessary access, and clear review procedures.</p><h3>How your data is protected</h3><p>Your password is hashed with scrypt and never stored in plaintext. Session cookies are HttpOnly and SameSite. OTPs and security codes exist on the server only as salted hashes. Uploaded files are validated by content, renamed randomly, stored outside the web root, and served only through authorised requests.</p><h3>Access is never automatic</h3><p>Adding a nominee sends no access. Mobile verification proves ownership of the number; identity documents are approved by you, a human; codes are bound, expiring, revocable; and a nominee session can open only the exact documents the code allows.</p>`));
$('#forgotPasswordBtn').addEventListener('click', () => openModal(`<h2>Forgot your password?</h2><p>Your password is hashed on the server and cannot be recovered by anyone — including us. That is the point: no backdoor exists that could be misused.</p><div class="notice warning">If you cannot sign in, an administrator can remove your account and its data on request; a new account can then be created. Records that matter legally should also be kept with their official issuers.</div><div class="form-actions"><button class="outline-btn" data-close>Back to sign in</button></div>`));

/* ---------- boot ---------- */
applyTheme(document.documentElement.getAttribute('data-theme') || readStoredTheme());
$('#authThemeBtn').addEventListener('click', toggleTheme);
$('#appThemeBtn').addEventListener('click', toggleTheme);
try { const remembered = localStorage.getItem('digitalLegacy:rememberEmail'); if (remembered) { $('#loginEmail').value = remembered; $('#rememberEmail').checked = true; } } catch (e) {}
(async function boot() {
  await loadCapability();
  try {
    const r = await api('GET', '/api/auth/me');
    app.user = r.user;
    $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden');
    updateGlobalUI(); renderPage('dashboard');
  } catch (err) {
    app.user = null;
    showAuthPanel('welcome');
  }
})();
