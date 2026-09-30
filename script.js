const WHEEL_POLL_INTERVAL = 3000;

let leaderboardPlayers = [];
let wheelPlayers = [];
let wheelWinners = [];
let syncedWinners = null;
let wheelWinnerQueue = [];
let activeLiveWinner = null;
let wheelRotation = 0;
let wheelBusy = false;
let adminMode = false;
let wheelSyncInFlight = false;
let activeHeroLayer = -1;
let heroBannerRequest = 0;
let heroBannerSources = { desktop: [], tablet: [], mobile: [] };
let activeHeroSourceKey = '';
let pendingHeroSourceKey = '';
let heroResizeFrame = 0;

const elements = {
  body: document.body,
  podium: document.querySelector('#podium'),
  bodyRows: document.querySelector('#leaderboardBody'),
  count: document.querySelector('#playerCount'),
  season: document.querySelector('#seasonNumber'),
  tournaments: document.querySelector('#tournamentCount'),
  totalPoints: document.querySelector('#totalPoints'),
  updated: document.querySelector('#lastUpdated'),
  refresh: document.querySelector('#refreshBtn'),
  search: document.querySelector('#playerSearch'),
  particleField: document.querySelector('#particleField'),
  giveawayWheel: document.querySelector('#giveawayWheel'),
  wheelLabels: document.querySelector('#wheelLabels'),
  wheelStatus: document.querySelector('#wheelStatus'),
  wheelResult: document.querySelector('#wheelResult'),
  wheelRefreshBtn: document.querySelector('#wheelRefreshBtn'),
  wheelRefreshNote: document.querySelector('#wheelRefreshNote'),
  spinBtn: document.querySelector('#spinBtn'),
  resetWheelBtn: document.querySelector('#resetWheelBtn'),
  adminLock: document.querySelector('#adminLock'),
  winnersList: document.querySelector('#winnersList'),
  winnersEmpty: document.querySelector('#winnersEmpty'),
  winnerModal: document.querySelector('#winnerModal'),
  closeWinnerModal: document.querySelector('#closeWinnerModal'),
  confetti: document.querySelector('#confetti'),
  wheelConfetti: document.querySelector('#wheelConfetti'),
  adminModal: document.querySelector('#adminModal'),
  adminForm: document.querySelector('#adminForm'),
  adminPinInput: document.querySelector('#adminPinInput'),
  adminPinError: document.querySelector('#adminPinError'),
  closeAdminModal: document.querySelector('#closeAdminModal')
};

function numberFrom(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return numberFrom(value).toLocaleString('en-US');
}

function normalizePlayer(raw) {
  const levelKey = Object.keys(raw || {}).find((key) => key.toLowerCase() === 'level' || key.includes('المستوى'));
  return {
    name: String(raw?.Player ?? '').trim(),
    rank: String(raw?.Role ?? 'PRO').trim(),
    level: String(raw?.Level ?? (levelKey ? raw[levelKey] : '-') ?? '-').trim(),
    points: numberFrom(raw?.Points),
    tournaments: numberFrom(raw?.Tournaments),
    avatar: String(raw?.Avatar ?? '').trim()
  };
}

function rankClass(rank) {
  const normalized = rank.toLowerCase();
  if (normalized.includes('legend') || normalized.includes('أسطور')) return 'legend';
  if (normalized.includes('vip')) return 'vip';
  return 'pro';
}

function initials(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PR';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}

function avatarMarkup(player, className) {
  const fallback = initials(player.name);
  const avatarUrl = player.avatar;
  const hasValidAvatar = /^https?:\/\//i.test(avatarUrl);
  const image = hasValidAvatar
    ? `<img class="avatar-image" src="${escapeHtml(avatarUrl)}" alt="صورة ${escapeHtml(player.name)}" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="${className}">${image}<span class="avatar-fallback">${fallback}</span></span>`;
}

function renderPodium(players) {
  const top = players.slice(0, 3);
  const slots = [top[1], top[0], top[2]];
  const classes = ['second', 'first', 'third'];
  const medals = ['02', '01', '03'];
  const labels = ['SILVER', 'CHAMPION', 'BRONZE'];
  elements.podium.innerHTML = slots.map((player, index) => {
    const current = player;
    if (!current) {
      return `<article class="podium-card ${classes[index]} is-empty"><div class="podium-avatar-wrap"><span class="medal">${medals[index]}</span><div class="avatar">--</div></div><h3>غير متاح</h3><span class="rank-title">بانتظار بيانات اللاعب</span><div class="podium-details"><div><strong>--</strong><small>نقطة</small></div><div><strong>--</strong><small>بطولة</small></div></div></article>`;
    }
    return `<article class="podium-card ${classes[index]}">
      ${index === 1 ? '<i class="fa-solid fa-crown crown" aria-label="المركز الأول"></i>' : ''}
      <div class="podium-avatar-wrap"><span class="medal">${medals[index]}</span>${avatarMarkup(current, 'avatar')}</div>
      <h3>${current.name}</h3><span class="rank-title">${labels[index]} / ${current.rank} / LVL ${current.level}</span>
      <div class="podium-details"><div><strong>${current.points.toLocaleString('en-US')}</strong><small>نقطة</small></div><div><strong>${current.tournaments}</strong><small>بطولة</small></div></div>
    </article>`;
  }).join('');
}

function renderTable(players) {
  const tablePlayers = players.filter((player) => player.position > 3);
  if (!tablePlayers.length) {
    elements.bodyRows.innerHTML = '<tr><td colspan="6" class="loading-cell">لا يوجد لاعب بهذا الاسم</td></tr>';
    return;
  }
  elements.bodyRows.innerHTML = tablePlayers.map((player) => `<tr>
    <td>${String(player.position).padStart(2, '0')}</td>
    <td><div class="player-cell">${avatarMarkup(player, 'player-avatar')}${player.name}</div></td>
    <td><span class="rank-badge ${rankClass(player.rank)}">${player.rank}</span></td>
    <td>${player.level}</td>
    <td class="points">${player.points.toLocaleString('en-US')}</td>
    <td>${player.tournaments}</td>
  </tr>`).join('');
}

function renderPlayers(players) {
  leaderboardPlayers = [...players].sort((a, b) => b.points - a.points).map((player, index) => ({ ...player, position: index + 1 }));
  elements.count.textContent = String(leaderboardPlayers.length).padStart(2, '0');
  renderPodium(leaderboardPlayers);
  filterLeaderboard(elements.search.value);
  elements.updated.textContent = `آخر تحديث ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
}

function normalizeSearch(value) {
  return String(value || '').toLocaleLowerCase().replace(/\s+/g, '');
}

function filterLeaderboard(value) {
  const query = normalizeSearch(value);
  const filtered = leaderboardPlayers.filter((player) => {
    const name = normalizeSearch(player.name);
    const position = String(player.position);
    return !query || name.includes(query) || position === query;
  });
  renderTable(filtered);
}

function normalizeWheelName(value) {
  return String(value ?? '').trim();
}

function uniqueNames(names) {
  return [...new Set(names.map(normalizeWheelName).filter(Boolean))];
}

function renderWheel() {
  const segmentCount = Math.max(wheelPlayers.length, 1);
  const segmentAngle = 360 / segmentCount;
  const colors = ['#00cec9', '#6c5ce7', '#ffc857', '#d94f70', '#2c8ca0', '#8b5cf6'];
  elements.giveawayWheel.style.setProperty('--segment-angle', `${segmentAngle}deg`);
  elements.giveawayWheel.style.setProperty('--segment-count', segmentCount);
  elements.giveawayWheel.style.setProperty('--wheel-colors', colors.join(', '));
  elements.giveawayWheel.style.background = `conic-gradient(from -${segmentAngle / 2}deg, ${wheelPlayers.map((_, index) => {
    const start = index * segmentAngle;
    const end = (index + 1) * segmentAngle;
    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  }).join(', ')})`;
  elements.wheelLabels.innerHTML = wheelPlayers.map((name, index) => `<span class="wheel-label" style="--label-angle: ${index * segmentAngle}deg">${escapeHtml(name)}</span>`).join('');
  if (!wheelBusy) elements.wheelStatus.textContent = wheelPlayers.length ? `${wheelPlayers.length} مشارك متاح` : 'لا توجد أسماء متاحة';
  elements.spinBtn.disabled = true;
  elements.resetWheelBtn.disabled = !wheelPlayers.length || wheelBusy;
  renderWinners();
}

function renderWinners() {
  const visibleWinners = wheelWinners.slice(0, 10);
  const existingRows = new Map([...elements.winnersList.children].map((row) => [row.dataset.winner, row]));
  const fragment = document.createDocumentFragment();

  visibleWinners.forEach((name, index) => {
    let row = existingRows.get(name);
    if (!row) {
      row = document.createElement('li');
      row.dataset.winner = name;
      row.innerHTML = '<span></span><strong></strong><i class="fa-solid fa-check"></i>';
      row.classList.add('new-entry');
      window.setTimeout(() => {
        row.classList.remove('new-entry', 'slide-in', 'fade-in');
      }, 1000);
    }
    row.querySelector('span').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('strong').textContent = name;
    fragment.appendChild(row);
  });

  elements.winnersList.replaceChildren(fragment);
  elements.winnersEmpty.hidden = wheelWinners.length > 0;
}

async function fetchWheelState() {
  const response = await fetch('https://opensheet.elk.sh/15OuMkXW22mZXAbLfjw9tdap6uut3HHJJx8ekR-EGStI/sheet1');
  if (!response.ok) throw new Error('Wheel API unavailable');
  const data = await response.json();
  const rows = Array.isArray(data) ? data : [];
  return {
    players: uniqueNames(rows.map((row) => row?.Player)),
    winners: uniqueNames(rows.map((row) => row?.Winners)).slice(0, 10)
  };
}

function updateWheelControls() {
  elements.spinBtn.hidden = adminMode;
  elements.resetWheelBtn.hidden = !adminMode;
  elements.adminLock.classList.toggle('is-unlocked', adminMode);
  elements.adminLock.innerHTML = `<i class="fa-solid fa-${adminMode ? 'lock-open' : 'lock'}"></i>`;
  elements.wheelResult.textContent = adminMode ? 'وضع المنظم: اختر فائزاً تجريبياً' : 'بانتظار المنظم لبدء القرعة';
  renderWheel();
}

function playWheelSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(180, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(720, audioContext.currentTime + 0.35);
    gain.gain.setValueAtTime(0.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.55);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.55);
  } catch (error) {
    // Audio is optional when browser autoplay policy blocks it.
  }
}

function showWinnerCelebration() {
  const confettiMarkup = Array.from({ length: 48 }, (_, index) => `<i style="--confetti-x: ${Math.random() * 100}%; --confetti-delay: ${Math.random() * .8}s; --confetti-color: hsl(${index * 37 % 360} 90% 65%)"></i>`).join('');
  [elements.confetti, elements.wheelConfetti].forEach((container) => {
    container.innerHTML = confettiMarkup;
    container.classList.remove('is-celebrating');
    void container.offsetWidth;
    container.classList.add('is-celebrating');
  });
}

function showWinnerModal() {
  elements.winnerModal.hidden = false;
  showWinnerCelebration();
}

function finishLiveSpin(winner) {
  wheelPlayers = wheelPlayers.filter((name) => name !== winner);
  activeLiveWinner = null;
  if (!wheelWinners.includes(winner)) wheelWinners.push(winner);
  wheelBusy = false;
  elements.wheelResult.textContent = `الفائز المباشر: ${winner}`;
  elements.wheelStatus.textContent = `${wheelPlayers.length} مشارك متاح`;
  showWinnerCelebration();
  renderWheel();
  if (wheelWinners.length >= 10) showWinnerModal();
  processWinnerQueue();
}

function spinToWinner(winner, isAdminTest = false) {
  if (wheelBusy || !wheelPlayers.length) return;
  const selectedIndex = wheelPlayers.indexOf(winner);
  if (selectedIndex < 0) return;
  wheelBusy = true;
  const segmentAngle = 360 / wheelPlayers.length;
  wheelRotation += 360 * 6 + (360 - (selectedIndex * segmentAngle + segmentAngle / 2) - (wheelRotation % 360));
  elements.giveawayWheel.style.setProperty('--wheel-rotation', `${wheelRotation}deg`);
  elements.wheelResult.textContent = isAdminTest ? 'تجربة المنظم قيد التشغيل...' : 'جاري استقبال نتيجة المنظم...';
  elements.wheelStatus.textContent = 'الإشارة قيد المعالجة';
  if (!isAdminTest) activeLiveWinner = winner;
  playWheelSound();
  window.setTimeout(() => {
    if (isAdminTest) {
      wheelBusy = false;
      elements.wheelResult.textContent = `التجربة توقفت على: ${winner}`;
      renderWheel();
      elements.wheelStatus.textContent = 'انقل الاسم إلى عمود Winners';
      return;
    }
    finishLiveSpin(winner);
  }, 4200);
}

function processWinnerQueue() {
  if (wheelBusy || !wheelWinnerQueue.length) return;
  const nextWinner = wheelWinnerQueue.shift();
  spinToWinner(nextWinner);
}

async function syncWheelState() {
  if (wheelSyncInFlight) return false;
  wheelSyncInFlight = true;
  try {
    const state = await fetchWheelState();
    const newWinners = syncedWinners === null
      ? []
      : state.winners.filter((name) => !syncedWinners.includes(name));
    syncedWinners = state.winners;
    if (syncedWinners.length === 0 && wheelWinners.length > 0 && !wheelBusy) wheelWinners = [];
    if (syncedWinners !== null && newWinners.length) {
      newWinners.forEach((winner) => {
        if (!wheelWinnerQueue.includes(winner) && !wheelWinners.includes(winner)) wheelWinnerQueue.push(winner);
        if (!wheelPlayers.includes(winner)) wheelPlayers.push(winner);
      });
    }
    const availableNames = uniqueNames([...state.players, ...newWinners]);
    wheelPlayers = availableNames.filter((name) => !wheelWinners.includes(name) || wheelWinnerQueue.includes(name) || name === activeLiveWinner);
    wheelWinners = state.winners.filter((name) => name !== activeLiveWinner && !wheelWinnerQueue.includes(name));
    if (syncedWinners.length === 0 && !wheelBusy) wheelWinners = [];
    if (!wheelBusy) {
      elements.wheelStatus.textContent = `${wheelPlayers.length} مشارك متاح`;
      renderWheel();
      processWinnerQueue();
    }
    return true;
  } catch (error) {
    elements.wheelStatus.textContent = 'تعذر تحديث بيانات القرعة';
    return false;
  } finally {
    wheelSyncInFlight = false;
  }
}

async function refreshWheelData() {
  if (elements.wheelRefreshBtn.disabled) return;
  elements.wheelRefreshBtn.disabled = true;
  elements.wheelRefreshBtn.classList.add('is-loading');
  elements.wheelRefreshNote.textContent = 'جاري تحديث البيانات...';
  const refreshed = await syncWheelState();
  elements.wheelRefreshNote.textContent = refreshed ? 'تم تحديث البيانات الآن' : 'تعذر تحديث البيانات';
  elements.wheelRefreshBtn.classList.remove('is-loading');
  elements.wheelRefreshBtn.disabled = false;
  window.setTimeout(() => {
    elements.wheelRefreshNote.textContent = 'مزامنة كل 3 ثوانٍ';
  }, 1800);
}

function adminTestSpin() {
  if (!adminMode || wheelBusy || !wheelPlayers.length) return;
  const winner = wheelPlayers[Math.floor(Math.random() * wheelPlayers.length)];
  spinToWinner(winner, true);
}

function toggleAdminMode() {
  if (adminMode) {
    adminMode = false;
    updateWheelControls();
    return;
  }
  elements.adminModal.hidden = false;
  elements.adminPinInput.value = '';
  elements.adminPinError.hidden = true;
  elements.adminPinInput.focus();
}

async function fetchPlayers() {
  const response = await fetch('https://opensheet.elk.sh/1OQgoEjv83opeB4qv7Y7LzZF3hykGJRGYcDJOt2Pcdd4/sheet1');
  if (!response.ok) throw new Error('Players API unavailable');
  const data = await response.json();
  const players = Array.isArray(data) ? data.map(normalizePlayer).filter((player) => player.name) : [];
  return players;
}

function updateBrandLogo(value) {
  const logoImage = document.querySelector('.brand-logo');
  const logoValue = String(value ?? '').trim();
  if (!logoImage) return;
  if (!logoValue) {
    logoImage.hidden = true;
    return;
  }

  let logoUrl;
  try {
    logoUrl = new URL(logoValue, window.location.href);
  } catch (error) {
    logoImage.hidden = true;
    return;
  }
  if (!['http:', 'https:'].includes(logoUrl.protocol)) {
    logoImage.hidden = true;
    return;
  }

  const preload = new Image();
  preload.onload = () => {
    logoImage.src = logoUrl.href;
    logoImage.hidden = false;

    let favicon = document.querySelector('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.removeAttribute('type');
    favicon.href = logoUrl.href;
  };
  preload.onerror = () => { logoImage.hidden = true; };
  preload.src = logoUrl.href;
}

function applyHeroBannerForViewport() {
  const layers = document.querySelectorAll('.leaderboard-hero__layer');
  if (!layers.length) return;

  const width = window.innerWidth;
  const breakpoint = width > 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile';
  const sources = heroBannerSources[breakpoint];
  const sourceKey = `${breakpoint}:${sources.join('|')}`;

  if (activeHeroSourceKey === sourceKey) {
    if (pendingHeroSourceKey) {
      heroBannerRequest += 1;
      pendingHeroSourceKey = '';
    }
    return;
  }
  if (pendingHeroSourceKey === sourceKey) return;

  const requestId = ++heroBannerRequest;
  pendingHeroSourceKey = sourceKey;

  const clearBanner = () => {
    if (requestId !== heroBannerRequest) return;
    layers.forEach((layer) => layer.classList.remove('is-visible'));
    activeHeroLayer = -1;
    pendingHeroSourceKey = '';
    activeHeroSourceKey = sourceKey;
  };

  const loadSource = (index) => {
    if (requestId !== heroBannerRequest) return;
    const source = sources[index];
    if (!source) {
      clearBanner();
      return;
    }

    const preload = new Image();
    preload.onload = () => {
      if (requestId !== heroBannerRequest) return;
      if (Array.from(layers).some((layer) => layer.classList.contains('is-visible') && layer.style.backgroundImage.includes(source))) {
        pendingHeroSourceKey = '';
        activeHeroSourceKey = sourceKey;
        return;
      }

      const nextIndex = activeHeroLayer === 0 ? 1 : 0;
      const nextLayer = layers[nextIndex];
      nextLayer.style.backgroundImage = `linear-gradient(to bottom, rgba(10, 14, 23, 0.22), rgba(10, 14, 23, 0.38)), url("${source}")`;
      requestAnimationFrame(() => {
        if (requestId !== heroBannerRequest) return;
        nextLayer.classList.add('is-visible');
        if (activeHeroLayer >= 0) layers[activeHeroLayer].classList.remove('is-visible');
        activeHeroLayer = nextIndex;
        pendingHeroSourceKey = '';
        activeHeroSourceKey = sourceKey;
      });
    };
    preload.onerror = () => loadSource(index + 1);
    preload.src = source;
  };

  loadSource(0);
}

function updateHeroBanner(desktopValue, tabletValue, mobileValue) {
  const toUrl = (value) => {
    const url = String(value ?? '').trim();
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.href);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (error) {
      return '';
    }
  };
  const desktop = toUrl(desktopValue);
  const tablet = toUrl(tabletValue);
  const mobile = toUrl(mobileValue);
  heroBannerSources = {
    desktop: [...new Set([desktop].filter(Boolean))],
    tablet: [...new Set([tablet, desktop].filter(Boolean))],
    mobile: [...new Set([mobile, tablet, desktop].filter(Boolean))]
  };
  applyHeroBannerForViewport();
}

async function fetchStats() {
  const response = await fetch('https://opensheet.elk.sh/1VCEryDPa8nauq0kTAGQS6msA-z_-rZbxR2qTOEEXGqQ/Stats');
  if (!response.ok) throw new Error('Stats API unavailable');
  const data = await response.json();
  const stats = Array.isArray(data) ? data[0] : null;
  if (stats) {
    updateBrandLogo(stats.Logo);
    updateHeroBanner(stats.Panar, stats.Panar2, stats.Panar3 ?? stats['Panar 3']);
  }
  if (!stats || stats.season == null || stats.TotalTournaments == null) throw new Error('Stats data is empty');
  return stats;
}

function renderStats(stats, players) {
  elements.season.textContent = String(numberFrom(stats.season)).padStart(2, '0');
  elements.tournaments.textContent = formatNumber(stats.TotalTournaments);
  elements.count.textContent = String(players.length).padStart(2, '0');
  elements.totalPoints.textContent = formatNumber(players.reduce((total, player) => total + player.points, 0));
}

async function loadData() {
  elements.refresh.classList.add('is-loading');
  const [playersResult, statsResult] = await Promise.allSettled([fetchPlayers(), fetchStats()]);
  const players = playersResult.status === 'fulfilled' ? playersResult.value : [];
  renderPlayers(players);
  if (statsResult.status === 'fulfilled') renderStats(statsResult.value, players);
  else {
    elements.season.textContent = '';
    elements.tournaments.textContent = '';
    elements.totalPoints.textContent = formatNumber(players.reduce((total, player) => total + player.points, 0));
  }
  if (playersResult.status === 'rejected' || statsResult.status === 'rejected') elements.updated.textContent = 'تم تحديث البيانات المتاحة';
  elements.refresh.classList.remove('is-loading');
}

function navigate(route) {
  const isAbout = route === 'about';
  document.querySelectorAll('[data-view]').forEach((view) => {
    const visible = view.dataset.view === route;
    view.hidden = !visible;
    view.classList.toggle('is-visible', visible);
  });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.route === route));
  if (window.location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
  elements.body.classList.toggle('about-active', isAbout);
  if (route === 'wheel') syncWheelState();
}

function createParticles() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 38; index += 1) {
    const particle = document.createElement('i');
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDuration = `${7 + Math.random() * 15}s`;
    particle.style.animationDelay = `${Math.random() * -18}s`;
    particle.style.opacity = `${0.18 + Math.random() * 0.6}`;
    fragment.appendChild(particle);
  }
  elements.particleField.appendChild(fragment);
}

document.querySelectorAll('[data-route]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  navigate(link.dataset.route);
}));
elements.refresh.addEventListener('click', loadData);
elements.search.addEventListener('input', (event) => filterLeaderboard(event.target.value));
elements.wheelRefreshBtn.addEventListener('click', refreshWheelData);
elements.spinBtn.addEventListener('click', adminTestSpin);
elements.resetWheelBtn.addEventListener('click', adminTestSpin);
elements.adminLock.addEventListener('click', toggleAdminMode);
elements.adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = elements.adminForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch('/api/verify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: elements.adminPinInput.value.trim() })
    });
    const result = await response.json();
    elements.adminPinInput.value = '';
    if (response.ok && result.verified) {
      adminMode = true;
      elements.adminModal.hidden = true;
      updateWheelControls();
    } else {
      elements.adminPinError.textContent = 'كلمة السر غير صحيحة أو تعذر التحقق';
      elements.adminPinError.hidden = false;
      elements.adminPinInput.select();
    }
  } catch (error) {
    elements.adminPinError.textContent = 'تعذر الاتصال بخدمة التحقق';
    elements.adminPinError.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});
elements.closeAdminModal.addEventListener('click', () => { elements.adminModal.hidden = true; });
elements.adminModal.addEventListener('click', (event) => { if (event.target === elements.adminModal) elements.adminModal.hidden = true; });
elements.closeWinnerModal.addEventListener('click', () => { elements.winnerModal.hidden = true; });
elements.winnerModal.addEventListener('click', (event) => { if (event.target === elements.winnerModal) elements.winnerModal.hidden = true; });
window.addEventListener('hashchange', () => {
  const route = window.location.hash.slice(1);
  navigate(route === 'about' || route === 'wheel' ? route : 'leaderboard');
});
window.addEventListener('resize', () => {
  if (heroResizeFrame) cancelAnimationFrame(heroResizeFrame);
  heroResizeFrame = requestAnimationFrame(() => {
    heroResizeFrame = 0;
    applyHeroBannerForViewport();
  });
});

createParticles();
loadData();
updateWheelControls();
window.setInterval(() => {
  if (!document.hidden && window.location.hash === '#wheel') syncWheelState();
}, WHEEL_POLL_INTERVAL);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.location.hash === '#wheel') syncWheelState();
});
const initialRoute = window.location.hash.slice(1);
navigate(initialRoute === 'about' || initialRoute === 'wheel' ? initialRoute : 'leaderboard');
