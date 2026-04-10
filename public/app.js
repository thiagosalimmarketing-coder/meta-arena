// ══════════════════════════════════════════════════════════════
//  ARENA HUB DE MARKETING — app.js
// ══════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────
let currentTab = 'pipeline';
let currentClientId = localStorage.getItem('arena_current_client') || null;
let clients = JSON.parse(localStorage.getItem('arena_clients') || '[]');
let historyItems = JSON.parse(localStorage.getItem('arena_history') || '[]');
let pipelineRunning = false;
let META_TOKEN = '';
let META_ACT = '';
const INSIGHT_FIELDS = "impressions,clicks,spend,reach,ctr,cpc,cpm,actions,cost_per_action_type,frequency";
const openSections = { account: true, campaigns: true, adsets: false, ads: false, audiences: false, pixels: false };

// ── PIPELINE AGENTS ───────────────────────────────────────────
const PIPELINE_AGENTS = [
  { id: 'pesquisador',  label: 'Pesquisador',    icon: '🔍' },
  { id: 'estrategista', label: 'Estrategista',   icon: '🎯' },
  { id: 'copywriter',   label: 'Copywriter',     icon: '✍️' },
  { id: 'brief',        label: 'Brief Criativo', icon: '🎨' },
  { id: 'distribuicao', label: 'Distribuição',   icon: '📊' },
];

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderClientSelect();
  renderPipelineNodes();
  renderPerfis();
  renderHistorico();
  document.getElementById('date-preset').addEventListener('change', fetchAll);

  if (currentClientId) {
    loadClientIntoState(currentClientId);
    document.getElementById('client-select').value = currentClientId;
    updateToneBars();
  }
});

// ── CLIENT MANAGEMENT ─────────────────────────────────────────
function getClient(id) { return clients.find(c => c.id === id); }
function saveClients() { localStorage.setItem('arena_clients', JSON.stringify(clients)); }
function saveHistory() { localStorage.setItem('arena_history', JSON.stringify(historyItems)); }

function loadClientIntoState(id) {
  currentClientId = id;
  localStorage.setItem('arena_current_client', id);
  const c = getClient(id);
  if (!c) return;
  META_TOKEN = c.metaToken || '';
  META_ACT   = c.metaAdAccount || '';
  document.getElementById('cfg-token').value = META_TOKEN;
  document.getElementById('cfg-act').value   = META_ACT;
}

function onClientChange(val) {
  if (!val) { currentClientId = null; localStorage.removeItem('arena_current_client'); updateToneBars(); return; }
  if (val === '__new__') { document.getElementById('client-select').value = currentClientId || ''; switchTab('perfis'); openNewClientModal(); return; }
  loadClientIntoState(val);
  updateToneBars();
  if (currentTab === 'metricas') fetchAll();
}

function updateToneBars() {
  const c = getClient(currentClientId);
  const text = c ? `<strong>Tom ativo (${c.name}):</strong> ${c.tone || 'Não definido'} · Nicho: ${c.niche || '—'} · Budget: ${c.budget || '—'}` : '';
  ['pipeline', 'rapido', 'criativo'].forEach(tab => {
    const el = document.getElementById(`${tab}-tone`);
    if (!el) return;
    if (c && c.tone) { el.innerHTML = text; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  });
}

function renderClientSelect() {
  const sel = document.getElementById('client-select');
  sel.innerHTML =
    '<option value="">Selecionar cliente...</option>' +
    clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
    '<option value="__new__">+ Novo cliente</option>';
  if (currentClientId) sel.value = currentClientId;
}

// ── TAB NAVIGATION ────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tab}`);
    p.style.display = p.id === `tab-${tab}` ? 'block' : 'none';
  });
  if (tab === 'metricas') {
    if (!META_TOKEN) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('progress-wrap').classList.add('hidden');
      document.getElementById('content').classList.add('hidden');
    } else {
      fetchAll();
    }
  }
  if (tab === 'historico') renderHistorico();
  if (tab === 'perfis') renderPerfis();
}

// ── AI CALL ───────────────────────────────────────────────────
async function callAI(agent, userContent) {
  const c = getClient(currentClientId);
  const clientContext = c ? { name: c.name, niche: c.niche, businessType: c.businessType, tone: c.tone, budget: c.budget, objective: c.objective } : {};
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, messages: [{ role: 'user', content: userContent }], clientContext }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.text;
}

// ── FORMAT AI TEXT ────────────────────────────────────────────
function formatAIText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<div style="font-size:11px;letter-spacing:.2em;color:var(--acc);text-transform:uppercase;margin:16px 0 6px;">$1</div>')
    .replace(/^### (.+)$/gm, '<div style="font-size:12px;color:var(--txt);margin:12px 0 4px;font-weight:600;">$1</div>')
    .replace(/^- (.+)$/gm, '&nbsp;&nbsp;· $1')
    .replace(/\n/g, '<br>');
}

// ── SAVE TO HISTORY ───────────────────────────────────────────
function saveToHistory(type, title, content) {
  const item = {
    id: Date.now().toString(),
    clientId: currentClientId,
    clientName: getClient(currentClientId)?.name || 'Sem cliente',
    type,
    title: title.slice(0, 80),
    content,
    createdAt: new Date().toISOString(),
  };
  historyItems.unshift(item);
  if (historyItems.length > 100) historyItems = historyItems.slice(0, 100);
  saveHistory();
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent; btn.textContent = 'Copiado ✓'; btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  });
}

// ══════════════════════════════════════════════════════════════
//  PIPELINE
// ══════════════════════════════════════════════════════════════

function renderPipelineNodes(activeIdx = -1, doneUntil = -1) {
  const wrap = document.getElementById('pipeline-nodes');
  wrap.innerHTML = PIPELINE_AGENTS.map((a, i) => {
    let cls = '';
    if (i < doneUntil) cls = 'done';
    else if (i === activeIdx) cls = 'running';
    const arrow = i < PIPELINE_AGENTS.length - 1 ? '<span class="p-arrow">→</span>' : '';
    return `<div class="p-node ${cls}" id="pnode-${i}">
      <span>${a.icon}</span><span>${a.label}</span>
      ${cls === 'done' ? '<span style="color:var(--green)">✓</span>' : cls === 'running' ? '<div class="ai-spinner"></div>' : ''}
    </div>${arrow}`;
  }).join('');
}

function setPipelineNodeState(idx, state) {
  const node = document.getElementById(`pnode-${idx}`);
  if (!node) return;
  node.className = `p-node ${state}`;
  const a = PIPELINE_AGENTS[idx];
  node.innerHTML = `<span>${a.icon}</span><span>${a.label}</span>
    ${state === 'done' ? '<span style="color:var(--green)">✓</span>' : state === 'running' ? '<div class="ai-spinner"></div>' : ''}`;
}

async function runPipeline() {
  if (pipelineRunning) return;
  const input = document.getElementById('pipeline-input').value.trim();
  if (!input) { alert('Descreva o produto/serviço/campanha'); return; }

  pipelineRunning = true;
  const btn = document.getElementById('btn-pipeline');
  btn.disabled = true; btn.textContent = '⏳ Executando Pipeline...';

  const budget    = document.getElementById('pipeline-budget').value.trim();
  const objective = document.getElementById('pipeline-objective').value;
  const resultsEl = document.getElementById('pipeline-results');
  resultsEl.innerHTML = '';

  let accumulated = `PRODUTO/CAMPANHA: ${input}`;
  if (budget) accumulated += `\nBUDGET DE MÍDIA: ${budget}`;
  if (objective) accumulated += `\nOBJETIVO: ${objective}`;

  const allResults = {};

  for (let i = 0; i < PIPELINE_AGENTS.length; i++) {
    const agent = PIPELINE_AGENTS[i];
    setPipelineNodeState(i, 'running');

    // Show loading card
    const cardId = `agent-card-${i}`;
    resultsEl.insertAdjacentHTML('beforeend', `
      <div class="agent-result fade" id="${cardId}">
        <div class="agent-result-head">
          <span class="agent-name">${agent.icon} ${agent.label}</span>
          <div class="ai-loading" style="padding:0;"><div class="ai-spinner"></div><span style="font-size:12px;">Processando...</span></div>
        </div>
      </div>`);
    resultsEl.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const result = await callAI(agent.id, accumulated);
      allResults[agent.id] = result;
      accumulated += `\n\n--- ${agent.label.toUpperCase()} ---\n${result}`;
      setPipelineNodeState(i, 'done');

      document.getElementById(cardId).innerHTML = `
        <div class="agent-result-head" onclick="toggleAgentCard('body-${cardId}','arr-${cardId}')">
          <span class="agent-name">${agent.icon} ${agent.label} <span style="color:var(--green);margin-left:6px;">✓</span></span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn-copy" onclick="event.stopPropagation();copyToClipboard(${JSON.stringify(result)}, this)">Copiar</button>
            <span id="arr-${cardId}" style="color:var(--dim);font-size:12px;">▲</span>
          </div>
        </div>
        <div class="agent-result-body" id="body-${cardId}">${formatAIText(result)}</div>`;
    } catch (e) {
      setPipelineNodeState(i, 'error');
      document.getElementById(cardId).innerHTML = `
        <div class="agent-result-head" style="background:#130707;">
          <span class="agent-name" style="color:var(--red);">${agent.icon} ${agent.label} — Erro</span>
        </div>
        <div class="agent-result-body" style="color:var(--red);">${e.message}</div>`;
      break;
    }
  }

  pipelineRunning = false;
  btn.disabled = false; btn.textContent = '🚀 Ativar Pipeline Completo';

  if (Object.keys(allResults).length > 0) {
    saveToHistory('pipeline', input, allResults);
    // Add export button
    resultsEl.insertAdjacentHTML('beforeend', `
      <div style="text-align:center;margin-top:16px;">
        <button class="btn-secondary" onclick="exportPipeline(${JSON.stringify(accumulated)})" style="font-size:12px;padding:8px 20px;">📋 Copiar resultado completo</button>
      </div>`);
  }
}

function toggleAgentCard(bodyId, arrId) {
  const body = document.getElementById(bodyId);
  const arr  = document.getElementById(arrId);
  if (!body) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  if (arr) arr.textContent = hidden ? '▲' : '▼';
}

function exportPipeline(text) {
  copyToClipboard(text, event.target);
}

// ══════════════════════════════════════════════════════════════
//  RÁPIDO
// ══════════════════════════════════════════════════════════════

async function runRapido() {
  const produto  = document.getElementById('rapido-produto').value.trim();
  if (!produto) { alert('Informe o produto/serviço'); return; }
  const angulo   = document.getElementById('rapido-angulo').value;
  const formato  = document.getElementById('rapido-formato').value;
  const detalhes = document.getElementById('rapido-detalhes').value.trim();

  const btn = document.getElementById('btn-rapido');
  btn.disabled = true; btn.textContent = '⏳ Gerando...';
  const res = document.getElementById('rapido-results');
  res.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Gerando 3 variações de copy...</div>`;

  const prompt = `Produto: ${produto}\nÂngulo: ${angulo}\nFormato: ${formato}${detalhes ? '\nDetalhes: ' + detalhes : ''}`;

  try {
    const text = await callAI('rapido', prompt);
    saveToHistory('rapido', produto, { text });
    res.innerHTML = `
      <div class="card fade">
        <div class="agent-result-body" style="padding:0;">${formatAIText(text)}</div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)}, this)">📋 Copiar tudo</button>
        </div>
      </div>`;
  } catch (e) {
    res.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = '⚡ Gerar Copies Agora';
}

// ══════════════════════════════════════════════════════════════
//  CRIATIVO
// ══════════════════════════════════════════════════════════════

async function runCriativo() {
  const produto  = document.getElementById('criativo-produto').value.trim();
  if (!produto) { alert('Informe o produto/campanha'); return; }
  const objetivo = document.getElementById('criativo-objetivo').value;
  const publico  = document.getElementById('criativo-publico').value.trim();
  const contexto = document.getElementById('criativo-contexto').value.trim();

  const btn = document.getElementById('btn-criativo');
  btn.disabled = true; btn.textContent = '⏳ Gerando brief...';
  const res = document.getElementById('criativo-results');
  res.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Criando brief criativo completo...</div>`;

  const prompt = `Produto/Campanha: ${produto}\nObjetivo: ${objetivo}${publico ? '\nPúblico-alvo: ' + publico : ''}${contexto ? '\nContexto/Referências: ' + contexto : ''}`;

  try {
    const text = await callAI('criativo', prompt);
    saveToHistory('criativo', produto, { text });
    res.innerHTML = `
      <div class="card fade">
        <div class="agent-result-body" style="padding:0;">${formatAIText(text)}</div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)}, this)">📋 Copiar brief</button>
        </div>
      </div>`;
  } catch (e) {
    res.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = '🎨 Gerar Brief Criativo';
}

// ══════════════════════════════════════════════════════════════
//  MÉTRICAS (Meta Ads)
// ══════════════════════════════════════════════════════════════

function applyConfig() {
  META_TOKEN = document.getElementById('cfg-token').value.trim();
  META_ACT   = document.getElementById('cfg-act').value.trim();
  localStorage.setItem('meta_token', META_TOKEN);
  localStorage.setItem('meta_act', META_ACT);
  fetchAll();
}

const fmtN = (n, d=2) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtR = (n) => n == null ? '—' : `R$ ${fmtN(n)}`;
const fmtP = (n) => n == null ? '—' : `${fmtN(n, 1)}%`;
const fmtI = (n) => n == null ? '—' : Number(n).toLocaleString('pt-BR');

function getAction(ins, type) {
  const acts = ins?.data?.[0]?.actions;
  if (!acts) return null;
  const a = acts.find(x => x.action_type === type);
  return a ? Number(a.value) : null;
}
function getCPA(ins, type) {
  const cpa = ins?.data?.[0]?.cost_per_action_type;
  if (!cpa) return null;
  const a = cpa.find(x => x.action_type === type);
  return a ? Number(a.value) : null;
}
function insVal(ins, key) {
  const v = ins?.data?.[0]?.[key];
  return v != null ? Number(v) : null;
}
function badge(status) {
  const labels = { ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado', CAMPAIGN_PAUSED: 'Camp. Pausada' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}
function mcard(label, value, color, sub='') {
  return `<div class="mcard"><div class="lbl">${label}</div><div class="val" style="color:${color}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
function miniCell(k, v) {
  return `<div class="mini-cell"><div class="mk">${k}</div><div class="mv">${v}</div></div>`;
}
function sectionHead(id, title, count) {
  return `<div class="section-head" onclick="toggleSection('${id}')"><span>${title}${count != null ? ` <span style="color:#444">(${count})</span>` : ''}</span><span class="arrow" id="arr-${id}">▼</span></div>`;
}
function toggleSection(id) {
  openSections[id] = !openSections[id];
  const body = document.getElementById(`sec-${id}`);
  const arr  = document.getElementById(`arr-${id}`);
  if (body) body.classList.toggle('hidden', !openSections[id]);
  if (arr)  arr.textContent = openSections[id] ? '▲' : '▼';
}
function setProgress(pct, label) {
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent = label;
}

async function mFetch(path, extra={}) {
  const params = new URLSearchParams({ path, token: META_TOKEN, ...extra });
  const r = await fetch(`/api/meta?${params}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d;
}

async function fetchAll() {
  if (!META_TOKEN) return;
  const btn = document.getElementById('btn-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  document.getElementById('error-wrap').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('progress-wrap').classList.remove('hidden');
  document.getElementById('content').classList.add('hidden');
  const dp = document.getElementById('date-preset').value;

  try {
    setProgress(10, 'Buscando dados da conta...');
    const account = await mFetch(`${META_ACT}`, { fields: 'name,account_status,currency,timezone_name,amount_spent,balance' });

    setProgress(25, 'Buscando insights gerais...');
    const acctIns = await mFetch(`${META_ACT}/insights`, { fields: INSIGHT_FIELDS, date_preset: dp, level: 'account' });

    setProgress(40, 'Buscando campanhas...');
    const campsR = await mFetch(`${META_ACT}/campaigns`, {
      fields: `id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,insights.date_preset(${dp}){${INSIGHT_FIELDS}}`,
      limit: 50,
    });

    setProgress(55, 'Buscando conjuntos de anúncios...');
    const adsetsR = await mFetch(`${META_ACT}/adsets`, {
      fields: `id,name,status,campaign_id,targeting,daily_budget,optimization_goal,insights.date_preset(${dp}){${INSIGHT_FIELDS}}`,
      limit: 100,
    });

    setProgress(70, 'Buscando anúncios e criativos...');
    const adsR = await mFetch(`${META_ACT}/ads`, {
      fields: `id,name,status,adset_id,campaign_id,creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type},insights.date_preset(${dp}){${INSIGHT_FIELDS}}`,
      limit: 100,
    });

    setProgress(82, 'Buscando públicos personalizados...');
    let audiences = [];
    try { const a = await mFetch(`${META_ACT}/customaudiences`, { fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound', limit: 50 }); audiences = a.data || []; } catch {}

    setProgress(92, 'Buscando pixel...');
    let pixels = [];
    try { const p = await mFetch(`${META_ACT}/adspixels`, { fields: 'id,name,last_fired_time', limit: 10 }); pixels = p.data || []; } catch {}

    setProgress(100, 'Concluído ✓');
    await new Promise(r => setTimeout(r, 300));
    renderAll({ account, acctIns, camps: campsR.data || [], adsets: adsetsR.data || [], ads: adsR.data || [], audiences, pixels, dp });
  } catch (e) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('progress-wrap').classList.add('hidden');
    const eb = document.getElementById('error-wrap');
    eb.classList.remove('hidden');
    eb.innerHTML = `<div class="error-box"><strong>Erro na API Meta:</strong> ${e.message}<small>Verifique token, permissões (ads_read, ads_management) e o Ad Account ID.</small></div>`;
  }
  if (btn) { btn.disabled = false; btn.textContent = '↻ Atualizar'; }
}

function renderAll(d) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('progress-wrap').classList.add('hidden');

  // Dot row
  const dotRow = document.getElementById('dot-row');
  dotRow.innerHTML = d.camps.slice(0, 8).map(c => {
    const col = c.status === 'ACTIVE' ? '#5bad85' : c.status === 'PAUSED' ? '#d4956a' : '#333';
    return `<div class="dot" style="background:${col}" title="${c.name}"></div>`;
  }).join('');

  const ai = d.acctIns;
  const spend    = insVal(ai, 'spend');
  const impr     = insVal(ai, 'impressions');
  const clicks   = insVal(ai, 'clicks');
  const reach    = insVal(ai, 'reach');
  const ctr      = insVal(ai, 'ctr');
  const cpc      = insVal(ai, 'cpc');
  const cpm      = insVal(ai, 'cpm');
  const freq     = insVal(ai, 'frequency');
  const purchases = getAction(ai, 'purchase');
  const leads     = getAction(ai, 'lead');
  const addCart   = getAction(ai, 'add_to_cart');
  const viewC     = getAction(ai, 'view_content');
  const cpPurch   = getCPA(ai, 'purchase');
  const cpLead    = getCPA(ai, 'lead');
  const amtSpent  = d.account.amount_spent ? Number(d.account.amount_spent) / 100 : null;

  const ctrCol  = ctr > 1.5 ? '#5bad85' : ctr > 0.8 ? '#d4956a' : '#e07070';
  const freqCol = freq > 3.5 ? '#e07070' : freq > 2 ? '#d4956a' : '#5bad85';

  let html = '';

  // ── CONTA ──
  html += sectionHead('account', 'Visão Geral da Conta');
  html += `<div id="sec-account" class="section-body">`;
  html += `<div class="grid">
    ${mcard('Gasto no período', fmtR(spend), 'var(--acc)')}
    ${mcard('Impressões', fmtI(impr), '#6a9e8e')}
    ${mcard('Cliques', fmtI(clicks), '#9b7dbf')}
    ${mcard('Alcance', fmtI(reach), '#6a8eb5')}
    ${mcard('CTR', fmtP(ctr), ctrCol)}
    ${mcard('CPC', fmtR(cpc), '#b86e6e')}
    ${mcard('CPM', fmtR(cpm), '#8e8e6a')}
    ${mcard('Frequência', fmtN(freq, 1), freqCol)}
  </div>`;

  const convCards = [
    purchases != null ? mcard('Compras', purchases, '#5bad85', cpPurch ? `CPA: ${fmtR(cpPurch)}` : '') : '',
    leads != null     ? mcard('Leads', leads, '#6a9e8e', cpLead ? `CPL: ${fmtR(cpLead)}` : '') : '',
    addCart != null   ? mcard('Add to Cart', addCart, '#9b7dbf') : '',
    viewC != null     ? mcard('View Content', fmtI(viewC), '#6a8eb5') : '',
  ].filter(Boolean);
  if (convCards.length) {
    html += `<div style="font-size:10px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase;margin-bottom:8px;">Eventos de Conversão</div>`;
    html += `<div class="grid">${convCards.join('')}</div>`;
  }

  html += `<div class="grid-sm">
    ${[['Moeda', d.account.currency], ['Fuso', d.account.timezone_name],
       ['Status conta', d.account.account_status === 1 ? '✓ Ativa' : '⚠ Restrita'],
       ['Gasto total histórico', amtSpent ? fmtR(amtSpent) : '—'],
       ['Pixels encontrados', d.pixels.length],
       ['Públicos personalizados', d.audiences.length],
    ].map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
  </div>`;

  // Análise IA da conta
  html += `<div style="margin-top:12px;margin-bottom:4px;">
    <button class="camp-ai-btn" onclick="analyzeAccount(${JSON.stringify({ spend, impr, clicks, reach, ctr, cpc, cpm, freq, purchases, leads, addCart, cpPurch, cpLead })}, this)" style="font-size:12px;padding:7px 16px;">
      🤖 Analisar conta com IA
    </button>
  </div>
  <div id="account-ai-result" class="camp-ai-result"></div>`;

  html += '</div>';

  // ── PIXEL ──
  if (d.pixels.length) {
    html += `<div style="margin-bottom:20px;">`;
    html += `<div style="font-size:10px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase;margin-bottom:10px;">Pixel</div>`;
    d.pixels.forEach(px => {
      const lastFired = px.last_fired_time ? new Date(px.last_fired_time).toLocaleDateString('pt-BR') : null;
      html += `<div class="pixel-row">
        <div style="font-size:18px;">◈</div>
        <div style="flex:1"><div style="font-size:13px;">${px.name}</div><div style="font-size:11px;color:var(--dim);font-family:monospace;">ID: ${px.id}</div></div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--dim);">Último disparo</div>
          <div style="font-size:12px;color:${lastFired ? '#5bad85' : '#e07070'};font-family:monospace;">${lastFired || 'Nunca'}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // ── CAMPANHAS ──
  html += sectionHead('campaigns', 'Campanhas + Análise IA', d.camps.length);
  html += `<div id="sec-campaigns" class="section-body">`;
  if (!d.camps.length) html += `<div style="color:var(--dim);font-size:13px;">Nenhuma campanha encontrada.</div>`;
  d.camps.forEach((c, idx) => {
    const ci  = c.insights;
    const cs  = insVal(ci, 'spend'), cc = insVal(ci, 'ctr'), ccp = insVal(ci, 'cpc');
    const ci2 = insVal(ci, 'impressions'), cf = insVal(ci, 'frequency');
    const cp  = getAction(ci, 'purchase'), cl = getAction(ci, 'lead');
    const cpa = getCPA(ci, 'purchase') || getCPA(ci, 'lead');
    const roas = (cp && cs) ? (cp * 1) / cs : null; // simplified
    const campData = { name: c.name, status: c.status, objective: c.objective, spend: cs, ctr: cc, cpc: ccp, impressions: ci2, frequency: cf, purchases: cp, leads: cl, cpa, budget_daily: c.daily_budget ? Number(c.daily_budget)/100 : null, budget_remaining: c.budget_remaining ? Number(c.budget_remaining)/100 : null };
    const campDataStr = JSON.stringify(campData).replace(/'/g, "\\'");

    html += `<div class="camp-card">
      <div class="camp-head">
        <div>
          <div class="camp-name">${c.name}</div>
          <div class="camp-meta">${badge(c.status)}<span style="font-size:11px;color:var(--dim);font-family:monospace;">${c.objective || ''}</span></div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="camp-spend">${fmtR(cs)}</div>
          <button class="camp-ai-btn" onclick="analyzeCampaign('${campDataStr}', 'camp-ai-${idx}', this)">🤖 Analisar IA</button>
        </div>
      </div>
      <div class="mini-grid">
        ${miniCell('Impressões', fmtI(ci2))}
        ${miniCell('CTR', fmtP(cc))}
        ${miniCell('CPC', fmtR(ccp))}
        ${miniCell('Freq.', fmtN(cf, 1))}
        ${cp != null ? miniCell('Compras', cp) : ''}
        ${cl != null ? miniCell('Leads', cl) : ''}
        ${cpa != null ? miniCell('CPA', fmtR(cpa)) : ''}
      </div>
      ${c.daily_budget || c.lifetime_budget ? `<div style="margin-top:8px;font-size:11px;color:var(--dim);font-family:monospace;">
        ${c.daily_budget ? `Budget diário: ${fmtR(Number(c.daily_budget)/100)}` : ''}
        ${c.lifetime_budget ? `Budget total: ${fmtR(Number(c.lifetime_budget)/100)}` : ''}
        ${c.budget_remaining ? ` · Restante: ${fmtR(Number(c.budget_remaining)/100)}` : ''}
      </div>` : ''}
      <div class="camp-ai-result" id="camp-ai-${idx}"></div>
    </div>`;
  });
  html += '</div>';

  // ── CONJUNTOS ──
  html += sectionHead('adsets', 'Conjuntos de Anúncios', d.adsets.length);
  html += `<div id="sec-adsets" class="section-body hidden">`;
  d.adsets.forEach(as => {
    const ai2 = as.insights;
    const as_s = insVal(ai2, 'spend'), as_ctr = insVal(ai2, 'ctr'), as_cpc = insVal(ai2, 'cpc');
    const as_i = insVal(ai2, 'impressions'), as_f = insVal(ai2, 'frequency');
    const as_p = getAction(ai2, 'purchase'), as_l = getAction(ai2, 'lead');
    const t = as.targeting || {};
    const ages = (t.age_min || t.age_max) ? `${t.age_min || '—'}–${t.age_max || '—'} anos` : '';
    const genders = t.genders ? (t.genders.includes(1) && t.genders.includes(2) ? 'M+F' : t.genders.includes(1) ? 'Masc' : 'Fem') : 'Todos';
    const interests = t.flexible_spec?.[0]?.interests?.slice(0, 5) || [];
    const geo = t.geo_locations?.countries?.join(', ') || t.geo_locations?.cities?.map(x => x.name).join(', ') || '';
    html += `<div class="camp-card">
      <div class="camp-head">
        <div>
          <div class="camp-name">${as.name}</div>
          <div class="camp-meta">${badge(as.status)}<span style="font-size:11px;color:var(--dim);font-family:monospace;">${as.optimization_goal || ''}</span>${ages ? `<span style="font-size:11px;color:var(--dim);">· ${ages}</span>` : ''}<span style="font-size:11px;color:var(--dim);">· ${genders}</span></div>
        </div>
        <div class="camp-spend" style="font-size:14px;">${fmtR(as_s)}</div>
      </div>
      <div class="mini-grid">
        ${miniCell('CTR', fmtP(as_ctr))}${miniCell('CPC', fmtR(as_cpc))}${miniCell('Impr.', fmtI(as_i))}${miniCell('Freq.', fmtN(as_f, 1))}
        ${as_p != null ? miniCell('Compras', as_p) : ''}${as_l != null ? miniCell('Leads', as_l) : ''}
      </div>
      ${geo ? `<div style="margin-top:6px;font-size:11px;color:#3a3a3a;font-family:monospace;">📍 ${geo}</div>` : ''}
      ${interests.length ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">${interests.map(i => `<span class="tag">${i.name}</span>`).join('')}</div>` : ''}
    </div>`;
  });
  html += '</div>';

  // ── ANÚNCIOS ──
  html += sectionHead('ads', 'Anúncios', d.ads.length);
  html += `<div id="sec-ads" class="section-body hidden">`;
  d.ads.forEach(ad => {
    const adi = ad.insights;
    const ad_s = insVal(adi, 'spend'), ad_ctr = insVal(adi, 'ctr'), ad_cpc = insVal(adi, 'cpc');
    const ad_i = insVal(adi, 'impressions'), ad_f = insVal(adi, 'frequency');
    const ad_p = getAction(adi, 'purchase'), ad_l = getAction(adi, 'lead');
    const cr = ad.creative || {};
    html += `<div class="ad-card">
      <div class="ad-row">
        ${cr.thumbnail_url ? `<img class="ad-thumb" src="${cr.thumbnail_url}" onerror="this.style.display='none'" alt=""/>` : ''}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;">
            <div style="font-size:12.5px;line-height:1.3;">${ad.name}</div>
            ${badge(ad.status)}
          </div>
          ${cr.title ? `<div style="font-size:11.5px;color:var(--acc);margin-bottom:2px;">${cr.title}</div>` : ''}
          ${cr.body ? `<div style="font-size:11px;color:var(--dim);line-height:1.45;">${(cr.body || '').slice(0, 120)}${(cr.body || '').length > 120 ? '...' : ''}</div>` : ''}
          ${cr.call_to_action_type ? `<span class="cta-tag">${cr.call_to_action_type}</span>` : ''}
        </div>
      </div>
      <div class="mini-grid" style="margin-top:8px;">
        ${miniCell('Gasto', fmtR(ad_s))}${miniCell('CTR', fmtP(ad_ctr))}${miniCell('CPC', fmtR(ad_cpc))}${miniCell('Impr.', fmtI(ad_i))}${miniCell('Freq.', fmtN(ad_f, 1))}
        ${ad_p != null ? miniCell('Compras', ad_p) : ''}${ad_l != null ? miniCell('Leads', ad_l) : ''}
      </div>
    </div>`;
  });
  html += '</div>';

  // ── PÚBLICOS ──
  if (d.audiences.length) {
    html += sectionHead('audiences', 'Públicos Personalizados', d.audiences.length);
    html += `<div id="sec-audiences" class="section-body hidden">`;
    d.audiences.forEach(au => {
      html += `<div class="aud-row">
        <div><div style="font-size:13px;">${au.name}</div><div style="font-size:11px;color:var(--dim);font-family:monospace;">${au.subtype}</div></div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#6a8eb5;font-family:monospace;">${au.approximate_count_lower_bound ? Number(au.approximate_count_lower_bound).toLocaleString('pt-BR') + '+' : ' —'}</div>
          <div style="font-size:10px;color:var(--dim);">pessoas</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  document.getElementById('content').innerHTML = html;
  document.getElementById('content').classList.remove('hidden');

  Object.entries(openSections).forEach(([id, open]) => {
    const el  = document.getElementById(`sec-${id}`);
    const arr = document.getElementById(`arr-${id}`);
    if (el)  el.classList.toggle('hidden', !open);
    if (arr) arr.textContent = open ? '▲' : '▼';
  });
}

// ── CAMPAIGN AI ANALYSIS ──────────────────────────────────────
async function analyzeCampaign(campDataStr, resultId, btn) {
  const campData = JSON.parse(campDataStr.replace(/\\'/g, "'"));
  const el = document.getElementById(resultId);
  if (!el) return;

  btn.disabled = true; btn.textContent = '⏳ Analisando...';
  el.style.display = 'block';
  el.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Analisando campanha com IA...</div>`;

  const prompt = `Analise esta campanha do Meta Ads e identifique erros, gaps e oportunidades:

Nome: ${campData.name}
Status: ${campData.status}
Objetivo: ${campData.objective || 'Não informado'}
Gasto no período: ${campData.spend != null ? 'R$ ' + campData.spend.toFixed(2) : 'sem dados'}
Impressões: ${campData.impressions != null ? campData.impressions.toLocaleString('pt-BR') : 'sem dados'}
CTR: ${campData.ctr != null ? campData.ctr.toFixed(2) + '%' : 'sem dados'}
CPC: ${campData.cpc != null ? 'R$ ' + campData.cpc.toFixed(2) : 'sem dados'}
Frequência: ${campData.frequency != null ? campData.frequency.toFixed(1) : 'sem dados'}
Compras: ${campData.purchases != null ? campData.purchases : 'sem dados'}
Leads: ${campData.leads != null ? campData.leads : 'sem dados'}
CPA: ${campData.cpa != null ? 'R$ ' + campData.cpa.toFixed(2) : 'sem dados'}
Budget diário: ${campData.budget_daily != null ? 'R$ ' + campData.budget_daily.toFixed(2) : 'não definido'}
Budget restante: ${campData.budget_remaining != null ? 'R$ ' + campData.budget_remaining.toFixed(2) : 'sem dados'}`;

  try {
    const text = await callAI('analista', prompt);
    el.innerHTML = formatAIText(text);
    el.innerHTML += `<div style="margin-top:12px;display:flex;gap:8px;">
      <button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)}, this)">📋 Copiar análise</button>
    </div>`;
    saveToHistory('analise', campData.name, { text });
  } catch (e) {
    el.innerHTML = `<span style="color:var(--red);">Erro: ${e.message}</span>`;
  }
  btn.disabled = false; btn.textContent = '🤖 Analisar IA';
}

async function analyzeAccount(metrics, btn) {
  const el = document.getElementById('account-ai-result');
  if (!el) return;
  btn.disabled = true; btn.textContent = '⏳ Analisando...';
  el.style.display = 'block';
  el.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Analisando conta com IA...</div>`;

  const prompt = `Analise o desempenho geral desta conta de Meta Ads no período selecionado:

Gasto: ${metrics.spend != null ? 'R$ ' + Number(metrics.spend).toFixed(2) : 'sem dados'}
Impressões: ${metrics.impr != null ? Number(metrics.impr).toLocaleString('pt-BR') : 'sem dados'}
Cliques: ${metrics.clicks != null ? Number(metrics.clicks).toLocaleString('pt-BR') : 'sem dados'}
Alcance: ${metrics.reach != null ? Number(metrics.reach).toLocaleString('pt-BR') : 'sem dados'}
CTR: ${metrics.ctr != null ? Number(metrics.ctr).toFixed(2) + '%' : 'sem dados'}
CPC: ${metrics.cpc != null ? 'R$ ' + Number(metrics.cpc).toFixed(2) : 'sem dados'}
CPM: ${metrics.cpm != null ? 'R$ ' + Number(metrics.cpm).toFixed(2) : 'sem dados'}
Frequência: ${metrics.freq != null ? Number(metrics.freq).toFixed(1) : 'sem dados'}
Compras: ${metrics.purchases != null ? metrics.purchases : 'sem dados'}
Leads: ${metrics.leads != null ? metrics.leads : 'sem dados'}
Add to Cart: ${metrics.addCart != null ? metrics.addCart : 'sem dados'}
CPA Compras: ${metrics.cpPurch != null ? 'R$ ' + Number(metrics.cpPurch).toFixed(2) : 'sem dados'}
CPL: ${metrics.cpLead != null ? 'R$ ' + Number(metrics.cpLead).toFixed(2) : 'sem dados'}

Identifique erros que passam despercebidos, gaps e oportunidades de melhoria.`;

  try {
    const text = await callAI('analista', prompt);
    el.innerHTML = formatAIText(text);
    el.innerHTML += `<div style="margin-top:12px;"><button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)}, this)">📋 Copiar análise</button></div>`;
  } catch (e) {
    el.innerHTML = `<span style="color:var(--red);">Erro: ${e.message}</span>`;
  }
  btn.disabled = false; btn.textContent = '🤖 Analisar conta com IA';
}

// ══════════════════════════════════════════════════════════════
//  HISTÓRICO
// ══════════════════════════════════════════════════════════════

function renderHistorico() {
  const el = document.getElementById('historico-list');
  if (!el) return;
  if (!historyItems.length) {
    el.innerHTML = `<div class="empty-state"><div class="ei">📋</div><p>Nenhum conteúdo gerado ainda.<br>Use o Pipeline, Rápido ou Criativo.</p></div>`;
    return;
  }
  const typeLabel = { pipeline: '🚀 Pipeline', rapido: '⚡ Rápido', criativo: '🎨 Criativo', analise: '🤖 Análise' };
  el.innerHTML = historyItems.map(item => `
    <div class="hist-item" onclick="openHistItem('${item.id}')">
      <span class="hist-type">${typeLabel[item.type] || item.type}</span>
      <span class="hist-title">${item.title}</span>
      <span class="hist-date">${new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
      <button class="hist-del" onclick="event.stopPropagation();deleteHistItem('${item.id}')">✕</button>
    </div>`).join('');
}

function openHistItem(id) {
  const item = historyItems.find(h => h.id === id);
  if (!item) return;
  const modal = document.getElementById('modal-hist');
  document.getElementById('modal-hist-title').textContent = item.title;
  let body = '';
  if (item.type === 'pipeline') {
    PIPELINE_AGENTS.forEach(a => {
      if (item.content[a.id]) {
        body += `<div style="font-size:10px;letter-spacing:.2em;color:var(--acc);text-transform:uppercase;margin:16px 0 6px;">${a.icon} ${a.label}</div>`;
        body += formatAIText(item.content[a.id]);
        body += '<br>';
      }
    });
  } else {
    body = formatAIText(item.content?.text || JSON.stringify(item.content));
  }
  document.getElementById('modal-hist-body').innerHTML = body;
  modal.classList.remove('hidden');
}

function closeHistModal() { document.getElementById('modal-hist').classList.add('hidden'); }

function deleteHistItem(id) {
  historyItems = historyItems.filter(h => h.id !== id);
  saveHistory();
  renderHistorico();
}

function clearHistory() {
  if (!confirm('Limpar todo o histórico?')) return;
  historyItems = [];
  saveHistory();
  renderHistorico();
}

// ══════════════════════════════════════════════════════════════
//  PERFIS
// ══════════════════════════════════════════════════════════════

function renderPerfis() {
  const el = document.getElementById('perfis-list');
  if (!el) return;
  if (!clients.length) {
    el.innerHTML = `<div class="empty-state"><div class="ei">⚙</div><p>Nenhum cliente cadastrado ainda.<br>Clique em "Novo Cliente" para começar.</p></div>`;
    return;
  }
  const typeLabel = { ecommerce: 'E-commerce', b2b: 'B2B', local: 'Local', infoproduto: 'Infoproduto', saas: 'SaaS' };
  el.innerHTML = clients.map(c => `
    <div class="profile-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <div class="profile-name">${c.name}</div>
          <div class="profile-meta">${typeLabel[c.businessType] || c.businessType || ''}${c.niche ? ' · ' + c.niche : ''}${c.budget ? ' · ' + c.budget : ''}</div>
          ${c.tone ? `<div style="font-size:12px;color:#555;margin-bottom:8px;line-height:1.5;">${c.tone.slice(0, 120)}${c.tone.length > 120 ? '...' : ''}</div>` : ''}
          ${c.metaAdAccount ? `<div style="font-size:11px;font-family:monospace;color:#333;">Meta Account: ${c.metaAdAccount}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn-edit" onclick="openEditClientModal('${c.id}')">Editar</button>
          <button class="btn-del" onclick="deleteClient('${c.id}')">Excluir</button>
        </div>
      </div>
      <div style="margin-top:12px;">
        <button class="camp-ai-btn" onclick="selectClient('${c.id}')" style="font-size:12px;padding:6px 14px;">Selecionar este cliente</button>
      </div>
    </div>`).join('');
}

function selectClient(id) {
  loadClientIntoState(id);
  renderClientSelect();
  updateToneBars();
  switchTab('pipeline');
}

function openNewClientModal() {
  document.getElementById('modal-client-title').textContent = 'Novo Cliente';
  document.getElementById('modal-client-id').value = '';
  ['mc-name','mc-niche','mc-tone','mc-budget','mc-token','mc-account'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mc-type').value = 'ecommerce';
  document.getElementById('mc-objective').value = 'vendas';
  document.getElementById('modal-client').classList.remove('hidden');
}

function openEditClientModal(id) {
  const c = getClient(id);
  if (!c) return;
  document.getElementById('modal-client-title').textContent = 'Editar Cliente';
  document.getElementById('modal-client-id').value = c.id;
  document.getElementById('mc-name').value = c.name || '';
  document.getElementById('mc-niche').value = c.niche || '';
  document.getElementById('mc-type').value = c.businessType || 'ecommerce';
  document.getElementById('mc-tone').value = c.tone || '';
  document.getElementById('mc-budget').value = c.budget || '';
  document.getElementById('mc-objective').value = c.objective || 'vendas';
  document.getElementById('mc-token').value = c.metaToken || '';
  document.getElementById('mc-account').value = c.metaAdAccount || '';
  document.getElementById('modal-client').classList.remove('hidden');
}

function closeClientModal() { document.getElementById('modal-client').classList.add('hidden'); }

function saveClient() {
  const name = document.getElementById('mc-name').value.trim();
  if (!name) { alert('Nome do cliente é obrigatório'); return; }
  const id = document.getElementById('modal-client-id').value || Date.now().toString();
  const client = {
    id,
    name,
    niche:        document.getElementById('mc-niche').value.trim(),
    businessType: document.getElementById('mc-type').value,
    tone:         document.getElementById('mc-tone').value.trim(),
    budget:       document.getElementById('mc-budget').value.trim(),
    objective:    document.getElementById('mc-objective').value,
    metaToken:    document.getElementById('mc-token').value.trim(),
    metaAdAccount: document.getElementById('mc-account').value.trim(),
  };
  const existing = clients.findIndex(c => c.id === id);
  if (existing >= 0) clients[existing] = client;
  else clients.push(client);
  saveClients();
  closeClientModal();
  renderClientSelect();
  renderPerfis();
  // Auto-select if first client
  if (clients.length === 1) { loadClientIntoState(id); updateToneBars(); renderClientSelect(); }
}

function deleteClient(id) {
  if (!confirm('Excluir este cliente?')) return;
  clients = clients.filter(c => c.id !== id);
  saveClients();
  if (currentClientId === id) { currentClientId = null; localStorage.removeItem('arena_current_client'); META_TOKEN = ''; META_ACT = ''; }
  renderClientSelect();
  renderPerfis();
  updateToneBars();
}

// ── CLOSE MODALS ON OVERLAY CLICK ─────────────────────────────
document.getElementById('modal-client').addEventListener('click', function(e) { if (e.target === this) closeClientModal(); });
document.getElementById('modal-hist').addEventListener('click', function(e) { if (e.target === this) closeHistModal(); });
