// Configuração
const CHANNELS_URL = './channels.json'; // troque se preferir outra rota
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

async function init(){
  wireUI();
  await loadChannels();
  const startId = localStorage.getItem(LS_LAST) || (channels[0]?.id ?? null);
  if (startId) selectChannel(startId, /*autoplay*/ true);
}

function wireUI(){
  const openDrawer = (open) => {
    els.drawer.classList.toggle('open', open);
    els.backdrop.hidden = !open;
    els.hamburger.setAttribute('aria-expanded', String(open));
    els.drawer.setAttribute('aria-hidden', String(!open));
  };
  els.hamburger.addEventListener('click', () => openDrawer(true));
  els.close.addEventListener('click', () => openDrawer(false));
  els.backdrop.addEventListener('click', () => openDrawer(false));
  // ESC fecha
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') openDrawer(false); });
}

async function loadChannels(){
  try{
    const res = await fetch(CHANNELS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Falha ao carregar ${CHANNELS_URL}`);
    channels = await res.json();
    renderList();
  }catch(err){
    console.error(err);
    els.list.innerHTML = `<div class="channel-meta" style="padding:12px">Erro ao carregar canais.</div>`;
  }
}

function renderList(){
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

    item.addEventListener('click', () => {
      selectChannel(ch.id, true);
      // fecha o menu depois de escolher
      document.getElementById('closeDrawer').click();
    });

    els.list.appendChild(item);
  });
  highlightActive();
}

function highlightActive(){
  [...els.list.querySelectorAll('.channel-item')].forEach(el => {
    el.classList.toggle('active', el.dataset.id === currentId);
  });
}

function selectChannel(id, autoplay=false){
  const ch = channels.find(c => c.id === id);
  if (!ch) return;
  currentId = id;
  localStorage.setItem(LS_LAST, currentId);
  highlightActive();
  play(ch.url, autoplay);
}

function play(src, autoplay=false){
  const video = els.video;

  // Destrói instância anterior do hls.js
  if (hls) { hls.destroy(); hls = null; }

  // Se for M3U8 e o navegador não suporta nativamente, usa hls.js
  const isHls = /\.m3u8($|\?)/i.test(src);
  if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
    if (window.Hls?.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (autoplay) video.play().catch(()=>{}); });
      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error:', data);
      });
    } else {
      // fallback: tenta setar mesmo assim
      video.src = src;
      if (autoplay) video.play().catch(()=>{});
    }
  } else {
    // MP4, HLS suportado nativo, etc.
    video.src = src;
    if (autoplay) video.play().catch(()=>{});
  }
}
