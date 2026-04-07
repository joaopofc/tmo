/* ═══════════════════════════════════════════════════════════════
   app-auth.js — Auth guard for the dashboard (index.html)
   Loaded before app.js.  Redirects to login if not authenticated.
   Also exposes getIdToken() for authenticated API calls.
   ═══════════════════════════════════════════════════════════════ */

const auth = firebase.auth();
let currentUser = null;

// Show loader until auth state resolves
const appEl     = document.getElementById('appView');
const loaderEl  = document.getElementById('globalLoader');

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;

        // Update avatar initial and name
        const initial = user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase();
        const avatarEl = document.getElementById('profileAvatar');
        const nameEl   = document.getElementById('profileName');
        if (avatarEl) avatarEl.textContent = initial;
        if (nameEl)   nameEl.textContent   = user.displayName || user.email;

        // Hide loader, show app
        if (loaderEl) loaderEl.style.display = 'none';
        if (appEl)    appEl.style.opacity    = '1';

        // Boot dashboard data
        loadHistorico();

    } else {
        // Not logged in → send to login page
        window.location.href = '/login.html';
    }
});

// ─── Get fresh ID token for each API call ─────────────────────────
async function getIdToken() {
    if (!currentUser) return null;
    return currentUser.getIdToken();
}

// ─── Logout ───────────────────────────────────────────────────────
async function logout() {
    await auth.signOut();
    window.location.href = '/login.html';
}
