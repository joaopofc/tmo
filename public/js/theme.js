/**
 * TMO Analytics — State Manager
 * Persiste e aplica o tema e o modo privacidade ANTES da renderização
 */
(function () {
    // ── THEME MANAGER ──
    const THEME_KEY = 'tmo-theme';
    const DEFAULT_THEME = 'dark';
    const savedTheme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', savedTheme);

    window.TMOTheme = {
        get: () => document.documentElement.getAttribute('data-theme') || DEFAULT_THEME,
        set(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(THEME_KEY, theme);
            document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
                btn.setAttribute('title', theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro');
                btn.setAttribute('aria-label', btn.getAttribute('title'));
            });
        },
        toggle() {
            this.set(this.get() === 'dark' ? 'light' : 'dark');
        },
    };

    // ── PRIVACY MANAGER ──
    const PRIVACY_KEY = 'tmo-privacy';
    const savedPrivacy = localStorage.getItem(PRIVACY_KEY) === 'true';
    if (savedPrivacy) document.documentElement.classList.add('privacy-active');

    window.TMOPrivacy = {
        get: () => document.documentElement.classList.contains('privacy-active'),
        set(isActive) {
            if (isActive) {
                document.documentElement.classList.add('privacy-active');
            } else {
                document.documentElement.classList.remove('privacy-active');
            }
            localStorage.setItem(PRIVACY_KEY, isActive);
            document.querySelectorAll('[data-privacy-toggle]').forEach(btn => {
                btn.setAttribute('title', isActive ? 'Mostrar métricas' : 'Ocultar métricas');
            });
        },
        toggle() {
            this.set(!this.get());
        }
    };
})();
