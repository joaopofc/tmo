/* ═══════════════════════════════════════════════════════════════
   TMO Analytics — Frontend Logic
   ═══════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────
let tmoChartInstance = null;
let volChartInstance = null;
let allRegistros = [];
let currentFilter = 'today';

const META_SEGUNDOS = 344;
const LIMITE_6MIN = 360;

// ─── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadHistorico();

    document.getElementById('btnAnalisar')
        ?.addEventListener('click', handleSubmit);

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.dataset.filter;
            applyFilter();
        });
    });
});

// ─── Utilities ────────────────────────────────────────────────────
function mmssToSec(str = '') {
    const [mm, ss] = str.split(':').map(Number);
    if (isNaN(mm) || isNaN(ss)) return 0;
    return mm * 60 + ss;
}

function secToMmss(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(totalSec) {
    if (!totalSec) return '—';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function classifyTmo(sec) {
    const ratio = sec / META_SEGUNDOS;
    if (ratio <= 0.7) return { key: 'excelente', label: 'Excelente' };
    if (ratio <= 1.0) return { key: 'bom', label: 'Bom' };
    if (ratio <= 1.3) return { key: 'atencao', label: 'Atenção' };
    return { key: 'critico', label: 'Crítico' };
}

function isSameDay(date, ref) {
    return (
        date.getFullYear() === ref.getFullYear() &&
        date.getMonth() === ref.getMonth() &&
        date.getDate() === ref.getDate()
    );
}

function filterByPeriod(records, filter) {
    const now = new Date();
    return records.filter(r => {
        if (!r.criadoEm) return true;
        const d = new Date(r.criadoEm);

        if (filter === 'today') return isSameDay(d, now);

        const diffMs = now.getTime() - d.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (filter === '7') return diffDays <= 7;
        if (filter === '30') return diffDays <= 30;
        return true;
    });
}

function formatLabel(date, filter) {
    const d = new Date(date);
    if (filter === 'today') {
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── API ──────────────────────────────────────────────────────────
async function loadHistorico() {
    try {
        const res = await fetch('/api/historico?limite=200');
        const { registros } = await res.json();
        allRegistros = registros || [];
        applyFilter();
    } catch (err) {
        console.error('[TMO] Erro ao carregar histórico:', err);
    }
}

async function handleSubmit() {
    const rawText = document.getElementById('tmoText').value.trim();
    const btn = document.getElementById('btnAnalisar');

    if (!rawText) {
        alert('Cole os tempos no formato MM:SS antes de processar.');
        return;
    }

    const original = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="lucide-spin"></i> Processando...';
    btn.disabled = true;
    lucide.createIcons();

    try {
        const res = await fetch('/api/analisar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText, metaSegundos: META_SEGUNDOS, operador: 'João' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.erro || 'Erro desconhecido');

        document.getElementById('tmoText').value = '';
        await loadHistorico();

    } catch (err) {
        alert(`Erro: ${err.message}`);
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
        lucide.createIcons();
    }
}

// ─── Main Filter & Render Pipeline ───────────────────────────────
function applyFilter() {
    const filtered = filterByPeriod(allRegistros, currentFilter);

    updateTopbarSubtitle(filtered);

    if (!filtered.length) {
        resetKpis();
        renderCharts([], [], null);
        hideExtras();
        return;
    }

    // Aggregate KPIs
    let totalSec = 0;
    let totalCalls = 0;
    let weightedPct = 0;

    filtered.forEach(r => {
        const sec = mmssToSec(r.tmoMedio);
        totalCalls += r.totalLigacoes || 0;
        totalSec += sec * (r.totalLigacoes || 0);
        weightedPct += (parseFloat(r.percentualDentroMeta) || 0) * (r.totalLigacoes || 0);
    });

    const avgSec = totalCalls > 0 ? Math.round(totalSec / totalCalls) : 0;
    const avgPct = totalCalls > 0 ? (weightedPct / totalCalls).toFixed(1) : '0.0';

    renderKpis(avgSec, avgPct, totalCalls);
    renderInsights(filtered);

    // Build chart data
    if (currentFilter === 'today') {
        renderTodayCharts(filtered);
    } else {
        renderGroupedCharts(filtered);
    }
}

// ─── KPI Panel ────────────────────────────────────────────────────
function resetKpis() {
    document.getElementById('resTmoMedio').textContent = '—';
    document.getElementById('resTmoMedioSub').textContent = 'Sem dados no período';
    document.getElementById('resTotal').textContent = '—';
    document.getElementById('resPercent').textContent = '—';
    setStatusKpi('Sem dados', 'aguardando', 'shield-off');
}

function renderKpis(avgSec, avgPct, totalCalls) {
    const el = document.getElementById('resTmoMedio');
    el.textContent = `${avgSec} s`;
    el.title = `Em minutos: ${secToMmss(avgSec)}`;

    document.getElementById('resTmoMedioSub').textContent =
        `Equivale a ${secToMmss(avgSec)} (passe o mouse para ver)`;

    document.getElementById('resTotal').textContent = totalCalls.toLocaleString('pt-BR');
    document.getElementById('resPercent').textContent = `${avgPct}%`;

    const cls = classifyTmo(avgSec);
    const iconMap = { excelente: 'award', bom: 'thumbs-up', atencao: 'alert-triangle', critico: 'x-circle', aguardando: 'shield-check' };
    setStatusKpi(cls.label, cls.key, iconMap[cls.key]);
}

function setStatusKpi(label, colorKey, icon) {
    document.getElementById('resStatus').textContent = label;

    const iconEl = document.getElementById('kpiStatusIcon');
    iconEl.className = `kpi-icon ${colorKey}`;
    iconEl.innerHTML = `<i id="iconStatus" data-lucide="${icon}"></i>`;
    lucide.createIcons();
}

// ─── Insights Panel ───────────────────────────────────────────────
function renderInsights(filtered) {
    const section = document.getElementById('insightsSection');

    if (currentFilter === 'all') {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    const labelMap = { today: 'Hoje', '7': 'Últimos 7 dias', '30': 'Este mês' };
    document.getElementById('insightsPeriodLabel').textContent = labelMap[currentFilter] || '';

    let totalWorkSec = 0;
    let below = 0;
    let above = 0;

    filtered.forEach(r => {
        const sec = mmssToSec(r.tmoMedio);
        totalWorkSec += sec * (r.totalLigacoes || 0);

        // Use temposSegundos array if available, fallback to counting from rawText
        if (Array.isArray(r.temposSegundos) && r.temposSegundos.length) {
            r.temposSegundos.forEach(s => { s > LIMITE_6MIN ? above++ : below++; });
        } else if (r.rawText) {
            r.rawText.split('\n').forEach(linha => {
                const s = mmssToSec(linha.trim());
                if (s > 0) s > LIMITE_6MIN ? above++ : below++;
            });
        }
    });

    document.getElementById('extraTimeVal').textContent = formatDuration(totalWorkSec);
    document.getElementById('callsBelow6').textContent = below.toLocaleString('pt-BR');
    document.getElementById('callsAbove6').textContent = above.toLocaleString('pt-BR');

    lucide.createIcons();
}

function hideExtras() {
    document.getElementById('insightsSection').style.display = 'none';
    document.getElementById('timelineSection').style.display = 'none';
}

// ─── Topbar Subtitle ──────────────────────────────────────────────
function updateTopbarSubtitle(filtered) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const periodMap = {
        today: 'Hoje',
        '7': 'Últimos 7 dias',
        '30': 'Este mês',
        all: 'Todo o histórico',
    };
    const desc = filtered.length
        ? `${periodMap[currentFilter]} · ${filtered.length} sessões · Atualizado às ${timeStr}`
        : `${periodMap[currentFilter]} · Nenhum dado`;

    const subtitleEl = document.getElementById('topbarSubtitle');
    if (subtitleEl) subtitleEl.textContent = desc;
}

// ─── Charts ───────────────────────────────────────────────────────
Chart.register(ChartDataLabels);

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 28, right: 20, left: 4, bottom: 4 } },
};

const TOOLTIP_DEFAULTS = {
    backgroundColor: '#0f172a',
    titleFont: { family: 'Inter', size: 12, weight: '500' },
    bodyFont: { family: '"JetBrains Mono", monospace', size: 14, weight: '700' },
    padding: { x: 14, y: 10 },
    cornerRadius: 8,
    caretSize: 6,
};

function buildGradient(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 280);
    g.addColorStop(0, 'rgba(79, 70, 229, 0.22)');
    g.addColorStop(1, 'rgba(79, 70, 229, 0.00)');
    return g;
}

function destroyCharts() {
    tmoChartInstance?.destroy();
    volChartInstance?.destroy();
    tmoChartInstance = null;
    volChartInstance = null;
}

function showVolumeChart(show) {
    const box = document.getElementById('volumeChartBox');
    const grid = document.getElementById('chartsGrid');
    box.style.display = show ? 'flex' : 'none';
    grid.style.gridTemplateColumns = show ? '1.618fr 1fr' : '1fr';
}

function renderCharts(labels, tmoData, volData) {
    destroyCharts();

    const ctx = document.getElementById('tmoChart').getContext('2d');
    const gradient = buildGradient(ctx);

    tmoChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: tmoData,
                borderColor: '#4f46e5',
                backgroundColor: gradient,
                borderWidth: 2.5,
                fill: true,
                tension: currentFilter === 'today' ? 0.15 : 0.35,
                pointRadius: currentFilter === 'today' ? 3 : 5,
                pointHoverRadius: 8,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#4f46e5',
                pointBorderWidth: 2.5,
            }],
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: currentFilter !== 'today',
                    align: 'top',
                    anchor: 'end',
                    offset: 6,
                    color: '#4f46e5',
                    font: { family: '"JetBrains Mono", monospace', weight: '700', size: 11 },
                    backgroundColor: 'rgba(255,255,255,0.92)',
                    borderRadius: 4,
                    padding: { x: 5, y: 3 },
                    formatter: v => `${v}s`,
                },
                tooltip: {
                    ...TOOLTIP_DEFAULTS,
                    callbacks: {
                        label: ctx => {
                            const s = ctx.parsed.y;
                            return `  ${s}s  (${secToMmss(s)})`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 12, weight: '500' }, color: '#94a3b8', maxRotation: 0 },
                },
                y: {
                    beginAtZero: false,
                    grid: { color: '#f1f5f9', lineWidth: 1 },
                    ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8', callback: v => `${v}s` },
                },
            },
        },
    });

    showVolumeChart(!!(volData && volData.length));

    if (volData && volData.length) {
        const vctx = document.getElementById('volumeChart').getContext('2d');
        volChartInstance = new Chart(vctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: volData,
                    backgroundColor: 'rgba(79, 70, 229, 0.10)',
                    hoverBackgroundColor: '#4f46e5',
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 34,
                }],
            },
            options: {
                ...CHART_DEFAULTS,
                layout: { padding: { top: 8, right: 12, left: 4, bottom: 4 } },
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: { ...TOOLTIP_DEFAULTS },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Inter', size: 12, weight: '500' }, color: '#94a3b8', maxRotation: 0 },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 11 }, color: '#94a3b8', stepSize: 1 },
                    },
                },
            },
        });
    }
}

// "Hoje" → individual calls plot
function renderTodayCharts(filtered) {
    const crono = [...filtered].reverse();
    const labels = [], tmoData = [];
    let idx = 1;

    crono.forEach(r => {
        if (Array.isArray(r.temposSegundos) && r.temposSegundos.length) {
            r.temposSegundos.forEach(s => {
                labels.push(`#${idx++}`);
                tmoData.push(s);
            });
        } else if (r.rawText) {
            r.rawText.split('\n').forEach(linha => {
                const s = mmssToSec(linha.trim());
                if (s > 0) { labels.push(`#${idx++}`); tmoData.push(s); }
            });
        }
    });

    document.getElementById('tmoChartTitle').textContent = 'Ligações de Hoje';
    document.getElementById('tmoChartSub').textContent = `${labels.length} ligações registradas`;

    renderCharts(labels, tmoData, null);
    renderTimeline(labels, tmoData, 'today');
}

// 7d / 30d / all → daily aggregation
function renderGroupedCharts(filtered) {
    const crono = [...filtered].reverse();
    const byDay = new Map();

    crono.forEach(r => {
        if (!r.criadoEm) return;
        const d = new Date(r.criadoEm);
        const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

        if (!byDay.has(key)) byDay.set(key, { totalSec: 0, calls: 0 });
        const entry = byDay.get(key);
        entry.totalSec += mmssToSec(r.tmoMedio) * (r.totalLigacoes || 0);
        entry.calls += r.totalLigacoes || 0;
    });

    const labels = Array.from(byDay.keys());
    const tmoData = labels.map(k => {
        const e = byDay.get(k);
        return e.calls > 0 ? Math.round(e.totalSec / e.calls) : 0;
    });
    const volData = labels.map(k => byDay.get(k).calls);

    const periodMap = { '7': 'Últimos 7 dias', '30': 'Este mês', all: 'Histórico completo' };
    document.getElementById('tmoChartTitle').textContent = 'TMO Médio Diário';
    document.getElementById('tmoChartSub').textContent = `${labels.length} dias — ${periodMap[currentFilter] || ''}`;

    renderCharts(labels, tmoData, volData);
    renderTimeline(labels, tmoData, 'days', volData);
}

// ─── Timeline Table ───────────────────────────────────────────────
function renderTimeline(labels, tmoData, mode, volData = []) {
    const section = document.getElementById('timelineSection');
    const rowsEl = document.getElementById('timelineRows');
    const headerEl = document.getElementById('tableHeader');

    if (!labels.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    const isToday = mode === 'today';
    const cols = isToday ? '80px 1fr 1fr 1fr' : '100px 1fr 1fr 1fr 1fr';

    document.getElementById('timelineLabel').textContent = isToday
        ? 'Ligações do Dia'
        : 'Resumo por Dia';

    document.getElementById('timelineCount').textContent = `${labels.length} registros`;

    // Header
    headerEl.style.gridTemplateColumns = cols;
    headerEl.innerHTML = isToday
        ? `<span class="table-header-cell">#</span>
           <span class="table-header-cell">TMO (seg)</span>
           <span class="table-header-cell">TMO (MM:SS)</span>
           <span class="table-header-cell">Status</span>`
        : `<span class="table-header-cell">Dia</span>
           <span class="table-header-cell">TMO Médio (s)</span>
           <span class="table-header-cell">TMO (MM:SS)</span>
           <span class="table-header-cell">Ligações</span>
           <span class="table-header-cell">Status</span>`;

    // Rows
    rowsEl.innerHTML = labels.map((lbl, i) => {
        const sec = tmoData[i];
        const cls = classifyTmo(sec);
        const pill = `<span class="pill ${cls.key}">${cls.label}</span>`;

        if (isToday) {
            return `<div class="timeline-row" style="grid-template-columns:${cols}">
                <span class="timeline-cell muted">${lbl}</span>
                <span class="timeline-cell mono">${sec}s</span>
                <span class="timeline-cell mono">${secToMmss(sec)}</span>
                <span class="timeline-cell">${pill}</span>
            </div>`;
        } else {
            const calls = volData[i] ?? '—';
            return `<div class="timeline-row" style="grid-template-columns:${cols}">
                <span class="timeline-cell">${lbl}</span>
                <span class="timeline-cell mono">${sec}s</span>
                <span class="timeline-cell mono">${secToMmss(sec)}</span>
                <span class="timeline-cell">${calls}</span>
                <span class="timeline-cell">${pill}</span>
            </div>`;
        }
    }).join('');
}
