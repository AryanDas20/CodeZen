let auth = null;
let firebaseModules = null;
let configured = false;

export async function initializeFirebaseClient() {
  const response = await fetch('/api/config');
  const config = await response.json();
  const firebaseConfig = config.firebase || {};
  configured = Boolean(config.firebaseConfigured && firebaseConfig.apiKey && firebaseConfig.projectId);
  if (!configured) return { configured: false, config };

  const [appModule, authModule] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js')
  ]);
  const firebaseApp = appModule.initializeApp(firebaseConfig);
  auth = authModule.getAuth(firebaseApp);
  firebaseModules = authModule;
  return { configured: true, config, auth };
}

export function firebaseAuthConfigured() { return configured; }
export function getFirebaseAuth() { return auth; }
export async function signInGoogle() {
  if (!auth) throw new Error('Google sign-in is not configured yet. Add your Firebase web app values and Admin credentials.');
  const provider = new firebaseModules.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return firebaseModules.signInWithPopup(auth, provider);
}
export async function signInEmail(email, password) {
  if (!auth) throw new Error('Firebase sign-in is not configured.');
  return firebaseModules.signInWithEmailAndPassword(auth, email, password);
}
export async function createEmailAccount(email, password, displayName) {
  if (!auth) throw new Error('Firebase sign-in is not configured.');
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
