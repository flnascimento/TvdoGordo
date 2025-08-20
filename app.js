// app.js — IPTV Player minimalista (mobile friendly) com detecção de mixed content

const CHANNELS_URL = './channels.json';
const LS_LAST = 'iptv:lastChannelId';

const els = {
  drawer: document.getElementById('channelDrawer'),
  list: document.getElementById('channelList'),
  hamburger: document.getElementById('menuBtn'),
  close: document.getElementById('closeDrawer'),
  backdrop: document.getElementById('backdrop'),
  video: document.getElementById('video')
};

let channels = [];
let currentId = null;
let hls = null;

init();

async function init() {
  wireUI();
  await loadChannels();
  const startId = localStorage.getItem(LS_LAST) || (channels[0]?.id ?? null);
  if (startId) selectChannel(startId, /*autoplay*/ false);
}

function wireUI() {
  const openDrawer = (open) => {
    els.drawer.classList.toggle('open', open);
    els.backdrop.hidden = !open;
    els.hamburger.setAttribute('aria-expanded', String(open));
    els.drawer.setAttribute('aria-hidden', String(!open));
  };

  els.hamburger.addEventListener('click', () => openDrawer(true));
  els.close.addEventListener('click', () => openDrawer(false));
  els.backdrop.addEventListener('click', () => openDrawer(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') openDrawer(false); });

  // Requisitos mobile
  els.video.setAttribute('playsinline', '');
  els.video.muted = true;
  els.video.preload = 'metadata';
  els.video.crossOrigin = 'anonymous';

  // Clique no vídeo = play/pause (conta como interação)
  els.video.addEventListener('click', async () => {
    try {
      if (els.video.paused) await els.video.play();
      else els.video.pause();
    } catch (err) {
      console.log('Play/pause falhou:', err);
    }
  });

  els.video.addEventListener('error', () => {
    console.error('Video element error:', els.video.error);
  }, { passive: true });
}

async function loadChannels() {
  try {
    const res = await fetch(CHANNELS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Falha ao carregar ${CHANNELS_URL}`);
    channels = await res.json();
    renderList();
  } catch (err) {
    console.error(err);
    els.list.innerHTML = `<div class="channel-meta" style="padding:12px">Erro ao carregar canais.</div>`;
  }
}

function renderList() {
  els.list.innerHTML = '';
  channels.forEach(ch => {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.setAttribute('role', 'option');
    item.dataset.id = ch.id;

    const logo = document.createElement('img');
    logo.className = 'channel-logo';
    logo.alt = '';
    logo.src = ch.logo || '';
    item.appendChild(logo);

    const content = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'channel-title';
    title.textContent = ch.name || ch.id;
    const meta = document.createElement('div');
    meta.className = 'channel-meta';
    meta.textContent = ch.group || ch.note || '';
    content.appendChild(title);
    content.appendChild(meta);
    item.appendChild(content);

    // Interação do usuário → podemos tentar autoplay
    item.addEventListener('click', () => {
      selectChannel(ch.id, /*autoplay*/ true);
      document.getElementById('closeDrawer').click();
    });

    els.list.appendChild(item);
  });
  highlightActive();
}

function highlightActive() {
  [...els.list.querySelectorAll('.channel-item')].forEach(el => {
    el.classList.toggle('active', el.dataset.id === currentId);
  });
}

function selectChannel(id, autoplay = false) {
  const ch = channels.find(c => c.id === id);
  if (!ch) return;
  currentId = id;
  localStorage.setItem(LS_LAST, currentId);
  highlightActive();
  play(ch.url, autoplay);
}

// ==== helpers de UI ====
function overlay(msg) {
  // mensagem sutil sobre o player
  let box = document.getElementById('player-overlay');
  if (!box) {
    box = document.createElement('div');
    box.id = 'player-overlay';
    box.style.position = 'fixed';
    box.style.left = '50%';
    box.style.top = '50%';
    box.style.transform = 'translate(-50%,-50%)';
    box.style.background = 'rgba(16,19,26,.9)';
    box.style.border = '1px solid #2a2f3a';
    box.style.borderRadius = '12px';
    box.style.padding = '12px 14px';
    box.style.color = '#e8ecf3';
    box.style.fontFamily = 'Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif';
    box.style.fontSize = '0.95rem';
    box.style.zIndex = '50';
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.style.display = 'block';
}
function hideOverlay() {
  const box = document.getElementById('player-overlay');
  if (box) box.style.display = 'none';
}
function isMixedContent(url) {
  return (location.protocol === 'https:' && /^http:\/\//i.test(url));
}
function isiOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// ==== player ====
function play(src, autoplay = false) {
  const video = els.video;

  // Limpa estado anterior
  try { if (hls) { hls.destroy(); hls = null; } } catch {}
  video.pause();
  video.removeAttribute('src');
  video.load();
  hideOverlay();

  // 1) Bloqueio por mixed content (GitHub Pages é https)
  if (isMixedContent(src)) {
    console.error('Mixed content bloqueado:', src);
    overlay('O stream é HTTP e a página está em HTTPS. O navegador bloqueou o vídeo. Use uma URL HTTPS ou um proxy HTTPS.');
    return;
  }

  const isHls = /\.m3u8($|\?)/i.test(src);

  // 2) iOS Safari → HLS nativo (mais estável no iOS)
  if (isHls && isiOS()) {
    video.src = src;
    if (autoplay) {
      setTimeout(() => {
        video.play().catch(err => console.log('play() bloqueado pelo navegador:', err));
      }, 50);
    }
    return;
  }

  // 3) Android/desktop → forçar hls.js quando for m3u8
  if (isHls) {
    if (window.Hls && window.Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        capLevelToPlayerSize: true
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoplay) {
          setTimeout(() => {
            video.play().catch(err => console.log('play() bloqueado pelo navegador:', err));
          }, 50);
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error:', data);
        overlay('Falha ao carregar o HLS (CORS/m3u8/segmentos). Veja o console.');
      });
      return;
    } else {
      console.warn('hls.js não suportado neste navegador.');
      // cai pro fallback nativo (alguns Androids recentes já tocam m3u8)
    }
  }

  // 4) Formatos suportados nativamente (ex.: MP4)
  video.src = src;
  if (autoplay) {
    setTimeout(() => {
      video.play().catch(err => console.log('play() bloqueado pelo navegador:', err));
    }, 50);
  }
}
