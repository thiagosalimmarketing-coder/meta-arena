// ══════════════════════════════════════════════════════════════
//  ARENA — ASSISTENTE DE TRÁFEGO PAGO — app.js
// ══════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────
let currentTab = 'chat';
let currentClientId = localStorage.getItem('arena_current_client') || null;
let clients       = JSON.parse(localStorage.getItem('arena_clients')  || '[]');
let historyItems  = JSON.parse(localStorage.getItem('arena_history')  || '[]');
let swipeItems    = JSON.parse(localStorage.getItem('arena_swipe')    || '[]');
let chatMessages  = []; // conversation history for current session
let lastMetrics   = null; // latest fetched metrics data (for chat context + report)
let pipelineRunning = false;
let META_TOKEN = '';
let META_ACT   = '';
let swipeFilter = 'all';

const INSIGHT_FIELDS = "impressions,clicks,spend,reach,ctr,cpc,cpm,actions,cost_per_action_type,frequency";
const openSections   = { account: true, campaigns: true, adsets: false, ads: false, audiences: false, pixels: false };

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
  renderSwipe();
  document.getElementById('date-preset').addEventListener('change', () => { if (META_TOKEN) fetchAll(); });

  if (currentClientId) {
    loadClientIntoState(currentClientId);
    document.getElementById('client-select').value = currentClientId;
    updateToneBars();
    updateChatInfo();
  }
});

// ── CLIENT MANAGEMENT ─────────────────────────────────────────
const getClient = id => clients.find(c => c.id === id);
const saveClients = () => localStorage.setItem('arena_clients', JSON.stringify(clients));
const saveHistory = () => localStorage.setItem('arena_history', JSON.stringify(historyItems));
const saveSwipeData = () => localStorage.setItem('arena_swipe', JSON.stringify(swipeItems));

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
  if (!val) {
    currentClientId = null;
    localStorage.removeItem('arena_current_client');
    META_TOKEN = ''; META_ACT = '';
    updateToneBars(); updateChatInfo();
    return;
  }
  if (val === '__new__') {
    document.getElementById('client-select').value = currentClientId || '';
    switchTab('perfis'); openNewClientModal(); return;
  }
  loadClientIntoState(val);
  updateToneBars(); updateChatInfo();
  if (currentTab === 'metricas' && META_TOKEN) fetchAll();
}

function updateToneBars() {
  const c = getClient(currentClientId);
  const text = c
    ? `<strong>Cliente ativo (${c.name}):</strong> ${c.tone ? c.tone.slice(0,100) + (c.tone.length > 100 ? '...' : '') : 'Tom não definido'} · Nicho: ${c.niche || '—'} · Budget: ${c.budget || '—'}`
    : '';
  ['pipeline', 'rapido', 'criativo'].forEach(tab => {
    const el = document.getElementById(`${tab}-tone`);
    if (!el) return;
    if (c && (c.tone || c.name)) { el.innerHTML = text; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  });
}

function updateChatInfo() {
  const c = getClient(currentClientId);
  const el = document.getElementById('chat-client-info');
  if (!el) return;
  if (c) {
    el.innerHTML = `<strong>${c.name}</strong> · ${c.niche || '—'} · ${c.businessType || '—'} · Budget: ${c.budget || '—'}${lastMetrics ? ' · <span style="color:var(--green);">✓ Métricas carregadas</span>' : ' · <span style="color:var(--dim);">Carregue as métricas para análise completa</span>'}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
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
    const isActive = p.id === `tab-${tab}`;
    p.classList.toggle('active', isActive);
    p.style.display = isActive ? 'block' : 'none';
  });
  if (tab === 'metricas' && META_TOKEN) fetchAll();
  if (tab === 'historico') renderHistorico();
  if (tab === 'perfis') renderPerfis();
  if (tab === 'swipe') renderSwipe();
  if (tab === 'relatorio') checkRelatorioReady();
}

// ── AI CALL ───────────────────────────────────────────────────
async function callAI(agent, userContent, extraMessages = []) {
  const c = getClient(currentClientId);
  const clientContext = c
    ? { name: c.name, niche: c.niche, businessType: c.businessType, tone: c.tone, budget: c.budget, objective: c.objective }
    : {};
  const metricsContext = lastMetrics;

  const messages = extraMessages.length
    ? extraMessages
    : [{ role: 'user', content: userContent }];

  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, messages, clientContext, metricsContext }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.text;
}

// ── FORMAT AI TEXT ────────────────────────────────────────────
function formatAIText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<div style="font-size:10px;letter-spacing:.2em;color:var(--acc);text-transform:uppercase;margin:16px 0 6px;font-family:monospace;">$1</div>')
    .replace(/^### (.+)$/gm, '<div style="font-size:12px;color:var(--txt);margin:10px 0 4px;font-weight:600;">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:14px;color:var(--txt);margin:14px 0 8px;font-weight:600;border-bottom:1px solid var(--brd);padding-bottom:6px;">$1</div>')
    .replace(/^- (.+)$/gm, '<div style="padding:2px 0 2px 12px;color:#aaa;">· $1</div>')
    .replace(/\n/g, '<br>');
}

// ── SAVE TO HISTORY ───────────────────────────────────────────
function saveToHistory(type, title, content) {
  const item = {
    id: Date.now().toString(),
    clientId: currentClientId,
    clientName: getClient(currentClientId)?.name || '—',
    type, title: (title || '').slice(0, 80), content,
    createdAt: new Date().toISOString(),
  };
  historyItems.unshift(item);
  if (historyItems.length > 150) historyItems = historyItems.slice(0, 150);
  saveHistory();
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent; btn.textContent = '✓ Copiado'; btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  });
}

// ══════════════════════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════════════════════

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function sendSuggestion(text) {
  document.getElementById('chat-input').value = text;
  sendChat();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('btn-chat-send');
  btn.disabled = true;
  input.value = '';

  appendChatMsg('user', text);
  chatMessages.push({ role: 'user', content: text });

  const thinkingId = appendChatMsg('ai', '<div class="ai-loading" style="padding:0;"><div class="ai-spinner"></div>Analisando...</div>', true);

  try {
    const reply = await callAI('chat', text, chatMessages);
    chatMessages.push({ role: 'assistant', content: reply });

    // Keep last 20 messages to avoid token limit
    if (chatMessages.length > 20) chatMessages = chatMessages.slice(chatMessages.length - 20);

    updateChatMsg(thinkingId, formatAIText(reply));
  } catch (e) {
    updateChatMsg(thinkingId, `<span style="color:var(--red);">Erro: ${e.message}</span>`);
  }
  btn.disabled = false;
  input.focus();
}

function appendChatMsg(role, html, isTemp = false) {
  const el   = document.getElementById('chat-messages');
  const id   = 'msg-' + Date.now();
  const div  = document.createElement('div');
  div.id     = id;
  div.className = `msg msg-${role} fade`;
  div.innerHTML = html;
  el.appendChild(div);
  el.scrollTop  = el.scrollHeight;
  return id;
}

function updateChatMsg(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  const msgs = document.getElementById('chat-messages');
  msgs.scrollTop = msgs.scrollHeight;
}

function clearChat() {
  chatMessages = [];
  const el = document.getElementById('chat-messages');
  el.innerHTML = '<div class="msg msg-ai">Conversa limpa. Como posso ajudar?</div>';
}

// ══════════════════════════════════════════════════════════════
//  PIPELINE
// ══════════════════════════════════════════════════════════════

function renderPipelineNodes(activeIdx = -1, doneUntil = -1) {
  const wrap = document.getElementById('pipeline-nodes');
  if (!wrap) return;
  wrap.innerHTML = PIPELINE_AGENTS.map((a, i) => {
    let cls = i < doneUntil ? 'done' : i === activeIdx ? 'running' : '';
    const arrow = i < PIPELINE_AGENTS.length - 1 ? '<span class="p-arrow">→</span>' : '';
    return `<div class="p-node ${cls}" id="pnode-${i}">
      <span>${a.icon}</span><span>${a.label}</span>
      ${cls === 'done' ? '<span style="color:var(--green);">✓</span>' : cls === 'running' ? '<div class="ai-spinner"></div>' : ''}
    </div>${arrow}`;
  }).join('');
}

function setPipelineNodeState(idx, state) {
  const node = document.getElementById(`pnode-${idx}`);
  if (!node) return;
  const a = PIPELINE_AGENTS[idx];
  node.className = `p-node ${state}`;
  node.innerHTML = `<span>${a.icon}</span><span>${a.label}</span>${state === 'done' ? '<span style="color:var(--green);">✓</span>' : state === 'running' ? '<div class="ai-spinner"></div>' : ''}`;
}

async function runPipeline() {
  if (pipelineRunning) return;
  const input = document.getElementById('pipeline-input').value.trim();
  if (!input) { alert('Descreva o produto/serviço/campanha'); return; }

  pipelineRunning = true;
  const btn = document.getElementById('btn-pipeline');
  btn.disabled = true; btn.textContent = '⏳ Executando...';

  const budget    = document.getElementById('pipeline-budget').value.trim();
  const objective = document.getElementById('pipeline-objective').value;
  const resultsEl = document.getElementById('pipeline-results');
  resultsEl.innerHTML = '';

  let accumulated = `PRODUTO/CAMPANHA: ${input}`;
  if (budget)    accumulated += `\nBUDGET: ${budget}`;
  if (objective) accumulated += `\nOBJETIVO: ${objective}`;

  const allResults = {};

  for (let i = 0; i < PIPELINE_AGENTS.length; i++) {
    const agent = PIPELINE_AGENTS[i];
    setPipelineNodeState(i, 'running');

    const cardId = `pcard-${i}`;
    resultsEl.insertAdjacentHTML('beforeend', `
      <div class="agent-result fade" id="${cardId}">
        <div class="agent-result-head">
          <span class="agent-name">${agent.icon} ${agent.label}</span>
          <div class="ai-loading" style="padding:0;"><div class="ai-spinner"></div><span style="font-size:12px;">Processando...</span></div>
        </div>
      </div>`);
    document.getElementById(cardId).scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const result = await callAI(agent.id, accumulated);
      allResults[agent.id] = result;
      accumulated += `\n\n=== ${agent.label.toUpperCase()} ===\n${result}`;
      setPipelineNodeState(i, 'done');

      const bodyId = `pbody-${i}`, arrId = `parr-${i}`;
      document.getElementById(cardId).innerHTML = `
        <div class="agent-result-head" onclick="toggleAgentCard('${bodyId}','${arrId}')">
          <span class="agent-name">${agent.icon} ${agent.label} <span style="color:var(--green);margin-left:6px;">✓</span></span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn-copy" onclick="event.stopPropagation();copyToClipboard(${JSON.stringify(result)},this)">Copiar</button>
            <span id="${arrId}" style="color:var(--dim);font-size:12px;">▲</span>
          </div>
        </div>
        <div class="agent-result-body" id="${bodyId}">${formatAIText(result)}</div>`;
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
    resultsEl.insertAdjacentHTML('beforeend', `
      <div style="text-align:center;margin-top:14px;">
        <button class="btn-secondary" onclick="copyToClipboard(${JSON.stringify(accumulated)},this)" style="font-size:12px;">📋 Copiar resultado completo</button>
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

// ══════════════════════════════════════════════════════════════
//  RÁPIDO
// ══════════════════════════════════════════════════════════════

async function runRapido() {
  const produto = document.getElementById('rapido-produto').value.trim();
  if (!produto) { alert('Informe o produto/serviço'); return; }
  const angulo   = document.getElementById('rapido-angulo').value;
  const formato  = document.getElementById('rapido-formato').value;
  const detalhes = document.getElementById('rapido-detalhes').value.trim();

  const btn = document.getElementById('btn-rapido');
  btn.disabled = true; btn.textContent = '⏳ Gerando...';
  const res = document.getElementById('rapido-results');
  res.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Gerando copies...</div>`;

  const prompt = `Produto: ${produto}\nÂngulo: ${angulo}\nFormato: ${formato}${detalhes ? '\nDetalhes: ' + detalhes : ''}`;

  try {
    const text = await callAI('rapido', prompt);
    saveToHistory('rapido', produto, { text });
    res.innerHTML = `<div class="card fade">
      <div class="agent-result-body" style="padding:0;">${formatAIText(text)}</div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)},this)">📋 Copiar tudo</button>
        <button class="btn-copy" onclick="addToSwipeFromRapido(${JSON.stringify(text)})">📚 Salvar no Swipe File</button>
      </div>
    </div>`;
  } catch (e) {
    res.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = '⚡ Gerar Copies Agora';
}

function addToSwipeFromRapido(text) {
  document.getElementById('sw-headline').value = '';
  document.getElementById('sw-body').value = text;
  document.getElementById('sw-cta').value = '';
  document.getElementById('sw-niche').value = getClient(currentClientId)?.niche || '';
  openNewSwipeModal();
}

// ══════════════════════════════════════════════════════════════
//  CRIATIVO
// ══════════════════════════════════════════════════════════════

async function runCriativo() {
  const produto = document.getElementById('criativo-produto').value.trim();
  if (!produto) { alert('Informe o produto/campanha'); return; }
  const objetivo = document.getElementById('criativo-objetivo').value;
  const publico  = document.getElementById('criativo-publico').value.trim();
  const contexto = document.getElementById('criativo-contexto').value.trim();

  const btn = document.getElementById('btn-criativo');
  btn.disabled = true; btn.textContent = '⏳ Gerando...';
  const res = document.getElementById('criativo-results');
  res.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Criando brief criativo...</div>`;

  const prompt = `Produto/Campanha: ${produto}\nObjetivo: ${objetivo}${publico ? '\nPúblico: ' + publico : ''}${contexto ? '\nContexto: ' + contexto : ''}`;

  try {
    const text = await callAI('criativo', prompt);
    saveToHistory('criativo', produto, { text });
    res.innerHTML = `<div class="card fade">
      <div class="agent-result-body" style="padding:0;">${formatAIText(text)}</div>
      <div style="margin-top:12px;">
        <button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)},this)">📋 Copiar brief</button>
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

const fmtN = (n, d=2) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtR = n => n == null ? '—' : `R$ ${fmtN(n)}`;
const fmtP = n => n == null ? '—' : `${fmtN(n, 1)}%`;
const fmtI = n => n == null ? '—' : Number(n).toLocaleString('pt-BR');

const getAction = (ins, type) => { const a = ins?.data?.[0]?.actions?.find(x => x.action_type === type); return a ? Number(a.value) : null; };
const getCPA    = (ins, type) => { const a = ins?.data?.[0]?.cost_per_action_type?.find(x => x.action_type === type); return a ? Number(a.value) : null; };
const insVal    = (ins, key)  => { const v = ins?.data?.[0]?.[key]; return v != null ? Number(v) : null; };

function badge(status) {
  const labels = { ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado', CAMPAIGN_PAUSED: 'Camp. Pausada' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}
function mcard(label, value, color, sub='') {
  return `<div class="mcard"><div class="lbl">${label}</div><div class="val" style="color:${color}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
function miniCell(k, v) { return `<div class="mini-cell"><div class="mk">${k}</div><div class="mv">${v}</div></div>`; }
function sectionHead(id, title, count) {
  return `<div class="section-head" onclick="toggleSection('${id}')"><span>${title}${count != null ? ` <span style="color:#444">(${count})</span>` : ''}</span><span class="arrow" id="arr-${id}">▼</span></div>`;
}
function toggleSection(id) {
  openSections[id] = !openSections[id];
  const body = document.getElementById(`sec-${id}`), arr = document.getElementById(`arr-${id}`);
  if (body) body.classList.toggle('hidden', !openSections[id]);
  if (arr)  arr.textContent = openSections[id] ? '▲' : '▼';
}
function setProgress(pct, label) {
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent = label;
}

async function mFetch(path, extra = {}) {
  const params = new URLSearchParams({ path, token: META_TOKEN, ...extra });
  const r = await fetch(`/api/meta?${params}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d;
}

async function fetchAll() {
  if (!META_TOKEN) {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('content').classList.add('hidden');
    return;
  }
  document.getElementById('error-wrap').classList.add('hidden');
  document.getElementById('diag-wrap').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('progress-wrap').classList.remove('hidden');
  document.getElementById('content').classList.add('hidden');
  const dp = document.getElementById('date-preset').value;

  try {
    setProgress(15, 'Conectando à API Meta...');

    // Dispara todas as chamadas em paralelo
    const [account, acctIns, campsR, adsetsR, adsR, audiencesR, pixelsR] = await Promise.all([
      mFetch(`${META_ACT}`, { fields: 'name,account_status,currency,timezone_name,amount_spent,balance' }),
      mFetch(`${META_ACT}/insights`, { fields: INSIGHT_FIELDS, date_preset: dp, level: 'account' }),
      mFetch(`${META_ACT}/campaigns`, {
        fields: `id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,insights.date_preset(${dp}){${INSIGHT_FIELDS}}`, limit: 50,
      }),
      mFetch(`${META_ACT}/adsets`, {
        fields: `id,name,status,campaign_id,targeting,daily_budget,optimization_goal,insights.date_preset(${dp}){${INSIGHT_FIELDS}}`, limit: 100,
      }),
      mFetch(`${META_ACT}/ads`, {
        fields: `id,name,status,adset_id,campaign_id,creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type},insights.date_preset(${dp}){${INSIGHT_FIELDS}}`, limit: 100,
      }),
      mFetch(`${META_ACT}/customaudiences`, { fields: 'id,name,subtype,approximate_count_lower_bound', limit: 50 }).catch(() => ({ data: [] })),
      mFetch(`${META_ACT}/adspixels`, { fields: 'id,name,last_fired_time', limit: 10 }).catch(() => ({ data: [] })),
    ]);

    setProgress(100, 'Concluído ✓');
    await new Promise(r => setTimeout(r, 150));

    const data = {
      account, acctIns,
      camps: campsR.data || [],
      adsets: adsetsR.data || [],
      ads: adsR.data || [],
      audiences: audiencesR.data || [],
      pixels: pixelsR.data || [],
      dp,
    };
    renderAll(data);
    runDiagnostico(data);
  } catch (e) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('progress-wrap').classList.add('hidden');
    const eb = document.getElementById('error-wrap');
    eb.classList.remove('hidden');
    eb.innerHTML = `<div class="error-box"><strong>Erro na API Meta:</strong> ${e.message}<small>Verifique o token e Ad Account ID no perfil do cliente.</small></div>`;
  }
}

function renderAll(d) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('progress-wrap').classList.add('hidden');

  // Dot row
  document.getElementById('dot-row').innerHTML = d.camps.slice(0, 8).map(c => {
    const col = c.status === 'ACTIVE' ? '#5bad85' : c.status === 'PAUSED' ? '#d4956a' : '#333';
    return `<div class="dot" style="background:${col}" title="${c.name}"></div>`;
  }).join('');

  const ai = d.acctIns;
  const spend  = insVal(ai, 'spend'),  impr = insVal(ai, 'impressions'), clicks = insVal(ai, 'clicks');
  const reach  = insVal(ai, 'reach'),  ctr  = insVal(ai, 'ctr'),         cpc    = insVal(ai, 'cpm');
  const cpm    = insVal(ai, 'cpm'),    freq = insVal(ai, 'frequency'),    cpcR   = insVal(ai, 'cpc');
  const purchases = getAction(ai, 'purchase'), leads   = getAction(ai, 'lead');
  const addCart   = getAction(ai, 'add_to_cart'), viewC = getAction(ai, 'view_content');
  const cpPurch   = getCPA(ai, 'purchase'),  cpLead = getCPA(ai, 'lead');
  const amtSpent  = d.account.amount_spent ? Number(d.account.amount_spent) / 100 : null;

  // Save metrics for chat + report
  lastMetrics = {
    spend, impressions: impr, clicks, reach, ctr, cpc: cpcR, cpm, frequency: freq,
    purchases, leads, addToCart: addCart, cpPurchase: cpPurch, cpLead,
    activeCampaigns: d.camps.filter(c => c.status === 'ACTIVE').length,
    totalCampaigns: d.camps.length,
    campaigns: d.camps.map(c => ({
      name: c.name, status: c.status, objective: c.objective,
      spend: insVal(c.insights, 'spend'), ctr: insVal(c.insights, 'ctr'),
      cpc: insVal(c.insights, 'cpc'), frequency: insVal(c.insights, 'frequency'),
    })),
  };
  updateChatInfo();
  checkRelatorioReady();

  const ctrCol  = ctr > 1.5 ? '#5bad85' : ctr > 0.8 ? '#d4956a' : '#e07070';
  const freqCol = freq > 3.5 ? '#e07070' : freq > 2 ? '#d4956a' : '#5bad85';

  let html = '';

  // CONTA
  html += sectionHead('account', 'Visão Geral da Conta');
  html += `<div id="sec-account" class="section-body">
    <div class="grid">
      ${mcard('Gasto', fmtR(spend), 'var(--acc)')}
      ${mcard('Impressões', fmtI(impr), '#6a9e8e')}
      ${mcard('Cliques', fmtI(clicks), '#9b7dbf')}
      ${mcard('Alcance', fmtI(reach), '#6a8eb5')}
      ${mcard('CTR', fmtP(ctr), ctrCol)}
      ${mcard('CPC', fmtR(cpcR), '#b86e6e')}
      ${mcard('CPM', fmtR(cpm), '#8e8e6a')}
      ${mcard('Frequência', fmtN(freq, 1), freqCol)}
    </div>`;

  const convCards = [
    purchases != null ? mcard('Compras', purchases, '#5bad85', cpPurch ? `CPA: ${fmtR(cpPurch)}` : '') : '',
    leads != null     ? mcard('Leads', leads, '#6a9e8e', cpLead ? `CPL: ${fmtR(cpLead)}` : '') : '',
    addCart != null   ? mcard('Add to Cart', addCart, '#9b7dbf') : '',
    viewC != null     ? mcard('View Content', fmtI(viewC), '#6a8eb5') : '',
  ].filter(Boolean);
  if (convCards.length) html += `<div style="font-size:10px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase;margin-bottom:8px;">Eventos de Conversão</div><div class="grid">${convCards.join('')}</div>`;

  html += `<div class="grid-sm">
    ${[['Moeda', d.account.currency], ['Fuso', d.account.timezone_name],
       ['Status conta', d.account.account_status === 1 ? '✓ Ativa' : '⚠ Restrita'],
       ['Gasto histórico', amtSpent ? fmtR(amtSpent) : '—'],
       ['Pixels', d.pixels.length], ['Públicos custom', d.audiences.length]
    ].map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
  </div></div>`;

  // PIXELS
  if (d.pixels.length) {
    html += `<div style="margin-bottom:20px;"><div style="font-size:10px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase;margin-bottom:10px;">Pixel</div>`;
    d.pixels.forEach(px => {
      const lf = px.last_fired_time ? new Date(px.last_fired_time).toLocaleDateString('pt-BR') : null;
      html += `<div class="pixel-row"><div style="font-size:18px;">◈</div>
        <div style="flex:1"><div style="font-size:13px;">${px.name}</div><div style="font-size:11px;color:var(--dim);font-family:monospace;">ID: ${px.id}</div></div>
        <div style="text-align:right"><div style="font-size:11px;color:var(--dim);">Último disparo</div><div style="font-size:12px;color:${lf ? '#5bad85' : '#e07070'};font-family:monospace;">${lf || 'Nunca'}</div></div>
      </div>`;
    });
    html += '</div>';
  }

  // CAMPANHAS
  html += sectionHead('campaigns', 'Campanhas + Análise IA', d.camps.length);
  html += `<div id="sec-campaigns" class="section-body">`;
  if (!d.camps.length) html += `<div style="color:var(--dim);font-size:13px;">Nenhuma campanha encontrada.</div>`;
  d.camps.forEach((c, idx) => {
    const ci  = c.insights;
    const cs  = insVal(ci, 'spend'), cc = insVal(ci, 'ctr'), ccp = insVal(ci, 'cpc');
    const ci2 = insVal(ci, 'impressions'), cf = insVal(ci, 'frequency');
    const cp  = getAction(ci, 'purchase'), cl = getAction(ci, 'lead');
    const cpa = getCPA(ci, 'purchase') || getCPA(ci, 'lead');
    const campData = JSON.stringify({ name: c.name, status: c.status, objective: c.objective, spend: cs, ctr: cc, cpc: ccp, impressions: ci2, frequency: cf, purchases: cp, leads: cl, cpa, budget_daily: c.daily_budget ? Number(c.daily_budget)/100 : null, budget_remaining: c.budget_remaining ? Number(c.budget_remaining)/100 : null });

    html += `<div class="camp-card">
      <div class="camp-head">
        <div><div class="camp-name">${c.name}</div><div class="camp-meta">${badge(c.status)}<span style="font-size:11px;color:var(--dim);font-family:monospace;">${c.objective || ''}</span></div></div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="camp-spend">${fmtR(cs)}</div>
          <button class="camp-ai-btn" onclick="analyzeCampaign('camp-ai-${idx}',this,${campData.replace(/'/g,"\\'")})" >🤖 Analisar IA</button>
        </div>
      </div>
      <div class="mini-grid">
        ${miniCell('Impressões', fmtI(ci2))}${miniCell('CTR', fmtP(cc))}${miniCell('CPC', fmtR(ccp))}${miniCell('Freq.', fmtN(cf, 1))}
        ${cp != null ? miniCell('Compras', cp) : ''}${cl != null ? miniCell('Leads', cl) : ''}${cpa != null ? miniCell('CPA', fmtR(cpa)) : ''}
      </div>
      ${c.daily_budget || c.lifetime_budget ? `<div style="margin-top:8px;font-size:11px;color:var(--dim);font-family:monospace;">${c.daily_budget ? `Budget diário: ${fmtR(Number(c.daily_budget)/100)}` : ''}${c.lifetime_budget ? ` Budget total: ${fmtR(Number(c.lifetime_budget)/100)}` : ''}${c.budget_remaining ? ` · Restante: ${fmtR(Number(c.budget_remaining)/100)}` : ''}</div>` : ''}
      <div class="camp-ai-result" id="camp-ai-${idx}"></div>
    </div>`;
  });
  html += '</div>';

  // CONJUNTOS
  html += sectionHead('adsets', 'Conjuntos de Anúncios', d.adsets.length);
  html += `<div id="sec-adsets" class="section-body hidden">`;
  d.adsets.forEach(as => {
    const ai2 = as.insights;
    const as_s = insVal(ai2,'spend'), as_ctr = insVal(ai2,'ctr'), as_cpc = insVal(ai2,'cpc');
    const as_i = insVal(ai2,'impressions'), as_f = insVal(ai2,'frequency');
    const as_p = getAction(ai2,'purchase'), as_l = getAction(ai2,'lead');
    const t = as.targeting || {};
    const ages = (t.age_min || t.age_max) ? `${t.age_min || '—'}–${t.age_max || '—'} anos` : '';
    const genders = t.genders ? (t.genders.includes(1) && t.genders.includes(2) ? 'M+F' : t.genders.includes(1) ? 'Masc' : 'Fem') : 'Todos';
    const interests = t.flexible_spec?.[0]?.interests?.slice(0,5) || [];
    const geo = t.geo_locations?.countries?.join(', ') || t.geo_locations?.cities?.map(x=>x.name).join(', ') || '';
    html += `<div class="camp-card">
      <div class="camp-head">
        <div><div class="camp-name">${as.name}</div><div class="camp-meta">${badge(as.status)}<span style="font-size:11px;color:var(--dim);font-family:monospace;">${as.optimization_goal||''}</span>${ages?`<span style="font-size:11px;color:var(--dim);">· ${ages}</span>`:''}<span style="font-size:11px;color:var(--dim);">· ${genders}</span></div></div>
        <div class="camp-spend" style="font-size:14px;">${fmtR(as_s)}</div>
      </div>
      <div class="mini-grid">${miniCell('CTR',fmtP(as_ctr))}${miniCell('CPC',fmtR(as_cpc))}${miniCell('Impr.',fmtI(as_i))}${miniCell('Freq.',fmtN(as_f,1))}${as_p!=null?miniCell('Compras',as_p):''}${as_l!=null?miniCell('Leads',as_l):''}</div>
      ${geo?`<div style="margin-top:6px;font-size:11px;color:#3a3a3a;font-family:monospace;">📍 ${geo}</div>`:''}
      ${interests.length?`<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">${interests.map(i=>`<span class="tag">${i.name}</span>`).join('')}</div>`:''}
    </div>`;
  });
  html += '</div>';

  // ANÚNCIOS
  html += sectionHead('ads', 'Anúncios', d.ads.length);
  html += `<div id="sec-ads" class="section-body hidden">`;
  d.ads.forEach(ad => {
    const adi = ad.insights;
    const ad_s=insVal(adi,'spend'),ad_ctr=insVal(adi,'ctr'),ad_cpc=insVal(adi,'cpc');
    const ad_i=insVal(adi,'impressions'),ad_f=insVal(adi,'frequency');
    const ad_p=getAction(adi,'purchase'),ad_l=getAction(adi,'lead');
    const cr = ad.creative || {};
    html += `<div class="ad-card">
      <div class="ad-row">
        ${cr.thumbnail_url?`<img class="ad-thumb" src="${cr.thumbnail_url}" onerror="this.style.display='none'" alt=""/>` : ''}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;"><div style="font-size:12.5px;line-height:1.3;">${ad.name}</div>${badge(ad.status)}</div>
          ${cr.title?`<div style="font-size:11.5px;color:var(--acc);margin-bottom:2px;">${cr.title}</div>`:''}
          ${cr.body?`<div style="font-size:11px;color:var(--dim);line-height:1.45;">${(cr.body||'').slice(0,120)}${(cr.body||'').length>120?'...':''}</div>`:''}
          ${cr.call_to_action_type?`<span class="cta-tag">${cr.call_to_action_type}</span>`:''}
        </div>
      </div>
      <div class="mini-grid" style="margin-top:8px;">${miniCell('Gasto',fmtR(ad_s))}${miniCell('CTR',fmtP(ad_ctr))}${miniCell('CPC',fmtR(ad_cpc))}${miniCell('Impr.',fmtI(ad_i))}${miniCell('Freq.',fmtN(ad_f,1))}${ad_p!=null?miniCell('Compras',ad_p):''}${ad_l!=null?miniCell('Leads',ad_l):''}</div>
    </div>`;
  });
  html += '</div>';

  // PÚBLICOS
  if (d.audiences.length) {
    html += sectionHead('audiences', 'Públicos Personalizados', d.audiences.length);
    html += `<div id="sec-audiences" class="section-body hidden">`;
    d.audiences.forEach(au => {
      html += `<div class="aud-row"><div><div style="font-size:13px;">${au.name}</div><div style="font-size:11px;color:var(--dim);font-family:monospace;">${au.subtype}</div></div>
        <div style="text-align:right;"><div style="font-size:12px;color:#6a8eb5;font-family:monospace;">${au.approximate_count_lower_bound?Number(au.approximate_count_lower_bound).toLocaleString('pt-BR')+'+':'—'}</div><div style="font-size:10px;color:var(--dim);">pessoas</div></div></div>`;
    });
    html += '</div>';
  }

  document.getElementById('content').innerHTML = html;
  document.getElementById('content').classList.remove('hidden');
  Object.entries(openSections).forEach(([id, open]) => {
    const el = document.getElementById(`sec-${id}`), arr = document.getElementById(`arr-${id}`);
    if (el) el.classList.toggle('hidden', !open);
    if (arr) arr.textContent = open ? '▲' : '▼';
  });
}

// ── DIAGNÓSTICO AUTOMÁTICO ────────────────────────────────────
async function runDiagnostico(d) {
  const wrap = document.getElementById('diag-wrap');
  if (!wrap) return;
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="diag-bar" style="background:#0d0d0d;border-color:#1a1a1a;"><div class="ai-spinner"></div><div class="diag-body" style="color:var(--dim);font-size:12px;">Analisando saúde da conta...</div></div>`;

  try {
    const text = await callAI('diagnostico', 'Analise a conta com os dados fornecidos.');
    const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
    const statusMatch = text.match(/STATUS:\s*(\w+)/i);
    const score  = scoreMatch  ? parseInt(scoreMatch[1])  : 50;
    const status = statusMatch ? statusMatch[1].toUpperCase() : 'ATENÇÃO';

    const cls   = status === 'SAUDÁVEL' ? 'diag-saudavel' : status === 'CRÍTICO' ? 'diag-critico' : 'diag-atencao';
    const color = status === 'SAUDÁVEL' ? 'var(--green)'  : status === 'CRÍTICO' ? 'var(--red)'   : 'var(--acc)';
    const body  = text.replace(/SCORE:.*\n?/i,'').replace(/STATUS:.*\n?/i,'').trim();

    wrap.innerHTML = `<div class="diag-bar ${cls}">
      <div class="diag-score" style="color:${color};">${score}</div>
      <div class="diag-body">
        <div class="diag-status" style="color:${color};">${status}</div>
        <div class="diag-text">${formatAIText(body)}</div>
      </div>
      <button class="btn-copy btn-sm" onclick="copyToClipboard(${JSON.stringify(text)},this)" style="flex-shrink:0;">Copiar</button>
    </div>`;
  } catch (e) {
    wrap.innerHTML = '';
  }
}

// ── CAMPAIGN AI ANALYSIS ──────────────────────────────────────
async function analyzeCampaign(resultId, btn, campData) {
  const el = document.getElementById(resultId);
  if (!el) return;
  btn.disabled = true; btn.textContent = '⏳';
  el.style.display = 'block';
  el.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Analisando campanha...</div>`;

  const prompt = `Analise esta campanha do Meta Ads:
Nome: ${campData.name}
Status: ${campData.status} | Objetivo: ${campData.objective || 'N/A'}
Gasto: ${campData.spend != null ? 'R$'+campData.spend.toFixed(2) : '—'}
CTR: ${campData.ctr != null ? campData.ctr.toFixed(2)+'%' : '—'} | CPC: ${campData.cpc != null ? 'R$'+campData.cpc.toFixed(2) : '—'}
Frequência: ${campData.frequency != null ? campData.frequency.toFixed(1) : '—'}
Impressões: ${campData.impressions != null ? campData.impressions.toLocaleString('pt-BR') : '—'}
Compras: ${campData.purchases ?? '—'} | Leads: ${campData.leads ?? '—'} | CPA: ${campData.cpa != null ? 'R$'+campData.cpa.toFixed(2) : '—'}
Budget diário: ${campData.budget_daily != null ? 'R$'+campData.budget_daily.toFixed(2) : 'N/A'} | Restante: ${campData.budget_remaining != null ? 'R$'+campData.budget_remaining.toFixed(2) : '—'}`;

  try {
    const text = await callAI('analista', prompt);
    el.innerHTML = formatAIText(text);
    el.innerHTML += `<div style="margin-top:10px;display:flex;gap:8px;"><button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(text)},this)">📋 Copiar análise</button></div>`;
    saveToHistory('analise', campData.name, { text });
  } catch (e) {
    el.innerHTML = `<span style="color:var(--red);">Erro: ${e.message}</span>`;
  }
  btn.disabled = false; btn.textContent = '🤖 Analisar IA';
}

// ══════════════════════════════════════════════════════════════
//  RELATÓRIO
// ══════════════════════════════════════════════════════════════

function checkRelatorioReady() {
  const noData = document.getElementById('relatorio-no-data');
  const form   = document.getElementById('relatorio-form');
  if (!noData || !form) return;
  if (lastMetrics) { noData.classList.add('hidden'); form.classList.remove('hidden'); }
  else             { noData.classList.remove('hidden'); form.classList.add('hidden'); }
}

async function runRelatorio() {
  if (!lastMetrics) { alert('Carregue as métricas primeiro na aba Métricas.'); return; }
  const periodo = document.getElementById('relatorio-periodo').value || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const obs     = document.getElementById('relatorio-obs').value.trim();
  const btn = document.getElementById('btn-relatorio');
  btn.disabled = true; btn.textContent = '⏳ Gerando...';

  const output = document.getElementById('relatorio-output-wrap');
  output.classList.remove('hidden');
  document.getElementById('relatorio-output').innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div>Gerando relatório completo...</div>`;

  const prompt = `Gere um relatório completo para o período: ${periodo}.${obs ? ' Observação: ' + obs : ''}`;
  try {
    const text = await callAI('relatorio', prompt);
    document.getElementById('relatorio-output').innerHTML = formatAIText(text);
    document.getElementById('relatorio-raw').value = text;
    saveToHistory('relatorio', `Relatório ${periodo}`, { text });
  } catch (e) {
    document.getElementById('relatorio-output').innerHTML = `<div class="error-box">${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = '📄 Gerar Relatório Completo';
}

// ══════════════════════════════════════════════════════════════
//  CALCULADORA
// ══════════════════════════════════════════════════════════════

function calcRoas() {
  const spend   = parseFloat(document.getElementById('roas-spend').value)   || 0;
  const revenue = parseFloat(document.getElementById('roas-revenue').value) || 0;
  if (!spend || !revenue) return;
  const roas   = revenue / spend;
  const profit = revenue - spend;
  const pct    = ((profit / spend) * 100).toFixed(1);
  const status = roas >= 4 ? '✅ Excelente' : roas >= 2 ? '⚠️ Aceitável' : '🔴 Abaixo do esperado';
  document.getElementById('roas-result').style.display = 'block';
  document.getElementById('roas-val').textContent    = roas.toFixed(2) + 'x';
  document.getElementById('roas-profit').textContent = `R$ ${profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('roas-pct').textContent    = pct + '%';
  document.getElementById('roas-status').textContent = status;
  document.getElementById('roas-val').style.color    = roas >= 4 ? 'var(--green)' : roas >= 2 ? 'var(--acc)' : 'var(--red)';
}

function calcCpl() {
  const budget = parseFloat(document.getElementById('cpl-budget').value) || 0;
  const alvo   = parseFloat(document.getElementById('cpl-alvo').value)   || 0;
  const conv   = parseFloat(document.getElementById('cpl-conv').value)   || 0;
  if (!budget || !alvo) return;
  const leads   = Math.floor(budget / alvo);
  const clients = conv ? Math.floor(leads * conv / 100) : '—';
  const cplReal = (budget / Math.max(leads, 1)).toFixed(2);
  document.getElementById('cpl-result').style.display = 'block';
  document.getElementById('cpl-leads').textContent   = leads.toLocaleString('pt-BR');
  document.getElementById('cpl-clients').textContent = typeof clients === 'number' ? clients.toLocaleString('pt-BR') : '—';
  document.getElementById('cpl-real').textContent    = `R$ ${cplReal}`;
}

function calcBreakeven() {
  const ticket = parseFloat(document.getElementById('be-ticket').value)  || 0;
  const margin = parseFloat(document.getElementById('be-margin').value)  || 0;
  const spend  = parseFloat(document.getElementById('be-spend').value)   || 0;
  if (!ticket || !margin || !spend) return;
  const lucroUnit  = ticket * (margin / 100);
  const vendas     = Math.ceil(spend / lucroUnit);
  const cpaMax     = lucroUnit.toFixed(2);
  const roasMin    = (spend / (vendas * ticket) > 0 ? (vendas * ticket / spend) : 0).toFixed(2);
  document.getElementById('be-result').style.display = 'block';
  document.getElementById('be-vendas').textContent   = vendas.toLocaleString('pt-BR');
  document.getElementById('be-cpa-max').textContent  = `R$ ${cpaMax}`;
  document.getElementById('be-roas-min').textContent = roasMin + 'x';
}

function calcEscala() {
  const spend    = parseFloat(document.getElementById('esc-spend').value)     || 0;
  const revenue  = parseFloat(document.getElementById('esc-revenue').value)   || 0;
  const conv     = parseFloat(document.getElementById('esc-conv').value)      || 0;
  const newSpend = parseFloat(document.getElementById('esc-new-spend').value) || 0;
  if (!spend || !revenue || !newSpend) return;
  const roas      = revenue / spend;
  const projRev   = newSpend * roas;
  const projConv  = conv ? Math.round(conv * (newSpend / spend)) : '—';
  const increase  = (((newSpend - spend) / spend) * 100).toFixed(0);
  document.getElementById('esc-result').style.display = 'block';
  document.getElementById('esc-proj-rev').textContent  = `R$ ${projRev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('esc-proj-conv').textContent = typeof projConv === 'number' ? projConv.toLocaleString('pt-BR') : '—';
  document.getElementById('esc-roas').textContent      = roas.toFixed(2) + 'x';
  document.getElementById('esc-pct').textContent       = '+' + increase + '%';
}

// ══════════════════════════════════════════════════════════════
//  SWIPE FILE
// ══════════════════════════════════════════════════════════════

function renderSwipe() {
  const filters = document.getElementById('swipe-filters');
  const list    = document.getElementById('swipe-list');
  if (!filters || !list) return;

  const niches = ['all', ...new Set(swipeItems.map(s => s.niche).filter(Boolean))];
  filters.innerHTML = niches.map(n =>
    `<button class="swipe-filter-btn ${swipeFilter === n ? 'active' : ''}" onclick="setSwipeFilter('${n}')">${n === 'all' ? 'Todos' : n}</button>`
  ).join('');

  const filtered = swipeFilter === 'all' ? swipeItems : swipeItems.filter(s => s.niche === swipeFilter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="ei">📚</div><p>Nenhum copy salvo ainda.<br>Adicione copies que funcionaram para consultar depois.</p></div>`;
    return;
  }

  const fmtLabel = { feed: 'Feed', stories: 'Stories', reels: 'Reels', carrossel: 'Carrossel' };
  list.innerHTML = filtered.map(s => `
    <div class="swipe-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;">
        <div>
          ${s.niche   ? `<span class="swipe-tag">${s.niche}</span>` : ''}
          ${s.format  ? `<span class="swipe-tag">${fmtLabel[s.format] || s.format}</span>` : ''}
          ${s.result  ? `<span class="swipe-tag" style="color:var(--green);">${s.result}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn-copy btn-sm" onclick="copyToClipboard('${(s.headline + '\n\n' + s.body + '\n\n' + s.cta).replace(/'/g,"\\'")}', this)">Copiar</button>
          <button class="hist-del" onclick="deleteSwipe('${s.id}')">✕</button>
        </div>
      </div>
      ${s.headline ? `<div class="swipe-headline">${s.headline}</div>` : ''}
      ${s.body     ? `<div class="swipe-body">${s.body}</div>` : ''}
      ${s.cta      ? `<div class="swipe-cta">CTA: ${s.cta}</div>` : ''}
    </div>`).join('');
}

function setSwipeFilter(f) { swipeFilter = f; renderSwipe(); }

function openNewSwipeModal() {
  document.getElementById('modal-swipe-title').textContent = 'Adicionar ao Swipe File';
  document.getElementById('modal-swipe-id').value = '';
  // Only clear if not pre-filled from rapido
  if (!document.getElementById('sw-body').value) {
    ['sw-headline','sw-body','sw-cta','sw-niche','sw-result'].forEach(id => document.getElementById(id).value = '');
  }
  document.getElementById('sw-format').value = 'feed';
  document.getElementById('modal-swipe').classList.remove('hidden');
}

function closeSwipeModal() { document.getElementById('modal-swipe').classList.add('hidden'); }

function saveSwipe() {
  const headline = document.getElementById('sw-headline').value.trim();
  const body     = document.getElementById('sw-body').value.trim();
  if (!headline && !body) { alert('Adicione pelo menos a headline ou o texto'); return; }

  const item = {
    id:       Date.now().toString(),
    headline, body,
    cta:      document.getElementById('sw-cta').value.trim(),
    niche:    document.getElementById('sw-niche').value.trim(),
    format:   document.getElementById('sw-format').value,
    result:   document.getElementById('sw-result').value.trim(),
    createdAt: new Date().toISOString(),
  };
  swipeItems.unshift(item);
  saveSwipeData();
  closeSwipeModal();
  ['sw-headline','sw-body','sw-cta','sw-niche','sw-result'].forEach(id => document.getElementById(id).value = '');
  renderSwipe();
}

function deleteSwipe(id) {
  swipeItems = swipeItems.filter(s => s.id !== id);
  saveSwipeData();
  renderSwipe();
}

// ══════════════════════════════════════════════════════════════
//  HISTÓRICO
// ══════════════════════════════════════════════════════════════

function renderHistorico() {
  const el = document.getElementById('historico-list');
  if (!el) return;
  if (!historyItems.length) {
    el.innerHTML = `<div class="empty-state"><div class="ei">🕓</div><p>Nenhum conteúdo gerado ainda.</p></div>`;
    return;
  }
  const typeLabel = { pipeline: '🚀 Pipeline', rapido: '⚡ Rápido', criativo: '🎨 Criativo', analise: '🤖 Análise', relatorio: '📄 Relatório' };
  el.innerHTML = historyItems.map(item => `
    <div class="hist-item" onclick="openHistItem('${item.id}')">
      <span class="hist-type">${typeLabel[item.type] || item.type}</span>
      <span class="hist-title">${item.title}</span>
      <span style="font-size:11px;color:#333;font-family:monospace;">${item.clientName}</span>
      <span class="hist-date">${new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
      <button class="hist-del" onclick="event.stopPropagation();deleteHistItem('${item.id}')">✕</button>
    </div>`).join('');
}

function openHistItem(id) {
  const item = historyItems.find(h => h.id === id);
  if (!item) return;
  document.getElementById('modal-hist-title').textContent = item.title;
  let body = '';
  if (item.type === 'pipeline') {
    PIPELINE_AGENTS.forEach(a => {
      if (item.content[a.id]) {
        body += `<div style="font-size:10px;letter-spacing:.2em;color:var(--acc);text-transform:uppercase;margin:16px 0 6px;">${a.icon} ${a.label}</div>`;
        body += formatAIText(item.content[a.id]) + '<br>';
      }
    });
  } else {
    body = formatAIText(item.content?.text || JSON.stringify(item.content));
  }
  const raw = item.type === 'pipeline'
    ? PIPELINE_AGENTS.map(a => item.content[a.id] ? `=== ${a.label} ===\n${item.content[a.id]}` : '').filter(Boolean).join('\n\n')
    : (item.content?.text || '');
  document.getElementById('modal-hist-body').innerHTML =
    body + `<div style="margin-top:16px;"><button class="btn-copy" onclick="copyToClipboard(${JSON.stringify(raw)},this)">📋 Copiar tudo</button></div>`;
  document.getElementById('modal-hist').classList.remove('hidden');
}

function closeHistModal() { document.getElementById('modal-hist').classList.add('hidden'); }

function deleteHistItem(id) {
  historyItems = historyItems.filter(h => h.id !== id);
  saveHistory(); renderHistorico();
}

function clearHistory() {
  if (!confirm('Limpar todo o histórico?')) return;
  historyItems = []; saveHistory(); renderHistorico();
}

// ══════════════════════════════════════════════════════════════
//  PERFIS
// ══════════════════════════════════════════════════════════════

function renderPerfis() {
  const el = document.getElementById('perfis-list');
  if (!el) return;
  if (!clients.length) {
    el.innerHTML = `<div class="empty-state"><div class="ei">⚙</div><p>Nenhum cliente cadastrado ainda.</p></div>`;
    return;
  }
  const typeLabel = { ecommerce:'E-commerce', b2b:'B2B', local:'Local', infoproduto:'Infoproduto', saas:'SaaS' };
  el.innerHTML = clients.map(c => `
    <div class="profile-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <div class="profile-name">${c.name}${currentClientId === c.id ? ' <span style="font-size:11px;color:var(--green);">● ativo</span>' : ''}</div>
          <div class="profile-meta">${typeLabel[c.businessType]||''}${c.niche?' · '+c.niche:''}${c.budget?' · '+c.budget:''}</div>
          ${c.tone?`<div style="font-size:12px;color:#555;margin-bottom:8px;line-height:1.5;">${c.tone.slice(0,100)}${c.tone.length>100?'...':''}</div>`:''}
          ${c.metaAdAccount?`<div style="font-size:11px;font-family:monospace;color:#333;">Meta: ${c.metaAdAccount}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn-secondary btn-sm" onclick="openEditClientModal('${c.id}')">Editar</button>
          <button style="padding:5px 12px;background:#130707;border:1px solid #2a1010;color:#6b3030;font-size:11px;border-radius:6px;" onclick="deleteClient('${c.id}')">Excluir</button>
        </div>
      </div>
      <div style="margin-top:10px;">
        <button class="camp-ai-btn" onclick="selectClient('${c.id}')" style="font-size:12px;padding:6px 14px;">Selecionar cliente</button>
      </div>
    </div>`).join('');
}

function selectClient(id) {
  loadClientIntoState(id);
  renderClientSelect(); updateToneBars(); updateChatInfo();
  renderPerfis();
  switchTab('chat');
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
  document.getElementById('mc-name').value    = c.name || '';
  document.getElementById('mc-niche').value   = c.niche || '';
  document.getElementById('mc-type').value    = c.businessType || 'ecommerce';
  document.getElementById('mc-tone').value    = c.tone || '';
  document.getElementById('mc-budget').value  = c.budget || '';
  document.getElementById('mc-objective').value = c.objective || 'vendas';
  document.getElementById('mc-token').value   = c.metaToken || '';
  document.getElementById('mc-account').value = c.metaAdAccount || '';
  document.getElementById('modal-client').classList.remove('hidden');
}

function closeClientModal() { document.getElementById('modal-client').classList.add('hidden'); }

function saveClient() {
  const name = document.getElementById('mc-name').value.trim();
  if (!name) { alert('Nome é obrigatório'); return; }
  const id = document.getElementById('modal-client-id').value || Date.now().toString();
  const client = {
    id, name,
    niche:         document.getElementById('mc-niche').value.trim(),
    businessType:  document.getElementById('mc-type').value,
    tone:          document.getElementById('mc-tone').value.trim(),
    budget:        document.getElementById('mc-budget').value.trim(),
    objective:     document.getElementById('mc-objective').value,
    metaToken:     document.getElementById('mc-token').value.trim(),
    metaAdAccount: document.getElementById('mc-account').value.trim(),
  };
  const idx = clients.findIndex(c => c.id === id);
  if (idx >= 0) clients[idx] = client; else clients.push(client);
  saveClients();
  closeClientModal();
  renderClientSelect(); renderPerfis();
  if (clients.length === 1) { loadClientIntoState(id); renderClientSelect(); updateToneBars(); updateChatInfo(); }
}

function deleteClient(id) {
  if (!confirm('Excluir este cliente?')) return;
  clients = clients.filter(c => c.id !== id);
  saveClients();
  if (currentClientId === id) { currentClientId = null; localStorage.removeItem('arena_current_client'); META_TOKEN = ''; META_ACT = ''; }
  renderClientSelect(); renderPerfis(); updateToneBars(); updateChatInfo();
}

// ── CLOSE MODALS ON OVERLAY CLICK ─────────────────────────────
['modal-client','modal-hist','modal-swipe'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', function(e) {
    if (e.target === this) {
      if (id === 'modal-client') closeClientModal();
      else if (id === 'modal-hist') closeHistModal();
      else if (id === 'modal-swipe') closeSwipeModal();
    }
  });
});
