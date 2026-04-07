/**
 * TMO Analytics — Theme Manager
 * Persiste e aplica o tema (dark/light) via data-theme no <html>
 */
(function () {
    const STORAGE_KEY = 'tmo-theme';
    const DEFAULT     = 'dark';

    // Aplica o tema ANTES de o DOM renderizar (evita flash)
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT;
    document.documentElement.setAttribute('data-theme', saved);

    window.TMOTheme = {
        get: () => document.documentElement.getAttribute('data-theme') || DEFAULT,

        set(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(STORAGE_KEY, theme);
            // Sincroniza todos os botões de toggle na página
            document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
                btn.setAttribute('title', theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro');
                btn.setAttribute('aria-label', btn.getAttribute('title'));
            });
        },

        toggle() {
            const next = this.get() === 'dark' ? 'light' : 'dark';
            this.set(next);
        },
    };
})();
