// Guided website tour: spotlights a real element, explains it in detail, and moves to the page it lives on.
const LANDING = [
  { target: '#lp-headline', title: 'What BrandWeave does', body: 'BrandWeave is a workspace where a team keeps its approved brand knowledge in one place and checks every draft against it before anything is published.', points: ['It never publishes or edits content on its own.', 'Every check explains what it found and why.', 'A person makes the final decision.'] },
  { target: '#auth-cta', title: 'Log in or create an account', body: 'Log in if you already have an account. Choose Sign up to create one with your email and a password (at least 6 characters). Your sources, reviews and decisions are stored privately under your account.', points: ['Accounts keep your data between visits.', 'You can also continue with Google.'] },
  { target: '#welcome-guest', title: 'Try it first as a guest', body: 'Guest mode opens a temporary workspace with no sign-up. It is the quickest way to explore every screen. Guest data is temporary and file uploads are turned off, so create an account to keep your work.', points: ['Nothing is pre-filled or made up.', 'Ends when you close the session.'] },
  { target: '#hero-illus', title: 'How a review looks', body: 'The illustration shows the core idea: a draft is scanned, a risky claim is highlighted, and a source from your own library is linked as possible evidence before a person approves it.' },
  { target: '#capabilities', title: 'The four building blocks', body: 'Brand memory holds your approved knowledge. Content review checks a draft against it. Explainable findings show the excerpt, severity and next step. The approval loop records who decided what, and when.' },
  { target: '#how', title: 'The workflow in three steps', body: 'Add your approved sources, run a review on a real draft, then record a human decision. Each step has its own page with a detailed explanation beside every function.', final: { label: 'Continue inside the workspace', action: 'guest' } }
];
const APP = [
  { page: 'overview', target: '.stats-grid', title: 'Overview counters', body: 'These four numbers are calculated from your real records: sources in your library, reviews run, reviews waiting for a decision, and reviews approved. They start at zero and update as you work.' },
  { page: 'memory', target: '#source-form', title: 'Add a source by hand', body: 'Type or paste approved information, then choose its type. For a terminology source, write lines such as “Banned: cheap, guaranteed”. Every term in the list is flagged when it appears in a draft.', points: ['Guidelines, facts and policies are used to look for possible evidence.', 'Only add material your organisation has approved.'] },
  { page: 'memory', target: '#upload-zone', title: 'Upload a document', body: 'Drop a PDF, DOCX, TXT, CSV, Markdown or image (up to 4 MB). Text is extracted from PDF, DOCX and text files so it can be used in checks. Images and scanned PDFs are stored but have no readable text. Uploads need an account.' },
  { page: 'review', target: '#review-form', title: 'Run a content review', body: 'Paste a real draft, pick the channel where it will appear and press Analyse. The engine looks for superlatives, absolute promises, numbers and your banned terms, then lists each finding with its excerpt and a suggested next step.' },
  { page: 'reviews', target: '.page-content .panel', title: 'Review queue', body: 'Every review you have run appears here, newest first, with its status. Open one to see findings, edit the draft into a new version, or record a decision.' },
  { page: 'approvals', target: '.page-content .panel', title: 'Approvals', body: 'Reviews that still need a decision wait here. Approve after checking the evidence, request changes with a reason, or reject. High-risk findings need an extra confirmation before approval.' },
  { page: 'insights', target: '.stats-grid', title: 'Policy insights', body: 'Counts of findings by severity and evidence gaps, taken only from your own reviews. They are rule-trigger counts, so treat them as prompts to look closer, not as verdicts.' },
  { page: 'audit', target: '.page-content .panel', title: 'Audit trail', body: 'Every meaningful action is logged with who did it and when: adding or deleting a source, running or revising a review, recording a decision and changing your profile name.' },
  { target: '#floating-ai', title: 'AI command centre', body: 'Ask it to open a page, rename your profile, add a source or start a review. It shows a preview first and only changes something after you confirm.', points: ['Try: “Open brand memory”.', 'Try: “review this content: …”.'] },
  { target: '#theme-toggle-app', title: 'Light and dark mode', body: 'Switch between the light and dark colour schemes at any time. Your choice is remembered on this device.', final: { label: 'Finish', action: 'close' } }
];
let layer, idx = 0, steps = [], ctx = {};
const $ = (s) => document.querySelector(s);
export function startTour(mode, c = {}) {
  endTour(); ctx = c; steps = mode === 'app' ? APP : LANDING; idx = 0;
  layer = document.createElement('div'); layer.className = 'tour';
  layer.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title"><div class="tour-count"></div><h3 id="tour-title"></h3><p class="tour-body"></p><ul class="tour-points"></ul><div class="tour-actions"><button class="btn btn-ghost btn-sm" data-t="skip">Skip</button><span class="tour-gap"></span><button class="btn btn-secondary btn-sm" data-t="prev">Back</button><button class="btn btn-primary btn-sm" data-t="next">Next</button></div></div>';
  layer.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
    if (t === 'skip') endTour();
    else if (t === 'prev') go(idx - 1);
    else { const f = steps[idx].final; if (idx === steps.length - 1) { endTour(); if (f?.action === 'guest') ctx.openGuest?.(); } else go(idx + 1); }
  });
  document.body.append(layer);
  addEventListener('resize', place); addEventListener('keydown', onKey, true);
  go(0);
}
export function endTour() { layer?.remove(); layer = null; removeEventListener('resize', place); removeEventListener('keydown', onKey, true); }
function onKey(e) { if (!layer) return; if (e.key === 'Escape') { e.stopPropagation(); endTour(); } if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); }
function go(i) {
  if (i < 0 || i >= steps.length) return;
  idx = i; const s = steps[i];
  if (s.page) ctx.goTo?.(s.page);
  $('.tour-count').textContent = `Step ${i + 1} of ${steps.length}`;
  $('#tour-title').textContent = s.title; $('.tour-body').textContent = s.body;
  $('.tour-points').innerHTML = (s.points || []).map((p) => `<li>${p.replace(/[&<>]/g, '')}</li>`).join('');
  $('[data-t=prev]').disabled = i === 0;
  $('[data-t=next]').textContent = s.final?.label || 'Next';
  requestAnimationFrame(() => { $(s.target)?.scrollIntoView({ block: 'center' }); setTimeout(place, 60); });
  $('[data-t=next]').focus({ preventScroll: true });
}
function place() {
  if (!layer) return;
  const spot = $('.tour-spot'), card = $('.tour-card'), el = $(steps[idx].target);
  const visible = el && el.offsetParent !== null; const pad = 8, m = 12;
  if (!visible) { spot.style.cssText = 'display:none'; card.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)'; return; }
  const r = el.getBoundingClientRect();
  spot.style.cssText = `display:block;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  const cw = card.offsetWidth, ch = card.offsetHeight, vw = innerWidth, vh = innerHeight;
  let top = r.bottom + pad + m; if (top + ch > vh - m) top = r.top - pad - m - ch;
  if (top < m) top = Math.max(m, Math.min(vh - ch - m, vh / 2 - ch / 2));
  const left = Math.max(m, Math.min(vw - cw - m, r.left + r.width / 2 - cw / 2));
  card.style.cssText = `left:${left}px;top:${top}px;transform:none`;
}
