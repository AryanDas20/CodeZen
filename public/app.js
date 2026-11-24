import {
  initializeFirebaseClient, signInGoogle, signInEmail, createEmailAccount,
  signOutFirebase, watchAuth, getFreshIdToken, describeAuthError, isAuthCancellation
} from './firebase-client.js';

import { illus, illusForIcon } from './illustrations.js';
import { startTour } from './tour.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  token: null, tokenKind: null, signupInProgress: false, user: null, profile: {}, data: { sources: [], reviews: [], audit: [] },
  page: 'overview', currentReview: null, authMode: 'signin', firebase: null,
  pendingAction: null, agentStatus: null, assistantBusy: false
};
const featureCopy = {
  memory: {
    icon: '◈', title: 'Brand memory',
    copy: 'A controlled library for your organisation’s brand guidelines, approved facts, terminology, policies and visual assets. Add only material your team has approved. Each source becomes part of the review context, so content checks can refer to the actual knowledge your organisation supplied.',
    meta: 'Good practice: give each source an owner and validity date in its title or content. Keep old or superseded guidance out of the active library.'
  },
  review: {
    icon: '✳', title: 'Evidence-led content review',
    copy: 'Paste a draft, choose its channel and run the first-pass checks. BrandWeave identifies measurable promises, absolute language, superlatives and restricted terminology. Findings include the exact excerpt, severity, reason and any possible matching source. The current MVP uses transparent deterministic checks; a phrase match is not proof that a claim is true.',
    meta: 'Input: text draft · Output: findings, severity, possible evidence and reviewer actions. PDF/DOCX source ingestion is available for signed-in workspaces.'
  },
  approvals: {
    icon: '✓', title: 'Human approval loop',
    copy: 'Reviewers can approve a draft, reject it or request changes with a reason. High-risk findings trigger an additional acknowledgement before approval. A decision records the actor, timestamp and reason. BrandWeave never auto-publishes content.',
    meta: 'The current personal workspace treats its signed-in owner as the authorised reviewer. Team roles and reviewer assignment are the next implementation layer.'
  },
  insights: {
    icon: '⌁', title: 'Policy insights',
    copy: 'Insights are calculated from real review records in this workspace: the number of reviews, severity distribution and decisions recorded. When enough real records exist, patterns can guide governance owners toward unclear or repeatedly violated rules. No sample metrics are generated.',
    meta: 'Empty-state analytics are intentional until real reviews are created.'
  },
  audit: {
    icon: '◷', title: 'Audit trail',
    copy: 'An activity record is written when a source is created or deleted, a review is analysed or revised, a review decision is made, or profile details are updated. Entries include actor, action, timestamp and relevant record identifiers.',
    meta: 'For production, add retention controls, export, tenant-level role access and immutable audit storage.'
  },
  assistant: {
    icon: '✳', title: 'AI command centre',
    copy: 'The command centre can navigate the product and prepare supported actions. A profile update is shown as a preview and cannot be applied until you confirm it. The built-in command router is available now. Agent37 is designed as a server-side adapter, but an instance ID alone does not provide a documented website chat API; configure a supported bridge endpoint before claiming a live Agent37 connection.',
    meta: 'Safety: allowlisted tools only · Confirmation required for mutations · No unrestricted database access or arbitrary code execution.'
  }
};

const EXPLAIN = {
  overview: ['How your workspace works', 'This page is your starting point. The four counters show real numbers from your own records and start at zero.', ['Brand memory: approved sources you have added.', 'Content reviews: drafts you have analysed.', 'Awaiting decision: reviews not yet approved or rejected.', 'Approved: reviews a person has signed off.']],
  memoryList: ['Your source library', 'Every source here is used when you review a draft. Active sources are searched for possible evidence, and terminology sources supply the banned words.', ['The × button removes a source from future checks.', 'Past reviews keep the findings they already recorded.']],
  memorySource: ['Add a source by hand', 'Give the source a clear title, choose its type and paste the approved text. The type decides how checks use it.', ['Guideline, approved fact and policy: searched for possible evidence behind a claim.', 'Terminology: write “Banned: word, another word” on its own line. Each term is flagged when found.', 'Titles with an owner and date (for example “Voice guide, approved 2026”) keep the library trustworthy.']],
  memoryUpload: ['Upload a document', 'Choose or drop a file up to 4 MB. PDF, DOCX, TXT, CSV and Markdown files have their text extracted so reviews can use them.', ['Images and scanned PDFs are stored but have no readable text, so checks ignore them.', 'Files are kept in private storage under your account.', 'Guests cannot upload. Create an account to use this.']],
  review: ['Run a content review', 'Paste the exact text you plan to publish and select where it will appear. Press Analyse to run the first-pass checks.', ['Looks for superlatives (“best-in-class”), absolute promises (“guaranteed”, “never”) and numbers such as “40%”.', 'Flags every banned term from your terminology sources.', 'Links possible evidence from your approved sources. A match is a lead, not proof.', 'Opens the result so you can read each finding.']],
  findings: ['Reading the findings', 'Each card shows the flagged excerpt, why it matters and what to do next.', ['High: superlatives and guarantees that need strong evidence.', 'Medium: numbers and banned terms.', 'Low: vague promotional wording.', 'Evidence line: whether a source in your library may support the claim.']],
  revise: ['Edit and re-check', 'Change the draft here and press Save & re-analyse. The checks run again on the new text.', ['Each save creates a new numbered version.', 'Earlier versions stay in the history below.', 'A revised draft goes back to “In review”.']],
  decision: ['Record a decision', 'Only a person decides. The checks never approve content on their own.', ['Approve: allowed once you have verified the evidence. High-risk findings need an extra confirmation.', 'Request changes or Reject: a reason is required.', 'The decision, who made it and when are written to the audit trail.', 'Nothing is published from here.']],
  queue: ['Review queue', 'Every review you have run is listed here, newest first. Open one to see its findings, edit the draft or record a decision.', ['Needs review: high-risk findings were detected.', 'In review: waiting for a person.', 'Changes requested, Approved and Rejected show the last decision.']],
  approvals: ['Approvals', 'This page lists the reviews still waiting for a decision. Open one, check the findings and evidence, then decide.', ['Pending = anything not yet approved or rejected.', 'The “Recently decided” card counts reviews with a final status.']],
  insights: ['Policy insights', 'These figures are counted from your own reviews, so they stay empty until you run some.', ['Severity bars show how many findings were high, medium or low.', 'Evidence gaps count findings with no matching source in your library.', 'They are rule triggers, so some may be false alarms. Use them to spot unclear guidelines.']],
  audit: ['Audit trail', 'A dated log of meaningful actions, written automatically.', ['Sources added, uploaded or deleted.', 'Reviews analysed or revised.', 'Decisions with their reasons.', 'Profile name changes.']]
};
function explainer(key) {
  const e = EXPLAIN[key]; if (!e) return '';
  return `<aside class="explain" aria-label="${escapeHtml(e[0])}"><div class="explain-ico" aria-hidden="true">i</div><div><b>${escapeHtml(e[0])}</b><p>${escapeHtml(e[1])}</p>${e[2]?.length ? `<ul>${e[2].map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}</div></aside>`;
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dateLabel(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function showToast(message, type = 'info', detail = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `${escapeHtml(message)}${detail ? `<small>${escapeHtml(detail)}</small>` : ''}`;
  $('#toast-root').append(node);
  setTimeout(() => node.remove(), 3900);
}
function setBusy(button, busy, label = 'Working…') {
  if (!button) return;
  if (busy) { button.dataset.original = button.innerHTML; button.disabled = true; button.innerHTML = label; }
  else { button.disabled = false; if (button.dataset.original) button.innerHTML = button.dataset.original; }
}
// Firebase ID tokens expire after about an hour, so a Firebase session asks the SDK
// for the current token on every request (it refreshes silently when needed).
async function currentToken(forceRefresh = false) {
  if (state.tokenKind === 'firebase') {
    const token = await getFreshIdToken(forceRefresh);
    if (token) state.token = token;
  }
  return state.token || '';
}
async function api(path, options = {}) {
  const send = async (forceRefresh) => {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${await currentToken(forceRefresh)}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    return fetch(path, { ...options, headers });
  };
  let response = await send(false);
  if (response.status === 401 && state.tokenKind === 'firebase') response = await send(true);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
function showModal(selector) { $(selector).classList.remove('hidden'); }
function hideModal(selector) { $(selector).classList.add('hidden'); }
function showFeature(key) {
  const feature = featureCopy[key];
  if (!feature) return;
  $('#feature-modal-icon').textContent = feature.icon;
  $('#feature-modal-title').textContent = feature.title;
  $('#feature-modal-copy').textContent = feature.copy;
  $('#feature-modal-meta').textContent = feature.meta;
  showModal('#feature-modal');
}
function setPage(page) {
  state.page = page;
  state.currentReview = null;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page || (page === 'review-detail' && item.dataset.page === 'reviews')));
  const labels = { overview: 'Overview', memory: 'Brand memory', review: 'Content review', reviews: 'Review queue', 'review-detail': 'Review details', approvals: 'Approvals', insights: 'Policy insights', audit: 'Audit trail' };
  $('#breadcrumb-current').textContent = labels[page] || 'Workspace';
  $('#sidebar').classList.remove('mobile-open');
  renderPage();
  $('#page-content').focus({ preventScroll: true });
}
function updateProfileDisplay() {
  const name = state.profile.displayName || state.user?.displayName || (state.user?.isGuest ? 'Guest workspace' : 'Workspace member');
  $('#user-name').textContent = name;
  $('#user-email').textContent = state.user?.isGuest ? 'Temporary guest session' : (state.profile.email || state.user?.email || 'Signed in');
  const initial = (name.trim()[0] || 'B').toUpperCase();
  $('#user-avatar').textContent = initial; $('#top-avatar').textContent = initial; $('#set-avatar').textContent = initial;
  $('#set-name').textContent = name; $('#set-email').textContent = $('#user-email').textContent;
  $('#workspace-name').textContent = state.user?.isGuest ? 'Guest workspace' : (name + '’s workspace');
  $('#workspace-plan').textContent = state.user?.isGuest ? 'TEMPORARY SESSION' : 'PERSONAL WORKSPACE';
}
function updateNavCounts() {
  $('#source-count').textContent = String(state.data.sources.length);
  $('#review-count').textContent = String(state.data.reviews.length);
}
async function loadWorkspace() {
  const data = await api('/api/state');
  state.user = data.user;
  state.profile = data.profile || {};
  state.data = { sources: data.sources || [], reviews: data.reviews || [], audit: data.audit || [] };
  updateProfileDisplay(); updateNavCounts();
  const status = await api('/api/agent/status').catch(() => null);
  state.agentStatus = status;
  if (status && !status.configured) $('#system-status-text').textContent = 'Workspace ready · Agent37 not connected';
  else $('#system-status-text').textContent = 'All systems operational';
  renderPage();
}
async function startGuest() {
  try {
    const existing = sessionStorage.getItem('brandweave_guest_token');
    if (existing) {
      state.token = existing; state.tokenKind = 'guest';
      try { await loadWorkspace(); enterApp(); return; } catch { sessionStorage.removeItem('brandweave_guest_token'); state.token = null; state.tokenKind = null; }
    }
    const response = await fetch('/api/guest/session', { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.token) throw new Error(result.error || 'Could not start a guest session.');
    state.token = result.token; state.tokenKind = 'guest';
    sessionStorage.setItem('brandweave_guest_token', result.token);
    await loadWorkspace(); enterApp();
  } catch (error) { state.token = null; state.tokenKind = null; showToast(error.message, 'error'); }
}
// The sign-in button AND the Firebase auth listener both report a new login. Sharing
// one in-flight promise means the workspace is loaded once, not twice.
let connectingFirebase = null;
function connectFirebaseUser(user, { forceRefresh = false } = {}) {
  if (!user) return Promise.resolve();
  if (connectingFirebase) return connectingFirebase;
  connectingFirebase = (async () => {
    state.token = await user.getIdToken(forceRefresh);
    state.tokenKind = 'firebase';
    sessionStorage.removeItem('brandweave_guest_token');
    try { await loadWorkspace(); }
    catch (error) { state.token = null; state.tokenKind = null; throw error; }
    enterApp();
  })().finally(() => { connectingFirebase = null; });
  return connectingFirebase;
}
function enterApp() {
  $('#welcome-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#auth-modal').classList.add('hidden');
  window.scrollTo(0, 0);
  renderPage();
}
function signOutToWelcome() {
  state.token = null; state.tokenKind = null; state.user = null; state.profile = {}; state.data = { sources: [], reviews: [], audit: [] };
  sessionStorage.removeItem('brandweave_guest_token');
  $('#app-shell').classList.add('hidden'); $('#welcome-screen').classList.remove('hidden');
  $('#profile-popover').classList.add('hidden'); $('#sidebar').classList.remove('mobile-open');
  state.page = 'overview'; state.currentReview = null; closeAssistant(); $('#assistant-clear').click();
  $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === 'overview')); $('#breadcrumb-current').textContent = 'Overview'; window.scrollTo(0, 0);
  showToast('You have signed out.', 'success');
}

function pageHeading(title, description, actions = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function emptyState(icon, title, description, action = '', compact = false) {
  return `<div class="empty-state ${compact ? 'empty-compact' : ''}"><div><div class="empty-illus">${illusForIcon(icon)}</div><b>${escapeHtml(title)}</b><p>${escapeHtml(description)}</p>${action}</div></div>`;
}
function statusPill(status) {
  const map = { approved: ['Approved', 'green'], needs_review: ['Needs review', 'red'], in_review: ['In review', 'blue'], changes_requested: ['Changes requested', 'amber'], rejected: ['Rejected', 'red'], active: ['Active', 'green'] };
  const [label, color] = map[status] || [String(status || 'Unknown').replaceAll('_', ' '), 'neutral'];
  return `<span class="pill pill-${color}">${escapeHtml(label.toUpperCase())}</span>`;
}
function renderOverview() {
  const sources = state.data.sources.length;
  const reviews = state.data.reviews.length;
  const pending = state.data.reviews.filter(r => !['approved', 'rejected'].includes(r.status)).length;
  const approved = state.data.reviews.filter(r => r.status === 'approved').length;
  const recent = [...state.data.reviews].sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0,4);
  const name = (state.profile.displayName || 'there').split(' ')[0];
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> YOUR GOVERNANCE WORKSPACE</div><h1>Good to have you, ${escapeHtml(name)}.</h1><p>Your brand control centre is ready. Add your organisation’s real knowledge to begin.</p></div><div class="heading-actions"><button class="btn btn-secondary btn-sm" data-feature="assistant">✳ AI command guide</button><button class="btn btn-primary btn-sm" data-nav="review">＋ New content review</button></div></div>
    <section class="dashboard-hero"><div class="dashboard-hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> BRAND TRUST, BUILT INTO THE WORKFLOW</div><h2>One source of truth. Every story on-brand.</h2><p>Bring your approved knowledge together, then make every review explainable and accountable.</p><div class="hero-actions"><button class="btn btn-primary btn-sm" data-nav="memory">Build brand memory <span>→</span></button><button class="hero-secondary" data-nav="review">Review content</button></div></div><div class="hero-decoration">${illus('hero')}</div></section>
    <section class="stats-grid">
      <div class="stat-card"><div class="stat-top"><span>Knowledge sources</span><span class="stat-icon">◈</span></div><div class="stat-value mono">${sources}</div><div class="stat-foot">Actual active sources in this workspace</div></div>
      <div class="stat-card"><div class="stat-top"><span>Content reviews</span><span class="stat-icon">▤</span></div><div class="stat-value mono">${reviews}</div><div class="stat-foot">Submissions analysed so far</div></div>
      <div class="stat-card"><div class="stat-top"><span>Awaiting decision</span><span class="stat-icon">◷</span></div><div class="stat-value mono">${pending}</div><div class="stat-foot">Reviews not yet approved or rejected</div></div>
      <div class="stat-card"><div class="stat-top"><span>Approved</span><span class="stat-icon">✓</span></div><div class="stat-value mono">${approved}</div><div class="stat-foot">Human decisions recorded</div></div>
    </section>
    ${explainer('overview')}<section class="dashboard-grid">
      <div class="panel"><div class="panel-head"><div><h3>Recent review activity</h3><p>Updates from your actual workspace records</p></div><button class="feature-link" data-nav="reviews">View all →</button></div>
        ${recent.length ? `<div class="record-list">${recent.map(r => `<div class="review-item" data-open-review="${escapeHtml(r.id)}"><div class="record-icon">▤</div><div class="record-info"><b>${escapeHtml(r.title || 'Untitled review')}</b><small>${escapeHtml(r.channel || 'General')} · ${dateLabel(r.updatedAt || r.createdAt)}</small></div>${statusPill(r.status)}<span class="review-open">›</span></div>`).join('')}</div>` : emptyState('▤','No reviews yet','Your real submissions and their findings will appear here once you run your first content review.','<button class="btn btn-primary btn-sm" data-nav="review">Start your first review →</button>',true)}
      </div>
      <div class="panel"><div class="panel-head"><div><h3>Start with the essentials</h3><p>A simple path to an evidence-led workflow</p></div><span class="pill pill-blue">GET STARTED</span></div><div class="panel-body"><div class="getting-started">
        <div class="setup-item"><span class="setup-icon">01</span><div><b>Add approved brand knowledge</b><p>Upload guidelines or enter approved facts, tone rules and terminology.</p></div></div>
        <div class="setup-item"><span class="setup-icon">02</span><div><b>Run a real content review</b><p>Paste your draft and inspect the checks against your current sources.</p></div></div>
        <div class="setup-item"><span class="setup-icon">03</span><div><b>Record a human decision</b><p>Revise, request changes or approve after checking evidence.</p></div></div>
        <button class="feature-link" data-feature="review">Understand the complete workflow →</button>
      </div></div></div>
    </section>
    <div class="section-label" style="margin:24px 0 10px">WORKSPACE PRINCIPLES</div><div class="tag-row"><span class="tag">Evidence before confidence</span><span class="tag">Human approval stays in control</span><span class="tag">No silent edits</span><span class="tag">No fabricated activity</span><span class="tag">Traceable decisions</span></div>`;
}
function renderMemory() {
  const sources = state.data.sources;
  return `${pageHeading('Brand memory','Your organisation’s approved knowledge, organised in one place. Every check should be grounded in material you add.', '<button class="btn btn-secondary btn-sm" data-feature="memory">How it works ↗</button>')}
    <div class="content-grid"><div class="stack">
      ${explainer('memoryList')}<div class="panel"><div class="panel-head"><div><h3>Knowledge sources</h3><p>${sources.length} actual source${sources.length === 1 ? '' : 's'} · no sample records</p></div><span class="pill pill-blue">SOURCE LIBRARY</span></div>
        ${sources.length ? `<div class="record-list">${sources.map(source => `<div class="record-row"><div class="record-icon">${source.sourceKind === 'file' ? '↥' : '◈'}</div><div class="record-info"><b>${escapeHtml(source.title)}</b><small><span class="source-type">${escapeHtml(source.type.replaceAll('_',' '))}</span> · ${escapeHtml(source.fileName || 'Manual entry')} · ${dateLabel(source.updatedAt || source.createdAt)}</small></div>${statusPill(source.status)}<button class="icon-button" data-delete-source="${escapeHtml(source.id)}" title="Delete source">×</button></div>`).join('')}</div>` : emptyState('◈','Your brand memory is empty','Add an approved guideline, fact, policy or terminology rule. Reviews will not pretend to know your brand until you provide it.','',true)}
      </div>
      ${explainer('memorySource')}<div class="panel"><div class="panel-head"><div><h3>Add a source manually</h3><p>Enter real, approved information from your organisation.</p></div></div><div class="panel-body form-panel">
        <form id="source-form" class="stack">
          <div class="field-row"><div class="field"><label for="source-title">Source title</label><input class="field-control" id="source-title" required maxlength="120" placeholder="e.g. Brand voice guidelines — approved 2026" /></div><div class="field"><label for="source-type">Source type</label><select class="field-control select-control" id="source-type"><option value="guideline">Brand guideline</option><option value="approved_fact">Approved fact / claim</option><option value="terminology">Terminology rules</option><option value="policy">Policy / disclaimer</option><option value="other">Other knowledge</option></select></div></div>
          <div class="field"><label for="source-content">Approved content</label><textarea class="field-control" id="source-content" required maxlength="50000" placeholder="Paste the approved source text here. For terminology, use clear lines such as: Banned: cheap, guaranteed\nPreferred: cost-effective, designed to help"></textarea><span class="field-hint">Only add content that your organisation is authorised to use. Avoid confidential personal data.</span></div>
          <div><button class="btn btn-primary btn-sm" type="submit">＋ Save approved source</button></div>
        </form>
      </div></div>
    </div>
    <aside class="stack">${explainer('memoryUpload')}<div class="panel"><div class="panel-head"><h3>Upload a document</h3><span class="pill pill-blue">SUPABASE STORAGE</span></div><div class="panel-body"><label class="upload-zone" id="upload-zone"><input id="source-file" type="file" accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"/><div class="upload-symbol">↥</div><b>Choose a brand document</b><small>PDF, DOCX, TXT, CSV, Markdown or image · Max 4 MB on Vercel</small></label><div class="field" style="margin-top:13px"><label for="upload-type">Classify this source</label><select id="upload-type" class="field-control select-control"><option value="guideline">Brand guideline</option><option value="approved_fact">Approved fact / claim</option><option value="terminology">Terminology rules</option><option value="policy">Policy / disclaimer</option><option value="asset">Visual asset</option><option value="other">Other</option></select></div><p class="field-hint" style="margin:10px 0 0">${state.user?.isGuest ? 'Guest workspaces are temporary. Sign in to store uploaded files securely in Supabase Storage.' : 'Files are stored in your private Supabase Storage workspace. Text extraction is attempted for PDF, DOCX and text files.'}</p></div></div>
      <div class="info-card"><h4>What belongs here?</h4><ul class="bullet-list"><li>Approved product facts and substantiation</li><li>Brand tone, voice and positioning rules</li><li>Preferred and prohibited terminology</li><li>Required disclaimers and approved claims</li><li>Approved logos, assets and usage guidance</li></ul></div>
      <div class="info-card"><h4>Source integrity</h4><p>A source match is a lead for a reviewer, not proof of truth. Add ownership, effective dates and expiry dates to your original source records.</p></div>
    </aside></div>`;
}
function renderReviewForm() {
  return `${pageHeading('Content review','Check a draft before it reaches the world. Findings explain what was flagged and what evidence is available.', '<button class="btn btn-secondary btn-sm" data-feature="review">Detailed feature guide ↗</button>')}
    ${explainer('review')}<div class="content-grid"><div class="panel"><div class="panel-head"><div><h3>Submit content for review</h3><p>Use a real draft from your organisation. Nothing is preloaded.</p></div><span class="pill pill-green">READY</span></div><div class="panel-body form-panel"><form id="review-form" class="stack">
      <div class="field"><label for="review-title">Review title</label><input id="review-title" class="field-control" maxlength="120" placeholder="e.g. Product launch LinkedIn post" /></div>
      <div class="field-row"><div class="field"><label for="review-channel">Publishing channel</label><select id="review-channel" class="field-control select-control"><option>Social media</option><option>Website</option><option>Advertising</option><option>Email campaign</option><option>Press release</option><option>Sales collateral</option><option>Other</option></select></div><div class="field"><label>Available knowledge</label><div class="field-control" style="display:flex;align-items:center;justify-content:space-between;color:var(--muted)"><span>${state.data.sources.length} real source(s)</span><button type="button" class="feature-link" data-nav="memory">Manage ↗</button></div></div></div>
      <div class="field"><label for="review-content">Content to review</label><textarea id="review-content" class="field-control" style="min-height:260px" required minlength="20" maxlength="20000" placeholder="Paste the exact content you want to review…"></textarea><span class="field-hint">20–20,000 characters. The current first pass checks claims, absolute language, quantified promises and terminology rules.</span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><span class="field-hint">Human review is required before approval.</span><button class="btn btn-primary" id="analyze-button" type="submit">✳ Analyse this content <span>→</span></button></div>
    </form></div></div>
    <aside class="stack"><div class="info-card"><h4>What happens next?</h4><ul class="bullet-list"><li>Text is checked against deterministic risk signals.</li><li>Active approved sources are considered for possible matches.</li><li>Each finding shows an excerpt, reason, severity and next step.</li><li>You can revise the draft and compare versions.</li><li>An authorised human records the final decision.</li></ul></div><div class="info-card"><h4>Current analysis boundary</h4><p>This first-pass engine does not claim to verify facts, interpret every nuance of tone or compare images against a logo library. Those checks need a verified AI provider, source quality and dedicated evaluation.</p></div><div class="info-card"><h4>Knowledge coverage</h4><p>${state.data.sources.length ? `${state.data.sources.length} source(s) are currently available in this workspace.` : 'No brand sources have been added. Findings will clearly state that evidence is unavailable.'}</p><button class="feature-link" data-nav="memory" style="margin-top:8px">Add brand sources →</button></div></aside></div>`;
}
function renderReviews() {
  const reviews = [...state.data.reviews].sort((a,b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  return `${pageHeading('Review queue','Every submission, analysis, revision and decision in your workspace.', '<button class="btn btn-primary btn-sm" data-nav="review">＋ New review</button>')}
    ${explainer('queue')}<div class="panel"><div class="panel-head"><div><h3>All reviews</h3><p>${reviews.length} real review record(s)</p></div><span class="pill pill-blue">WORKSPACE RECORDS</span></div>
    ${reviews.length ? `<div class="record-list">${reviews.map(r => `<div class="review-item" data-open-review="${escapeHtml(r.id)}"><div class="record-icon">▤</div><div class="record-info"><b>${escapeHtml(r.title || 'Untitled review')}</b><small>${escapeHtml(r.channel || 'General')} · ${dateLabel(r.updatedAt || r.createdAt)} · ${Number(r.findings?.length || 0)} finding(s)</small></div>${statusPill(r.status)}<span class="review-open">›</span></div>`).join('')}</div>` : emptyState('▤','No content has been reviewed','Create a real review to see its findings, version history and human decisions here.','<button class="btn btn-primary btn-sm" data-nav="review">Start a content review →</button>')}
    </div>`;
}
function renderReviewDetail(review) {
  const findings = review.findings || [];
  const versions = review.versions || [];
  const latestDecision = (review.decisions || []).at(-1);
  return `${pageHeading(escapeHtml(review.title || 'Review details'),`${escapeHtml(review.channel || 'General')} · Created ${dateLabel(review.createdAt)} · ${versions.length} version(s)`, '<button class="btn btn-secondary btn-sm" data-nav="reviews">← Back to queue</button>')}
    <div class="content-grid"><div class="stack">
      ${explainer('revise')}<div class="panel"><div class="panel-head"><div><h3>Current draft</h3><p>Version ${versions.length || 1} · Use the editor to submit a revised version</p></div>${statusPill(review.status)}</div><div class="panel-body form-panel"><textarea id="revision-content" class="field-control" style="min-height:210px">${escapeHtml(review.content || '')}</textarea><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap"><span class="field-hint">Saving a revision re-runs the available checks and records a new version.</span><button class="btn btn-primary btn-sm" id="save-revision" data-review-id="${escapeHtml(review.id)}">Save & re-analyse →</button></div></div></div>
      ${explainer('findings')}<div class="panel"><div class="panel-head"><div><h3>Review findings</h3><p>${findings.length} signal(s) · ${escapeHtml(review.method || '')}</p></div><button class="feature-link" data-feature="review">How findings work ↗</button></div>
        ${findings.length ? findings.map(f => `<div class="review-finding"><div class="finding-top"><b>${escapeHtml(f.title)}</b><span class="pill pill-${f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'amber' : 'neutral'}">${escapeHtml(f.severity.toUpperCase())}</span><span class="tag">${escapeHtml(f.category)}</span></div><div class="finding-excerpt">${escapeHtml(f.excerpt)}</div><p>${escapeHtml(f.explanation)}</p><p><b>Suggested next step:</b> ${escapeHtml(f.recommendation)}</p><div class="finding-evidence">${f.evidenceStatus === 'not_found' ? '◇ No approved source match found' : f.evidenceStatus === 'possible_match' ? '↗ Possible source match — reviewer verification required' : '↗ Restricted term matched to source'}${f.evidence?.length ? ` · ${f.evidence.map(e => escapeHtml(e.title)).join(', ')}` : ''}</div></div>`).join('') : emptyState('✓','No rule signals found','No configured first-pass rules were triggered. This does not prove that the content is fully on-brand.', '', true)}
      </div>
      <div class="panel"><div class="panel-head"><h3>Version history</h3><span class="pill pill-neutral">${versions.length} VERSION(S)</span></div><div class="panel-body">${versions.length ? versions.map(v => `<div class="version-block"><div class="review-meta"><b style="font-size:10px">Version ${v.version}</b><span class="tag">${escapeHtml(v.label || 'Saved version')}</span><span class="field-hint">${dateLabel(v.createdAt)}</span></div><pre>${escapeHtml((v.content || '').slice(0,900))}${(v.content || '').length > 900 ? '…' : ''}</pre></div>`).join('') : emptyState('◷','No versions yet','Revisions will appear here.', '', true)}</div></div>
    </div><aside class="stack">
      <div class="panel"><div class="panel-head"><h3>Decision summary</h3></div><div class="panel-body"><div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin:0"><div class="stat-card"><div class="stat-top">High</div><div class="stat-value">${review.summary?.high || 0}</div></div><div class="stat-card"><div class="stat-top">Medium</div><div class="stat-value">${review.summary?.medium || 0}</div></div><div class="stat-card"><div class="stat-top">Low</div><div class="stat-value">${review.summary?.low || 0}</div></div><div class="stat-card"><div class="stat-top">Total</div><div class="stat-value">${review.summary?.total || findings.length}</div></div></div><p class="field-hint" style="margin:12px 0 0">${escapeHtml(review.summary?.coverage || 'Evidence coverage not available.')}</p></div></div>
      ${explainer('decision')}<div class="info-card"><h4>Human decision</h4><p>AI or deterministic checks do not approve content. An authorised person must inspect the source and risk before making a decision.</p><div class="stack" style="margin-top:13px"><button class="btn btn-primary btn-sm" data-decision="approve" data-review-id="${escapeHtml(review.id)}">✓ Approve after verification</button><button class="btn btn-secondary btn-sm" data-decision="request_changes" data-review-id="${escapeHtml(review.id)}">Request changes</button><button class="btn btn-secondary btn-sm" data-decision="reject" data-review-id="${escapeHtml(review.id)}">Reject submission</button></div></div>
      ${latestDecision ? `<div class="info-card"><h4>Latest decision</h4><div style="margin:6px 0">${statusPill(latestDecision.action === 'approve' ? 'approved' : latestDecision.action === 'reject' ? 'rejected' : 'changes_requested')}</div><p>${escapeHtml(latestDecision.reason || 'No reason supplied.')}</p><div class="field-hint" style="margin-top:8px">${escapeHtml(latestDecision.actor || 'Reviewer')} · ${dateLabel(latestDecision.createdAt)}</div></div>` : ''}
      <div class="info-card"><h4>Analysis limitations</h4><ul class="bullet-list">${(review.limitations || []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Human verification remains required.</li>'}</ul></div>
    </aside></div>`;
}
function renderApprovals() {
  const pending = state.data.reviews.filter(r => !['approved','rejected'].includes(r.status));
  const decided = state.data.reviews.filter(r => ['approved','rejected'].includes(r.status));
  return `${pageHeading('Approvals','Make accountable decisions after checking the content, findings and supporting sources.', '<button class="btn btn-secondary btn-sm" data-feature="approvals">Approval policy ↗</button>')}
    ${explainer('approvals')}<div class="content-grid"><div class="panel"><div class="panel-head"><div><h3>Waiting for a decision</h3><p>${pending.length} review(s) need attention</p></div><span class="pill pill-amber">PENDING</span></div>${pending.length ? `<div class="record-list">${pending.map(r => `<div class="review-item" data-open-review="${escapeHtml(r.id)}"><div class="record-icon">◷</div><div class="record-info"><b>${escapeHtml(r.title || 'Untitled review')}</b><small>${Number(r.findings?.length || 0)} finding(s) · ${dateLabel(r.updatedAt || r.createdAt)}</small></div>${statusPill(r.status)}<span class="review-open">›</span></div>`).join('')}</div>` : emptyState('✓','No pending decisions','New and revised reviews will appear here until an authorised person decides.', '', true)}</div>
    <aside class="stack"><div class="info-card"><h4>Decision rules</h4><ul class="bullet-list"><li>Check the evidence for factual claims.</li><li>High-risk approvals require an explicit acknowledgement.</li><li>Request changes or reject with a reason.</li><li>Every outcome is recorded in the audit trail.</li><li>Publishing stays outside this MVP.</li></ul></div><div class="info-card"><h4>Recently decided</h4><p>${decided.length} review(s) have a final status in this workspace.</p><button class="feature-link" data-nav="reviews" style="margin-top:9px">Open review history →</button></div></aside></div>`;
}
function renderInsights() {
  const reviews = state.data.reviews;
  const allFindings = reviews.flatMap(r => r.findings || []);
  const counts = { high: allFindings.filter(f => f.severity === 'high').length, medium: allFindings.filter(f => f.severity === 'medium').length, low: allFindings.filter(f => f.severity === 'low').length };
  const decided = reviews.filter(r => ['approved','rejected','changes_requested'].includes(r.status)).length;
  const noEvidence = allFindings.filter(f => f.evidenceStatus === 'not_found').length;
  return `${pageHeading('Policy insights','Use actual review patterns to identify where guidelines or workflows may need clarification.', '<button class="btn btn-secondary btn-sm" data-feature="insights">Metric methodology ↗</button>')}
    ${explainer('insights')}<section class="stats-grid"><div class="stat-card"><div class="stat-top">Reviews analysed</div><div class="stat-value">${reviews.length}</div><div class="stat-foot">Real records</div></div><div class="stat-card"><div class="stat-top">High-risk signals</div><div class="stat-value">${counts.high}</div><div class="stat-foot">First-pass signals, not confirmed violations</div></div><div class="stat-card"><div class="stat-top">Possible evidence gaps</div><div class="stat-value">${noEvidence}</div><div class="stat-foot">No source match recorded</div></div><div class="stat-card"><div class="stat-top">Decisions recorded</div><div class="stat-value">${decided}</div><div class="stat-foot">Human workflow outcomes</div></div></section>
    <div class="content-grid"><div class="panel"><div class="panel-head"><div><h3>Finding distribution</h3><p>Severity counts across current review records</p></div></div><div class="panel-body">${reviews.length ? `<div class="stack">${[['High',counts.high,'var(--bad)'],['Medium',counts.medium,'var(--warn)'],['Low',counts.low,'var(--olive)']].map(([label,count,color]) => `<div><div class="review-meta" style="justify-content:space-between;margin-bottom:7px"><span style="font-size:10px">${label}</span><b style="font-size:10px">${count}</b></div><div style="height:8px;border-radius:10px;background:var(--bar);overflow:hidden"><div style="height:100%;width:${allFindings.length ? Math.max(0, count/allFindings.length*100) : 0}%;background:${color};border-radius:10px"></div></div></div>`).join('')}</div><p class="field-hint" style="margin-top:16px">These are rule-trigger counts and may include false positives. Reviewers should confirm usefulness and missed issues before treating them as policy metrics.</p>` : emptyState('⌁','Insights will appear after real reviews','No sample metrics are generated. Submit content to begin building an evidence base.','<button class="btn btn-primary btn-sm" data-nav="review">Create first review →</button>',true)}</div></div>
    <aside class="stack"><div class="info-card"><h4>Guideline clarity loop</h4><p>Repeated flags and reviewer overrides can reveal unclear policy language. This first release stores the evidence needed for future pattern analysis; it does not claim trend intelligence with an empty or small dataset.</p></div><div class="info-card"><h4>What to measure next</h4><ul class="bullet-list"><li>Reviewer-confirmed useful flags vs false positives</li><li>Time from submission to decision</li><li>Suggestion acceptance without intent loss</li><li>Recurring overrides by policy section</li><li>Approved-source freshness and coverage</li></ul></div></aside></div>`;
}
function renderAudit() {
  const entries = [...state.data.audit].sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `${pageHeading('Audit trail','A traceable history of meaningful workspace actions, changes and human decisions.', '<button class="btn btn-secondary btn-sm" data-feature="audit">Audit design ↗</button>')}
    ${explainer('audit')}<div class="panel"><div class="panel-head"><div><h3>Activity history</h3><p>${entries.length} activity record(s) · no generated entries</p></div><span class="pill pill-blue">ACTIVITY LOG</span></div>
    ${entries.length ? `<div class="record-list">${entries.map(entry => `<div class="record-row"><div class="record-icon">◷</div><div class="record-info"><b>${escapeHtml((entry.action || 'Activity').replaceAll('.',' ').replaceAll('_',' '))}</b><small>${escapeHtml(entry.actor || 'Workspace member')} · ${dateLabel(entry.createdAt)}</small></div><span class="field-hint">${escapeHtml(Object.entries(entry.details || {}).map(([k,v]) => `${k}: ${String(v)}`).join(' · ').slice(0,110))}</span></div>`).join('')}</div>` : emptyState('◷','No activity recorded yet','Actions such as adding sources, analysing drafts, revising content and recording decisions will appear here.')}
    </div>`;
}
function renderPage() {
  if (!$('#page-content')) return;
  const renderers = { overview: renderOverview, memory: renderMemory, review: renderReviewForm, reviews: renderReviews, approvals: renderApprovals, insights: renderInsights, audit: renderAudit };
  $('#page-content').innerHTML = state.page === 'review-detail' && state.currentReview ? renderReviewDetail(state.currentReview) : (renderers[state.page] || renderOverview)();
  if (state.page === 'memory') {
    $('#source-file')?.addEventListener('change', handleSourceUpload);
    const zone = $('#upload-zone');
    zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone?.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone?.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); const file = e.dataTransfer.files?.[0]; if (file) uploadFile(file); });
  }
}

async function handleSourceUpload(event) { const file = event.target.files?.[0]; if (file) await uploadFile(file); event.target.value = ''; }
async function uploadFile(file) {
  if (state.user?.isGuest) { showToast('Sign in to upload persistent files.', 'error', 'Guest mode supports manual text sources only.'); return; }
  const form = new FormData(); form.append('file', file); form.append('type', $('#upload-type')?.value || 'guideline'); form.append('title', file.name);
  const zone = $('#upload-zone'); zone?.classList.add('loading');
  try { const source = await api('/api/sources/upload', { method: 'POST', body: form }); state.data.sources.unshift(source); updateNavCounts(); renderPage(); showToast('Source uploaded', 'success', source.content ? 'Text extraction completed.' : 'File saved. No extractable text was detected.'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { zone?.classList.remove('loading'); }
}
async function createSource(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form); setBusy(button, true, 'Saving source…');
  try {
    const source = await api('/api/sources', { method: 'POST', body: JSON.stringify({ title: $('#source-title').value, type: $('#source-type').value, content: $('#source-content').value }) });
    state.data.sources.unshift(source); updateNavCounts(); renderPage(); showToast('Approved source saved', 'success', 'This source is now available to the first-pass review engine.');
  } catch (error) { showToast(error.message, 'error'); setBusy(button, false); }
}
async function analyzeReview(event) {
  event.preventDefault();
  const button = $('#analyze-button'); setBusy(button, true, 'Analysing…');
  try {
    const result = await api('/api/reviews/analyze', { method: 'POST', body: JSON.stringify({ title: $('#review-title').value || 'Untitled review', channel: $('#review-channel').value, content: $('#review-content').value }) });
    state.data.reviews.unshift(result.review); updateNavCounts(); state.currentReview = result.review; state.page = 'review-detail'; renderPage();
    showToast('Review analysis complete', 'success', `${result.analysis.findings.length} first-pass signal(s) recorded.`);
  } catch (error) { showToast(error.message, 'error'); setBusy(button, false); }
}
async function openReview(id) {
  try { state.currentReview = await api(`/api/reviews/${encodeURIComponent(id)}`); state.page = 'review-detail'; $('#breadcrumb-current').textContent = 'Review details'; renderPage(); }
  catch (error) { showToast(error.message, 'error'); }
}
async function saveRevision(button) {
  const id = button.dataset.reviewId; setBusy(button, true, 'Re-analysing…');
  try {
    const result = await api(`/api/reviews/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ content: $('#revision-content').value }) });
    state.currentReview = result.review; replaceReviewInCache(result.review); renderPage(); showToast('New version saved', 'success', `Version ${(result.review.versions || []).length} recorded.`);
  } catch (error) { showToast(error.message, 'error'); setBusy(button, false); }
}
function replaceReviewInCache(review) {
  const index = state.data.reviews.findIndex(r => r.id === review.id);
  if (index >= 0) state.data.reviews[index] = review; else state.data.reviews.unshift(review);
  updateNavCounts();
}
async function makeDecision(button) {
  const action = button.dataset.decision;
  const id = button.dataset.reviewId;
  let reason = '';
  if (action !== 'approve') {
    reason = window.prompt(action === 'reject' ? 'Why are you rejecting this submission?' : 'What needs to change before this can proceed?') || '';
    if (reason.trim().length < 3) { showToast('A reason is required for this decision.', 'error'); return; }
  }
  const confirmHighRisk = action === 'approve' && Boolean(state.currentReview?.findings?.some(f => f.severity === 'high'));
  if (action === 'approve' && confirmHighRisk && !window.confirm('This review contains high-risk signals. Have you verified the supporting evidence and confirmed the claims with an authorised source?')) return;
  setBusy(button, true, 'Recording…');
  try {
    const result = await api(`/api/reviews/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ action, reason, confirmHighRisk }) });
    state.currentReview = result.review; replaceReviewInCache(result.review); renderPage(); showToast('Decision recorded', 'success', 'The action has been added to the audit trail.');
  } catch (error) { showToast(error.message, 'error'); setBusy(button, false); }
}

function openAssistant() {
  $('#assistant-drawer').classList.remove('hidden');
  $('#assistant-input').focus();
}
function closeAssistant() { $('#assistant-drawer').classList.add('hidden'); }
function appendChat(text, role = 'assistant', meta = '') {
  const messages = $('#assistant-messages');
  const welcome = $('.assistant-welcome', messages); welcome?.remove(); $('.prompt-chips', messages)?.remove();
  const node = document.createElement('div'); node.className = `chat-message ${role}`;
  node.innerHTML = `${escapeHtml(text)}${meta ? `<small>${escapeHtml(meta)}</small>` : ''}`;
  messages.append(node); messages.scrollTop = messages.scrollHeight;
}
function addChatAction(action) {
  const node = document.createElement('div'); node.className = 'chat-action';
  if (action.type === 'update_profile') {
    node.innerHTML = `<b>Profile update preview</b><p>New display name: <strong>${escapeHtml(action.payload.displayName)}</strong><br/>Your profile has not been changed yet.</p><button data-chat-confirm="update_profile" data-payload="${escapeHtml(JSON.stringify(action.payload))}">Confirm change</button><button class="cancel-action" data-chat-cancel>Cancel</button>`;
  } else if (action.type === 'create_source') {
    node.innerHTML = `<b>New Brand Memory source</b><p><strong>${escapeHtml(action.payload.title)}</strong><br/>Type: ${escapeHtml(action.payload.type.replaceAll('_',' '))}<br/>${escapeHtml(action.payload.content.slice(0,180))}${action.payload.content.length > 180 ? '…' : ''}<br/><br/>Confirm that this content is approved for your organisation.</p><button data-chat-confirm="create_source" data-payload="${escapeHtml(JSON.stringify(action.payload))}">Save source</button><button class="cancel-action" data-chat-cancel>Cancel</button>`;
  } else if (action.type === 'create_review') {
    node.innerHTML = `<b>New content review</b><p>${escapeHtml(action.payload.content.slice(0,220))}${action.payload.content.length > 220 ? '…' : ''}<br/><br/>This will save a review record and run first-pass checks.</p><button data-chat-confirm="create_review" data-payload="${escapeHtml(JSON.stringify(action.payload))}">Create review</button><button class="cancel-action" data-chat-cancel>Cancel</button>`;
  } else if (action.type === 'navigate') {
    node.innerHTML = `<b>Open ${escapeHtml(action.label)}</b><p>This will navigate within your BrandWeave workspace.</p><button data-chat-navigate="${escapeHtml(action.target)}">Open page</button><button class="cancel-action" data-chat-cancel>Dismiss</button>`;
  }
  $('#assistant-messages').append(node); $('#assistant-messages').scrollTop = $('#assistant-messages').scrollHeight;
}
async function sendAssistantMessage() {
  if (state.assistantBusy) return;
  const input = $('#assistant-input'); const message = input.value.trim(); if (!message) return;
  input.value = ''; appendChat(message, 'user'); state.assistantBusy = true; $('#assistant-send').disabled = true;
  const pending = document.createElement('div'); pending.className = 'chat-message assistant'; pending.textContent = 'Thinking through the request…'; pending.id = 'assistant-pending'; $('#assistant-messages').append(pending);
  try {
    const result = await api('/api/agent/chat', { method: 'POST', body: JSON.stringify({ message }) });
    $('#assistant-pending')?.remove(); appendChat(result.reply || 'I could not complete that request.', 'assistant', result.source === 'agent37' ? 'Agent37 response' : 'Workspace assistant');
    if (result.action) addChatAction(result.action);
  } catch (error) { $('#assistant-pending')?.remove(); appendChat(error.message, 'assistant'); }
  finally { state.assistantBusy = false; $('#assistant-send').disabled = false; input.focus(); }
}
async function confirmAssistantAction(button) {
  const type = button.dataset.chatConfirm;
  let payload; try { payload = JSON.parse(button.dataset.payload || '{}'); } catch { payload = {}; }
  button.disabled = true; button.textContent = 'Applying…';
  try {
    const result = await api('/api/agent/confirm', { method: 'POST', body: JSON.stringify({ type, payload }) });
    appendChat(result.reply, 'assistant', 'Action completed · audit entry recorded');
    if (type === 'update_profile' && state.tokenKind === 'firebase') await getFreshIdToken(true).catch(() => {});
    await loadWorkspace();
    if (result.reviewId) { await openReview(result.reviewId); closeAssistant(); }
    else if (result.sourceId) { setPage('memory'); }
  } catch (error) { appendChat(`The change was not applied: ${error.message}`, 'assistant'); button.disabled = false; button.textContent = 'Confirm change'; }
}
function openConfirmAction(title, copy, detail, callback) {
  state.pendingAction = callback;
  $('#confirm-title').textContent = title; $('#confirm-copy').textContent = copy; $('#confirm-detail').textContent = detail;
  showModal('#confirm-modal');
}

function openAuth(mode = 'signin') {
  state.authMode = mode; updateAuthMode(); showModal('#auth-modal');
}
function updateAuthMode() {
  const signup = state.authMode === 'signup';
  $('#auth-title').textContent = signup ? 'Create your workspace' : 'Welcome back';
  $('#auth-subtitle').textContent = signup ? 'Create a secure account to save your brand knowledge.' : 'Sign in to your workspace.';
  $('#auth-name-wrap').classList.toggle('hidden', !signup);
  $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('#auth-submit').innerHTML = signup ? 'Create account securely <span>→</span>' : 'Sign in securely <span>→</span>';
  $$('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.authMode === state.authMode));
  $('#auth-error').textContent = '';
}
async function handleAuthSubmit(event) {
  event.preventDefault(); const button = $('#auth-submit'); setBusy(button, true, 'Connecting…'); $('#auth-error').textContent = '';
  const signup = state.authMode === 'signup';
  try {
    const email = $('#auth-email').value.trim(); const password = $('#auth-password').value;
    if (signup) state.signupInProgress = true; // keep the auth listener from loading a half-created profile
    const result = signup
      ? await createEmailAccount(email, password, $('#auth-name').value.trim())
      : await signInEmail(email, password);
    // After sign-up, force a new token so it carries the display name that was just saved.
    await connectFirebaseUser(result.user, { forceRefresh: signup });
    $('#auth-password').value = '';
  } catch (error) { $('#auth-error').textContent = describeAuthError(error); }
  finally { state.signupInProgress = false; setBusy(button, false); }
}
let googleBusy = false;
async function handleGoogleSignIn() {
  if (googleBusy) return; // ignore double clicks and the second Google button
  googleBusy = true;
  const buttons = [$('#welcome-google'), $('#auth-google')].filter(Boolean);
  buttons.forEach(b => { b.disabled = true; });
  try {
    const result = await signInGoogle();
    await connectFirebaseUser(result.user);
  } catch (error) {
    console.warn('Google sign-in failed:', error?.code || '', error?.message || error);
    if (isAuthCancellation(error)) showToast('Google sign-in was not completed.', 'info', describeAuthError(error));
    else showToast(describeAuthError(error), 'error');
  } finally {
    googleBusy = false;
    buttons.forEach(b => { b.disabled = false; });
  }
}
async function profileEdit() {
  const nextName = window.prompt('Enter your display name:', state.profile.displayName || '');
  if (nextName === null || !nextName.trim()) return;
  openConfirmAction('Confirm profile update', 'Your display name will be changed in this workspace.', nextName.trim(), async () => {
    const result = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ displayName: nextName.trim() }) });
    if (state.tokenKind === 'firebase') await getFreshIdToken(true).catch(() => {});
    state.profile.displayName = result.displayName; updateProfileDisplay(); hideModal('#confirm-modal'); showToast('Profile updated', 'success');
  });
}

function openSearch() { showModal('#search-modal'); $('#global-search-input').focus(); runSearch(''); }
function runSearch(query) {
  const q = query.toLowerCase().trim();
  const sources = state.data.sources.filter(s => !q || `${s.title} ${s.content} ${s.type}`.toLowerCase().includes(q)).slice(0,5);
  const reviews = state.data.reviews.filter(r => !q || `${r.title} ${r.content} ${r.channel}`.toLowerCase().includes(q)).slice(0,5);
  const result = $('#global-search-results');
  const items = [
    ...sources.map(s => `<button class="review-item" style="width:100%;border:0;background:transparent;text-align:left" data-nav="memory"><span class="record-icon">◈</span><span class="record-info"><b>${escapeHtml(s.title)}</b><small>Brand source · ${escapeHtml(s.type.replaceAll('_',' '))}</small></span></button>`),
    ...reviews.map(r => `<button class="review-item" style="width:100%;border:0;background:transparent;text-align:left" data-open-review="${escapeHtml(r.id)}"><span class="record-icon">▤</span><span class="record-info"><b>${escapeHtml(r.title)}</b><small>Review · ${escapeHtml(r.channel || 'General')}</small></span></button>`)
  ];
  result.innerHTML = items.length ? items.join('') : `<div class="search-hint">${q ? 'No matching workspace records.' : 'Start typing to search your actual sources and reviews.'}</div>`;
}

// Global event delegation
$('#welcome-guest').addEventListener('click', startGuest);
$('#welcome-google').addEventListener('click', handleGoogleSignIn);
$$('[data-open-auth]').forEach(b => b.addEventListener('click', () => openAuth(b.dataset.openAuth)));
$('#account-button').addEventListener('click', openSettings);
$$('[data-set-theme]').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.setTheme)));
$('#set-edit').addEventListener('click', () => { hideModal('#settings-modal'); profileEdit(); });
$('#set-tour').addEventListener('click', () => { hideModal('#settings-modal'); beginTour(); });
$('#set-signout').addEventListener('click', () => { hideModal('#settings-modal'); $('#profile-popover [data-profile-action="signout"]').click(); });
$$('[data-theme-toggle]').forEach(b => b.addEventListener('click', toggleTheme));
document.addEventListener('click', event => {
  if (event.target.closest('[data-start-tour]')) beginTour();
  if (!event.target.closest('#profile-popover, #profile-menu-button')) $('#profile-popover').classList.add('hidden');
  if (!event.target.closest('#sidebar, #mobile-menu')) $('#sidebar').classList.remove('mobile-open');
});
// Search results live in the modal, outside #page-content, so they need their own handler.
$('#global-search-results').addEventListener('click', async event => {
  const nav = event.target.closest('[data-nav]'); const open = event.target.closest('[data-open-review]');
  if (!nav && !open) return;
  hideModal('#search-modal');
  if (nav) setPage(nav.dataset.nav); else await openReview(open.dataset.openReview);
});
$('#auth-google').addEventListener('click', handleGoogleSignIn);
$('#auth-form').addEventListener('submit', handleAuthSubmit);
$$('[data-auth-mode]').forEach(tab => tab.addEventListener('click', () => { state.authMode = tab.dataset.authMode; updateAuthMode(); }));
$$('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => { hideModal('#auth-modal'); hideModal('#feature-modal'); hideModal('#confirm-modal'); hideModal('#search-modal'); hideModal('#settings-modal'); }));
$('#confirm-cancel').addEventListener('click', () => { state.pendingAction = null; hideModal('#confirm-modal'); });
$('#confirm-apply').addEventListener('click', async () => { if (!state.pendingAction) return; const fn = state.pendingAction; $('#confirm-apply').disabled = true; try { await fn(); } catch (error) { showToast(error.message, 'error'); } finally { $('#confirm-apply').disabled = false; state.pendingAction = null; hideModal('#confirm-modal'); } });
$('#sidebar-collapse').addEventListener('click', () => $('#sidebar').classList.toggle('collapsed'));
$('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('mobile-open'));
$$('.nav-item').forEach(item => item.addEventListener('click', () => setPage(item.dataset.page)));
$('#sidebar-ai-open').addEventListener('click', openAssistant);
$('#topbar-ai').addEventListener('click', openAssistant);
$('#floating-ai').addEventListener('click', openAssistant);
$('#assistant-close').addEventListener('click', closeAssistant);
$('#assistant-send').addEventListener('click', sendAssistantMessage);
$('#assistant-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAssistantMessage(); } });
$('#assistant-clear').addEventListener('click', () => { $('#assistant-messages').innerHTML = `<div class="assistant-welcome"><div class="assistant-welcome-icon">✳</div><h3>What can I help you do?</h3><p>Ask me to navigate your workspace, prepare changes or explain your review workflow. I’ll ask before applying changes. Try “Open brand memory”, “change my name to …”, “review this content: …” or “add a terminology rule titled Tone: Banned: cheap”. Every change shows a preview and waits for your confirmation.</p></div><div class="prompt-chips"><button data-prompt="Show my pending reviews">Show pending reviews <span>↗</span></button><button data-prompt="Open brand memory">Open brand memory <span>↗</span></button><button data-prompt="How does evidence-linked review work?">Explain evidence review <span>↗</span></button></div>`; });
$('#profile-menu-button').addEventListener('click', () => $('#profile-popover').classList.toggle('hidden'));
$('#help-open').addEventListener('click', beginTour);
$('#topbar-search').addEventListener('click', openSearch);
$('#global-search-input').addEventListener('input', e => runSearch(e.target.value));
$('#notification-button').addEventListener('click', () => showToast('You’re all caught up.', 'info', 'Notifications will appear here when real workflow events are enabled.'));
$('#page-content').addEventListener('click', async event => {
  const nav = event.target.closest('[data-nav]'); if (nav) { setPage(nav.dataset.nav); return; }
  const feature = event.target.closest('[data-feature]'); if (feature) { showFeature(feature.dataset.feature); return; }
  const open = event.target.closest('[data-open-review]'); if (open) { await openReview(open.dataset.openReview); return; }
  const del = event.target.closest('[data-delete-source]'); if (del) {
    if (!window.confirm('Delete this source from your workspace? Existing reviews will retain the recorded finding text, but this source will no longer be available to future checks.')) return;
    try { await api(`/api/sources/${encodeURIComponent(del.dataset.deleteSource)}`, { method: 'DELETE' }); state.data.sources = state.data.sources.filter(s => s.id !== del.dataset.deleteSource); updateNavCounts(); renderPage(); showToast('Source deleted', 'success'); } catch (error) { showToast(error.message, 'error'); }
    return;
  }
  const decision = event.target.closest('[data-decision]'); if (decision) { await makeDecision(decision); return; }
  const revise = event.target.closest('#save-revision'); if (revise) { await saveRevision(revise); return; }
});
$('#page-content').addEventListener('submit', event => {
  if (event.target.id === 'source-form') createSource(event);
  if (event.target.id === 'review-form') analyzeReview(event);
});
$('#assistant-messages').addEventListener('click', async event => {
  const prompt = event.target.closest('[data-prompt]'); if (prompt) { $('#assistant-input').value = prompt.dataset.prompt; sendAssistantMessage(); return; }
  const confirm = event.target.closest('[data-chat-confirm]'); if (confirm) { await confirmAssistantAction(confirm); return; }
  const cancel = event.target.closest('[data-chat-cancel]'); if (cancel) { cancel.closest('.chat-action').remove(); appendChat('No change was made.', 'assistant'); return; }
  const nav = event.target.closest('[data-chat-navigate]'); if (nav) { setPage(nav.dataset.chatNavigate); appendChat(`Opened ${nav.dataset.chatNavigate}.`, 'assistant'); closeAssistant(); }
});
$('#profile-popover').addEventListener('click', async event => {
  const action = event.target.closest('[data-profile-action]')?.dataset.profileAction; if (!action) return;
  $('#profile-popover').classList.add('hidden');
  if (action === 'profile') profileEdit();
  if (action === 'account') openSettings();
  if (action === 'signout') {
    if (!window.confirm('Sign out of this BrandWeave session?')) return;
    try { await signOutFirebase(); } catch {}
    signOutToWelcome();
  }
});
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openAssistant(); }
  if (event.key === 'Escape') { hideModal('#search-modal'); hideModal('#feature-modal'); hideModal('#confirm-modal'); hideModal('#auth-modal'); hideModal('#settings-modal'); closeAssistant(); $('#sidebar').classList.remove('mobile-open'); }
});

function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
function openSettings() { syncThemeButtons(); showModal('#settings-modal'); }
function syncThemeButtons() { $$('[data-set-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setTheme === document.documentElement.dataset.theme))); }
function applyTheme(next) {
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('bw-theme', next); } catch {}
  $('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#1B1A18' : '#FAF8F3');
  syncThemeButtons();
}
function beginTour() {
  const inApp = !$('#app-shell').classList.contains('hidden');
  const ctx = {
    goTo: setPage,
    openGuest: async () => { await startGuest(); if (!$('#app-shell').classList.contains('hidden')) setTimeout(() => startTour('app', ctx), 400); }
  };
  startTour(inApp ? 'app' : 'landing', ctx);
}
$$('[data-illus]').forEach(node => { node.innerHTML = illus(node.dataset.illus); });
$('#hero-illus').innerHTML = illus('hero');
async function boot() {
  try {
    const result = await initializeFirebaseClient();
    state.firebase = result;
    if (!result.configured) $('#welcome-auth-hint').textContent = `${result.message || 'Firebase setup is incomplete.'} Guest workspace is available in the meantime.`;
    else {
      $('#welcome-auth-hint').textContent = 'Google and email authentication are enabled.';
      // One listener, registered once. It restores a saved Firebase session after a page
      // refresh. Logins started by a button are completed by that button's handler; the
      // shared in-flight promise in connectFirebaseUser prevents a double load.
      watchAuth(async user => {
        if (!user || state.token || state.signupInProgress) return;
        try { await connectFirebaseUser(user); } catch (error) { showToast(describeAuthError(error), 'error'); }
      });
    }
    const health = await fetch('/api/health').then(r => r.json());
    if (!health.firebaseAuth) $('#system-status-text').textContent = 'Firebase setup required · Guest mode available';
  } catch (error) {
    $('#welcome-auth-hint').textContent = `${error.message || 'Firebase setup is pending.'} Guest workspace is ready.`;
    console.warn('BrandWeave initialisation:', error);
  }
}
boot();

// Polished interaction layer: scroll progress, subtle pointer lighting,
// reveal-on-scroll, focus mode and a discoverable keyboard shortcut guide.
(function installMotionExperience() {
  const root = document.documentElement;
  const progress = $('#motion-progress span');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let scrollTicking = false;
  const updateScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    $('#back-to-top')?.classList.toggle('visible', window.scrollY > 520);
    scrollTicking = false;
  };
  window.addEventListener('scroll', () => {
    if (!scrollTicking) { requestAnimationFrame(updateScroll); scrollTicking = true; }
  }, { passive: true });
  updateScroll();

  if (!reducedMotion && window.matchMedia?.('(pointer: fine)').matches) {
    let pointerFrame = false;
    window.addEventListener('pointermove', event => {
      if (pointerFrame) return;
      pointerFrame = true;
      requestAnimationFrame(() => {
        root.style.setProperty('--pointer-x', `${event.clientX}px`);
        root.style.setProperty('--pointer-y', `${event.clientY}px`);
        const card = event.target.closest?.('[data-spotlight],.cap-card,.step-card,.stat-card');
        if (card) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
          card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
        }
        pointerFrame = false;
      });
    }, { passive: true });
  }

  const back = document.createElement('button');
  back.id = 'back-to-top'; back.type = 'button'; back.title = 'Back to top';
  back.setAttribute('aria-label', 'Back to top'); back.textContent = '↑';
  back.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));
  document.body.append(back);

  const guide = document.createElement('div');
  guide.id = 'shortcut-overlay'; guide.hidden = true;
  guide.innerHTML = `<section class="shortcut-card" role="dialog" aria-modal="true" aria-labelledby="shortcut-title"><div class="shortcut-head"><h3 id="shortcut-title">Keyboard shortcuts</h3><button class="shortcut-close" type="button" aria-label="Close shortcuts">×</button></div><div class="shortcut-row"><span>Open AI command centre</span><kbd>⌘ / Ctrl + K</kbd></div><div class="shortcut-row"><span>Quick search</span><kbd>⌘ / Ctrl + Shift + K</kbd></div><div class="shortcut-row"><span>Toggle focus mode</span><kbd>⌘ / Ctrl + Shift + F</kbd></div><div class="shortcut-row"><span>Show this guide</span><kbd>?</kbd></div><div class="shortcut-row"><span>Close overlays</span><kbd>Esc</kbd></div></section>`;
  document.body.append(guide);
  const closeGuide = () => { guide.hidden = true; };
  guide.addEventListener('click', event => { if (event.target === guide || event.target.closest('.shortcut-close')) closeGuide(); });
  const revealObserver = !reducedMotion && 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } });
  }, { threshold: .12, rootMargin: '0px 0px -35px 0px' }) : null;
  const observeReveals = () => {
    const targets = $$('#welcome-screen .lp-section, #welcome-screen .cap-card, #welcome-screen .step-card, #page-content .panel, #page-content .content-grid > *, #page-content .record-list > *');
    targets.forEach(node => {
      if (node.dataset.revealBound) return;
      node.dataset.revealBound = '1'; node.classList.add('reveal-on-scroll');
      if (revealObserver) revealObserver.observe(node); else node.classList.add('is-visible');
    });
  };
  observeReveals();
  const pageObserver = new MutationObserver(observeReveals);
  $('#page-content') && pageObserver.observe($('#page-content'), { childList: true, subtree: true });
  document.addEventListener('keydown', event => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable;
    if (event.key === 'Escape') closeGuide();
    if (!typing && event.key === '?') { event.preventDefault(); guide.hidden = !guide.hidden; }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault(); document.body.classList.toggle('focus-mode');
      showToast(document.body.classList.contains('focus-mode') ? 'Focus mode enabled' : 'Focus mode disabled', 'success', 'Press Ctrl/⌘ + Shift + F to toggle.');
    }
  });
})();
