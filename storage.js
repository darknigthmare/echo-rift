(function () {
  'use strict';

  const PROFILE_KEY = 'echo-rift-profile-v1';
  const SETTINGS_KEY = 'echo-rift-settings-v1';
  const ACTIVE_SESSION_KEY = 'echo-rift-active-session-v1';
  const ACTIVE_SESSION_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
  const DB_NAME = 'echo-rift-audio-library';
  const DB_VERSION = 1;
  const STORE_NAME = 'tracks';
  const MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024;
  const AUDIO_EXTENSION = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;

  const defaultProfile = () => ({
    name: 'Récupérateur',
    level: 1,
    xp: 0,
    credits: 0,
    gamesPlayed: 0,
    correctAnswers: 0,
    totalAnswers: 0,
    bestScore: 0,
    bestStreak: 0,
    discovered: [],
    achievements: [],
    campaign: {},
    lastMode: 'solo',
    onboardingComplete: false
  });

  const defaultSettings = () => ({
    volume: 0.72,
    reducedMotion: Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    highContrast: false,
    visualizer: true,
    screenShake: true,
    language: 'fr'
  });

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function finiteNumber(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function normalizeProfile(stored) {
    const fallback = defaultProfile();
    const source = stored && typeof stored === 'object' ? stored : {};
    const campaign = {};
    if (source.campaign && typeof source.campaign === 'object' && !Array.isArray(source.campaign)) {
      Object.entries(source.campaign).forEach(([id, result]) => {
        if (!id || id === '__proto__' || !result || typeof result !== 'object') return;
        campaign[id] = {
          stars: Math.round(finiteNumber(result.stars, 0, 0, 3)),
          best: Math.round(finiteNumber(result.best))
        };
      });
    }
    return {
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 18) : fallback.name,
      level: Math.max(1, Math.round(finiteNumber(source.level, fallback.level, 1, 10000))),
      xp: Math.round(finiteNumber(source.xp)),
      credits: Math.round(finiteNumber(source.credits)),
      gamesPlayed: Math.round(finiteNumber(source.gamesPlayed)),
      correctAnswers: Math.round(finiteNumber(source.correctAnswers)),
      totalAnswers: Math.round(finiteNumber(source.totalAnswers)),
      bestScore: Math.round(finiteNumber(source.bestScore)),
      bestStreak: Math.round(finiteNumber(source.bestStreak)),
      discovered: Array.isArray(source.discovered) ? Array.from(new Set(source.discovered.filter(id => typeof id === 'string'))) : [],
      achievements: Array.isArray(source.achievements) ? Array.from(new Set(source.achievements.filter(id => typeof id === 'string'))) : [],
      campaign,
      lastMode: ['solo', 'party', 'endless', 'campaign'].includes(source.lastMode) ? source.lastMode : fallback.lastMode,
      onboardingComplete: Boolean(source.onboardingComplete)
    };
  }

  function loadProfile() {
    let raw = null;
    try { raw = localStorage.getItem(PROFILE_KEY); } catch (_) { raw = null; }
    return normalizeProfile(safeParse(raw, {}));
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadSettings() {
    let raw = null;
    try { raw = localStorage.getItem(SETTINGS_KEY); } catch (_) { raw = null; }
    const fallback = defaultSettings();
    const stored = safeParse(raw, {});
    return {
      volume: finiteNumber(stored.volume, fallback.volume, 0, 1),
      reducedMotion: stored.reducedMotion == null ? fallback.reducedMotion : Boolean(stored.reducedMotion),
      highContrast: Boolean(stored.highContrast),
      visualizer: stored.visualizer == null ? fallback.visualizer : Boolean(stored.visualizer),
      screenShake: stored.screenShake == null ? fallback.screenShake : Boolean(stored.screenShake),
      language: 'fr'
    };
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadActiveSession() {
    let raw = null;
    try { raw = localStorage.getItem(ACTIVE_SESSION_KEY); } catch (_) { raw = null; }
    const stored = safeParse(raw, null);
    const valid = stored
      && stored.schemaVersion === 1
      && Number.isFinite(stored.savedAt)
      && Date.now() - stored.savedAt <= ACTIVE_SESSION_MAX_AGE
      && stored.config && typeof stored.config === 'object'
      && Array.isArray(stored.players) && stored.players.length >= 1 && stored.players.length <= 4
      && Number.isInteger(stored.questionIndex) && stored.questionIndex >= 0
      && stored.question && typeof stored.question === 'object'
      && ['paused', 'answering', 'loading', 'reveal'].includes(stored.phase);
    if (valid) return stored;
    if (raw) clearActiveSession();
    return null;
  }

  function saveActiveSession(snapshot) {
    try {
      const payload = Object.assign({}, snapshot, { schemaVersion: 1, savedAt: Date.now() });
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function resetProfile() {
    const profile = defaultProfile();
    saveProfile(profile);
    return profile;
  }

  function xpForLevel(level) {
    return 700 + Math.max(0, level - 1) * 350;
  }

  function addXp(profile, amount) {
    let gainedLevels = 0;
    profile.xp += Math.max(0, Math.round(amount));
    while (profile.xp >= xpForLevel(profile.level)) {
      profile.xp -= xpForLevel(profile.level);
      profile.level += 1;
      profile.credits += 125 + profile.level * 10;
      gainedLevels += 1;
    }
    return gainedLevels;
  }

  function isSupportedAudioFile(file) {
    if (!file || finiteNumber(file.size, 0, 0) <= 0 || file.size > MAX_AUDIO_FILE_SIZE) return false;
    return Boolean((file.type && file.type.startsWith('audio/')) || AUDIO_EXTENSION.test(file.name || ''));
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB indisponible dans ce navigateur.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('category', 'category');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir la bibliothèque audio.'));
    });
  }

  async function transact(mode, callback) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;
        try {
          result = callback(store, tx);
        } catch (error) {
          reject(error);
          return;
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('Erreur de bibliothèque audio.'));
        tx.onabort = () => reject(tx.error || new Error('Transaction annulée.'));
      });
    } finally {
      db.close();
    }
  }

  async function addCustomFiles(files, defaults = {}) {
    const accepted = Array.from(files || []).filter(isSupportedAudioFile);
    if (!accepted.length) return [];

    const records = accepted.map((file, index) => {
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      return {
        id: `custom-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        title: baseName || `Écho personnalisé ${index + 1}`,
        artist: defaults.artist || 'Bibliothèque personnelle',
        category: defaults.category || 'custom',
        kind: 'music',
        difficulty: Number(defaults.difficulty || 2),
        duration: 0,
        sourceType: 'custom',
        mimeType: file.type,
        fileName: file.name,
        blob: file,
        createdAt: Date.now() + index
      };
    });

    await transact('readwrite', store => {
      records.forEach(record => store.put(record));
    });
    return records.map(stripBlob);
  }

  function stripBlob(record) {
    if (!record) return null;
    const copy = Object.assign({}, record);
    delete copy.blob;
    return copy;
  }

  async function getCustomTracks() {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => {
          const rows = (request.result || []).sort((a, b) => a.createdAt - b.createdAt).map(stripBlob);
          resolve(rows);
        };
        request.onerror = () => reject(request.error || new Error('Lecture impossible.'));
      });
    } finally {
      db.close();
    }
  }

  async function getCustomTrackRecord(id) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Écho introuvable.'));
      });
    } finally {
      db.close();
    }
  }

  async function updateCustomTrack(id, patch) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const read = store.get(id);
        read.onsuccess = () => {
          if (!read.result) {
            reject(new Error('Écho introuvable.'));
            return;
          }
          const next = Object.assign({}, read.result, patch, { id });
          store.put(next);
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('Modification impossible.'));
      });
    } finally {
      db.close();
    }
  }

  async function deleteCustomTrack(id) {
    await transact('readwrite', store => store.delete(id));
  }

  async function clearCustomTracks() {
    await transact('readwrite', store => store.clear());
  }

  window.EchoStorage = {
    loadProfile,
    saveProfile,
    loadSettings,
    saveSettings,
    resetProfile,
    loadActiveSession,
    saveActiveSession,
    clearActiveSession,
    addXp,
    xpForLevel,
    isSupportedAudioFile,
    addCustomFiles,
    getCustomTracks,
    getCustomTrackRecord,
    updateCustomTrack,
    deleteCustomTrack,
    clearCustomTracks
  };
})();
