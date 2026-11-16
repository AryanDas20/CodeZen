import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { agent37Status, askAgent37 } from './agent37.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const guestSecret = process.env.GUEST_TOKEN_SECRET || 'development-only-change-this-secret-please';
const guestSessions = new Map();
// Vercel Functions reject request payloads above 4.5 MB; leave room for multipart overhead.
const MAX_UPLOAD = 4 * 1024 * 1024;

let firebaseAuthReady = false;
let adminAuth = null;
let firebaseAdminStatus = { code: 'missing_credentials', message: 'Firebase Admin credentials are missing. Add FIREBASE_SERVICE_ACCOUNT_JSON in Vercel and redeploy.' };
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'brandweave-sources';
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseReady = Boolean(supabaseUrl && supabaseKey);

function parseServiceAccount(rawValue) {
  let raw = String(rawValue || '').trim();
  if (!raw) throw Object.assign(new Error('Service account JSON is empty.'), { configCode: 'missing_credentials' });

  // Accept a normal JSON object, a JSON-encoded string containing JSON,
  // and a value accidentally wrapped in single quotes by a shell command.
  if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
  let parsed = JSON.parse(raw);
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Service account JSON must be an object.'), { configCode: 'invalid_service_account' });
  }
  parsed.private_key = typeof parsed.private_key === 'string'
    ? parsed.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
    : parsed.private_key;
  if (parsed.type !== 'service_account' || !parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw Object.assign(new Error('Service account JSON is missing required service-account fields.'), { configCode: 'invalid_service_account' });
  }
  try {
    crypto.createPrivateKey(parsed.private_key);
  } catch {
    throw Object.assign(new Error('Service account private_key is not a valid PEM private key.'), { configCode: 'invalid_service_account' });
  }
  return parsed;
}

function initializeFirebase() {
  try {
    let credential;
    let serviceAccountProjectId = '';

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      serviceAccountProjectId = serviceAccount.project_id;
      const webProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
      if (webProjectId && serviceAccountProjectId !== webProjectId) {
        throw Object.assign(new Error('The Firebase service account belongs to a different project.'), { configCode: 'project_mismatch' });
      }
      credential = cert(serviceAccount);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
      // Application Default Credentials are supported for local files and Google-managed runtimes.
      credential = applicationDefault();
    } else {
      firebaseAdminStatus = {
        code: 'missing_credentials',
        message: 'Firebase Web App values are present, but the server is missing FIREBASE_SERVICE_ACCOUNT_JSON. Add the complete service-account JSON in Vercel and redeploy.'
      };
      console.warn(firebaseAdminStatus.message);
      return;
    }

    const existingDefaultApp = getApps().find((firebaseApp) => firebaseApp.name === '[DEFAULT]');
    const firebaseProjectId = String(process.env.FIREBASE_PROJECT_ID || serviceAccountProjectId || '').trim() || undefined;
    const firebaseApp = existingDefaultApp || initializeApp({ credential, projectId: firebaseProjectId });
    adminAuth = getAuth(firebaseApp);
    firebaseAuthReady = true;
    firebaseAdminStatus = { code: 'configured', message: 'Firebase Admin is configured.' };
    console.log('Firebase Admin initialized.');
  } catch (error) {
    firebaseAuthReady = false;
    adminAuth = null;
    const code = error.configCode || (error instanceof SyntaxError ? 'invalid_json' : 'admin_initialization_failed');
    const messages = {
      missing_credentials: 'Firebase Admin credentials are missing. Add the complete service-account JSON to FIREBASE_SERVICE_ACCOUNT_JSON in Vercel, then redeploy.',
      invalid_json: 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the complete contents of the downloaded service-account JSON file.',
      invalid_service_account: 'The service-account JSON is missing required fields. It must contain project_id, client_email and private_key.',
      project_mismatch: 'The Firebase Web App project ID and service-account project_id do not match. Use credentials from the same Firebase project.',
      admin_initialization_failed: 'Firebase Admin could not initialize. Check that the service-account key is valid, active and from the correct Firebase project.'
    };
    firebaseAdminStatus = { code, message: messages[code] || messages.admin_initialization_failed };
    console.warn('Firebase Admin is not configured. Guest mode remains available.', code, error.message);
  }
}
initializeFirebase();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://www.gstatic.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://*.googleapis.com', 'https://accounts.google.com', 'https://*.firebaseapp.com', 'https://*.firebaseio.com', 'https://*.supabase.co', 'https://*.supabase.in', 'https://www.gstatic.com'],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com', 'https://*.google.com'],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'text/csv', 'image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type. Upload PDF, DOCX, TXT, CSV, Markdown, PNG, JPG or WEBP.'));
  }
});

function signGuest(id, exp) {
  const payload = `${id}.${exp}`;
  const signature = crypto.createHmac('sha256', guestSecret).update(payload).digest('hex');
  return `guest.${payload}.${signature}`;
}
function verifyGuest(token) {
  if (!token?.startsWith('guest.')) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [, id, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (!id || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = crypto.createHmac('sha256', guestSecret).update(`${id}.${exp}`).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { uid: `guest:${id}`, guestId: id, isGuest: true, displayName: 'Guest workspace' };
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in or start a guest session to continue.' });
  const guest = verifyGuest(token);
  if (guest) { req.user = guest; return next(); }
  if (!firebaseAuthReady || !adminAuth) return res.status(503).json({ error: 'Firebase server authentication is not configured. Guest mode is available.' });
  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    req.user = { uid: decoded.uid, email: decoded.email || '', displayName: decoded.name || '', isGuest: false };
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }
}

function guestState(user) {
  if (!guestSessions.has(user.guestId)) guestSessions.set(user.guestId, { sources: [], reviews: [], audit: [], profile: { displayName: 'Guest workspace' } });
  return guestSessions.get(user.guestId);
}
function supabaseHeaders(extra = {}) {
  const headers = { apikey: supabaseKey, ...extra };
  // Legacy service_role keys are JWTs and also need the Authorization header.
  // New sb_secret_ keys are API keys, not JWTs; send them via apikey only.
  if (supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${supabaseKey}`;
  return headers;
}
function supabasePath(pathname) {
  if (!supabaseReady) throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.');
  return `${supabaseUrl}${pathname}`;
}
async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(supabasePath(pathname), {
    ...options,
    headers: supabaseHeaders({ ...(options.headers || {}) })
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) {
    const message = body?.message || body?.error || body?.hint || `Supabase request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return body;
}
function recordQuery(user, name, extra = '') {
  const params = new URLSearchParams({
    select: 'id,data,created_at,updated_at',
    owner_uid: `eq.${user.uid}`,
    collection: `eq.${name}`,
    ...Object.fromEntries(new URLSearchParams(extra))
  });
  return `/rest/v1/brandweave_records?${params.toString()}`;
}
async function listCollection(user, name) {
  if (user.isGuest) return [...guestState(user)[name]].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  const rows = await supabaseRequest(recordQuery(user, name, 'order=updated_at.desc&limit=100'));
  return (rows || []).map(row => ({ id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
}
async function addRecord(user, name, data) {
  const now = new Date().toISOString();
  const record = { ...data, createdAt: now, updatedAt: now };
  if (user.isGuest) {
    const id = crypto.randomUUID();
    guestState(user)[name].unshift({ id, ...record });
    return { id, ...record };
  }
  const id = crypto.randomUUID();
  const rows = await supabaseRequest('/rest/v1/brandweave_records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{ id, owner_uid: user.uid, collection: name, data: record, created_at: now, updated_at: now }])
  });
  const row = rows?.[0];
  return { id, ...((row && row.data) || record), createdAt: row?.created_at || now, updatedAt: row?.updated_at || now };
}
async function updateRecord(user, name, id, patch) {
  const now = new Date().toISOString();
  if (user.isGuest) {
    const list = guestState(user)[name];
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return null;
    list[index] = { ...list[index], ...patch, updatedAt: now };
    return list[index];
  }
  const existing = await getRecord(user, name, id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: now };
  const params = new URLSearchParams({ id: `eq.${id}`, owner_uid: `eq.${user.uid}`, collection: `eq.${name}` });
  await supabaseRequest(`/rest/v1/brandweave_records?${params}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data: merged, updated_at: now })
  });
  return merged;
}
async function getRecord(user, name, id) {
  if (user.isGuest) return guestState(user)[name].find(item => item.id === id) || null;
  const params = new URLSearchParams({ select: 'id,data,created_at,updated_at', id: `eq.${id}`, owner_uid: `eq.${user.uid}`, collection: `eq.${name}`, limit: '1' });
  const rows = await supabaseRequest(`/rest/v1/brandweave_records?${params}`);
  const row = rows?.[0];
  return row ? { id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}
async function deleteRecord(user, name, id) {
  if (user.isGuest) {
    const list = guestState(user)[name];
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
  const params = new URLSearchParams({ id: `eq.${id}`, owner_uid: `eq.${user.uid}`, collection: `eq.${name}` });
  await supabaseRequest(`/rest/v1/brandweave_records?${params}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return true;
}
async function uploadToSupabase(pathname, file) {
  const encodedPath = pathname.split('/').map(encodeURIComponent).join('/');
  return supabaseRequest(`/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodedPath}`, {
    method: 'POST',
    headers: { 'Content-Type': file.mimetype, 'x-upsert': 'false' },
    body: file.buffer
  });
}
async function deleteFromSupabase(pathname) {
  const encodedPath = pathname.split('/').map(encodeURIComponent).join('/');
  return supabaseRequest(`/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodedPath}`, {
    method: 'DELETE'
  });
}
async function audit(user, action, details = {}) {
  const entry = { action, details, actor: user.displayName || user.email || (user.isGuest ? 'Guest' : user.uid), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (user.isGuest) guestState(user).audit.unshift({ id: crypto.randomUUID(), ...entry });
  else await addRecord(user, 'audit', entry);
}

function getFirebaseWebConfig() {
  return {
    apiKey: String(process.env.FIREBASE_API_KEY || '').trim(),
    authDomain: String(process.env.FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: String(process.env.FIREBASE_PROJECT_ID || '').trim(),
    messagingSenderId: String(process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: String(process.env.FIREBASE_APP_ID || '').trim()
  };
}

function getFirebaseDiagnostics() {
  const firebase = getFirebaseWebConfig();
  const required = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId'];
  const missingWebFields = required.filter((key) => !firebase[key]);
  const firebaseWebConfigured = missingWebFields.length === 0;
  return {
    firebaseWebConfigured,
    firebaseAdminConfigured: firebaseAuthReady,
    firebaseConfigured: firebaseWebConfigured && firebaseAuthReady,
    missingWebFields,
    adminStatus: firebaseAdminStatus.code,
    adminMessage: firebaseAdminStatus.message
  };
}

app.get('/api/health', (_req, res) => {
  const firebase = getFirebaseDiagnostics();
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    firebaseAuth: firebase.firebaseConfigured,
    firebaseWeb: firebase.firebaseWebConfigured,
    firebaseAdmin: firebase.firebaseAdminConfigured,
    firebaseStatus: firebase.adminStatus,
    firebaseMessage: firebase.adminMessage,
    missingFirebaseWebFields: firebase.missingWebFields,
    supabase: supabaseReady,
    agent37: agent37Status().configured
  });
});
app.get('/api/config', (_req, res) => {
  const diagnostics = getFirebaseDiagnostics();
  res.set('Cache-Control', 'no-store');
  res.json({
    firebase: getFirebaseWebConfig(),
    ...diagnostics,
    supabaseConfigured: supabaseReady,
    agent37: agent37Status()
  });
});
app.post('/api/guest/session', (_req, res) => {
  const id = crypto.randomUUID();
  const exp = Date.now() + 1000 * 60 * 60 * 12;
  guestSessions.set(id, { sources: [], reviews: [], audit: [], profile: { displayName: 'Guest workspace' } });
  res.json({ token: signGuest(id, exp), expiresAt: new Date(exp).toISOString(), displayName: 'Guest workspace' });
});

app.use('/api', authMiddleware);

app.get('/api/state', async (req, res, next) => {
  try {
    const [sources, reviews, auditEntries] = await Promise.all([
      listCollection(req.user, 'sources'), listCollection(req.user, 'reviews'), listCollection(req.user, 'audit')
    ]);
    let profile = { displayName: req.user.displayName || 'Workspace member', email: req.user.email || '', photoURL: '' };
    if (req.user.isGuest) profile = guestState(req.user).profile;
    res.json({ user: { uid: req.user.uid, email: req.user.email || '', isGuest: req.user.isGuest }, profile, sources, reviews, audit: auditEntries, capabilities: { uploads: !req.user.isGuest && supabaseReady, persistentStorage: !req.user.isGuest && supabaseReady, approvals: true } });
  } catch (error) { next(error); }
});

app.patch('/api/profile', async (req, res, next) => {
  try {
    const displayName = String(req.body.displayName || '').trim();
    if (displayName.length < 2 || displayName.length > 60) return res.status(400).json({ error: 'Name must be between 2 and 60 characters.' });
    if (req.user.isGuest) guestState(req.user).profile.displayName = displayName;
    else {
      if (!firebaseAuthReady) return res.status(503).json({ error: 'Firebase Authentication is not configured.' });
      await adminAuth.updateUser(req.user.uid, { displayName });
    }
    await audit(req.user, 'profile.updated', { displayName });
    res.json({ ok: true, displayName });
  } catch (error) { next(error); }
});

app.post('/api/sources', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const type = String(req.body.type || 'guideline');
    const content = String(req.body.content || '').trim();
    const allowedTypes = ['guideline', 'approved_fact', 'terminology', 'policy', 'asset', 'other'];
    if (!title || title.length > 120 || !content || content.length > 50000 || !allowedTypes.includes(type)) return res.status(400).json({ error: 'Enter a title, a supported source type and content (up to 50,000 characters).' });
    const record = await addRecord(req.user, 'sources', { title, type, content, status: 'active', sourceKind: 'manual' });
    await audit(req.user, 'source.created', { sourceId: record.id, title, type });
    res.status(201).json(record);
  } catch (error) { next(error); }
});

async function extractText(file) {
  const mime = file.mimetype;
  if (mime.startsWith('text/')) return file.buffer.toString('utf8').slice(0, 50000);
  if (mime === 'application/pdf') {
    const parsed = await pdfParse(file.buffer);
    return String(parsed.text || '').slice(0, 50000);
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return String(parsed.value || '').slice(0, 50000);
  }
  return '';
}
app.post('/api/sources/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (req.user.isGuest) return res.status(403).json({ error: 'File uploads to a persistent knowledge library require an account. Guests can paste source text into the workspace.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    if (!supabaseReady) return res.status(503).json({ error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.' });
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const objectPath = `workspaces/${req.user.uid}/sources/${crypto.randomUUID()}-${safeName}`;
    await uploadToSupabase(objectPath, req.file);
    let extractedText = '';
    try { extractedText = await extractText(req.file); } catch (error) { console.warn('Text extraction warning:', error.message); }
    const record = await addRecord(req.user, 'sources', {
      title: String(req.body.title || req.file.originalname).trim().slice(0, 120),
      type: ['guideline', 'approved_fact', 'terminology', 'policy', 'asset', 'other'].includes(req.body.type) ? req.body.type : 'guideline',
      content: extractedText,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      storagePath: objectPath,
      status: 'active',
      sourceKind: 'file'
    });
    await audit(req.user, 'source.uploaded', { sourceId: record.id, fileName: req.file.originalname });
    res.status(201).json(record);
  } catch (error) { next(error); }
});

app.delete('/api/sources/:id', async (req, res, next) => {
  try {
    const existing = await getRecord(req.user, 'sources', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Source not found.' });
    if (!req.user.isGuest && existing.storagePath && supabaseReady) await deleteFromSupabase(existing.storagePath).catch(() => {});
    await deleteRecord(req.user, 'sources', req.params.id);
    await audit(req.user, 'source.deleted', { sourceId: req.params.id, title: existing.title });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

function analyzeContent(content, sources) {
  const findings = [];
  const checks = [
    { regex: /\b(world'?s\s+(?:number\s+one|no\.?\s*1|#1)|#1|best[- ]in[- ]class|industry[- ]leading)\b/ig, title: 'Comparative or superlative claim', severity: 'high', category: 'Facts & claims', explanation: 'A ranking or superiority claim needs an approved, dated methodology or evidence source.' },
    { regex: /\b(guarantee[sd]?|guaranteed|always|never|every(?:one|body)?|all customers|100\s*%|zero risk)\b/ig, title: 'Absolute or guarantee language', severity: 'high', category: 'Facts & claims', explanation: 'Absolute promises can create an expectation that needs precise evidence and approved terms.' },
    { regex: /\b\d+(?:\.\d+)?\s*(?:%|percent|x|times|days?|hours?|minutes?)\b/ig, title: 'Quantified claim', severity: 'medium', category: 'Facts & claims', explanation: 'A number or measurable outcome should be linked to an approved study, scope and validity period.' },
    { regex: /\b(revolutionary|unmatched|unprecedented|cutting[- ]edge|world[- ]class)\b/ig, title: 'Vague promotional language', severity: 'low', category: 'Tone & voice', explanation: 'Consider replacing broad promotional language with a specific, verifiable benefit.' }
  ];
  const approved = sources.filter(s => ['approved_fact', 'guideline', 'policy'].includes(s.type) && s.status === 'active');
  for (const rule of checks) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(content)) !== null) {
      const start = Math.max(0, content.lastIndexOf('.', match.index) + 1);
      const nextStop = content.slice(match.index).search(/[.!?\n]/);
      const end = nextStop < 0 ? Math.min(content.length, match.index + match[0].length + 120) : match.index + nextStop + 1;
      const snippet = content.slice(start, end).trim().slice(0, 240);
      const candidates = approved.filter(source => source.content && source.content.toLowerCase().split(/\W+/).filter(w => w.length > 4).some(word => snippet.toLowerCase().includes(word)));
      findings.push({
        id: crypto.randomUUID(), title: rule.title, category: rule.category, severity: rule.severity,
        excerpt: match[0], context: snippet, explanation: rule.explanation,
        evidenceStatus: candidates.length ? 'possible_match' : 'not_found',
        evidence: candidates.slice(0, 3).map(s => ({ sourceId: s.id, title: s.title, type: s.type })),
        recommendation: candidates.length ? 'Ask an authorised reviewer to verify that the referenced source supports this exact claim.' : 'Attach an approved source or replace the claim with narrower, factual wording.',
        confidence: 'rule-based signal; human verification required'
      });
      if (findings.length >= 30) break;
    }
  }
  const bannedSources = sources.filter(s => s.type === 'terminology' && s.content);
  for (const source of bannedSources) {
    const lines = source.content.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(?:banned|avoid|do not use)\s*:\s*(.+)$/i);
      if (!match) continue;
      for (const term of match[1].split(',').map(s => s.trim()).filter(Boolean)) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'ig');
        let hit;
        while ((hit = regex.exec(content)) !== null) {
          findings.push({ id: crypto.randomUUID(), title: 'Restricted terminology', category: 'Terminology', severity: 'medium', excerpt: hit[0], context: content.slice(Math.max(0, hit.index - 90), Math.min(content.length, hit.index + 120)), explanation: `Your terminology source “${source.title}” identifies this expression as restricted.`, evidenceStatus: 'source_found', evidence: [{ sourceId: source.id, title: source.title, type: source.type }], recommendation: 'Replace it with the approved term specified by your brand team.', confidence: 'exact phrase match' });
        }
      }
    }
  }
  const hasNoSources = sources.length === 0;
  return {
    findings,
    summary: {
      total: findings.length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      sourceCount: sources.length,
      coverage: hasNoSources ? 'No brand sources have been added yet.' : `${approved.length} active guideline, fact or policy source(s) considered.`
    },
    method: 'Deterministic first-pass checks. This is not an AI fact verification and does not prove a claim true or false.',
    limitations: hasNoSources ? ['No organisation-approved sources were available. Add source material before relying on evidence coverage.'] : ['Semantic interpretation, visual identity and external fact verification are not included in this first-pass rules engine.', 'A possible source match is not proof that the source substantiates the claim.']
  };
}

app.post('/api/reviews/analyze', async (req, res, next) => {
  try {
    const content = String(req.body.content || '').trim();
    const title = String(req.body.title || 'Untitled review').trim().slice(0, 120);
    const channel = String(req.body.channel || 'General').slice(0, 60);
    if (content.length < 20 || content.length > 20000) return res.status(400).json({ error: 'Paste at least 20 characters and no more than 20,000 characters.' });
    const sources = await listCollection(req.user, 'sources');
    const analysis = analyzeContent(content, sources);
    const review = await addRecord(req.user, 'reviews', {
      title, channel, content, findings: analysis.findings, summary: analysis.summary,
      method: analysis.method, limitations: analysis.limitations,
      status: analysis.findings.some(f => f.severity === 'high') ? 'needs_review' : 'in_review',
      versions: [{ version: 1, content, createdAt: new Date().toISOString(), label: 'Original submission' }],
      decisions: []
    });
    await audit(req.user, 'review.analyzed', { reviewId: review.id, title, findings: analysis.findings.length });
    res.status(201).json({ review, analysis });
  } catch (error) { next(error); }
});

app.get('/api/reviews/:id', async (req, res, next) => {
  try {
    const review = await getRecord(req.user, 'reviews', req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    res.json(review);
  } catch (error) { next(error); }
});
app.patch('/api/reviews/:id', async (req, res, next) => {
  try {
    const review = await getRecord(req.user, 'reviews', req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    const content = String(req.body.content || '').trim();
    if (content.length < 20 || content.length > 20000) return res.status(400).json({ error: 'Revised content must be between 20 and 20,000 characters.' });
    const sources = await listCollection(req.user, 'sources');
    const analysis = analyzeContent(content, sources);
    const versions = [...(review.versions || []), { version: (review.versions || []).length + 1, content, createdAt: new Date().toISOString(), label: 'Revised version' }];
    const updated = await updateRecord(req.user, 'reviews', req.params.id, { content, findings: analysis.findings, summary: analysis.summary, method: analysis.method, limitations: analysis.limitations, versions, status: 'in_review' });
    await audit(req.user, 'review.revised', { reviewId: req.params.id, version: versions.length });
    res.json({ review: updated, analysis });
  } catch (error) { next(error); }
});
app.post('/api/reviews/:id/decision', async (req, res, next) => {
  try {
    const review = await getRecord(req.user, 'reviews', req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    const action = String(req.body.action || '');
    const reason = String(req.body.reason || '').trim().slice(0, 1000);
    if (!['approve', 'request_changes', 'reject'].includes(action)) return res.status(400).json({ error: 'Unsupported decision.' });
    if (action !== 'approve' && reason.length < 3) return res.status(400).json({ error: 'Add a reason for this decision.' });
    if (action === 'approve' && review.findings?.some(f => f.severity === 'high') && !req.body.confirmHighRisk) return res.status(409).json({ error: 'This review contains high-risk signals. Confirm that an authorised human has verified the evidence before approving.', requiresHighRiskConfirmation: true });
    const decision = { action, reason, actor: req.user.displayName || req.user.email || 'Guest', createdAt: new Date().toISOString() };
    const decisions = [...(review.decisions || []), decision];
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';
    const updated = await updateRecord(req.user, 'reviews', req.params.id, { decisions, status });
    await audit(req.user, `review.${action}`, { reviewId: req.params.id, reason });
    res.json({ ok: true, review: updated });
  } catch (error) { next(error); }
});

function routeIntent(message) {
  const text = message.toLowerCase().trim();
  const routes = [
    { re: /(brand memory|knowledge base|sources|guidelines)/, target: 'memory', label: 'Brand Memory' },
    { re: /(review queue|all reviews|my reviews|content reviews)/, target: 'reviews', label: 'Review Queue' },
    { re: /(approval|pending review|waiting for approval)/, target: 'approvals', label: 'Approvals' },
    { re: /(insights|analytics|metrics|trends)/, target: 'insights', label: 'Insights' },
    { re: /(audit|activity history|change history)/, target: 'audit', label: 'Audit Trail' },
    { re: /(dashboard|overview|home)/, target: 'overview', label: 'Overview' },
    { re: /(content review|start a review|new review|check content)/, target: 'review', label: 'Content Review' }
  ];
  for (const route of routes) if (route.re.test(text)) return { type: 'navigate', target: route.target, label: route.label };
  const name = message.match(/(?:change|update|set) my (?:username|name|profile name) (?:to|as) ["“]?(.+?)["”]?$/i);
  if (name) return { type: 'update_profile', payload: { displayName: name[1].trim().replace(/[.!?]+$/, '').slice(0, 60) }, requiresConfirmation: true };
  const review = message.match(/(?:review|analyse|analyze|check) (?:this|the following)(?: content)?\s*[:\-]\s*([\s\S]+)/i);
  if (review?.[1]?.trim().length >= 20) return { type: 'create_review', payload: { title: 'AI-submitted content review', channel: 'General', content: review[1].trim().slice(0, 20000) }, requiresConfirmation: true };
  const source = message.match(/(?:add|create|save)\s+(?:a\s+)?(guideline|approved fact|fact|terminology rule|terminology|policy)\s*(?:titled|called|named)?\s*([^:\n]*)[:\-]\s*([\s\S]+)/i);
  if (source?.[3]?.trim()) {
    const rawType = source[1].toLowerCase();
    const type = rawType.includes('terminology') ? 'terminology' : rawType.includes('fact') ? 'approved_fact' : rawType;
    return { type: 'create_source', payload: { type, title: source[2].trim().replace(/^["“]|["”]$/g, '') || `AI-created ${type.replaceAll('_',' ')}`, content: source[3].trim().slice(0, 50000) }, requiresConfirmation: true };
  }
  return null;
}
app.get('/api/agent/status', (_req, res) => res.json(agent37Status()));
app.post('/api/agent/chat', async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message || message.length > 2000) return res.status(400).json({ error: 'Enter a message up to 2,000 characters.' });
    const action = routeIntent(message);
    if (action) {
      let reply = `I can take you to ${action.label}.`;
      if (action.type === 'update_profile') reply = `I can update your display name to “${action.payload.displayName}”. Nothing has changed yet. Please confirm the action.`;
      if (action.type === 'create_review') reply = `I can create a content review from the text you provided. This will save a review record and run the current first-pass checks. Please inspect the preview and confirm.`;
      if (action.type === 'create_source') reply = `I can add “${action.payload.title}” to Brand Memory as ${action.payload.type.replaceAll('_',' ')}. This source will influence future checks, so confirm that the material is approved for your organisation.`;
      return res.json({ reply, action, source: 'workspace-command-router' });
    }
    if (/(how does|explain|what is).*(evidence|brand memory|approval|audit|content review|review workflow)/i.test(message)) {
      return res.json({ reply: 'BrandWeave keeps approved guidelines, facts, terminology and policies in Brand Memory. When you submit a draft, the first-pass engine checks specific language patterns and compares excerpts with the sources you supplied. Each finding records its excerpt, category, severity, reason and possible source match. A possible match is not proof; a human reviewer verifies the evidence, requests changes or approves. Revisions and decisions are stored in the review history and audit trail. Publishing is deliberately outside this MVP.', action: null, source: 'product-knowledge' });
    }
    if (/\b(delete|remove|publish|approve all|change.*password|transfer|payment)\b/i.test(message)) {
      return res.json({ reply: 'I can’t execute that as a broad or unverified command. Choose a specific record and use its review controls; consequential changes require a clear preview and confirmation.', action: null, source: 'safety-router' });
    }
    const sources = await listCollection(req.user, 'sources');
    const reviews = await listCollection(req.user, 'reviews');
    const bridge = await askAgent37({ message, user: req.user, context: { sourceCount: sources.length, reviewCount: reviews.length, currentFeatures: ['brand memory', 'content review', 'review decisions', 'profile updates', 'audit history'] } }).catch(error => { console.warn('Agent37 bridge error:', error.message); return { connected: true, reply: null, error: error.message }; });
    if (bridge.reply) return res.json({ reply: bridge.reply, action: null, source: 'agent37' });
    res.json({
      reply: 'I can navigate your workspace and prepare supported actions such as profile updates. For brand questions, add your approved sources and run a content review so I can work from your organisation’s actual material. The Agent37 bridge is not currently returning a response, so I won’t invent an AI answer.',
      action: null,
      source: 'workspace-assistant',
      agent37: agent37Status()
    });
  } catch (error) { next(error); }
});
app.post('/api/agent/confirm', async (req, res, next) => {
  try {
    const { type, payload } = req.body || {};
    if (type === 'update_profile') {
      const displayName = String(payload?.displayName || '').trim();
      if (displayName.length < 2 || displayName.length > 60) return res.status(400).json({ error: 'Invalid display name.' });
      if (req.user.isGuest) guestState(req.user).profile.displayName = displayName;
      else {
        await adminAuth.updateUser(req.user.uid, { displayName });
      }
      await audit(req.user, 'profile.updated_by_assistant', { displayName });
      return res.json({ ok: true, reply: `Your display name has been updated to ${displayName}.` });
    }
    if (type === 'create_source') {
      const title = String(payload?.title || '').trim();
      const content = String(payload?.content || '').trim();
      const sourceType = String(payload?.type || 'other');
      if (!title || !content || content.length > 50000 || !['guideline','approved_fact','terminology','policy'].includes(sourceType)) return res.status(400).json({ error: 'Invalid source details.' });
      const source = await addRecord(req.user, 'sources', { title, type: sourceType, content, status: 'active', sourceKind: 'manual' });
      await audit(req.user, 'source.created_by_assistant', { sourceId: source.id, title, type: sourceType });
      return res.json({ ok: true, reply: `“${title}” has been added to Brand Memory. It is now available to future first-pass checks.`, sourceId: source.id });
    }
    if (type === 'create_review') {
      const content = String(payload?.content || '').trim();
      if (content.length < 20 || content.length > 20000) return res.status(400).json({ error: 'Review content must be between 20 and 20,000 characters.' });
      const sources = await listCollection(req.user, 'sources');
      const analysis = analyzeContent(content, sources);
      const review = await addRecord(req.user, 'reviews', { title: String(payload?.title || 'AI-submitted content review').slice(0,120), channel: String(payload?.channel || 'General').slice(0,60), content, findings: analysis.findings, summary: analysis.summary, method: analysis.method, limitations: analysis.limitations, status: analysis.findings.some(f => f.severity === 'high') ? 'needs_review' : 'in_review', versions: [{ version: 1, content, createdAt: new Date().toISOString(), label: 'Original submission' }], decisions: [] });
      await audit(req.user, 'review.created_by_assistant', { reviewId: review.id, findings: analysis.findings.length });
      return res.json({ ok: true, reply: `Your content review has been created with ${analysis.findings.length} first-pass signal(s). A human must verify the findings and make the decision.`, reviewId: review.id });
    }
    res.status(400).json({ error: 'This action is not available.' });
  } catch (error) { next(error); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
// Vercel serves files inside /public from its static CDN. This middleware also serves them locally.
app.use(express.static(path.join(rootDir, 'public'), { extensions: ['html'] }));
app.get(/.*/, (_req, res) => res.sendFile(path.join(rootDir, 'public', 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : (String(error.message || '').startsWith('Unsupported file type') ? 400 : 500));
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Check the server logs and configuration.' : error.message });
});

// Vercel imports the Express app as a serverless function. Start a local listener only outside Vercel.
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`BrandWeave is running on http://localhost:${PORT}`));
}

export default app;
