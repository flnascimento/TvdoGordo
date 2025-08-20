// app.js — IPTV Player minimalista (mobile friendly)

const CHANNELS_URL = './channels.json'; // ajuste se necessário
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

  // Canal inicial: último usado ou o primeiro da lista (sem autoplay em mobile)
  const startId = localStorage.getItem(LS_LAST) || (channels[0]?.id ?? null);
  if (startId) {
    selectChannel(startId, /*autoplay*/ false);
  }
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

  // Mobile: requisitos para inline + autoplay após interação
  els.video.setAttribute('playsinline', '');
  els.video.muted = true;
  els.video.preload = 'metadata';
  els.video.crossOrigin = 'anonymous';

  // Opcional: toque no vídeo dá play/pause (conta como interação)
  els.video.addEventListener('click', async () => {
    try {
      if (els.video.paused) await els.video.play();
      else els.video.pause();
    } catch (err) {
      console.log('Play/pause falhou:', err);
    }
  });

  // Log de erros do elemento <video>
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

    // Interação do usuário → podemos tentar autoplay com segurança
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

function play(src, autoplay = false) {
  const video = els.video;

  // Limpa estado anterior
  try { if (hls) { hls.destroy(); hls = null; } } catch {}
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.crossOrigin = 'anonymous'; // ajuda quando CORS do servidor permite

  const isHls = /\.m3u8($|\?)/i.test(src);
  const canHlsNatively = !!video.canPlayType('application/vnd.apple.mpegurl');

  // iOS Safari (HLS nativo)
  if (isHls && canHlsNatively) {
    video.src = src;
    if (autoplay) {
      setTimeout(() => {
        video.play().catch(err => console.log('play() bloqueado pelo navegador:', err));
      }, 50);
    }
    return;
  }

  // Android/desktop com hls.js
  if (isHls && window.Hls && window.Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 30,
      capLevelToPlayerSize: true
      // Se necessário: xhrSetup: (xhr) => { xhr.withCredentials = false; }
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
    });

    return;
  }

  // Formatos suportados nativamente (ex.: MP4)
  video.src = src;
  if (autoplay) {
    setTimeout(() => {
      video.play().catch(err => console.log('play() bloqueado pelo navegador:', err));
    }, 50);
  }
}
