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

const API_BASE = 'https://music-api.gdstudio.xyz/api.php';
// 若使用代理可改为： const API_BASE = '/api.php';

let tracks = [];
let currentIndex = -1;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0;
let shuffledOrder = [];
let scrubEnabled = true; // 轮盘滑动调进度开关
let playHistory = []; // 最近播放记录
let favorites = [];   // 收藏列表（可导出）

// ========== 本地持久化（IndexedDB 歌曲 + localStorage 设置）==========
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
      // 本地文件把二进制存进 DB，下次打开可恢复
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
      currentIndex,
      isShuffle,
      repeatMode,
      scrubEnabled
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
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  } catch (_) {}
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
  if (currentIndex < 0 || !tracks[currentIndex]) {
    flashStatus('NO TRACK');
    return;
  }
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

  favListEl.querySelectorAll('.fav-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.fav-remove')) return;
      const i = parseInt(el.dataset.favIndex, 10);
      playFavorite(favorites[i]);
    });
  });
  favListEl.querySelectorAll('.fav-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.favIndex, 10);
      favorites.splice(i, 1);
      saveFavorites();
      renderFavList();
      updateFavButton();
    });
  });
}

async function playFavorite(item) {
  if (!item) return;
  // 若播放列表已有，直接切到
  const exist = tracks.findIndex((t) => trackKey(t) === trackKey(item));
  if (exist >= 0) {
    await loadTrack(exist);
    audio.play().catch(() => {});
    closeSheetPanel();
    return;
  }
  // 在线收藏：加入列表再播
  if (item.isOnline && item.id) {
    tracks.push({
      id: item.id,
      name: item.name,
      artist: item.artist,
      album: item.album || '',
      pic_id: item.pic_id,
      source: item.source || 'netease',
      isOnline: true,
      url: null,
      cover: item.cover || null,
      duration: item.duration || null
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
  // 本地收藏没有文件数据，无法直接播放
  flashStatus('NEED RE-IMPORT');
  alert('该收藏是本地歌曲，请到「本地」重新导入同名文件后再播放。');
}

function exportFavorites() {
  const data = {
    type: 'ipod-favorites',
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites
  };
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
      if (!Array.isArray(list) || !list.length) {
        alert('文件里没有可用的收藏列表');
        return;
      }
      let added = 0;
      list.forEach((item) => {
        if (!item || !item.name) return;
        const norm = toFavItem({
          name: item.name,
          artist: item.artist || '',
          album: item.album || '',
          cover: item.cover || null,
          isOnline: item.isOnline !== false && !!(item.id || item.isOnline),
          id: item.id || null,
          source: item.source || 'netease',
          pic_id: item.pic_id || null,
          duration: item.duration || null
        });
        if (!favorites.some((f) => trackKey(f) === trackKey(norm))) {
          favorites.push(norm);
          added++;
        }
      });
      saveFavorites();
      renderFavList();
      updateFavButton();
      alert(`已导入，新增 ${added} 首（已自动跳过重复）`);
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
  updateFavButton();
  updateStatusHint();
  renderPlaylist();
  renderLibrary();
  renderFavList();
  flashStatus('CLEARED');
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function updateModeIcons() {
  shuffleIcon.classList.toggle('active', isShuffle);
  shuffleBtn.classList.toggle('active', isShuffle);
  repeatIcon.classList.toggle('active', repeatMode > 0);
  repeatBtn.classList.toggle('active', repeatMode > 0);
  if (repeatMode === 2) {
    repeatIcon.textContent = '🔂';
    repeatBtn.textContent = '🔂';
  } else {
    repeatIcon.textContent = '🔁';
    repeatBtn.textContent = '🔁';
  }
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
  updateStatusHint();
}

let statusHintTimer = null;

function updateStatusHint() {
  if (!statusHintBtn) return;
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

/** 临时显示英文状态（切歌等），片刻后恢复 */
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

function applyCoverAnimClass() {
  if (!coverBox) return;
  coverBox.classList.remove('anim-flip', 'anim-fade', 'anim-zoom', 'anim-slide');
  if (coverAnimMode && coverAnimMode !== 'none') {
    coverBox.classList.add('anim-' + coverAnimMode);
  }
}

/** 封面切歌动画 direction: 'prev' | 'next' */
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

/** 轻触感反馈（iOS Safari 需在用户手势内；部分环境可能无震动） */
function haptic(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) {}
}

/** 音源列表与检测 */
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
  sourceSelect.innerHTML = list.map(s =>
    `<option value="${s.value}">${s.name}</option>`
  ).join('');
  if (list.some(s => s.value === current)) sourceSelect.value = current;
  else if (list.length) sourceSelect.value = list[0].value;
}

async function testSource(source) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const url = new URL(API_BASE);
    url.searchParams.set('types', 'search');
    url.searchParams.set('source', source);
    url.searchParams.set('name', '周杰伦');
    url.searchParams.set('count', '1');
    url.searchParams.set('pages', '1');
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'Referer': 'https://music.gdstudio.xyz/'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function checkAllSources() {
  const btn = document.getElementById('sourceCheckBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '检测中';
    btn.classList.add('checking');
  }
  if (searchStatus) {
    searchStatus.textContent = '正在检测音源…';
    searchStatus.classList.remove('error');
  }
  // 切到在线面板
  tabOnline?.click();

  const ok = [];
  for (const s of ALL_SOURCES) {
    if (searchStatus) searchStatus.textContent = `检测中：${s.name}…`;
    const pass = await testSource(s.value);
    if (pass) ok.push(s);
  }

  rebuildSourceSelect(ok.length ? ok : ALL_SOURCES);
  if (btn) {
    btn.disabled = false;
    btn.textContent = '检测';
    btn.classList.remove('checking');
  }
  if (searchStatus) {
    if (ok.length === 0) {
      searchStatus.textContent = '全部音源检测失败（可能跨域或网络问题）';
      searchStatus.classList.add('error');
    } else if (ok.length < ALL_SOURCES.length) {
      const names = ok.map(s => s.name).join('、');
      searchStatus.textContent = `保留 ${ok.length} 个可用音源：${names}`;
      searchStatus.classList.remove('error');
    } else {
      searchStatus.textContent = '全部音源可用';
      searchStatus.classList.remove('error');
    }
  }
  haptic(12);
}

// ========== API ==========
async function apiFetch(params) {
  const url = new URL(API_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Referer': 'https://music.gdstudio.xyz/'
    }
  });
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
  } catch {
    return null;
  }
}

// ========== 播放逻辑 ==========
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

async function loadTrack(index, opts = {}) {
  if (index < 0 || index >= tracks.length) return;
  const { direction } = opts; // 'prev' | 'next' | undefined
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
      if (!url) throw new Error('无播放地址');
      track.url = url;
      if (!track.cover && track.pic_id) {
        const pic = await getCoverUrl(track.pic_id, track.source || 'netease');
        if (pic) {
          track.cover = pic;
          coverImg.src = pic;
          coverImg.classList.add('show');
          coverBox.classList.add('has-cover');
        }
      }
    } catch (err) {
      titleEl.textContent = '获取失败';
      artistEl.textContent = err.message || '请换一首';
      return;
    }
    titleEl.textContent = track.name;
  }

  audio.src = track.url;
  audio.load();
  pushHistory(track);
  saveSettings();
  updateFavButton();
}

function togglePlay() {
  if (tracks.length === 0) {
    openSheet();
    return;
  }
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

function nextTrack() {
  if (tracks.length === 0) return;
  const next = getNextIndex(1);
  if (next >= 0) {
    flashStatus('NEXT TRACK');
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

// ========== 列表渲染 ==========
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
    </div>
  `).join('');

  playlistEl.querySelectorAll('.track-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      loadTrack(idx).then(() => {
        audio.play().catch(() => {});
        closeSheetPanel();
      });
    });
  });
}

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

  libraryList.querySelectorAll('.library-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      loadTrack(idx).then(() => audio.play().catch(() => {}));
    });
  });
}

function renderSearchResults(list) {
  if (!list || list.length === 0) {
    searchResults.innerHTML = `<div class="empty-tip">没有找到相关歌曲</div>`;
    return;
  }
  searchResults.innerHTML = list.map((item, i) => {
    const artist = Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || '未知');
    return `
      <div class="track-item online" data-search-index="${i}">
        <div class="track-info-list">
          <div class="track-name">${escapeHtml(item.name)}</div>
          <div class="track-artist-list">${escapeHtml(artist)} · ${escapeHtml(item.album || '')}</div>
        </div>
        <button class="add-btn-row" data-search-index="${i}">＋</button>
      </div>
    `;
  }).join('');

  searchResults.querySelectorAll('.track-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.add-btn-row')) return;
      const idx = parseInt(el.dataset.searchIndex);
      playOnlineTrack(list[idx]);
    });
  });
  searchResults.querySelectorAll('.add-btn-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.searchIndex);
      addOnlineTrack(list[idx]);
      btn.textContent = '✓';
      btn.style.color = '#30d158';
    });
  });
}

function addOnlineTrack(item) {
  const artist = Array.isArray(item.artist) ? item.artist.join(' / ') : (item.artist || '未知艺术家');
  if (tracks.some(t => t.isOnline && t.id === item.id && t.source === item.source)) return;
  tracks.push({
    id: item.id,
    name: item.name,
    artist,
    album: item.album || '',
    pic_id: item.pic_id,
    source: item.source || sourceSelect.value,
    isOnline: true,
    url: null,
    cover: null,
    duration: null
  });
  if (isShuffle) rebuildShuffle();
  renderPlaylist();
  renderLibrary();
  updateStatusHint();
  persistAll();
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
    searchStatus.textContent = '搜索失败（可能跨域，请配置代理）';
    searchStatus.classList.add('error');
    searchResults.innerHTML = `<div class="empty-tip">搜索失败</div>`;
  }
}

function openSheet() { sheetPanel.classList.add('show'); }
function closeSheetPanel() { sheetPanel.classList.remove('show'); }

// 事件
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
nextBtn.addEventListener('click', () => { haptic(10); nextTrack(); });
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

// 进度条
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

// 点击轮：仅外圈圆环 + 顺/逆时针角度滑动调进度（非左右拖）
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
  return {
    angle: Math.atan2(dy, dx),
    r: Math.hypot(dx, dy)
  };
}

function isOnRing(r) {
  // 外圈圆环：排除中心按钮区域，允许略超出外缘
  return r >= rInner && r <= rOuter * 1.08;
}

function onWheelStart(e) {
  if (!scrubEnabled) return;
  if (e.target.closest('.wheel-btn')) return;
  const rect = wheelOuter.getBoundingClientRect();
  wheelCx = rect.left + rect.width / 2;
  wheelCy = rect.top + rect.height / 2;
  rOuter = rect.width / 2;
  rInner = rOuter * 0.40; // 约等于中心圆外侧
  const { angle, r } = getPolar(e, wheelCx, wheelCy);
  if (!isOnRing(r)) return; // 必须点在外圈圆环上
  lastAngle = angle;
  isScrubbing = true;
  scrubStartTime = audio.currentTime || 0;
  haptic(8);
  e.preventDefault();
}

function onWheelMove(e) {
  if (!isScrubbing || !audio.duration) return;
  const { angle, r } = getPolar(e, wheelCx, wheelCy);
  // 手指滑出圆环太远则忽略本次位移（防左右直线误触）
  if (!isOnRing(r)) {
    e.preventDefault();
    return;
  }
  let delta = angle - lastAngle;
  // 处理 ±π 边界，保证顺时针 / 逆时针连续
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  // 过滤极小抖动
  if (Math.abs(delta) < 0.004) {
    e.preventDefault();
    return;
  }
  // 一整圈约对应歌曲 55% 时长，可多圈累计
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

// 音频事件
audio.addEventListener('play', () => { isPlaying = true; updatePlayIcon(); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayIcon(); });
audio.addEventListener('ended', () => {
  if (repeatMode === 2) { audio.currentTime = 0; audio.play(); }
  else nextTrack();
});
audio.addEventListener('timeupdate', () => {
  if (!isDragging && !isScrubbing && audio.duration) {
    progress.style.width = (audio.currentTime / audio.duration) * 100 + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }
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
  if (currentIndex >= 0 && tracks[currentIndex]?.isOnline) {
    artistEl.textContent = '播放失败，链接可能失效';
  }
});

// 本地上传
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^/.]+$/, '');
    const trackObj = {
      name,
      artist: '本地音乐',
      album: '',
      url,
      duration: null,
      cover: null,
      isOnline: false,
      blob: file // 用于 IndexedDB 持久化
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
          let base64 = '';
          for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i]);
          trackObj.cover = `data:${format};base64,${window.btoa(base64)}`;
        }
        resolve();
      },
      onError: () => resolve()
    });
  });
}

// 全页禁止长按选中 / 复制（输入框除外）
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
  renderPlaylist();
  renderLibrary();
  renderFavList();
  // 恢复上次播到的曲目（不自动播放，避免浏览器拦截）
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
