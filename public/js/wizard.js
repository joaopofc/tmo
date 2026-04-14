/* ═══════════════════════════════════════════════════════════════
   TMO Analytics — Wizard Logic
   Separated from app.js for single responsibility
   ═══════════════════════════════════════════════════════════════ */

const META_SEGUNDOS_WIZ = 344;

// ─── Helpers ──────────────────────────────────────────────────────
function parseTmoLines(text) {
    return text
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\d{1,2}:\d{2}$/.test(l))
        .map(l => {
            const [mm, ss] = l.split(':').map(Number);
            return { raw: l, seconds: mm * 60 + ss };
        });
}

function secToMmssWiz(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Wizard State ─────────────────────────────────────────────────
let parsedTimes = [];

// ─── Open / Close ─────────────────────────────────────────────────
function openWizard() {
    // Reset to step 1
    goToStep1(true);

    document.getElementById('wizardScreen').classList.add('open');
    document.getElementById('appView').classList.add('pushed');
    document.getElementById('wizardTextarea').focus();
    lucide.createIcons();
}

function closeWizard() {
    document.getElementById('wizardScreen').classList.remove('open');
    document.getElementById('appView').classList.remove('pushed');

    // Clean up after animation
    setTimeout(() => {
        document.getElementById('wizardTextarea').value = '';
        parsedTimes = [];
        updateHint([]);
        document.getElementById('btnWizardNext').disabled = true;
    }, 460);
}

// ─── Step Navigation ──────────────────────────────────────────────
function goToStep1(silent = false) {
    setActiveStep(1);
    if (!silent) lucide.createIcons();
}

function goToStep2() {
    const raw = document.getElementById('wizardTextarea').value;
    parsedTimes = parseTmoLines(raw);

    if (!parsedTimes.length) {
        document.getElementById('wizardTextarea').focus();
        return;
    }

    buildReview(parsedTimes);
    setActiveStep(2);
    lucide.createIcons();
}

function setActiveStep(n) {
    // Steps content
    document.querySelectorAll('.wizard-step').forEach((el, i) => {
        el.classList.toggle('active', i + 1 === n);
    });

    // Dots
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
        const stepN = i + 1;
        dot.classList.remove('active', 'done');
        if (stepN < n) dot.classList.add('done');
        if (stepN === n) dot.classList.add('active');
    });

    // Labels
    document.querySelectorAll('.step-label').forEach((lbl, i) => {
        lbl.classList.toggle('active', i + 1 === n);
    });
}

// ─── Live textarea hint ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('wizardTextarea');
    const btn = document.getElementById('btnWizardNext');

    if (!ta) return;

    ta.addEventListener('input', () => {
        const times = parseTmoLines(ta.value);
        updateHint(times);
        btn.disabled = times.length === 0;
    });
});

function updateHint(times) {
    const hint = document.getElementById('wizardLineCount');
    const belowEl = document.getElementById('wizardCountBelow');
    const aboveEl = document.getElementById('wizardCountAbove');
    const boxBelow = document.getElementById('wizStatBelow');
    const boxAbove = document.getElementById('wizStatAbove');

    if (!hint) return;

    if (!times || times.length === 0) {
        hint.innerHTML = '<span style="font-weight: 300;"><strong style="font-weight: 900; font-size: 15px">0</strong> chamadas</span>';
        hint.parentElement.classList.remove('active-info');

        belowEl.innerHTML = '<span style="font-weight: 300;"><strong style="font-weight: 900; font-size: 15px">0</strong> abaixo de 6min</span>';
        boxBelow.classList.remove('active-green');

        aboveEl.innerHTML = '<span style="font-weight: 300;"><strong style="font-weight: 900; font-size: 15px">0</strong> acima de 6min</span>';
        boxAbove.classList.remove('active-red');
    } else {
        hint.innerHTML = `<span style="font-weight: 300;"><strong style="font-weight: 900; font-size: 15px">${times.length}</strong> chamada${times.length > 1 ? 's' : ''}</span>`;
        hint.parentElement.classList.add('active-info');

        let below = 0;
        let above = 0;
        times.forEach(t => { t.seconds > 360 ? above++ : below++; });

        belowEl.innerHTML = `<span style="font-weight: 300;"><strong style="font-weight: 900; font-size: 15px">${below}</strong> abaixo de 6min</span>`;
        if (below > 0) boxBelow.classList.add('active-green'); else boxBelow.classList.remove('active-green');

        aboveEl.innerHTML = `<span style="font-weight: 300;"><strong style="font-weight: 900; font-size: 15px">${above}</strong> acima de 6min</span>`;
        if (above > 0) boxAbove.classList.add('active-red'); else boxAbove.classList.remove('active-red');
    }
}

// ─── Build Review Screen ──────────────────────────────────────────
function buildReview(times) {
    const total = times.length;
    const sumSec = times.reduce((a, t) => a + t.seconds, 0);
    const avgSec = Math.round(sumSec / total);
    const maxSec = Math.max(...times.map(t => t.seconds));
    const minSec = Math.min(...times.map(t => t.seconds));

    // Stats row
    document.getElementById('reviewStats').innerHTML = `
        <div class="review-stat">
            <span class="review-stat-label">Total de Ligações</span>
            <span class="review-stat-value">${total}</span>
        </div>
        <div class="review-stat">
            <span class="review-stat-label">TMO Médio</span>
            <span class="review-stat-value">${avgSec}s</span>
        </div>
        <div class="review-stat">
            <span class="review-stat-label">Min / Máx</span>
            <span class="review-stat-value" style="font-size:15px;">${secToMmssWiz(minSec)} / ${secToMmssWiz(maxSec)}</span>
        </div>
    `;

    // Preview list (first 6)
    const preview = times.slice(0, 6);
    const remaining = total - preview.length;

    document.getElementById('reviewPreviewList').innerHTML =
        preview.map((t, i) => `
            <div class="review-preview-item">
                <span class="muted">#${i + 1}</span>
                <span class="mono">${t.raw}</span>
                <span class="muted">${t.seconds}s</span>
            </div>
        `).join('')
        + (remaining > 0
            ? `<div class="review-preview-item" style="justify-content:center;">
                   <span class="muted">+ ${remaining} registro${remaining > 1 ? 's' : ''} adicionais</span>
               </div>`
            : '');
}

// ─── Submit ────────────────────────────────────────────────────────
async function submitWizard() {
    const btn = document.getElementById('btnWizardSubmit');
    if (btn.disabled) return;

    const rawText = document.getElementById('wizardTextarea').value.trim();
    if (!parsedTimes.length) return;

    const original = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="lucide-spin"></i> Enviando...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        const token = typeof getIdToken === 'function' ? await getIdToken() : null;
        if (!token) {
            alert("A sessão expirada ou você não está logado.");
            return;
        }

        const res = await fetch('/api/analisar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                rawText,
                metaSegundos: META_SEGUNDOS_WIZ,
                operador: 'Sistema',
            }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.erro || 'Erro desconhecido');

        // Success → close and reload
        closeWizard();
        await loadHistorico();

    } catch (err) {
        alert(`Erro ao enviar: ${err.message}`);
        btn.innerHTML = original;
        btn.disabled = false;
        lucide.createIcons();
    }
}
