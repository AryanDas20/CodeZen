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

// Turns Firebase's "Firebase: Error (auth/...)" into something a person can act on.
const AUTH_MESSAGES = {
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished. Please try again and complete the Google steps.',
  'auth/cancelled-popup-request': 'Another sign-in window was already open. Please try once more.',
  'auth/unauthorized-domain': 'This website address is not in Firebase Authentication > Settings > Authorized domains. Add it there and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase Console (Authentication > Sign-in method).',
  'auth/network-request-failed': 'Network error while contacting Firebase. Check your connection and try again.',
  'auth/internal-error': 'Firebase hit an internal error. If this keeps happening, check the browser console for blocked scripts or frames.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead, or use Google if you registered that way.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method. Sign in with that method first.'
};

export function describeAuthError(error) {
  const code = error?.code || '';
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  const raw = String(error?.message || '').trim();
  return raw || 'Authentication failed. Please try again.';
}
export function isAuthCancellation(error) {
  return ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(error?.code);
}

// Only one Google popup may exist at a time. Two buttons (welcome screen and
// sign-in dialog) used to start two popups, which makes Firebase cancel the first.
let googleSignInInFlight = null;
export function signInGoogle() {
  if (!auth) return Promise.reject(new Error(setupMessage || 'Google sign-in is not configured. Check Firebase configuration and redeploy.'));
  if (googleSignInInFlight) return googleSignInInFlight;
  const provider = new firebaseModules.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // signInWithPopup must be called synchronously from the click handler (no await
  // before it) or browsers treat the popup as unsolicited and block it.
  googleSignInInFlight = firebaseModules.signInWithPopup(auth, provider)
    .finally(() => { googleSignInInFlight = null; });
  return googleSignInInFlight;
}

export async function signInEmail(email, password) {
  if (!auth) throw new Error(setupMessage || 'Firebase sign-in is not configured.');
  return firebaseModules.signInWithEmailAndPassword(auth, email, password);
}

export async function createEmailAccount(email, password, displayName) {
  if (!auth) throw new Error(setupMessage || 'Firebase sign-in is not configured.');
  const result = await firebaseModules.createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    try { await firebaseModules.updateProfile(result.user, { displayName }); }
    catch (error) { console.warn('Could not save display name:', error); }
  }
  return result;
}

export async function signOutFirebase() {
  if (auth) await firebaseModules.signOut(auth);
}

// Firebase ID tokens expire after about one hour. getIdToken() returns the cached
// token while it is valid and silently refreshes it when it is not.
export async function getFreshIdToken(forceRefresh = false) {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function watchAuth(callback) {
  if (!auth) return () => {};
  return firebaseModules.onAuthStateChanged(auth, callback);
}
