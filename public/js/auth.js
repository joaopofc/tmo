/* ═══════════════════════════════════════════════════════════════
   auth.js — Authentication Logic
   Handles: login, logout, session persistence, auth guard
   ═══════════════════════════════════════════════════════════════ */

const auth = firebase.auth();

// ─── Persist session across tabs and browser restarts ─────────────
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ─── Route guard (used on login.html) ────────────────────────────
// Checks if user is already logged in → redirects to dashboard
auth.onAuthStateChanged(user => {
    const loader = document.getElementById('authLoader');
    const screen = document.getElementById('loginScreen');

    if (user) {
        // Already authenticated → go to dashboard
        window.location.href = '/';
    } else {
        // Not logged in → show login form
        if (loader) loader.style.display = 'none';
        if (screen) screen.style.display = 'flex';
        lucide.createIcons();
    }
});

// ─── Login handler ────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('btnLogin');
    const errorDiv = document.getElementById('loginError');
    const errorMsg = document.getElementById('loginErrorMsg');

    // Reset error
    errorDiv.style.display = 'none';

    // Loading state
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Verificando...</span>';

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged will fire and redirect
    } catch (err) {
        const messages = {
            'auth/user-not-found':      'Usuário não encontrado.',
            'auth/wrong-password':      'Senha incorreta.',
            'auth/invalid-email':       'E-mail inválido.',
            'auth/too-many-requests':   'Muitas tentativas. Aguarde um momento.',
            'auth/invalid-credential':  'Credenciais inválidas. Verifique e-mail e senha.',
            'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
        };

        errorMsg.textContent    = messages[err.code] || 'Erro ao entrar. Tente novamente.';
        errorDiv.style.display  = 'flex';

        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in"></i><span>Entrar</span>';
        lucide.createIcons();
    }
}

// ─── Password toggle ──────────────────────────────────────────────
function togglePassword() {
    const input   = document.getElementById('loginPassword');
    const icon    = document.getElementById('eyeIcon');
    const visible = input.type === 'text';

    input.type = visible ? 'password' : 'text';
    icon.setAttribute('data-lucide', visible ? 'eye' : 'eye-off');
    lucide.createIcons();
}
