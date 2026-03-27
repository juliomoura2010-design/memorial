// ══════════════════════════════════════════════════════════
// CONFIG — preenchida pelo usuário no setup
// ══════════════════════════════════════════════════════════
let SB_URL = '';
let SB_KEY = '';
let ADMIN_PASS = '';
let isAdmin = false;
let fabOpen = false;

const SQL_SETUP = `
-- Tabela de configurações
create table if not exists memorial_config (
  id bigint primary key default 1,
  name text default 'Nome da Pessoa Amada',
  dates text default '',
  quote text default '',
  hero_photo text default '',
  admin_pass text default 'admin123',
  constraint single_row check (id = 1)
);
insert into memorial_config (id) values (1) on conflict do nothing;

-- Tabela de memórias (fotos e vídeos)
create table if not exists memorial_memories (
  id bigint generated always as identity primary key,
  type text not null,
  file_url text not null,
  caption text default '',
  item_date text default '',
  created_at timestamptz default now()
);

-- Tabela de mensagens
create table if not exists memorial_messages (
  id bigint generated always as identity primary key,
  author text not null,
  message text not null,
  item_date text default '',
  created_at timestamptz default now()
);

-- Tabela de áudios
create table if not exists memorial_audios (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  file_url text not null,
  created_at timestamptz default now()
);

-- Política de acesso público (leitura)
alter table memorial_config enable row level security;
alter table memorial_memories enable row level security;
alter table memorial_messages enable row level security;
alter table memorial_audios enable row level security;

create policy "Leitura pública" on memorial_config for select using (true);
create policy "Escrita pública" on memorial_config for all using (true);
create policy "Leitura pública" on memorial_memories for select using (true);
create policy "Escrita pública" on memorial_memories for all using (true);
create policy "Leitura pública" on memorial_messages for select using (true);
create policy "Escrita pública" on memorial_messages for all using (true);
create policy "Leitura pública" on memorial_audios for select using (true);
create policy "Escrita pública" on memorial_audios for all using (true);
`.trim();

// ══════════════════════════════════════════════════════════
// SUPABASE API
// ══════════════════════════════════════════════════════════
async function sbFetch(path, opts={}) {
  const extraHeaders = opts.headers || {};
  const res = await fetch(SB_URL + path, {
    ...opts,
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...extraHeaders   // permite sobrescrever o Prefer
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbUpload(bucket, path, file, onProgress) {
  // Supabase Storage upload via fetch
  const url = `${SB_URL}/storage/v1/object/${bucket}/${path}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('apikey', SB_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + SB_KEY);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded/e.total*100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(`${SB_URL}/storage/v1/object/public/${bucket}/${path}`);
      } else {
        reject(new Error(xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new Error('Erro de rede'));
    const fd = new FormData();
    fd.append('', file);
    xhr.send(fd);
  });
}

// ══════════════════════════════════════════════════════════
// SETUP
// ══════════════════════════════════════════════════════════
function copySQL() {
  // Método compatível com qualquer contexto (local, HTTP e HTTPS)
  const ta = document.createElement('textarea');
  ta.value = SQL_SETUP;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    document.getElementById('sqlCopied').style.display = 'inline';
    setTimeout(() => document.getElementById('sqlCopied').style.display = 'none', 2500);
  } catch(e) {
    // Fallback: abre modal com o SQL para copiar manualmente
    openSQLModal();
  }
  document.body.removeChild(ta);
}

async function setupMemorial() {
  const url = document.getElementById('sbUrl').value.trim().replace(/\/$/, '');
  const key = document.getElementById('sbKey').value.trim();
  const name = document.getElementById('setupName').value.trim();
  const dates = document.getElementById('setupDates').value.trim();
  const quote = document.getElementById('setupQuote').value.trim();
  const pass = document.getElementById('setupPass').value.trim();

  // Validações com feedback visual inline
  if (!url || !key) { showSetupError('Preencha a URL e a chave do Supabase (Passos 1–5).'); return; }
  if (!url.startsWith('https://')) { showSetupError('A URL deve começar com https://'); return; }
  if (!name) { showSetupError('Digite o nome da pessoa amada.'); return; }
  if (!pass) { showSetupError('Defina uma senha de administrador.'); return; }

  SB_URL = url; SB_KEY = key;

  const btn = document.getElementById('setupBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Conectando...';
  hideSetupError();

  try {
    // Testa conexão primeiro
    const testRes = await fetch(`${SB_URL}/rest/v1/memorial_config?id=eq.1&select=id`, {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    });

    if (!testRes.ok) {
      const txt = await testRes.text();
      if (testRes.status === 401) throw new Error('Chave inválida. Verifique a "anon public key" no Supabase.');
      if (testRes.status === 404) throw new Error('URL inválida ou tabelas não criadas. Execute o SQL (Passo 3).');
      throw new Error(`Erro ${testRes.status}: ${txt.substring(0, 100)}`);
    }

    btn.textContent = '⏳ Salvando dados...';

    // UPSERT — funciona tanto para inserir quanto para atualizar
    await sbFetch('/rest/v1/memorial_config', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: 1, name, dates, quote, admin_pass: pass })
    });

    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);

    btn.textContent = '✓ Memorial criado! Abrindo...';
    setTimeout(() => startApp(), 800);

  } catch(e) {
    btn.disabled = false;
    btn.textContent = '✦ Criar Memorial';
    showSetupError(e.message);
  }
}

function showSetupError(msg) {
  let el = document.getElementById('setupError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'setupError';
    el.style.cssText = 'background:#fff0f0;border:1px solid #e8a0a0;border-radius:4px;padding:12px 16px;font-size:13px;color:#8b2020;line-height:1.5;margin-top:12px';
    document.getElementById('setupBtn').insertAdjacentElement('afterend', el);
  }
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideSetupError() {
  const el = document.getElementById('setupError');
  if (el) el.style.display = 'none';
}

function skipSetup() {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (!url || !key) { notify('Nenhuma configuração salva. Complete o setup.'); return; }
  SB_URL = url; SB_KEY = key;
  startApp();
}

// ══════════════════════════════════════════════════════════
// START APP
// ══════════════════════════════════════════════════════════
async function startApp() {
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';

  try {
    const [config, memories, messages, audios] = await Promise.all([
      sbFetch('/rest/v1/memorial_config?id=eq.1&select=*'),
      sbFetch('/rest/v1/memorial_memories?select=*&order=created_at.asc'),
      sbFetch('/rest/v1/memorial_messages?select=*&order=created_at.asc'),
      sbFetch('/rest/v1/memorial_audios?select=*&order=created_at.asc')
    ]);

    ADMIN_PASS = config[0]?.admin_pass || 'admin123';

    // Render hero
    const cfg = config[0] || {};
    document.getElementById('heroName').textContent = cfg.name || '—';
    document.getElementById('heroDates').textContent = cfg.dates || '';
    document.getElementById('heroQuote').textContent = cfg.quote || '';
    document.getElementById('footerName').textContent = cfg.name || '—';

    if (cfg.hero_photo) {
      document.getElementById('heroImg').src = cfg.hero_photo;
      document.getElementById('heroImg').style.display = 'block';
      document.getElementById('heroPlaceholder').style.display = 'none';
    }

    // Render content
    memories.forEach(renderMemory);
    messages.forEach(renderMessage);
    audios.forEach(renderAudio);

    updateEmpty('memoriesEmpty', memories.length);
    updateEmpty('messagesEmpty', messages.length);
    updateEmpty('audiosEmpty', audios.length);

    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('memorialApp').style.display = 'block';
    initScrollReveal();

  } catch(e) {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loadingScreen').innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-soft)">
        <p style="font-family:'Cormorant Garamond',serif;font-size:20px;font-style:italic;margin-bottom:16px">
          Erro ao conectar ao banco de dados
        </p>
        <p style="font-size:12px;margin-bottom:20px">${e.message.substring(0,120)}</p>
        <button onclick="document.getElementById('loadingScreen').style.display='none';document.getElementById('setupScreen').style.display='flex'" 
          style="background:var(--gold);border:none;padding:10px 24px;border-radius:3px;cursor:pointer;font-family:'Jost',sans-serif;font-size:12px;letter-spacing:.15em;text-transform:uppercase">
          ← Voltar ao Setup
        </button>
      </div>`;
    document.getElementById('loadingScreen').style.display = 'flex';
  }
}

// ══════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════
function loginAdmin() {
  const pass = document.getElementById('loginPass').value;
  if (pass === ADMIN_PASS) {
    isAdmin = true;
    document.body.classList.add('admin-mode');
    document.getElementById('adminBar').classList.add('visible');
    document.getElementById('fabArea').style.display = 'block';
    document.getElementById('adminToggleBtn').style.display = 'none';
    document.getElementById('heroPlaceholderText').textContent = 'Clique p/ foto';
    closeModal('loginModal');
    notify('Bem-vindo, admin ✦');
  } else {
    notify('Senha incorreta');
  }
}

function logoutAdmin() {
  isAdmin = false;
  document.body.classList.remove('admin-mode');
  document.getElementById('adminBar').classList.remove('visible');
  document.getElementById('fabArea').style.display = 'none';
  document.getElementById('adminToggleBtn').style.display = 'flex';
  document.getElementById('heroPlaceholderText').textContent = 'Foto';
  closeFab();
  notify('Saiu do modo admin');
}

// ══════════════════════════════════════════════════════════
// HERO EDIT
// ══════════════════════════════════════════════════════════
function openHeroEdit() {
  document.getElementById('editName').value = document.getElementById('heroName').textContent;
  document.getElementById('editDates').value = document.getElementById('heroDates').textContent;
  document.getElementById('editQuote').value = document.getElementById('heroQuote').textContent;
  openModal('heroEditModal');
}

async function saveHeroInfo() {
  const name = document.getElementById('editName').value.trim();
  const dates = document.getElementById('editDates').value.trim();
  const quote = document.getElementById('editQuote').value.trim();
  const heroFile = document.getElementById('editHeroFile').files[0];

  let hero_photo = undefined;

  if (heroFile) {
    showUploadStatus('Enviando foto...');
    try {
      const path = `hero_${Date.now()}.${heroFile.name.split('.').pop()}`;
      hero_photo = await sbUpload('memorial-media', path, heroFile, null);
    } catch(e) {
      notify('Erro ao enviar foto: ' + e.message.substring(0,60));
      hideUploadStatus();
      return;
    }
    hideUploadStatus();
  }

  const body = { name, dates, quote };
  if (hero_photo) body.hero_photo = hero_photo;

  try {
    await sbFetch('/rest/v1/memorial_config?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    document.getElementById('heroName').textContent = name;
    document.getElementById('heroDates').textContent = dates;
    document.getElementById('heroQuote').textContent = quote;
    document.getElementById('footerName').textContent = name;
    if (hero_photo) {
      document.getElementById('heroImg').src = hero_photo;
      document.getElementById('heroImg').style.display = 'block';
      document.getElementById('heroPlaceholder').style.display = 'none';
    }
    closeModal('heroEditModal');
    notify('Memorial atualizado ✦');
  } catch(e) {
    notify('Erro: ' + e.message.substring(0,80));
  }
}

async function uploadHeroPhoto(input) {
  if (!isAdmin || !input.files[0]) return;
  const file = input.files[0];
  showUploadStatus('Enviando foto principal...');
  try {
    const path = `hero_${Date.now()}.${file.name.split('.').pop()}`;
    const url = await sbUpload('memorial-media', path, file, null);
    await sbFetch('/rest/v1/memorial_config?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify({ hero_photo: url })
    });
    document.getElementById('heroImg').src = url;
    document.getElementById('heroImg').style.display = 'block';
    document.getElementById('heroPlaceholder').style.display = 'none';
    hideUploadStatus();
    notify('Foto principal atualizada ✦');
  } catch(e) {
    hideUploadStatus();
    notify('Erro: ' + e.message.substring(0,80));
  }
}

// ══════════════════════════════════════════════════════════
// ADD PHOTO
// ══════════════════════════════════════════════════════════
async function addPhoto() {
  const file = document.getElementById('photoFile').files[0];
  if (!file) { notify('Selecione uma imagem'); return; }
  const caption = document.getElementById('photoCaption').value.trim();
  const item_date = document.getElementById('photoDate').value;

  setBtn('photoBtnSave', true);
  showProgress('photoProgress');

  try {
    const path = `photo_${Date.now()}.${file.name.split('.').pop()}`;
    const url = await sbUpload('memorial-media', path, file, p => updateProgress('photoProgressFill','photoProgressText', p));
    const [rec] = await sbFetch('/rest/v1/memorial_memories', {
      method: 'POST',
      body: JSON.stringify({ type:'photo', file_url:url, caption, item_date })
    });
    renderMemory(rec);
    updateEmpty('memoriesEmpty', 1);
    closeModal('photoModal');
    resetFields(['photoFile','photoCaption','photoDate'], ['photoPreview']);
    hideProgress('photoProgress');
    notify('Foto adicionada ✦');
  } catch(e) {
    notify('Erro: ' + e.message.substring(0,80));
    hideProgress('photoProgress');
  }
  setBtn('photoBtnSave', false);
}

// ══════════════════════════════════════════════════════════
// ADD VIDEO
// ══════════════════════════════════════════════════════════
async function addVideo() {
  const file = document.getElementById('videoFile').files[0];
  if (!file) { notify('Selecione um vídeo'); return; }
  const caption = document.getElementById('videoCaption').value.trim();
  const item_date = document.getElementById('videoDate').value;

  setBtn('videoBtnSave', true);
  showProgress('videoProgress');

  try {
    const path = `video_${Date.now()}.${file.name.split('.').pop()}`;
    const url = await sbUpload('memorial-media', path, file, p => updateProgress('videoProgressFill','videoProgressText', p));
    const [rec] = await sbFetch('/rest/v1/memorial_memories', {
      method: 'POST',
      body: JSON.stringify({ type:'video', file_url:url, caption, item_date })
    });
    renderMemory(rec);
    updateEmpty('memoriesEmpty', 1);
    closeModal('videoModal');
    resetFields(['videoFile','videoCaption','videoDate'], ['videoPreview']);
    hideProgress('videoProgress');
    notify('Vídeo adicionado ✦');
  } catch(e) {
    notify('Erro: ' + e.message.substring(0,80));
    hideProgress('videoProgress');
  }
  setBtn('videoBtnSave', false);
}

// ══════════════════════════════════════════════════════════
// ADD MESSAGE
// ══════════════════════════════════════════════════════════
async function addMessage() {
  const author = document.getElementById('msgAuthor').value.trim() || 'Anônimo';
  const message = document.getElementById('msgText').value.trim();
  const item_date = document.getElementById('msgDate').value;
  if (!message) { notify('Escreva uma mensagem'); return; }

  try {
    const [rec] = await sbFetch('/rest/v1/memorial_messages', {
      method: 'POST',
      body: JSON.stringify({ author, message, item_date })
    });
    renderMessage(rec);
    updateEmpty('messagesEmpty', 1);
    closeModal('msgModal');
    resetFields(['msgAuthor','msgText','msgDate'], []);
    notify('Mensagem guardada ✦');
  } catch(e) {
    notify('Erro: ' + e.message.substring(0,80));
  }
}

// ══════════════════════════════════════════════════════════
// ADD AUDIO
// ══════════════════════════════════════════════════════════
async function addAudio() {
  const file = document.getElementById('audioFile').files[0];
  if (!file) { notify('Selecione um arquivo de áudio'); return; }
  const title = document.getElementById('audioTitle').value.trim() || file.name;
  const description = document.getElementById('audioDesc').value.trim();

  setBtn('audioBtnSave', true);
  showProgress('audioProgress');

  try {
    const path = `audio_${Date.now()}.${file.name.split('.').pop()}`;
    const url = await sbUpload('memorial-media', path, file, p => updateProgress('audioProgressFill','audioProgressText', p));
    const [rec] = await sbFetch('/rest/v1/memorial_audios', {
      method: 'POST',
      body: JSON.stringify({ title, description, file_url:url })
    });
    renderAudio(rec);
    updateEmpty('audiosEmpty', 1);
    closeModal('audioModal');
    resetFields(['audioFile','audioTitle','audioDesc'], ['audioPreview']);
    hideProgress('audioProgress');
    notify('Áudio adicionado ✦');
  } catch(e) {
    notify('Erro: ' + e.message.substring(0,80));
    hideProgress('audioProgress');
  }
  setBtn('audioBtnSave', false);
}

// ══════════════════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════════════════
async function deleteMemory(id) {
  if (!confirm('Remover esta memória?')) return;
  await sbFetch(`/rest/v1/memorial_memories?id=eq.${id}`, { method: 'DELETE' });
  document.querySelector(`.memory-card[data-id="${id}"]`)?.remove();
  notify('Removido');
}

async function deleteMessage(id) {
  if (!confirm('Remover esta mensagem?')) return;
  await sbFetch(`/rest/v1/memorial_messages?id=eq.${id}`, { method: 'DELETE' });
  document.querySelector(`.message-item[data-id="${id}"]`)?.remove();
  notify('Mensagem removida');
}

async function deleteAudio(id) {
  if (!confirm('Remover este áudio?')) return;
  await sbFetch(`/rest/v1/memorial_audios?id=eq.${id}`, { method: 'DELETE' });
  document.querySelector(`.audio-card[data-id="${id}"]`)?.remove();
  notify('Áudio removido');
}

// ══════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════
function renderMemory(m) {
  document.getElementById('memoriesEmpty').style.display = 'none';
  const card = document.createElement('div');
  card.className = 'memory-card';
  card.dataset.id = m.id;
  const dateStr = m.item_date ? formatDate(m.item_date) : '';
  const caption = escapeHTML(m.caption || '');
  const fileUrl = encodeURI(m.file_url || '');
  
  const media = m.type === 'photo'
    ? `<img class="memory-card-media" src="${fileUrl}" alt="${caption}" loading="lazy">`
    : `<video class="memory-card-media" src="${fileUrl}" controls></video>`;
  card.innerHTML = `
    ${media}
    <div class="memory-card-body">
      ${dateStr ? `<div class="memory-card-date">${escapeHTML(dateStr)}</div>` : ''}
      ${caption ? `<div class="memory-card-caption">${caption}</div>` : ''}
    </div>
    <button class="card-del-btn" onclick="deleteMemory(${m.id})">✕</button>`;
  document.getElementById('memoriesGrid').appendChild(card);
}

function renderMessage(m) {
  document.getElementById('messagesEmpty').style.display = 'none';
  const item = document.createElement('div');
  item.className = 'message-item';
  item.dataset.id = m.id;
  const initial = (m.author||'A').charAt(0).toUpperCase();
  const dateStr = m.item_date ? formatDate(m.item_date) : '';
  
  const author = escapeHTML(m.author || 'Anônimo');
  const message = escapeHTML(m.message || '');
  
  item.innerHTML = `
    <div class="message-avatar">${escapeHTML(initial)}</div>
    <div class="message-bubble">
      <div class="message-author">${author}</div>
      ${dateStr ? `<div class="message-date-tag">${escapeHTML(dateStr)}</div>` : ''}
      <div class="message-text">${message}</div>
      <button class="msg-del-btn" onclick="deleteMessage(${m.id})">✕ Remover</button>
    </div>`;
  document.getElementById('messagesList').appendChild(item);
}

function renderAudio(a) {
  document.getElementById('audiosEmpty').style.display = 'none';
  const card = document.createElement('div');
  card.className = 'audio-card';
  card.dataset.id = a.id;
  
  const title = escapeHTML(a.title || '');
  const desc = escapeHTML(a.description || 'Áudio especial');
  const fileUrl = encodeURI(a.file_url || '');
  
  card.innerHTML = `
    <div class="audio-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    </div>
    <div class="audio-title">${title}</div>
    <div class="audio-label">${desc}</div>
    <audio src="${fileUrl}" controls></audio>
    <button class="aud-del-btn" onclick="deleteAudio(${a.id})">✕ Remover</button>`;
  document.getElementById('audiosGrid').appendChild(card);
}

// ══════════════════════════════════════════════════════════
// HELPERS

function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ══════════════════════════════════════════════════════════
function formatDate(s) {
  if (!s) return '';
  try { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; } catch(e) { return s; }
}

function updateEmpty(id, count) {
  const el = document.getElementById(id);
  if (el) el.style.display = count > 0 ? 'none' : '';
}

function previewFile(input, previewId) {
  const f = input.files[0];
  if (f) document.getElementById(previewId).textContent = '✓ ' + f.name;
}

function resetFields(ids, prevIds) {
  ids.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  prevIds.forEach(id => { const el = document.getElementById(id); if(el) el.textContent = ''; });
}

function showProgress(id) { document.getElementById(id).style.display = 'block'; }
function hideProgress(id) { document.getElementById(id).style.display = 'none'; }
function updateProgress(fillId, textId, pct) {
  document.getElementById(fillId).style.width = pct + '%';
  document.getElementById(textId).textContent = `Enviando... ${pct}%`;
}

function setBtn(id, disabled) { document.getElementById(id).disabled = disabled; }

function showUploadStatus(msg) {
  const el = document.getElementById('uploadStatus');
  el.textContent = msg; el.classList.add('show');
}
function hideUploadStatus() {
  document.getElementById('uploadStatus').classList.remove('show');
}

// FAB
function toggleFab() {
  fabOpen = !fabOpen;
  document.getElementById('fabMenu').classList.toggle('open', fabOpen);
  document.getElementById('fabIcon').innerHTML = fabOpen
    ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
    : '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
}
function closeFab() {
  fabOpen = false;
  document.getElementById('fabMenu').classList.remove('open');
  document.getElementById('fabIcon').innerHTML = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
}

// Modals
function openModal(id) { closeFab(); document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// Notify
function notify(msg) {
  const n = document.getElementById('notif');
  n.textContent = msg; n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 2800);
}

// Scroll reveal
function initScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }});
  }, { threshold: .1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

function openSQLModal() {
  document.getElementById('sqlTextarea').value = SQL_SETUP;
  document.getElementById('sqlModal').classList.add('open');
}

function selectAllSQL() {
  const ta = document.getElementById('sqlTextarea');
  ta.focus();
  ta.select();
  // Tenta copiar após selecionar
  try {
    document.execCommand('copy');
    document.getElementById('sqlCopied').style.display = 'inline';
    setTimeout(() => document.getElementById('sqlCopied').style.display = 'none', 2500);
  } catch(e) {}
}

// Também expor o SQL via botão "Ver SQL"
window.addEventListener('DOMContentLoaded', () => {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) {
    SB_URL = url; SB_KEY = key;
    document.getElementById('setupScreen').style.display = 'none';
    startApp();
  }
});