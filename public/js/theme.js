/**
 * TMO Analytics — State Manager
 * Persiste e aplica o tema e o modo privacidade ANTES da renderização
 */
(function () {
    // ── THEME MANAGER ──
    const THEME_KEY = 'tmo-theme';
    const THEME_HISTORY_KEY = 'tmo-theme-history';
    const DEFAULT_THEME = 'light';
    
    let savedTheme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    let themeHistory = ['light', 'dark'];
    try {
        const hist = JSON.parse(localStorage.getItem(THEME_HISTORY_KEY));
        if (Array.isArray(hist) && hist.length === 2) {
            themeHistory = hist;
        }
    } catch(e) {}
    
    if (!themeHistory.includes(savedTheme)) {
        themeHistory = [themeHistory[1] || 'dark', savedTheme];
        localStorage.setItem(THEME_HISTORY_KEY, JSON.stringify(themeHistory));
    }

    document.documentElement.setAttribute('data-theme', savedTheme);

    window.TMOTheme = {
        get: () => document.documentElement.getAttribute('data-theme') || DEFAULT_THEME,
        set(theme) {
            const current = this.get();
            if (current !== theme) {
                themeHistory = [current, theme];
                localStorage.setItem(THEME_HISTORY_KEY, JSON.stringify(themeHistory));
            }
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem(THEME_KEY, theme);
            
            document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
        },
        toggle() {
            const current = this.get();
            const next = current === themeHistory[1] ? themeHistory[0] : themeHistory[1];
            this.set(next);
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

    // ── DROPDOWN MANAGER ──
    window.toggleDropdown = function(menuId, event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById(menuId);
        if (!menu) return;
        const isShowing = menu.classList.contains('show');
        
        document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));

        if (!isShowing) {
            menu.classList.add('show');
        }
    };

    if (typeof window !== 'undefined') {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
            }
        });
    }
})();
