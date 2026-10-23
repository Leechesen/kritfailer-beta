import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { betaConfig } from "./beta-config.mjs";
import { validateBetaConfig } from "./beta-core.mjs";
export { ref, set, get, update, remove, onValue, push, onDisconnect, runTransaction, serverTimestamp, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
export { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
let connection;
export async function connectPortal() {
  if (!connection) connection = (async () => {
    validateBetaConfig(betaConfig, location.hostname);
    const app = initializeApp(betaConfig.firebase), auth = getAuth(app), db = getDatabase(app);
    if (betaConfig.mode === "emulator") {
      connectAuthEmulator(auth, `http://127.0.0.1:${betaConfig.emulators.authPort}`);
      connectDatabaseEmulator(db, "127.0.0.1", betaConfig.emulators.databasePort);
    }
    await setPersistence(auth, browserLocalPersistence);
    await auth.authStateReady();
    return { auth, db };
  })();
  return connection;
}
export async function connectFirebase({ allowAnonymous = false } = {}) {
  const { auth, db } = await connectPortal();
  let user = auth.currentUser;
  if ((!user || user.isAnonymous) && !allowAnonymous) throw new Error("Nejprve se přihlas v testovacím portálu kampaní.");
  if (!user && allowAnonymous) user = (await signInAnonymously(auth)).user;
  return { db, uid: user.uid };
}
