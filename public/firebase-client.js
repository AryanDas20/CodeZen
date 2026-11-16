let auth = null;
let firebaseModules = null;
let configured = false;
let setupMessage = 'Firebase Authentication is not configured. Check the Firebase environment variables and redeploy.';

export async function initializeFirebaseClient() {
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read Firebase configuration (HTTP ${response.status}).`);
  const config = await response.json();
  const firebaseConfig = config.firebase || {};
  const webConfigured = Boolean(config.firebaseWebConfigured ?? (
    firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId && firebaseConfig.appId
  ));
  const adminConfigured = Boolean(config.firebaseAdminConfigured ?? config.firebaseConfigured);
  configured = Boolean(config.firebaseConfigured && webConfigured && adminConfigured);

  if (!webConfigured) {
    const missing = Array.isArray(config.missingWebFields) ? config.missingWebFields : [];
    setupMessage = missing.length
      ? `Firebase Web App configuration is incomplete. Missing: ${missing.map((key) => `FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`).join(', ')}.`
      : 'Firebase Web App values are incomplete. Check the five FIREBASE_ web configuration variables in Vercel.';
    return { configured: false, config, message: setupMessage };
  }
  if (!adminConfigured) {
    setupMessage = config.firebaseAdminMessage || config.adminMessage || 'Firebase Web App values are present, but Firebase Admin credentials are not configured correctly. Check FIREBASE_SERVICE_ACCOUNT_JSON in Vercel and redeploy.';
    return { configured: false, config, message: setupMessage };
  }

  try {
    const [appModule, authModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js')
    ]);
    const firebaseApp = appModule.getApps().length
      ? appModule.getApp()
      : appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(firebaseApp);
    firebaseModules = authModule;
    setupMessage = '';
    return { configured: true, config, auth };
  } catch (error) {
    configured = false;
    setupMessage = `Firebase Auth could not initialize in the browser: ${error.message || 'Unknown Firebase SDK error'}`;
    return { configured: false, config, message: setupMessage };
  }
}

export function firebaseAuthConfigured() { return configured; }
export function getFirebaseAuth() { return auth; }
export async function signInGoogle() {
  if (!auth) throw new Error(setupMessage || 'Google sign-in is not configured. Check Firebase configuration and redeploy.');
  const provider = new firebaseModules.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return firebaseModules.signInWithPopup(auth, provider);
}
export async function signInEmail(email, password) {
  if (!auth) throw new Error(setupMessage || 'Firebase sign-in is not configured.');
  return firebaseModules.signInWithEmailAndPassword(auth, email, password);
}
export async function createEmailAccount(email, password, displayName) {
  if (!auth) throw new Error(setupMessage || 'Firebase sign-in is not configured.');
  const result = await firebaseModules.createUserWithEmailAndPassword(auth, email, password);
  await firebaseModules.updateProfile(result.user, { displayName });
  return result;
}
export async function signOutFirebase() {
  if (auth) await firebaseModules.signOut(auth);
}

export function watchAuth(callback) {
  if (!auth) return () => {};
  return firebaseModules.onAuthStateChanged(auth, callback);
}
