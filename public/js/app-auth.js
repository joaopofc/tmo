
const auth = firebase.auth();
let currentUser = null;

// Show loader until auth state resolves
const appEl = document.getElementById('appView');
const loaderEl = document.getElementById('globalLoader');

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;

        // Update avatar initial and name
        const initial = user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase();
        const avatarEl = document.getElementById('profileAvatar');
        const nameEl = document.getElementById('profileName');
        if (avatarEl) avatarEl.textContent = initial;
        if (nameEl) nameEl.textContent = user.displayName || user.email;

        // Sync with backend to ensure User ID is explicitly saved in DB
        try {
            const token = await currentUser.getIdToken();
            await fetch('/api/syncUser', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error("Erro ao sincronizar usuário no banco:", err);
        }

        // Hide loader, show app
        if (loaderEl) loaderEl.style.display = 'none';
        if (appEl) appEl.style.opacity = '1';

        // Boot dashboard data
        if (typeof loadHistorico === 'function') {
            loadHistorico();
        }

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
