(function () {
  'use strict';

  const PROFILE_KEY = 'echo-rift-profile-v1';
  const SETTINGS_KEY = 'echo-rift-settings-v1';
  const DB_NAME = 'echo-rift-audio-library';
  const DB_VERSION = 1;
  const STORE_NAME = 'tracks';

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
    lastMode: 'solo'
  });

  const defaultSettings = () => ({
    volume: 0.72,
    reducedMotion: false,
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

  function loadProfile() {
    const fallback = defaultProfile();
    let raw = null;
    try { raw = localStorage.getItem(PROFILE_KEY); } catch (_) { raw = null; }
    const stored = safeParse(raw, fallback);
    return Object.assign(fallback, stored, {
      discovered: Array.isArray(stored.discovered) ? stored.discovered : [],
      achievements: Array.isArray(stored.achievements) ? stored.achievements : [],
      campaign: stored.campaign && typeof stored.campaign === 'object' ? stored.campaign : {}
    });
  }

  function saveProfile(profile) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (_) { /* stockage désactivé */ }
  }

  function loadSettings() {
    let raw = null;
    try { raw = localStorage.getItem(SETTINGS_KEY); } catch (_) { raw = null; }
    return Object.assign(defaultSettings(), safeParse(raw, {}));
  }

  function saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* stockage désactivé */ }
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
    const accepted = Array.from(files || []).filter(file => file && file.type && file.type.startsWith('audio/'));
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
    addXp,
    xpForLevel,
    addCustomFiles,
    getCustomTracks,
    getCustomTrackRecord,
    updateCustomTrack,
    deleteCustomTrack,
    clearCustomTracks
  };
})();
