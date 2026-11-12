const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const menuBtn = document.getElementById('menuBtn');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const albumEl = document.getElementById('album');
const coverImg = document.getElementById('coverImg');
const coverBox = document.getElementById('coverBox');
const musicDot = document.getElementById('musicDot');
const centerLabel = document.getElementById('centerLabel');
const sheetPanel = document.getElementById('sheetPanel');
const sheetEl = sheetPanel.querySelector('.sheet');
const screenEl = document.querySelector('.screen');
const ipodEl = document.querySelector('.ipod');
const playlistEl = document.getElementById('playlist');
const libraryList = document.getElementById('libraryList');
const fileInput = document.getElementById('fileInput');
const closeSheet = document.getElementById('closeSheet');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const shuffleIcon = document.getElementById('shuffleIcon');
const repeatIcon = document.getElementById('repeatIcon');
const wheelOuter = document.getElementById('wheelOuter');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const sourceSelect = document.getElementById('sourceSelect');
const searchResults = document.getElementById('searchResults');
const searchStatus = document.getElementById('searchStatus');
const tabLocal = document.getElementById('tabLocal');
const tabOnline = document.getElementById('tabOnline');
const tabFav = document.getElementById('tabFav');
const panelLocal = document.getElementById('panelLocal');
const panelOnline = document.getElementById('panelOnline');
const panelFav = document.getElementById('panelFav');
const statusHintBtn = document.getElementById('statusHintBtn');
const libraryAddBtn = document.getElementById('libraryAddBtn');
const scrubToggle = document.getElementById('scrubToggle');
const favBtn = document.getElementById('favBtn');
const favListEl = document.getElementById('favList');
const clearDataBtn = document.getElementById('clearDataBtn');
const exportFavBtn = document.getElementById('exportFavBtn');
const importFavBtn = document.getElementById('importFavBtn');
const importFavInput = document.getElementById('importFavInput');
const sheetSizeBtn = document.getElementById('sheetSizeBtn');
const sheetBgBtn = document.getElementById('sheetBgBtn');

const API_BASE = 'https://music-api.gdstudio.xyz/api.php';

let tracks = [];
let currentIndex = -1;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0;
let shuffledOrder = [];
let scrubEnabled = true;
let playHistory = [];
let favorites = [];
let lastSearchList = [];

let sheetFullscreen = false;
let sheetTransparent = false;
try {
  sheetFullscreen = localStorage.getItem('ipodSheetFullscreen') === 'true';
  sheetTransparent = localStorage.getItem('ipodSheetTransparent') === 'true';
} catch (_) {}

const DB_NAME = 'ipodMusicDB';
const DB_STORE = 'tracks';
const SETTINGS_KEY = 'ipodSettings';
const HISTORY_KEY = 'ipodPlayHistory';
const FAV_KEY = 'ipodFavorites';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveTracksToDB() {
  try {
    const db = await openDB();
    const payload = tracks.map((t, i) => ({
      key: i,
      name: t.name,
      artist: t.artist || '',
      album: t.album || '',
      duration: t.duration || null,
      cover: t.cover || null,
      isOnline: !!t.isOnline,
      id: t.id || null,
      source: t.source || null,
      pic_id: t.pic_id || null,
      blob: (!t.isOnline && t.blob) ? t.blob : null
    }));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.clear();
      payload.forEach((row) => store.put(row));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('保存播放列表失败', err);
  }
}

async function loadTracksFromDB() {
  try {
    const db = await openDB();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    rows.sort((a, b) => a.key - b.key);
    return rows.map((row) => {
      const track = {
        name: row.name,
        artist: row.artist,
        album: row.album,
        duration: row.duration,
        cover: row.cover,
        isOnline: row.isOnline,
        id: row.id,
        source: row.source,
        pic_id: row.pic_id,
        url: null,
        blob: row.blob || null
      };
      if (!track.isOnline && track.blob) {
        track.url = URL.createObjectURL(track.blob);
      }
      return track;
    });
  } catch (err) {
    console.warn('读取播放列表失败', err);
    return [];
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      currentIndex, isShuffle, repeatMode, scrubEnabled
    }));
  } catch (_) {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.currentIndex === 'number') currentIndex = s.currentIndex;
    if (typeof s.isShuffle === 'boolean') isShuffle = s.isShuffle;
    if (typeof s.repeatMode === 'number') repeatMode = s.repeatMode;
    if (typeof s.scrubEnabled === 'boolean') scrubEnabled = s.scrubEnabled;
  } catch (_) {}
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(playHistory.slice(0, 50)));
  } catch (_) {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) playHistory = JSON.parse(raw) || [];
  } catch (_) {
    playHistory = [];
  }
}

function pushHistory(track) {
  if (!track) return;
  playHistory = playHistory.filter(
    (h) => !(h.name === track.name && h.artist === track.artist && !!h.isOnline === !!track.isOnline)
  );
  playHistory.unshift({
    name: track.name,
    artist: track.artist || '',
    isOnline: !!track.isOnline,
    at: Date.now()
  });
  if (playHistory.length > 50) playHistory.length = 50;
  saveHistory();
}

function persistAll() {
  saveSettings();
  saveTracksToDB();
  saveFavorites();
}

function trackKey(t) {
  if (!t) return '';
  if (t.isOnline && t.id) return `online:${t.source || 'netease'}:${t.id}`;
  return `local:${t.name || ''}|${t.artist || ''}`;
}

function saveFavorites() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch (_) {}
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    favorites = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(favorites)) favorites = [];
  } catch (_) {
    favorites = [];
  }
}

function isFavorite(track) {
  if (!track) return false;
  const k = trackKey(track);
  return favorites.some((f) => trackKey(f) === k);
}

function toFavItem(track) {
  return {
    name: track.name,
    artist: track.artist || '',
    album: track.album || '',
    cover: track.cover || null,
    isOnline: !!track.isOnline,
    id: track.id || null,
    source: track.source || null,
    pic_id: track.pic_id || null,
    duration: track.duration || null
  };
}

function updateFavButton() {
  if (!favBtn) return;
  const on = currentIndex >= 0 && isFavorite(tracks[currentIndex]);
  favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  const outline = favBtn.querySelector('.heart-outline');
  const filled = favBtn.querySelector('.heart-filled');
  if (outline && filled) {
    outline.style.display = on ? 'none' : 'block';
    filled.style.display = on ? 'block' : 'none';
  }
}

function toggleFavorite() {
  if (currentIndex < 0 || !tracks[currentIndex]) { flashStatus('NO TRACK'); return; }
  const track = tracks[currentIndex];
  const k = trackKey(track);
  const idx = favorites.findIndex((f) => trackKey(f) === k);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    flashStatus('UNLIKED');
  } else {
    favorites.unshift(toFavItem(track));
    flashStatus('LIKED');
  }
  saveFavorites();
  updateFavButton();
  renderFavList();
  haptic(12);
}

function renderFavList() {
  if (!favListEl) return;
  if (!favorites.length) {
    favListEl.innerHTML = `<div class="empty-tip">还没有收藏，播放时点爱心即可添加</div>`;
    return;
  }
  favListEl.innerHTML = favorites.map((t, i) => `
    <div class="track-item fav-item" data-fav-index="${i}">
      <div class="track-num">${i + 1}</div>
      <div class="track-info-list">
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-artist-list">${escapeHtml(t.artist || '未知')}${t.isOnline ? ' · 在线' : ' · 本地'}</div>
      </div>
      <button class="add-btn-row fav-remove" data-fav-index="${i}" title="取消收藏">♡</button>
    </div>
  `).join('');
}

favListEl.addEventListener('click', (e) => {
  const rm = e.target.closest('.fav-remove');
  if (rm && favListEl.contains(rm)) {
    e.stopPropagation();
    const i = parseInt(rm.dataset.favIndex, 10);
    if (Number.isNaN(i)) return;
    if (!confirm(`确定取消收藏「${favorites[i]?.name || ''}」吗？`)) return;
    favorites.splice(i, 1);
    saveFavorites();
    renderFavList();
    updateFavButton();
    flashStatus('UNLIKED');
    return;
  }
  const item = e.target.closest('.fav-item');
  if (!item || !favListEl.contains(item)) return;
  const i = parseInt(item.dataset.favIndex, 10);
  if (Number.isNaN(i)) return;
  playFavorite(favorites[i]);
});

async function playAllFavorites() {
  if (!favorites.length) { flashStatus('NO FAVORITES'); return; }
  let firstIdx = -1;
  let skippedLocal = 0;
  for (const fav of favorites) {
    const exist = tracks.findIndex((t) => trackKey(t) === trackKey(fav));
    if (exist >= 0) { if (firstIdx < 0) firstIdx = exist; continue; }
    if (fav.isOnline && fav.id) {
      tracks.push({
        id: fav.id, name: fav.name, artist: fav.artist || '', album: fav.album || '',
        pic_id: fav.pic_id || null, source: fav.source || 'netease',
        isOnline: true, url: null, cover: fav.cover || null, duration: fav.duration || null
      });
      if (firstIdx < 0) firstIdx = tracks.length - 1;
    } else {
      skippedLocal++;
    }
  }
  if (isShuffle) rebuildShuffle();
  persistAll();
  renderPlaylist();
  renderLibrary();
  renderFavList();
  if (firstIdx < 0) {
    alert('收藏中没有可直接播放的歌曲\n(本地收藏需到「本地」重新导入文件后再播放)');
    return;
  }
  await loadTrack(firstIdx);
  audio.play().catch(() => {});
  closeSheetPanel();
  flashStatus(skippedLocal > 0 ? `PLAYING · SKIP ${skippedLocal}` : 'PLAYING FAVORITES');
}

async function playFavorite(item) {
  if (!item) return;
  const exist = tracks.findIndex((t) => trackKey(t) === trackKey(item));
  if (exist >= 0) {
    await loadTrack(exist);
    audio.play().catch(() => {});
    closeSheetPanel();
    return;
  }
  if (item.isOnline && item.id) {
    tracks.push({
      id: item.id, name: item.name, artist: item.artist, album: item.album || '',
      pic_id: item.pic_id, source: item.source || 'netease',
      isOnline: true, url: null, cover: item.cover || null, duration: item.duration || null
    });
    if (isShuffle) rebuildShuffle();
    persistAll();
    renderPlaylist();
    renderLibrary();
    await loadTrack(tracks.length - 1);
    audio.play().catch(() => {});
    closeSheetPanel();
    return;
  }
  flashStatus('NEED RE-IMPORT');
  alert('该收藏是本地歌曲，请到「本地」重新导入同名文件后再播放。');
}

function exportFavorites() {
  const data = { type: 'ipod-favorites', version: 1, exportedAt: new Date().toISOString(), favorites };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ipod-favorites-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flashStatus('EXPORTED');
}

function importFavoritesFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : (data.favorites || data.list || []);
      if (!Array.isArray(list) || !list.length) { alert('文件里没有可用的收藏列表'); return; }
      let added = 0;
      list.forEach((item) => {
        if (!item || !item.name) return;
        const norm = toFavItem({
          name: item.name, artist: item.artist || '', album: item.album || '',
          cover: item.cover || null,
          isOnline: item.isOnline !== false && !!(item.id || item.isOnline),
          id: item.id || null, source: item.source || 'netease',
          pic_id: item.pic_id || null, duration: item.duration || null
        });
        if (!favorites.some((f) => trackKey(f) === trackKey(norm))) {
          favorites.push(norm);
          added++;
        }
      });
      saveFavorites();
      renderFavList();
      updateFavButton();
      alert(`已导入，新增 ${added} 首(已自动跳过重复)`);
    } catch (err) {
      alert('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

async function clearAllPlayData() {
  if (!confirm('确定清除全部播放数据？\n包括：播放列表、本地缓存歌曲、收藏、设置与播放记录。')) return;
  tracks.forEach((t) => {
    if (t.url && String(t.url).startsWith('blob:')) {
      try { URL.revokeObjectURL(t.url); } catch (_) {}
    }
  });
  tracks = [];
  currentIndex = -1;
  isPlaying = false;
  isShuffle = false;
  repeatMode = 0;
  scrubEnabled = true;
  shuffledOrder = [];
  playHistory = [];
  favorites = [];
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {}
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(FAV_KEY);
  } catch (_) {}
  audio.pause();
  audio.removeAttribute('src');
  updatePlayIcon();
  updateModeIcons();
  updateScrubToggle();
  updateFavButton();
  updateStatusHint();
  renderPlaylist();
  renderLibrary();
  renderFavList();
  syncSearchButtons();
  flashStatus('CLEARED');
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>]/g, (c) => HTML_ESCAPE[c]);
}

const ICON_SHUFFLE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>';
const ICON_REPEAT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
const ICON_REPEAT_ONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M10.5 9.5 12.5 8v6"/></svg>';

function updateModeIcons() {
  shuffleIcon.classList.toggle('active', isShuffle);
  shuffleBtn.classList.toggle('active', isShuffle);
  repeatIcon.classList.toggle('active', repeatMode > 0);
  repeatBtn.classList.toggle('active', repeatMode > 0);
  shuffleIcon.innerHTML = ICON_SHUFFLE;
  shuffleBtn.innerHTML = ICON_SHUFFLE;
  const repeatSvg = repeatMode === 2 ? ICON_REPEAT_ONE : ICON_REPEAT;
  repeatIcon.innerHTML = repeatSvg;
  repeatBtn.innerHTML = repeatSvg;
}

function updatePlayIcon() {
  if (isPlaying) {
    playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    if (coverBox) coverBox.classList.add('is-playing');
    if (musicDot) musicDot.classList.add('playing');
    if (centerLabel) centerLabel.classList.add('is-playing');
  } else {
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    if (coverBox) coverBox.classList.remove('is-playing');
    if (musicDot) musicDot.classList.remove('playing');
    if (centerLabel) centerLabel.classList.remove('is-playing');
  }
  if (centerLabel) centerLabel.textContent = 'MUSIC';
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'; } catch (_) {}
  }
  updateStatusHint();
}

let statusHintTimer = null;

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    const track = currentIndex >= 0 ? tracks[currentIndex] : null;
    navigator.mediaSession.metadata = track ? new MediaMetadata({
      title: track.name,
      artist: track.artist || '未知艺术家',
      album: track.album || '',
      artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : []
    }) : null;
    navigator.mediaSession.setActionHandler('play', togglePlay);
    navigator.mediaSession.setActionHandler('pause', togglePlay);
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
  } catch (_) {}
}

function updateStatusHint() {
  if (!statusHintBtn) return;
  if (!scrubEnabled) {
    statusHintBtn.textContent = 'WHEEL SCRUB OFF';
    statusHintBtn.classList.remove('is-playing');
    return;
  }
  if (tracks.length === 0) {
    statusHintBtn.textContent = 'ADD A MUSIC FILE';
    statusHintBtn.classList.remove('is-playing');
    return;
  }
  if (isPlaying) {
    statusHintBtn.textContent = 'NOW PLAYING';
    statusHintBtn.classList.add('is-playing');
  } else if (currentIndex >= 0) {
    statusHintBtn.textContent = 'PAUSED';
    statusHintBtn.classList.remove('is-playing');
  } else {
    statusHintBtn.textContent = 'READY';
    statusHintBtn.classList.remove('is-playing');
  }
}

function flashStatus(text, ms = 1100) {
  if (!statusHintBtn) return;
  if (statusHintTimer) clearTimeout(statusHintTimer);
  statusHintBtn.textContent = text;
  statusHintBtn.classList.remove('is-playing');
  statusHintTimer = setTimeout(() => {
    statusHintTimer = null;
    updateStatusHint();
  }, ms);
}

let coverAnimMode = localStorage.getItem('ipodCoverAnim') || 'flip';
let loadSeq = 0;

function applyCoverAnimClass() {
  if (!coverBox) return;
  coverBox.classList.remove('anim-flip', 'anim-fade', 'anim-zoom', 'anim-slide');
  if (coverAnimMode && coverAnimMode !== 'none') {
    coverBox.classList.add('anim-' + coverAnimMode);
  }
}

function animateCoverChange(applyContent, direction = 'next') {
  if (!coverBox || coverAnimMode === 'none') {
    applyContent();
    return Promise.resolve();
  }
  applyCoverAnimClass();
  const outClass = direction === 'prev' ? 'cover-out-prev' : 'cover-out-next';
  const inClass = direction === 'prev' ? 'cover-in-prev' : 'cover-in-next';
  return new Promise((resolve) => {
    coverBox.classList.remove('cover-in-prev', 'cover-in-next', 'cover-out-prev', 'cover-out-next');
    coverBox.classList.add(outClass);
    const onOut = () => {
      coverBox.removeEventListener('animationend', onOut);
      applyContent();
      coverBox.classList.remove(outClass);
      coverBox.classList.add(inClass);
      const onIn = () => {
        coverBox.removeEventListener('animationend', onIn);
        coverBox.classList.remove(inClass);
        if (isPlaying) coverBox.classList.add('is-playing');
        resolve();
      };
      coverBox.addEventListener('animationend', onIn);
    };
    coverBox.addEventListener('animationend', onOut);
  });
}

function updateScrubToggle() {
  if (!scrubToggle) return;
  scrubToggle.setAttribute('aria-pressed', scrubEnabled ? 'true' : 'false');
}

function computeSheetHeight() {
  if (!screenEl) return null;
  const rect = screenEl.getBoundingClientRect();
  let offset = 17;
  if (ipodEl) {
    const ipodRect = ipodEl.getBoundingClientRect();
    if (rect.top > ipodRect.top) {
      offset = rect.top - ipodRect.top;
    }
  }
  const vh = window.innerHeight || document.documentElement.clientHeight;
  let h = vh - rect.bottom - offset;
  const min = 360;
  const max = Math.max(min, vh * 0.82);
  if (!isFinite(h) || h <= 0) h = Math.min(vh * 0.5, max);
  if (h < min) h = min;
  if (h > max) h = max;
  return h;
}

function positionSheet() {
  if (!sheetEl) return;
  if (sheetFullscreen) {
    sheetEl.style.removeProperty('--sheet-height');
    return;
  }
  const h = computeSheetHeight();
  if (h) sheetEl.style.setProperty('--sheet-height', h + 'px');
}

function applySheetPrefs() {
  if (!sheetPanel) return;
  sheetPanel.classList.toggle('fullscreen', sheetFullscreen);
  sheetPanel.classList.toggle('transparent', sheetTransparent);
  if (sheetSizeBtn) sheetSizeBtn.setAttribute('aria-pressed', sheetFullscreen ? 'true' : 'false');
  if (sheetBgBtn) sheetBgBtn.setAttribute('aria-pressed', sheetTransparent ? 'true' : 'false');
  positionSheet();
}

function haptic(ms = 10) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}

const ALL_SOURCES = [
  { value: 'netease', name: '网易云' },
  { value: 'tencent', name: 'QQ音乐' },
  { value: 'kuwo', name: '酷我' },
  { value: 'joox', name: 'JOOX' },
  { value: 'tidal', name: 'Tidal' },
  { value: 'ytmusic', name: 'YouTube Music' }
];

function rebuildSourceSelect(list) {
  if (!sourceSelect) return;
  const current = sourceSelect.value;
  sourceSelect.innerHTML = list.map(s => `<option value="${s.value}">${s.name}</option>`).join('');
  if (list.some(s => s.value === current)) sourceSelect.value = current;
  else if (list.length) sourceSelect.value = list[0].value;
}

async function testSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(API_BASE);
    url.searchParams.set('types', 'search');
    url.searchParams.set('source', source);
    url.searchParams.set('name', '周杰伦');
    url.searchParams.set('count', '1');
    url.searchParams.set('pages', '1');
    const res = await fetch(url.toString(), { 
      signal: controller.signal,
      headers: {
        'Referer': 'https://music.gdstudio.xyz/'
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function testSourceWithRetry(source) {
  let pass = await testSource(source);
  if (!pass) {
    await new Promise(r => setTimeout(r, 500));
    pass = await testSource(source);
  }
  return pass;
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  let nextIndex = 0;
  const runners = Array(Math.min(limit, tasks.length)).fill(null).map(async () => {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(runners);
  return results;
}

async function checkAllSources() {
  const btn = document.getElementById('sourceCheckBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '检测中';
    btn.classList.add('checking');
  }
  tabOnline?.click();

  const total = ALL_SOURCES.length;
  const ok = [];
  const failed = [];
  let done = 0;
  const activeSet = new Set();

  const updateProgress = () => {
    if (!searchStatus) return;
    const activeNames = Array.from(activeSet).join('、');
    const okTags = ok.map(x=>x.name).join('、') || '无';
    const failTags = failed.map(x=>x.name).join('、') || '无';
    searchStatus.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">检测进度 ${done}/${total} ${activeNames ? `· 正在检测: ${activeNames}` : ''}</div>
      <div style="font-size:11px;color:#30d158;">可用：${okTags}</div>
      <div style="font-size:11px;color:#ff3b30;">失效：${failTags}</div>
    `;
    searchStatus.classList.remove('error');
  };

  updateProgress();

  const tasks = ALL_SOURCES.map(s => async () => {
    activeSet.add(s.name);
    updateProgress();
    
    const pass = await testSourceWithRetry(s.value);
    
    activeSet.delete(s.name);
    if (pass) {
      ok.push(s);
    } else {
      failed.push(s);
    }
    done++;
    updateProgress();
    return pass;
  });

  await runWithConcurrency(tasks, 3);

  rebuildSourceSelect(ok.length ? ok : ALL_SOURCES);
  if (btn) {
    btn.disabled = false;
    btn.textContent = '检测';
    btn.classList.remove('checking');
  }
  
  if (searchStatus) {
    if (ok.length === 0) {
      searchStatus.innerHTML = `
        <div style="color:#ff3b30;font-weight:600;">全部音源检测失败(可能跨域或网络问题)</div>
        <div style="font-size:11px;color:#ff3b30;">失效：${failed.map(x=>x.name).join('、')}</div>
      `;
      searchStatus.classList.add('error');
    } else {
      searchStatus.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">检测完成，保留 ${ok.length} 个可用音源</div>
        <div style="font-size:11px;color:#30d158;">可用：${ok.map(s => s.name).join('、')}</div>
        ${failed.length ? `<div style="font-size:11px;color:#ff3b30;">失效：${failed.map(x=>x.name).join('、')}</div>` : ''}
      `;
      searchStatus.classList.remove('error');
    }
  }
  haptic(12);
}

async function apiFetch(params) {
  const url = new URL(API_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('网络错误 ' + res.status);
  return res.json();
}

async function searchSongs(keyword, source = 'netease', count = 20, page = 1) {
  return apiFetch({ types: 'search', source, name: keyword, count, pages: page });
}

async function getPlayUrl(id, source = 'netease', br = 320) {
  const data = await apiFetch({ types: 'url', source, id, br });
  return data?.url || null;
}

async function getCoverUrl(picId, source = 'netease', size = 300) {
  if (!picId) return null;
  try {
    const data = await apiFetch({ types: 'pic', source, id: picId, size });
    return data?.url || null;
  } catch { return null; }
}

let consecutiveSkip = 0;
let failureSkipGuard = { key: '', at: 0 };

function getNextIndex(direction = 1) {
  if (tracks.length === 0) return -1;
  if (repeatMode === 2) return currentIndex;
  if (isShuffle) {
    if (shuffledOrder.length === 0) rebuildShuffle();
    const pos = shuffledOrder.indexOf(currentIndex);
    let nextPos = pos + direction;
    if (nextPos < 0) nextPos = shuffledOrder.length - 1;
    if (nextPos >= shuffledOrder.length) {
      if (repeatMode === 1) { rebuildShuffle(); nextPos = 0; }
      else return -1;
    }
    return shuffledOrder[nextPos];
  }
  let next = currentIndex + direction;
  if (next < 0) return repeatMode === 1 ? tracks.length - 1 : -1;
  if (next >= tracks.length) return repeatMode === 1 ? 0 : -1;
  return next;
}

function rebuildShuffle() {
  shuffledOrder = tracks.map((_, i) => i);
  for (let i = shuffledOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
  }
  if (shuffledOrder.length > 1 && shuffledOrder[0] === currentIndex) {
    const swap = 1 + Math.floor(Math.random() * (shuffledOrder.length - 1));
    [shuffledOrder[0], shuffledOrder[swap]] = [shuffledOrder[swap], shuffledOrder[0]];
  }
}

function skipFailedTrack(reason = 'SKIP FAILED') {
  const track = currentIndex >= 0 ? tracks[currentIndex] : null;
  if (!track || tracks.length === 0) return;

  const key = trackKey(track);
  const now = Date.now();
  if (failureSkipGuard.key === key && now - failureSkipGuard.at < 2500) return;
  failureSkipGuard = { key, at: now };

  if (consecutiveSkip >= tracks.length) {
    consecutiveSkip = 0;
    isPlaying = false;
    updatePlayIcon();
    try { audio.pause(); } catch (_) {}
    flashStatus('ALL SOURCES FAILED', 1800);
    return;
  }
  consecutiveSkip++;

  flashStatus(reason, 1200);
  const next = getNextIndex(1);
  if (next >= 0 && next !== currentIndex) {
    loadTrack(next, { direction: 'next' }).then(() => {
      audio.play().catch(() => {});
    });
  } else {
    isPlaying = false;
    updatePlayIcon();
    try { audio.pause(); } catch (_) {}
    flashStatus('PLAYBACK FAILED', 1800);
  }
}

async function loadTrack(index, opts = {}) {
  if (index < 0 || index >= tracks.length) return;
  const { direction } = opts;
  const loadToken = ++loadSeq;
  currentIndex = index;
  const track = tracks[index];

  titleEl.textContent = track.name;
  artistEl.textContent = track.artist || '未知艺术家';
  albumEl.textContent = track.album || '';
  document.title = track.name + ' · iPod';

  const applyCover = () => {
    if (track.cover) {
      coverImg.src = track.cover;
      coverImg.classList.add('show');
      coverBox.classList.add('has-cover');
    } else {
      coverImg.classList.remove('show');
      coverImg.removeAttribute('src');
      coverBox.classList.remove('has-cover');
    }
  };

  if (direction === 'prev' || direction === 'next') {
    await animateCoverChange(applyCover, direction);
  } else {
    applyCover();
  }

  renderLibrary();
  renderPlaylist();
  updateStatusHint();

  if (track.isOnline && !track.url) {
    titleEl.textContent = '正在获取…';
    try {
      const url = await getPlayUrl(track.id, track.source || 'netease', 320);
      if (loadToken !== loadSeq) return;
      if (!url) throw new Error('无播放地址');
      track.url = url;
      if (!track.cover && track.pic_id) {
        const pic = await getCoverUrl(track.pic_id, track.source || 'netease');
        if (loadToken !== loadSeq) return;
        if (pic) {
          track.cover = pic;
          coverImg.src = pic;
          coverImg.classList.add('show');
          coverBox.classList.add('has-cover');
        }
      }
    } catch (err) {
      if (loadToken !== loadSeq) return;
      titleEl.textContent = '获取失败';
      artistEl.textContent = err.message || '请换一首';
      skipFailedTrack('SKIP BAD SOURCE');
      return;
    }
    if (loadToken !== loadSeq) return;
    titleEl.textContent = track.name;
  }

  audio.src = track.url;
  audio.load();
  pushHistory(track);
  saveSettings();
  updateFavButton();
  updateMediaSession();
}

function togglePlay() {
  if (tracks.length === 0) { openSheet(); return; }
  if (currentIndex === -1) {
    loadTrack(isShuffle ? (shuffledOrder[0] || 0) : 0).then(() => {
      if (tracks[currentIndex]?.url) audio.play().catch(() => {});
    });
    return;
  }
  if (isPlaying) audio.pause();
  else audio.play().catch(() => {});
}

function prevTrack() {
  if (tracks.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    flashStatus('RESTART');
    return;
  }
  const next = getNextIndex(-1);
  if (next >= 0) {
    flashStatus('PREVIOUS TRACK');
    loadTrack(next, { direction: 'prev' }).then(() => {
      if (isPlaying && tracks[next]?.url) audio.play().catch(() => {});
    });
  }
}

function nextTrack(auto = false) {
  if (tracks.length === 0) return;
  let next = getNextIndex(1);
  if (next < 0 && !auto && tracks.length > 0) next = 0;
  if (next >= 0) {
    const isWrap = currentIndex === tracks.length - 1 && next === 0 && !auto;
    flashStatus(isWrap ? 'FIRST TRACK' : 'NEXT TRACK');
    loadTrack(next, { direction: 'next' }).then(() => {
      if (isPlaying && tracks[next]?.url) audio.play().catch(() => {});
    });
  } else {
    isPlaying = false;
    updatePlayIcon();
    audio.pause();
    flashStatus('END OF PLAYLIST');
  }
}

function renderPlaylist() {
  if (tracks.length === 0) {
    playlistEl.innerHTML = `<div class="empty-tip">还没有歌曲<br>点击下方添加本地音乐</div>`;
    return;
  }
  playlistEl.innerHTML = tracks.map((t, i) => `
    <div class="track-item ${i === currentIndex ? 'current' : ''}" data-index="${i}">
      <div class="track-num">${i + 1}</div>
      <div class="track-info-list">
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-artist-list">${escapeHtml(t.artist || '未知')}${t.isOnline ? ' · 在线' : ''}</div>
      </div>
      <div class="track-duration">${t.duration || '--:--'}</div>
      <button class="track-delete-btn" data-index="${i}" title="移除">✕</button>
    </div>
  `).join('');
}

playlistEl.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.track-delete-btn');
  if (delBtn) {
    e.stopPropagation();
    const idx = parseInt(delBtn.dataset.index, 10);
    if (!Number.isNaN(idx)) removeTrackFromList(idx);
    return;
  }
  const item = e.target.closest('.track-item');
  if (!item || !playlistEl.contains(item)) return;
  const idx = parseInt(item.dataset.index, 10);
  if (Number.isNaN(idx)) return;
  loadTrack(idx).then(() => {
    audio.play().catch(() => {});
    closeSheetPanel();
  });
});

function renderLibrary() {
  if (tracks.length === 0) {
    libraryList.innerHTML = `<div class="empty-tip">还没有歌曲，点击右上角添加</div>`;
    return;
  }
  libraryList.innerHTML = tracks.map((t, i) => `
    <div class="library-item ${i === currentIndex ? 'current' : ''}" data-index="${i}">
      <div class="library-num">${String(i + 1).padStart(2, '0')}</div>
      <div class="library-info">
        <div class="library-name">${escapeHtml(t.name)}</div>
        <div class="library-artist">${escapeHtml(t.artist || '未知艺术家')}</div>
      </div>
      <div class="library-duration">${t.duration || '-:-'}</div>
    </div>
  `).join('');
}

libraryList.addEventListener('click', (e) => {
  const item = e.target.closest('.library-item');
  if (!item || !libraryList.contains(item)) return;
  const idx = parseInt(item.dataset.index, 10);
  if (Number.isNaN(idx)) return;
  loadTrack(idx).then(() => audio.play().catch(() => {}));
});

function renderSearchResults(list) {
  lastSearchList = Array.isArray(list) ? list : [];
  if (!list || list.length === 0) {
    searchResults.innerHTML = `<div class="empty-tip">没有找到相关歌曲</div>`;
    return;
  }
  searchResults.innerHTML = list.map((item, i) => {
    const artist = Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || '未知');
    const isAdded = tracks.some(t => t.isOnline && t.id === item.id && t.source === (item.source || sourceSelect.value));
    return `
      <div class="track-item online" data-search-index="${i}">
        <div class="track-info-list">
          <div class="track-name">${escapeHtml(item.name)}</div>
          <div class="track-artist-list">${escapeHtml(artist)} · ${escapeHtml(item.album || '')}</div>
        </div>
        <button class="add-btn-row" data-search-index="${i}" style="color:${isAdded ? '#30d158' : ''}">${isAdded ? '✓' : '＋'}</button>
      </div>
    `;
  }).join('');
}

function syncSearchButtons() {
  if (!lastSearchList.length) return;
  const btns = searchResults.querySelectorAll('.add-btn-row');
  btns.forEach(btn => {
    const idx = parseInt(btn.dataset.searchIndex, 10);
    if (isNaN(idx) || !lastSearchList[idx]) return;
    const item = lastSearchList[idx];
    const isAdded = tracks.some(t => t.isOnline && t.id === item.id && t.source === (item.source || sourceSelect.value));
    if (isAdded) {
      btn.textContent = '✓';
      btn.style.color = '#30d158';
    } else {
      btn.textContent = '＋';
      btn.style.color = '';
    }
  });
}

searchResults.addEventListener('click', (e) => {
  const addBtn = e.target.closest('.add-btn-row');
  const item = e.target.closest('.track-item');
  const target = addBtn || item;
  if (!target || !searchResults.contains(target)) return;
  const idx = parseInt(target.dataset.searchIndex, 10);
  if (Number.isNaN(idx) || !lastSearchList[idx]) return;
  
  if (addBtn) {
    const searchItem = lastSearchList[idx];
    const isAdded = tracks.some(t => t.isOnline && t.id === searchItem.id && t.source === (searchItem.source || sourceSelect.value));
    if (isAdded) {
      removeOnlineTrack(searchItem);
    } else {
      addOnlineTrack(searchItem);
    }
    syncSearchButtons();
  } else {
    playOnlineTrack(lastSearchList[idx]);
  }
});

function addOnlineTrack(item) {
  const artist = Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || '未知艺术家');
  if (tracks.some(t => t.isOnline && t.id === item.id && t.source === item.source)) return;
  tracks.push({
    id: item.id, name: item.name, artist, album: item.album || '',
    pic_id: item.pic_id, source: item.source || sourceSelect.value,
    isOnline: true, url: null, cover: null, duration: null
  });
  if (isShuffle) rebuildShuffle();
  renderPlaylist();
  renderLibrary();
  updateStatusHint();
  persistAll();
  haptic(10);
}

function removeOnlineTrack(item) {
  const idx = tracks.findIndex(t => t.isOnline && t.id === item.id && t.source === (item.source || sourceSelect.value));
  if (idx >= 0) {
    removeTrackFromList(idx, true);
  }
}

async function removeTrackFromList(index, skipConfirm = false) {
  if (index < 0 || index >= tracks.length) return;
  const track = tracks[index];
  
  if (!skipConfirm) {
    if (!confirm(`确定从播放列表中移除「${track.name}」吗？`)) return;
  }

  if (track.url && String(track.url).startsWith('blob:')) {
    try { URL.revokeObjectURL(track.url); } catch (_) {}
  }

  tracks.splice(index, 1);
  
  if (tracks.length === 0) {
    currentIndex = -1;
    audio.pause();
    audio.removeAttribute('src');
    updatePlayIcon();
    updateStatusHint();
    document.title = 'iPod Music';
    titleEl.textContent = '选择音乐';
    artistEl.textContent = '点击 MENU 添加';
    albumEl.textContent = '';
    coverImg.classList.remove('show');
    coverBox.classList.remove('has-cover');
    musicDot.classList.remove('playing');
    centerLabel.classList.remove('is-playing');
  } else {
    const wasPlaying = isPlaying;
    if (index === currentIndex) {
      if (currentIndex >= tracks.length) {
        currentIndex = tracks.length - 1;
      }
      audio.pause();
      loadTrack(currentIndex).then(() => {
        if (wasPlaying) audio.play().catch(()=>{});
      });
    } else if (index < currentIndex) {
      currentIndex--;
    }
  }

  if (isShuffle) rebuildShuffle();
  renderPlaylist();
  renderLibrary();
  persistAll();
  syncSearchButtons();
  haptic(12);
}

async function playOnlineTrack(item) {
  addOnlineTrack(item);
  const idx = tracks.findIndex(t => t.isOnline && t.id === item.id && t.source === (item.source || sourceSelect.value));
  if (idx >= 0) {
    await loadTrack(idx);
    audio.play().catch(() => {});
    closeSheetPanel();
  }
}

async function doSearch() {
  const keyword = searchInput.value.trim();
  if (!keyword) {
    searchStatus.textContent = '请输入关键词';
    searchStatus.classList.add('error');
    return;
  }
  searchStatus.textContent = '搜索中…';
  searchStatus.classList.remove('error');
  searchResults.innerHTML = `<div class="empty-tip">搜索中…</div>`;
  try {
    const data = await searchSongs(keyword, sourceSelect.value, 25, 1);
    const list = Array.isArray(data) ? data : [];
    searchStatus.textContent = `找到 ${list.length} 首 · GD音乐台`;
    renderSearchResults(list);
  } catch (err) {
    console.error(err);
    searchStatus.textContent = '搜索失败(可能跨域，请配置代理)';
    searchStatus.classList.add('error');
    searchResults.innerHTML = `<div class="empty-tip">搜索失败</div>`;
  }
}

function openSheet() {
  positionSheet();
  sheetPanel.classList.add('show');
}
function closeSheetPanel() { sheetPanel.classList.remove('show'); }

function switchTab(name) {
  const tabs = { local: tabLocal, fav: tabFav, online: tabOnline };
  const panels = { local: panelLocal, fav: panelFav, online: panelOnline };
  Object.keys(tabs).forEach((k) => {
    tabs[k]?.classList.toggle('active', k === name);
    panels[k]?.classList.toggle('active', k === name);
  });
  if (name === 'fav') renderFavList();
}
tabLocal.addEventListener('click', () => switchTab('local'));
tabFav?.addEventListener('click', () => switchTab('fav'));
tabOnline.addEventListener('click', () => switchTab('online'));

favBtn?.addEventListener('click', toggleFavorite);
document.getElementById('playAllFavBtn')?.addEventListener('click', () => { haptic(12); playAllFavorites(); });
clearDataBtn?.addEventListener('click', clearAllPlayData);
exportFavBtn?.addEventListener('click', exportFavorites);
importFavBtn?.addEventListener('click', () => importFavInput?.click());
importFavInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importFavoritesFile(file);
  e.target.value = '';
});

playBtn.addEventListener('click', () => { haptic(12); togglePlay(); });
prevBtn.addEventListener('click', () => { haptic(10); prevTrack(); });
nextBtn.addEventListener('click', () => { haptic(10); nextTrack(false); });
menuBtn.addEventListener('click', () => { haptic(8); openSheet(); });
closeSheet.addEventListener('click', closeSheetPanel);
statusHintBtn.addEventListener('click', () => {
  if (tracks.length === 0) openSheet();
  else togglePlay();
});
libraryAddBtn.addEventListener('click', openSheet);

scrubToggle.addEventListener('click', () => {
  scrubEnabled = !scrubEnabled;
  updateScrubToggle();
  saveSettings();
  haptic(15);
  flashStatus(scrubEnabled ? 'WHEEL SCRUB ON' : 'WHEEL SCRUB OFF', 900);
});

shuffleBtn.addEventListener('click', () => {
  isShuffle = !isShuffle;
  if (isShuffle) rebuildShuffle();
  updateModeIcons();
  saveSettings();
});
repeatBtn.addEventListener('click', () => {
  repeatMode = (repeatMode + 1) % 3;
  updateModeIcons();
  saveSettings();
});

sheetSizeBtn?.addEventListener('click', () => {
  sheetFullscreen = !sheetFullscreen;
  try { localStorage.setItem('ipodSheetFullscreen', String(sheetFullscreen)); } catch (_) {}
  applySheetPrefs();
  haptic(10);
});

sheetBgBtn?.addEventListener('click', () => {
  sheetTransparent = !sheetTransparent;
  try { localStorage.setItem('ipodSheetTransparent', String(sheetTransparent)); } catch (_) {}
  applySheetPrefs();
  haptic(10);
});

sheetPanel.addEventListener('click', (e) => {
  if (e.target === sheetPanel) closeSheetPanel();
});

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

const sourceCheckBtn = document.getElementById('sourceCheckBtn');
if (sourceCheckBtn) {
  sourceCheckBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    checkAllSources();
  });
}

window.addEventListener('resize', () => {
  if (sheetPanel.classList.contains('show')) positionSheet();
});
window.addEventListener('orientationchange', () => {
  if (sheetPanel.classList.contains('show')) setTimeout(positionSheet, 120);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (sheetPanel.classList.contains('show')) positionSheet();
  });
}

let isDragging = false;
progressBar.addEventListener('touchstart', startDrag, { passive: false });
progressBar.addEventListener('mousedown', startDrag);
function startDrag(e) { isDragging = true; updateProgressFromEvent(e); e.preventDefault(); }
function updateProgressFromEvent(e) {
  const rect = progressBar.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  let percent = (clientX - rect.left) / rect.width;
  percent = Math.max(0, Math.min(1, percent));
  progress.style.width = percent * 100 + '%';
  if (audio.duration) audio.currentTime = percent * audio.duration;
}
document.addEventListener('touchmove', (e) => { if (isDragging) { updateProgressFromEvent(e); e.preventDefault(); } }, { passive: false });
document.addEventListener('mousemove', (e) => { if (isDragging) updateProgressFromEvent(e); });
document.addEventListener('touchend', () => { isDragging = false; });
document.addEventListener('mouseup', () => { isDragging = false; });

let isScrubbing = false, lastAngle = 0, scrubStartTime = 0, wheelCx = 0, wheelCy = 0, rInner = 0, rOuter = 0;
const wheelScrub = document.getElementById('wheelScrub');

function getPoint(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function getPolar(e, cx, cy) {
  const p = getPoint(e);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { angle: Math.atan2(dy, dx), r: Math.hypot(dx, dy) };
}

function isOnRing(r) { return r >= rInner && r <= rOuter * 1.08; }

function onWheelStart(e) {
  if (!scrubEnabled) return;
  if (e.target.closest('.wheel-btn')) return;
  const rect = wheelOuter.getBoundingClientRect();
  wheelCx = rect.left + rect.width / 2;
  wheelCy = rect.top + rect.height / 2;
  rOuter = rect.width / 2;
  rInner = rOuter * 0.40;
  const { angle, r } = getPolar(e, wheelCx, wheelCy);
  if (!isOnRing(r)) return;
  lastAngle = angle;
  isScrubbing = true;
  scrubStartTime = audio.currentTime || 0;
  haptic(8);
  e.preventDefault();
}

function onWheelMove(e) {
  if (!isScrubbing || !audio.duration) return;
  const { angle, r } = getPolar(e, wheelCx, wheelCy);
  if (!isOnRing(r)) { e.preventDefault(); return; }
  let delta = angle - lastAngle;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  if (Math.abs(delta) < 0.004) { e.preventDefault(); return; }
  const sensitivity = (audio.duration * 0.55) / (2 * Math.PI);
  const newTime = Math.max(0, Math.min(audio.duration, scrubStartTime + delta * sensitivity * 5.5));
  scrubStartTime = newTime;
  lastAngle = angle;
  audio.currentTime = newTime;
  progress.style.width = (newTime / audio.duration) * 100 + '%';
  currentTimeEl.textContent = formatTime(newTime);
  e.preventDefault();
}

function onWheelEnd() { isScrubbing = false; }

const scrubTarget = wheelScrub || wheelOuter;
scrubTarget.addEventListener('touchstart', onWheelStart, { passive: false });
scrubTarget.addEventListener('mousedown', onWheelStart);
wheelOuter.addEventListener('contextmenu', (e) => e.preventDefault());
wheelOuter.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (isScrubbing) onWheelMove(e); }, { passive: false });
document.addEventListener('mousemove', (e) => { if (isScrubbing) onWheelMove(e); });
document.addEventListener('touchend', onWheelEnd);
document.addEventListener('mouseup', onWheelEnd);

audio.addEventListener('play', () => { consecutiveSkip = 0; isPlaying = true; updatePlayIcon(); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayIcon(); });
audio.addEventListener('ended', () => {
  if (repeatMode === 2) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    nextTrack(true);
  }
});

let timeRafPending = false;
audio.addEventListener('timeupdate', () => {
  if (isDragging || isScrubbing || !audio.duration || timeRafPending) return;
  timeRafPending = true;
  requestAnimationFrame(() => {
    timeRafPending = false;
    if (isDragging || isScrubbing || !audio.duration) return;
    progress.style.width = (audio.currentTime / audio.duration) * 100 + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });
});
audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
  if (currentIndex >= 0 && tracks[currentIndex]) {
    tracks[currentIndex].duration = formatTime(audio.duration);
    renderPlaylist();
    renderLibrary();
  }
});
audio.addEventListener('error', () => {
  const failedIndex = currentIndex;
  if (currentIndex >= 0 && tracks[currentIndex]?.isOnline) {
    artistEl.textContent = '播放失败，链接可能失效';
  }
  setTimeout(() => {
    if (currentIndex === failedIndex) skipFailedTrack('SKIP PLAY ERROR');
  }, 0);
});

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^/.]+$/, '');
    const trackObj = {
      name, artist: '本地音乐', album: '', url, duration: null,
      cover: null, isOnline: false, blob: file
    };
    await readMetadata(file, trackObj);
    tracks.push(trackObj);
  }
  if (isShuffle) rebuildShuffle();
  renderPlaylist();
  renderLibrary();
  updateStatusHint();
  persistAll();
  if (currentIndex === -1) loadTrack(0);
  fileInput.value = '';
});

function readMetadata(file, trackObj) {
  return new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') { resolve(); return; }
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags;
        if (tags.title) trackObj.name = tags.title;
        if (tags.artist) trackObj.artist = tags.artist;
        if (tags.album) trackObj.album = tags.album;
        if (tags.picture) {
          const { data, format } = tags.picture;
          const CHUNK = 0x8000;
          let binary = '';
          for (let i = 0; i < data.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK));
          }
          trackObj.cover = `data:${format};base64,${window.btoa(binary)}`;
        }
        resolve();
      },
      onError: () => resolve()
    });
  });
}

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  e.preventDefault();
});
document.addEventListener('selectstart', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  e.preventDefault();
});

async function bootstrap() {
  loadSettings();
  loadHistory();
  loadFavorites();
  const saved = await loadTracksFromDB();
  if (saved.length) {
    tracks = saved;
    if (currentIndex >= tracks.length) currentIndex = tracks.length ? 0 : -1;
    if (isShuffle) rebuildShuffle();
  }
  updatePlayIcon();
  updateModeIcons();
  updateScrubToggle();
  updateFavButton();
  updateStatusHint();
  applyCoverAnimClass();
  applySheetPrefs();
  renderPlaylist();
  renderLibrary();
  renderFavList();
  if (currentIndex >= 0 && tracks[currentIndex]) {
    await loadTrack(currentIndex);
  }
}

const coverAnimSelect = document.getElementById('coverAnimSelect');
if (coverAnimSelect) {
  coverAnimSelect.value = coverAnimMode;
  coverAnimSelect.addEventListener('change', () => {
    coverAnimMode = coverAnimSelect.value;
    localStorage.setItem('ipodCoverAnim', coverAnimMode);
    applyCoverAnimClass();
    haptic(10);
  });
}

bootstrap();