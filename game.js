(function () {
  'use strict';

  const { CATEGORIES, TRACKS, CAMPAIGN_SECTORS, QUESTION_TYPES, ACHIEVEMENTS } = window.EchoContent;
  const Storage = window.EchoStorage;
  const Audio = window.EchoAudio;

  const PLAYER_COLORS = ['#65efff', '#ff6f9d', '#ffd36a', '#9c86ff'];
  const PLAYER_KEYMAPS = [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV']
  ];
  const PLAYER_KEYLABELS = [
    ['1', '2', '3', '4'],
    ['Q', 'W', 'E', 'R'],
    ['A', 'S', 'D', 'F'],
    ['Z', 'X', 'C', 'V']
  ];
  const MODULE_INFO = {
    scan: { icon: '⌕', label: 'Analyse', description: 'Élimine deux mauvaises réponses pour ce joueur.' },
    double: { icon: '×2', label: 'Amplificateur', description: 'Double les gains, mais renforce aussi la pénalité.' },
    shield: { icon: '◇', label: 'Bouclier', description: 'Annule la prochaine pénalité.' },
    replay: { icon: '↻', label: 'Boucle', description: 'Rejoue immédiatement l’extrait.' }
  };

  const MODE_INFO = {
    solo: { label: 'Course solo', icon: '✦', description: 'Dix à vingt échos, score, séries et modules.' },
    party: { label: 'Party local', icon: '◫', description: 'Deux à quatre joueurs répondent simultanément sur le même clavier.' },
    endless: { label: 'Faille infinie', icon: '∞', description: 'Trois vies. Continue tant que ton oreille tient le choc.' }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function shuffle(array, random = Math.random) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function sample(array, count = 1, random = Math.random) {
    return shuffle(array, random).slice(0, count);
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('fr-FR').format(Math.round(value || 0));
  }

  function accuracy(correct, total) {
    return total ? Math.round((correct / total) * 100) : 0;
  }

  function uniqueBy(array, keyFn) {
    const seen = new Set();
    return array.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  class EchoRiftApp {
    constructor() {
      this.screen = document.getElementById('screen');
      this.profileChip = document.getElementById('profile-chip');
      this.toastRegion = document.getElementById('toast-region');
      this.profile = Storage.loadProfile();
      this.settings = Storage.loadSettings();
      this.customTracks = [];
      this.currentScreen = 'home';
      this.setupMode = 'solo';
      this.setupDraft = null;
      this.session = null;
      this.timerFrame = 0;
      this.timerStart = 0;
      this.timerDuration = 0;
      this.remainingMs = 0;
      this.archiveFilter = { query: '', category: 'all', source: 'all' };
      this.gamepadState = new Map();
      this.previewTrackId = null;
      this.pendingImport = false;
      this.boundKeydown = event => this.onKeydown(event);
      this.boundClick = event => this.onClick(event);
      this.boundChange = event => this.onChange(event);
      this.boundInput = event => this.onInput(event);
    }

    async init() {
      this.applySettings();
      this.updateProfileChip();
      document.addEventListener('click', this.boundClick);
      document.addEventListener('change', this.boundChange);
      document.addEventListener('input', this.boundInput);
      window.addEventListener('keydown', this.boundKeydown);
      window.addEventListener('beforeunload', () => Audio.stop(0));
      this.customTracks = await this.safeLoadCustomTracks();
      this.renderHome();
      this.pollGamepads();
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }

    async safeLoadCustomTracks() {
      try {
        const rows = await Storage.getCustomTracks();
        return rows.map(track => Object.assign({}, track, {
          seed: hashString(track.id),
          duration: track.duration || 30,
          category: track.category || 'custom'
        }));
      } catch (error) {
        this.toast('Bibliothèque personnelle indisponible dans ce contexte.', 'warning');
        return [];
      }
    }

    applySettings() {
      document.documentElement.classList.toggle('reduced-motion', Boolean(this.settings.reducedMotion));
      document.documentElement.classList.toggle('high-contrast', Boolean(this.settings.highContrast));
      Audio.setVolume(this.settings.volume);
      Audio.setVisualizerEnabled(this.settings.visualizer);
    }

    updateProfileChip() {
      const needed = Storage.xpForLevel(this.profile.level);
      const ratio = clamp(this.profile.xp / needed, 0, 1);
      this.profileChip.innerHTML = `
        <span class="profile-level">NIV. ${this.profile.level}</span>
        <span class="profile-name">${escapeHtml(this.profile.name)}</span>
        <span class="profile-xp" aria-label="${this.profile.xp} points d’expérience sur ${needed}"><i style="--progress:${ratio}"></i></span>
      `;
    }

    setScreen(name, html) {
      Audio.attachVisualizer(null);
      this.currentScreen = name;
      this.screen.classList.remove('screen-enter');
      this.screen.innerHTML = html;
      void this.screen.offsetWidth;
      this.screen.classList.add('screen-enter');
      this.screen.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: this.settings.reducedMotion ? 'auto' : 'smooth' });
    }

    toast(message, type = 'info') {
      const element = document.createElement('div');
      element.className = `toast toast-${type}`;
      element.textContent = message;
      this.toastRegion.appendChild(element);
      requestAnimationFrame(() => element.classList.add('show'));
      setTimeout(() => {
        element.classList.remove('show');
        setTimeout(() => element.remove(), 250);
      }, 3200);
    }

    renderHome() {
      this.cancelTimer();
      Audio.stop();
      const profileAccuracy = accuracy(this.profile.correctAnswers, this.profile.totalAnswers);
      const campaignStars = Object.values(this.profile.campaign || {}).reduce((sum, item) => sum + Number(item.stars || 0), 0);
      const customReady = this.customTracks.length >= 4;
      const discovered = this.profile.discovered.length;
      const lastAchievement = this.profile.achievements.length
        ? ACHIEVEMENTS.find(item => item.id === this.profile.achievements[this.profile.achievements.length - 1])
        : null;

      this.setScreen('home', `
        <section class="home-layout">
          <div class="hero-panel panel">
            <div class="eyebrow"><span class="live-dot"></span> ARCHIVE DES ÉCHOS · EN LIGNE</div>
            <h1>Écoute.<br><span>Choisis ta faille.</span></h1>
            <p>Un blind test transformé en jeu vidéo : réponses simultanées, risques de vitesse, pouvoirs tactiques, campagne et bibliothèque audio personnelle.</p>
            <div class="hero-actions">
              <button class="button primary large" data-action="setup" data-mode="${escapeHtml(this.profile.lastMode || 'solo')}">Jouer maintenant <span>→</span></button>
              <button class="button ghost large" data-action="campaign">Continuer l’Archive</button>
            </div>
            <div class="hero-flags">
              <span>72 échos originaux</span><span>1–4 joueurs</span><span>Hors ligne</span><span>Import audio</span>
            </div>
          </div>

          <aside class="profile-overview panel">
            <div class="panel-heading">
              <div><span class="kicker">PROFIL</span><h2>${escapeHtml(this.profile.name)}</h2></div>
              <span class="rank-orb">${this.profile.level}</span>
            </div>
            <div class="stat-grid compact">
              <div><strong>${formatNumber(this.profile.bestScore)}</strong><span>Meilleur score</span></div>
              <div><strong>${profileAccuracy}%</strong><span>Précision</span></div>
              <div><strong>${discovered}/72</strong><span>Échos reconnus</span></div>
              <div><strong>${campaignStars}/15</strong><span>Étoiles</span></div>
            </div>
            ${lastAchievement ? `<div class="latest-achievement"><span>${lastAchievement.icon}</span><div><small>DERNIER SUCCÈS</small><strong>${escapeHtml(lastAchievement.title)}</strong></div></div>` : `<div class="latest-achievement muted"><span>◇</span><div><small>OBJECTIF</small><strong>Termine ta première partie</strong></div></div>`}
          </aside>
        </section>

        <section class="section-block">
          <div class="section-title"><div><span class="kicker">MODES DE JEU</span><h2>Choisis ton signal</h2></div><span class="section-rule"></span></div>
          <div class="mode-grid">
            ${Object.entries(MODE_INFO).map(([id, mode]) => `
              <button class="mode-card panel" data-action="setup" data-mode="${id}">
                <span class="mode-icon">${mode.icon}</span>
                <span class="mode-copy"><strong>${mode.label}</strong><small>${mode.description}</small></span>
                <span class="mode-arrow">→</span>
              </button>
            `).join('')}
            <button class="mode-card panel campaign-card" data-action="campaign">
              <span class="mode-icon">◎</span>
              <span class="mode-copy"><strong>Archive Run</strong><small>Cinq secteurs, difficulté progressive et medley final.</small></span>
              <span class="mode-arrow">→</span>
            </button>
          </div>
        </section>

        <section class="utility-grid">
          <button class="utility-card panel" data-action="archive">
            <span class="utility-icon">♫</span><span><strong>Musée sonore</strong><small>Écoute, apprends et filtre les 72 échos.</small></span><b>${discovered}</b>
          </button>
          <button class="utility-card panel ${customReady ? 'ready' : ''}" data-action="workshop">
            <span class="utility-icon">＋</span><span><strong>Atelier audio</strong><small>Ajoute tes propres musiques pour créer ton blind test.</small></span><b>${this.customTracks.length}</b>
          </button>
          <button class="utility-card panel" data-action="help">
            <span class="utility-icon">?</span><span><strong>Comment jouer</strong><small>Commandes, scoring, manches et modules.</small></span><b>5</b>
          </button>
        </section>
      `);
    }

    renderSetup(mode = 'solo') {
      Audio.stop();
      this.setupMode = MODE_INFO[mode] ? mode : 'solo';
      const isParty = this.setupMode === 'party';
      const isEndless = this.setupMode === 'endless';
      const draft = this.setupDraft && this.setupDraft.mode === this.setupMode
        ? this.setupDraft
        : {
            mode: this.setupMode,
            players: isParty ? 2 : 1,
            names: [this.profile.name, 'Joueur 2', 'Joueur 3', 'Joueur 4'],
            difficulty: 'standard',
            questions: isEndless ? 999 : 12,
            source: 'builtin',
            categories: Object.keys(CATEGORIES),
            types: ['classic', 'signal', 'lightning', 'fracture', 'memory'],
            modules: true
          };
      this.setupDraft = draft;
      const customAvailable = this.customTracks.length >= 4;

      this.setScreen('setup', `
        <section class="page-header">
          <button class="back-button" data-action="home">← Accueil</button>
          <div><span class="kicker">CONFIGURATION</span><h1>${MODE_INFO[this.setupMode].icon} ${MODE_INFO[this.setupMode].label}</h1><p>${MODE_INFO[this.setupMode].description}</p></div>
        </section>

        <form id="setup-form" class="setup-layout">
          <div class="setup-main">
            ${isParty ? `
              <section class="panel form-section">
                <div class="form-section-title"><span>01</span><div><h2>Récupérateurs</h2><p>Chaque joueur dispose de quatre touches dédiées.</p></div></div>
                <label class="field compact-field">Nombre de joueurs
                  <select id="player-count" name="players">
                    ${[2, 3, 4].map(value => `<option value="${value}" ${draft.players === value ? 'selected' : ''}>${value} joueurs</option>`).join('')}
                  </select>
                </label>
                <div id="player-name-fields" class="player-name-grid"></div>
              </section>
            ` : `
              <section class="panel form-section">
                <div class="form-section-title"><span>01</span><div><h2>Récupérateur</h2><p>Le score sera enregistré sur ton profil local.</p></div></div>
                <label class="field">Nom affiché<input name="player-name-0" maxlength="18" value="${escapeHtml(draft.names[0])}"></label>
                ${isEndless ? `<div class="life-preview"><span>◇</span><span>◇</span><span>◇</span><small>3 vies au départ</small></div>` : ''}
              </section>
            `}

            <section class="panel form-section">
              <div class="form-section-title"><span>02</span><div><h2>Bibliothèque</h2><p>Le jeu inclut des compositions originales et accepte tes fichiers audio.</p></div></div>
              <div class="source-choice-grid">
                <label class="source-choice"><input type="radio" name="source" value="builtin" ${draft.source === 'builtin' ? 'checked' : ''}><span><b>Archive originale</b><small>72 musiques et bruitages synthétisés</small></span></label>
                <label class="source-choice ${customAvailable ? '' : 'disabled'}"><input type="radio" name="source" value="custom" ${draft.source === 'custom' ? 'checked' : ''} ${customAvailable ? '' : 'disabled'}><span><b>Mes fichiers</b><small>${this.customTracks.length} échos importés · minimum 4</small></span></label>
                <label class="source-choice ${customAvailable ? '' : 'disabled'}"><input type="radio" name="source" value="mixed" ${draft.source === 'mixed' ? 'checked' : ''} ${customAvailable ? '' : 'disabled'}><span><b>Archive mixte</b><small>Contenu original + bibliothèque personnelle</small></span></label>
              </div>
              ${customAvailable ? '' : `<button type="button" class="text-button" data-action="workshop">Importer des fichiers audio →</button>`}
            </section>

            <section class="panel form-section" id="category-section">
              <div class="form-section-title"><span>03</span><div><h2>Univers sonores</h2><p>Sélectionne au moins quatre familles pour des choix variés.</p></div></div>
              <div class="chip-grid">
                ${Object.values(CATEGORIES).map(category => `
                  <label class="check-chip" style="--chip-accent:${category.accent}">
                    <input type="checkbox" name="categories" value="${category.id}" ${draft.categories.includes(category.id) ? 'checked' : ''}>
                    <span><i>${category.icon}</i>${category.label}</span>
                  </label>
                `).join('')}
              </div>
              <div class="inline-actions"><button type="button" class="text-button" data-action="select-all-categories">Tout sélectionner</button><button type="button" class="text-button" data-action="clear-categories">Tout retirer</button></div>
            </section>

            <section class="panel form-section">
              <div class="form-section-title"><span>04</span><div><h2>Types de manches</h2><p>La dernière question utilise toujours une manche mémoire dans la campagne.</p></div></div>
              <div class="round-type-grid">
                ${Object.values(QUESTION_TYPES).map(type => `
                  <label class="round-choice">
                    <input type="checkbox" name="types" value="${type.id}" ${draft.types.includes(type.id) ? 'checked' : ''}>
                    <span class="round-icon">${type.icon}</span><span><b>${type.label}</b><small>${type.description}</small></span>
                  </label>
                `).join('')}
              </div>
            </section>
          </div>

          <aside class="setup-sidebar">
            <section class="panel form-section sticky-panel">
              <div class="form-section-title small"><span>05</span><div><h2>Règles</h2></div></div>
              <fieldset class="field"><legend>Difficulté</legend>
                <div class="segmented">
                  ${[['discovery', 'Découverte'], ['standard', 'Standard'], ['expert', 'Expert']].map(([value, label]) => `<label><input type="radio" name="difficulty" value="${value}" ${draft.difficulty === value ? 'checked' : ''}><span>${label}</span></label>`).join('')}
                </div>
              </fieldset>
              ${isEndless ? '' : `<label class="field">Nombre de questions
                <select name="questions">
                  ${[8, 12, 16, 20].map(value => `<option value="${value}" ${Number(draft.questions) === value ? 'selected' : ''}>${value} questions</option>`).join('')}
                </select>
              </label>`}
              <label class="switch-row"><span><b>Modules de Résonance</b><small>Analyse, double, bouclier et replay</small></span><input type="checkbox" name="modules" ${draft.modules ? 'checked' : ''}><i></i></label>
              <div class="setup-summary">
                <div><span>Mode</span><strong>${MODE_INFO[this.setupMode].label}</strong></div>
                <div><span>Bibliothèque perso.</span><strong>${this.customTracks.length} échos</strong></div>
                <div><span>Sauvegarde</span><strong>Automatique</strong></div>
              </div>
              <button type="submit" class="button primary large full">Ouvrir la faille <span>→</span></button>
              <p class="keyboard-note">Conseil : utilise un casque ou des enceintes. Le navigateur demandera l’autorisation audio au lancement.</p>
            </section>
          </aside>
        </form>
      `);

      if (isParty) this.renderPlayerNameFields(draft.players, draft.names);
      const form = document.getElementById('setup-form');
      form.addEventListener('submit', event => {
        event.preventDefault();
        this.startFromSetup(form);
      });
    }

    renderPlayerNameFields(count, names) {
      const container = document.getElementById('player-name-fields');
      if (!container) return;
      container.innerHTML = Array.from({ length: count }, (_, index) => `
        <label class="player-name-field" style="--player:${PLAYER_COLORS[index]}">
          <span>J${index + 1} · ${PLAYER_KEYLABELS[index].join(' ')}</span>
          <input name="player-name-${index}" maxlength="18" value="${escapeHtml(names[index] || `Joueur ${index + 1}`)}">
        </label>
      `).join('');
    }

    startFromSetup(form) {
      const data = new FormData(form);
      const playersCount = this.setupMode === 'party' ? Number(data.get('players') || 2) : 1;
      const names = Array.from({ length: playersCount }, (_, index) => {
        const name = String(data.get(`player-name-${index}`) || `Joueur ${index + 1}`).trim();
        return name || `Joueur ${index + 1}`;
      });
      const categories = data.getAll('categories');
      const types = data.getAll('types');
      const source = String(data.get('source') || 'builtin');
      if ((source === 'builtin' || source === 'mixed') && categories.length < 1) {
        this.toast('Sélectionne au moins un univers sonore.', 'warning');
        return;
      }
      if (!types.length) {
        this.toast('Sélectionne au moins un type de manche.', 'warning');
        return;
      }
      if ((source === 'custom' || source === 'mixed') && this.customTracks.length < 4) {
        this.toast('Importe au moins quatre fichiers audio.', 'warning');
        return;
      }
      const config = {
        mode: this.setupMode,
        playerNames: names,
        difficulty: String(data.get('difficulty') || 'standard'),
        questionCount: this.setupMode === 'endless' ? 999 : Number(data.get('questions') || 12),
        source,
        categories,
        types,
        modules: data.get('modules') === 'on'
      };
      this.setupDraft = Object.assign({}, config, {
        players: playersCount,
        names,
        questions: config.questionCount
      });
      this.profile.lastMode = this.setupMode;
      this.profile.name = names[0];
      Storage.saveProfile(this.profile);
      this.updateProfileChip();
      this.startSession(config);
    }

    buildTrackPool(config) {
      let builtin = TRACKS.filter(track => config.categories.includes(track.category));
      if (builtin.length < 4 && config.source !== 'custom') builtin = TRACKS.slice();
      const custom = this.customTracks.map(track => Object.assign({}, track, {
        categoryLabel: 'Bibliothèque personnelle',
        seed: track.seed || hashString(track.id)
      }));
      if (config.source === 'custom') return custom;
      if (config.source === 'mixed') return builtin.concat(custom);
      return builtin;
    }

    startSession(config, campaignSector = null) {
      this.cancelTimer();
      Audio.stop();
      const pool = this.buildTrackPool(config);
      if (pool.length < 4) {
        this.toast('La bibliothèque sélectionnée ne contient pas assez d’échos.', 'error');
        return;
      }
      const players = config.playerNames.map((name, index) => ({
        id: index,
        name,
        color: PLAYER_COLORS[index],
        score: 0,
        combo: 0,
        bestCombo: 0,
        correct: 0,
        wrong: 0,
        answer: null,
        answerElapsed: null,
        eliminated: [],
        doubleActive: false,
        shieldActive: false,
        lives: config.mode === 'endless' ? 3 : null,
        modules: {
          scan: config.modules ? 1 : 0,
          double: config.modules ? 1 : 0,
          shield: config.modules ? 1 : 0,
          replay: config.modules ? 1 : 0
        }
      }));
      this.session = {
        config,
        campaignSector,
        pool,
        players,
        questionIndex: 0,
        question: null,
        phase: 'loading',
        roundLog: [],
        recentTrackIds: [],
        sessionSeed: Date.now() >>> 0,
        startedAt: Date.now(),
        perfect: true,
        maximumStreak: 0,
        fastCorrect: false,
        encountered: new Set()
      };
      this.prepareQuestion();
    }

    buildQuestion() {
      const session = this.session;
      const config = session.config;
      const random = seededRandom(session.sessionSeed + session.questionIndex * 9973);
      let allowedTypes = config.types.slice();
      if (config.source === 'custom') allowedTypes = allowedTypes.filter(type => type !== 'signal');
      if (!allowedTypes.length) allowedTypes = ['classic'];
      let type = allowedTypes[Math.floor(random() * allowedTypes.length)];
      const isFinal = config.mode !== 'endless' && session.questionIndex === config.questionCount - 1;
      if ((session.campaignSector && session.campaignSector.boss && isFinal) || (isFinal && allowedTypes.includes('memory'))) type = 'memory';

      let pool = session.pool.filter(track => !session.recentTrackIds.includes(track.id));
      if (pool.length < 4) pool = session.pool.slice();
      if (type === 'signal') {
        const proceduralPool = pool.filter(track => track.sourceType !== 'custom');
        if (proceduralPool.length) pool = proceduralPool;
        else type = 'classic';
      }
      const track = pool[Math.floor(random() * pool.length)];
      session.recentTrackIds.push(track.id);
      if (session.recentTrackIds.length > 6) session.recentTrackIds.shift();
      session.encountered.add(track.id);

      const common = {
        id: `q-${session.questionIndex}-${track.id}`,
        type,
        track,
        options: [],
        answerIndex: 0,
        prompt: '',
        hint: '',
        timer: 11,
        audioOptions: { duration: 5.6 },
        sequence: null,
        fractureLabel: ''
      };

      if (type === 'signal') {
        const categories = Object.values(CATEGORIES);
        const correct = CATEGORIES[track.category];
        const distractors = sample(categories.filter(category => category.id !== track.category), 3, random);
        common.options = shuffle([correct, ...distractors], random).map(category => ({
          id: category.id,
          label: category.label,
          sublabel: category.description,
          icon: category.icon
        }));
        common.answerIndex = common.options.findIndex(option => option.id === track.category);
        common.prompt = 'De quel univers sonore provient cet écho ?';
        common.hint = 'Identifie la texture générale, pas le titre.';
        common.timer = 10;
      } else if (type === 'memory') {
        const sequence = sample(uniqueBy(session.pool, item => item.title), 3, random);
        if (!sequence.some(item => item.id === track.id)) sequence[0] = track;
        common.sequence = shuffle(sequence, random);
        const target = common.sequence[1];
        const distractors = sample(uniqueBy(session.pool.filter(item => item.id !== target.id && !common.sequence.some(seq => seq.id === item.id)), item => item.title), 3, random);
        common.options = shuffle([target, ...distractors], random).map(item => ({ id: item.id, label: item.title, sublabel: item.artist, icon: '♫' }));
        common.answerIndex = common.options.findIndex(option => option.id === target.id);
        common.track = target;
        common.prompt = 'Quel était le deuxième écho ?';
        common.hint = 'Trois fragments sont joués dans l’ordre.';
        common.timer = 15;
        common.audioOptions = {};
        common.sequence.forEach(item => session.encountered.add(item.id));
      } else {
        const titlePool = uniqueBy(session.pool.filter(item => item.id !== track.id && item.title !== track.title), item => item.title);
        const distractors = sample(titlePool, 3, random);
        common.options = shuffle([track, ...distractors], random).map(item => ({
          id: item.id,
          label: item.title,
          sublabel: item.artist || 'Bibliothèque personnelle',
          icon: CATEGORIES[item.category] ? CATEGORIES[item.category].icon : '♫'
        }));
        common.answerIndex = common.options.findIndex(option => option.id === track.id);
        common.prompt = track.kind === 'sfx' ? 'Quel bruit iconique entends-tu ?' : 'Quel est le titre de cet écho ?';
        common.hint = config.difficulty === 'discovery' ? 'Les titres peuvent être étudiés dans le Musée sonore.' : 'Valide tôt pour augmenter le multiplicateur.';

        if (type === 'lightning') {
          common.prompt = 'Éclair : reconnais ce fragment.';
          common.hint = 'Trois impulsions très courtes.';
          common.timer = 7;
          common.audioOptions = { duration: 1.05 };
        } else if (type === 'fracture') {
          const variants = [
            { label: 'RALENTI', rate: 0.72, duration: 5.2 },
            { label: 'ACCÉLÉRÉ', rate: 1.38, duration: 4.2 },
            { label: 'INVERSÉ', reverse: true, duration: 5 },
            { label: 'ÉTOUFFÉ', filterFrequency: 680, filterQ: 1.6, duration: 5.6 },
            { label: 'SANS BASSES', highpassFrequency: 1900, filterQ: 0.8, duration: 5.2 }
          ];
          const variant = variants[Math.floor(random() * variants.length)];
          common.fractureLabel = variant.label;
          common.audioOptions = Object.assign({}, variant);
          delete common.audioOptions.label;
          common.prompt = 'Fracture : retrouve l’écho déformé.';
          common.hint = 'La transformation sera révélée après la réponse.';
          common.timer = 12;
        }
      }

      if (config.difficulty === 'discovery') {
        common.timer += 3;
        if (type === 'classic' && track.sourceType !== 'custom' && random() < 0.55) {
          const categories = Object.values(CATEGORIES);
          const correct = CATEGORIES[track.category];
          const distractors = sample(categories.filter(category => category.id !== track.category), 3, random);
          common.options = shuffle([correct, ...distractors], random).map(category => ({ id: category.id, label: category.label, sublabel: category.description, icon: category.icon }));
          common.answerIndex = common.options.findIndex(option => option.id === track.category);
          common.prompt = 'Mode découverte : reconnais la famille sonore.';
          common.hint = 'Le titre complet apparaîtra après la réponse.';
        }
      } else if (config.difficulty === 'expert') {
        common.timer = Math.max(6, common.timer - 2);
        if (common.audioOptions.duration) common.audioOptions.duration = Math.max(1, common.audioOptions.duration - 1.1);
      }

      return common;
    }

    async prepareQuestion() {
      if (!this.session) return;
      this.cancelTimer();
      this.session.phase = 'loading';
      this.session.question = this.buildQuestion();
      this.session.players.forEach(player => {
        player.answer = null;
        player.answerElapsed = null;
        player.eliminated = [];
        player.doubleActive = false;
        player.shieldActive = false;
      });
      this.remainingMs = this.session.question.timer * 1000;
      this.renderGame();

      try {
        await Audio.ensureContext();
        if (!this.session || this.session.phase !== 'loading') return;
        const question = this.session.question;
        if (question.type === 'memory') {
          await Audio.playSequence(question.sequence, this.session.config.difficulty === 'expert' ? 1.0 : 1.35);
        } else if (question.type === 'lightning') {
          await Audio.playSequence([question.track, question.track, question.track], question.audioOptions.duration || 1.05);
        } else {
          await Audio.play(question.track, question.audioOptions);
        }
        if (!this.session || this.session.question !== question) return;
        this.session.phase = 'answering';
        this.startTimer(question.timer);
        this.renderGame();
      } catch (error) {
        console.error(error);
        this.toast(`Audio impossible : ${error.message}`, 'error');
        if (this.session) {
          this.session.phase = 'answering';
          this.startTimer(this.session.question.timer);
          this.renderGame();
        }
      }
    }

    renderGame() {
      const session = this.session;
      if (!session || !session.question) return;
      const q = session.question;
      const type = QUESTION_TYPES[q.type];
      const totalQuestions = session.config.mode === 'endless' ? null : session.config.questionCount;
      const progress = totalQuestions ? (session.questionIndex + (session.phase === 'reveal' ? 1 : 0)) / totalQuestions : 0;
      const phaseLabel = session.phase === 'loading' ? 'SYNTHÈSE DU SIGNAL…' : session.phase === 'reveal' ? 'RÉVÉLATION' : 'RÉPONDEZ MAINTENANT';
      const correctOption = session.phase === 'reveal' ? q.answerIndex : -1;

      this.setScreen('game', `
        <section class="game-shell ${session.phase === 'reveal' ? 'is-reveal' : ''}">
          <header class="game-hud panel">
            <button class="game-exit" data-action="abandon-game" title="Quitter la partie">×</button>
            <div class="round-progress">
              <span>${totalQuestions ? `QUESTION ${session.questionIndex + 1} / ${totalQuestions}` : `FAILLE ${session.questionIndex + 1}`}</span>
              <div><i style="--progress:${totalQuestions ? progress : Math.min(1, session.questionIndex / 25)}"></i></div>
            </div>
            <div class="round-type"><span>${type.icon}</span><div><small>MANCHE</small><strong>${type.label}</strong></div></div>
            <div class="timer-wrap ${this.remainingMs < 3000 && session.phase === 'answering' ? 'danger' : ''}">
              <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"></circle><circle class="timer-ring" cx="22" cy="22" r="18" style="--timer:${clamp(this.remainingMs / (q.timer * 1000), 0, 1)}"></circle></svg>
              <strong id="timer-value">${session.phase === 'loading' ? '…' : Math.ceil(this.remainingMs / 1000)}</strong>
            </div>
          </header>

          <div class="question-panel panel">
            <div class="question-status"><span class="status-pulse"></span>${phaseLabel}${q.fractureLabel && session.phase === 'reveal' ? ` · ${q.fractureLabel}` : ''}</div>
            <h1>${escapeHtml(q.prompt)}</h1>
            <p>${escapeHtml(q.hint)}</p>
            <div class="visualizer-wrap">
              <canvas id="audio-visualizer" aria-label="Visualisation du signal audio"></canvas>
              <div class="signal-core"><span>${session.phase === 'loading' ? '⌛' : session.phase === 'reveal' ? '✓' : type.icon}</span></div>
            </div>
            <div class="audio-controls">
              <span>↻ RÉÉCOUTE DISPONIBLE AVEC LE MODULE BOUCLE</span>
              <span>${q.track.sourceType === 'custom' ? 'FICHIER PERSONNEL' : 'SIGNAL ORIGINAL GÉNÉRÉ EN TEMPS RÉEL'}</span>
            </div>
          </div>

          <div class="answer-grid">
            ${q.options.map((option, index) => {
              const playerMarkers = session.players.filter(player => player.answer === index);
              const wrongSelected = session.phase === 'reveal' && playerMarkers.length && index !== correctOption;
              const classes = [
                'answer-portal',
                session.phase === 'answering' ? 'active' : '',
                index === correctOption ? 'correct' : '',
                wrongSelected ? 'wrong' : '',
                session.phase === 'reveal' && index !== correctOption && !wrongSelected ? 'dimmed' : ''
              ].filter(Boolean).join(' ');
              return `
                <button class="${classes}" data-action="answer" data-option="${index}" ${session.phase !== 'answering' ? 'disabled' : ''}>
                  <span class="portal-index">${index + 1}</span>
                  <span class="portal-icon">${escapeHtml(option.icon || '♫')}</span>
                  <span class="portal-copy"><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.sublabel || '')}</small></span>
                  <span class="answer-markers">${playerMarkers.map(player => `<i style="--player:${player.color}" title="${escapeHtml(player.name)}">J${player.id + 1}</i>`).join('')}</span>
                </button>
              `;
            }).join('')}
          </div>

          ${session.phase === 'reveal' ? this.renderRevealPanel(q) : ''}

          <div class="player-strip ${session.players.length > 2 ? 'many' : ''}">
            ${session.players.map((player, index) => this.renderPlayerCard(player, index)).join('')}
          </div>
        </section>
      `);
      const canvas = document.getElementById('audio-visualizer');
      Audio.attachVisualizer(canvas);
      this.updateTimerDom();
    }

    renderPlayerCard(player, index) {
      const answered = player.answer != null;
      const correctness = this.session.phase === 'reveal'
        ? (player.answer === this.session.question.answerIndex ? 'correct-player' : 'wrong-player')
        : '';
      const keys = PLAYER_KEYLABELS[index];
      const lives = player.lives == null ? '' : `<span class="player-lives">${Array.from({ length: 3 }, (_, life) => `<i class="${life < player.lives ? 'alive' : ''}">◇</i>`).join('')}</span>`;
      return `
        <article class="player-card panel ${answered ? 'locked' : ''} ${correctness}" style="--player:${player.color}">
          <div class="player-head">
            <span class="player-badge">J${index + 1}</span>
            <div><strong>${escapeHtml(player.name)}</strong><small>${answered ? 'RÉPONSE VERROUILLÉE' : this.session.phase === 'answering' ? `TOUCHES ${keys.join(' · ')}` : 'EN ATTENTE'}</small></div>
            ${lives}
            <b>${formatNumber(player.score)}</b>
          </div>
          <div class="player-meta"><span>Série <b>×${player.combo}</b></span>${player.doubleActive ? '<span class="active-buff">AMPLI ×2</span>' : ''}${player.shieldActive ? '<span class="active-buff">BOUCLIER</span>' : ''}${player.eliminated.length ? `<span class="active-buff">ÉLIMINÉES : ${player.eliminated.map(i => i + 1).join(', ')}</span>` : ''}</div>
          ${this.session.config.modules && this.session.phase === 'answering' && !answered ? `
            <div class="module-row">
              ${Object.entries(MODULE_INFO).map(([id, module]) => `<button data-action="module" data-player="${index}" data-module="${id}" title="${module.description}" ${player.modules[id] > 0 ? '' : 'disabled'}><span>${module.icon}</span><small>${module.label}</small></button>`).join('')}
            </div>
          ` : ''}
        </article>
      `;
    }

    renderRevealPanel(question) {
      const category = CATEGORIES[question.track.category];
      const results = this.session.players.map(player => {
        const last = this.session.roundLog[this.session.roundLog.length - 1];
        const playerResult = last ? last.players.find(item => item.playerId === player.id) : null;
        if (!playerResult) return '';
        return `<span style="--player:${player.color}"><i>${playerResult.correct ? '✓' : '×'}</i>${escapeHtml(player.name)} <b>${playerResult.points >= 0 ? '+' : ''}${formatNumber(playerResult.points)}</b></span>`;
      }).join('');
      return `
        <section class="reveal-panel panel">
          <div class="reveal-track">
            <span class="reveal-icon" style="--accent:${category ? category.accent : '#fff'}">${category ? category.icon : '♫'}</span>
            <div><small>${category ? category.label : 'Bibliothèque personnelle'}</small><h2>${escapeHtml(question.track.title)}</h2><p>${escapeHtml(question.track.artist || 'Bibliothèque personnelle')}</p></div>
          </div>
          <div class="reveal-results">${results}</div>
          <button class="button primary" data-action="next-question">${this.isSessionFinished() ? 'Voir les résultats' : 'Signal suivant'} →</button>
        </section>
      `;
    }

    startTimer(seconds) {
      this.cancelTimer();
      this.timerDuration = seconds * 1000;
      this.remainingMs = this.timerDuration;
      this.timerStart = performance.now();
      const tick = now => {
        if (!this.session || this.session.phase !== 'answering') return;
        const elapsed = now - this.timerStart;
        this.remainingMs = Math.max(0, this.timerDuration - elapsed);
        this.updateTimerDom();
        if (this.remainingMs <= 0) {
          this.revealQuestion();
          return;
        }
        this.timerFrame = requestAnimationFrame(tick);
      };
      this.timerFrame = requestAnimationFrame(tick);
    }

    updateTimerDom() {
      const value = document.getElementById('timer-value');
      const ring = document.querySelector('.timer-ring');
      const wrap = document.querySelector('.timer-wrap');
      if (value && this.session) value.textContent = this.session.phase === 'loading' ? '…' : String(Math.ceil(this.remainingMs / 1000));
      if (ring && this.timerDuration) ring.style.setProperty('--timer', String(clamp(this.remainingMs / this.timerDuration, 0, 1)));
      if (wrap) wrap.classList.toggle('danger', this.remainingMs < 3000 && this.session && this.session.phase === 'answering');
    }

    cancelTimer() {
      if (this.timerFrame) cancelAnimationFrame(this.timerFrame);
      this.timerFrame = 0;
    }

    submitAnswer(playerIndex, optionIndex) {
      const session = this.session;
      if (!session || session.phase !== 'answering') return;
      const player = session.players[playerIndex];
      if (!player || player.answer != null) return;
      if (player.eliminated.includes(optionIndex)) {
        this.toast(`${player.name} : cette réponse a été éliminée par l’Analyse.`, 'warning');
        return;
      }
      player.answer = optionIndex;
      player.answerElapsed = this.timerDuration - this.remainingMs;
      this.renderGame();
      if (session.players.every(item => item.answer != null)) {
        setTimeout(() => this.revealQuestion(), 450);
      }
    }

    activateModule(playerIndex, moduleId) {
      const session = this.session;
      if (!session || session.phase !== 'answering' || !session.config.modules) return;
      const player = session.players[playerIndex];
      if (!player || player.answer != null || !player.modules[moduleId]) return;
      player.modules[moduleId] -= 1;
      if (moduleId === 'scan') {
        player.eliminated = sample([0, 1, 2, 3].filter(index => index !== session.question.answerIndex), 2);
        this.toast(`${player.name} élimine les réponses ${player.eliminated.map(i => i + 1).join(' et ')}.`, 'success');
      } else if (moduleId === 'double') {
        player.doubleActive = true;
        this.toast(`${player.name} active l’Amplificateur ×2.`, 'info');
      } else if (moduleId === 'shield') {
        player.shieldActive = true;
        this.toast(`${player.name} déploie son Bouclier.`, 'info');
      } else if (moduleId === 'replay') {
        Audio.replay().catch(error => this.toast(error.message, 'error'));
      }
      this.renderGame();
    }

    revealQuestion() {
      const session = this.session;
      if (!session || session.phase !== 'answering') return;
      this.cancelTimer();
      session.phase = 'reveal';
      const q = session.question;
      const typeMultiplier = { classic: 1, signal: 0.95, lightning: 1.28, fracture: 1.4, memory: 1.5 }[q.type] || 1;
      const difficultyMultiplier = { discovery: 0.88, standard: 1, expert: 1.22 }[session.config.difficulty] || 1;
      const playerResults = [];

      session.players.forEach(player => {
        const correct = player.answer === q.answerIndex;
        let points = 0;
        if (correct) {
          const elapsed = player.answerElapsed == null ? this.timerDuration : player.answerElapsed;
          const remainingRatio = clamp(1 - elapsed / this.timerDuration, 0, 1);
          const speedMultiplier = 0.62 + remainingRatio * 0.88;
          const comboMultiplier = 1 + Math.min(player.combo, 10) * 0.05;
          points = Math.round(1000 * speedMultiplier * comboMultiplier * typeMultiplier * difficultyMultiplier);
          if (player.doubleActive) points *= 2;
          player.score += points;
          player.combo += 1;
          player.correct += 1;
          player.bestCombo = Math.max(player.bestCombo, player.combo);
          session.maximumStreak = Math.max(session.maximumStreak, player.combo);
          if (elapsed < 2000) session.fastCorrect = true;
        } else {
          let penalty = session.config.difficulty === 'expert' ? 160 : 80;
          if (player.doubleActive) penalty *= 2;
          if (player.shieldActive) penalty = 0;
          points = -penalty;
          player.score = Math.max(0, player.score - penalty);
          player.combo = 0;
          player.wrong += 1;
          session.perfect = false;
          if (player.lives != null) player.lives = Math.max(0, player.lives - 1);
        }
        player.doubleActive = false;
        player.shieldActive = false;
        playerResults.push({ playerId: player.id, answer: player.answer, correct, points });
      });

      session.roundLog.push({
        questionId: q.id,
        trackId: q.track.id,
        type: q.type,
        correctIndex: q.answerIndex,
        players: playerResults
      });
      this.renderGame();
      if (this.settings.screenShake && playerResults.some(item => !item.correct)) {
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 380);
      }
    }

    isSessionFinished() {
      const session = this.session;
      if (!session) return true;
      if (session.config.mode === 'endless') return session.players[0].lives <= 0;
      return session.questionIndex >= session.config.questionCount - 1;
    }

    nextQuestion() {
      if (!this.session || this.session.phase !== 'reveal') return;
      if (this.isSessionFinished()) {
        this.finishSession();
        return;
      }
      this.session.questionIndex += 1;
      this.prepareQuestion();
    }

    checkAchievements(session, primaryPlayer) {
      const newlyUnlocked = [];
      const unlock = id => {
        if (!this.profile.achievements.includes(id)) {
          this.profile.achievements.push(id);
          newlyUnlocked.push(ACHIEVEMENTS.find(item => item.id === id));
        }
      };
      unlock('first-game');
      if (session.maximumStreak >= 5) unlock('streak-5');
      if (session.perfect) unlock('perfect');
      if (session.fastCorrect) unlock('speed');
      if (this.profile.discovered.length >= 25) unlock('discover-25');
      if (session.campaignSector && session.campaignSector.id === 'sector-core') unlock('campaign-clear');
      return newlyUnlocked.filter(Boolean);
    }

    finishSession() {
      const session = this.session;
      if (!session) return;
      this.cancelTimer();
      Audio.stop();
      const ranking = session.players.slice().sort((a, b) => b.score - a.score || b.correct - a.correct);
      const primary = session.players[0];
      const discoveredBefore = new Set(this.profile.discovered);
      session.roundLog.forEach(round => {
        const result = round.players.find(item => item.playerId === 0);
        if (result && result.correct) discoveredBefore.add(round.trackId);
      });
      this.profile.discovered = Array.from(discoveredBefore);
      this.profile.gamesPlayed += 1;
      this.profile.correctAnswers += primary.correct;
      this.profile.totalAnswers += primary.correct + primary.wrong;
      this.profile.bestScore = Math.max(this.profile.bestScore, primary.score);
      this.profile.bestStreak = Math.max(this.profile.bestStreak, primary.bestCombo);
      const xpAward = Math.round(primary.score * 0.11 + primary.correct * 45);
      const creditsAward = Math.round(primary.correct * 12 + (session.perfect ? 75 : 0));
      const levelsGained = Storage.addXp(this.profile, xpAward);
      this.profile.credits += creditsAward;

      let campaignResult = null;
      if (session.campaignSector) {
        const target = session.campaignSector.target;
        const stars = primary.score >= target[2] ? 3 : primary.score >= target[1] ? 2 : primary.score >= target[0] ? 1 : 0;
        const previous = this.profile.campaign[session.campaignSector.id] || { stars: 0, best: 0 };
        this.profile.campaign[session.campaignSector.id] = {
          stars: Math.max(previous.stars, stars),
          best: Math.max(previous.best, primary.score)
        };
        campaignResult = { stars, target };
      }

      const achievements = this.checkAchievements(session, primary);
      Storage.saveProfile(this.profile);
      this.updateProfileChip();
      this.renderResults({ ranking, xpAward, creditsAward, levelsGained, achievements, campaignResult, session });
    }

    renderResults(result) {
      const { ranking, xpAward, creditsAward, levelsGained, achievements, campaignResult, session } = result;
      const winner = ranking[0];
      const primary = session.players[0];
      const totalPrimary = primary.correct + primary.wrong;
      const replayMode = session.config.mode;
      this.setScreen('results', `
        <section class="results-page">
          <div class="results-hero panel">
            <span class="kicker">SESSION TERMINÉE</span>
            <div class="winner-orb"><i></i><span>${session.players.length > 1 ? 'J' + (winner.id + 1) : '✦'}</span></div>
            <h1>${session.players.length > 1 ? `${escapeHtml(winner.name)} stabilise la faille` : 'Faille stabilisée'}</h1>
            <p>${primary.correct} bonnes réponses sur ${totalPrimary} · meilleure série ×${primary.bestCombo}</p>
            ${campaignResult ? `<div class="star-result" aria-label="${campaignResult.stars} étoiles sur 3">${[0, 1, 2].map(index => `<span class="${index < campaignResult.stars ? 'earned' : ''}">★</span>`).join('')}</div>` : ''}
          </div>

          <div class="results-grid">
            <section class="panel leaderboard-panel">
              <div class="panel-heading"><div><span class="kicker">CLASSEMENT</span><h2>Scores finaux</h2></div></div>
              <ol class="leaderboard">
                ${ranking.map((player, index) => `
                  <li style="--player:${player.color}"><span class="rank-number">${index + 1}</span><span class="rank-player"><i>J${player.id + 1}</i><strong>${escapeHtml(player.name)}</strong><small>${player.correct} justes · série ×${player.bestCombo}</small></span><b>${formatNumber(player.score)}</b></li>
                `).join('')}
              </ol>
            </section>

            <section class="panel rewards-panel">
              <div class="panel-heading"><div><span class="kicker">RÉCOMPENSES</span><h2>Progression</h2></div></div>
              <div class="reward-row"><span>✦</span><div><strong>+${formatNumber(xpAward)} XP</strong><small>Expérience de profil</small></div></div>
              <div class="reward-row"><span>◈</span><div><strong>+${formatNumber(creditsAward)}</strong><small>Fragments d’Archive</small></div></div>
              ${levelsGained ? `<div class="level-up">NIVEAU SUPÉRIEUR · ${this.profile.level}</div>` : ''}
              <div class="result-stats">
                <div><strong>${accuracy(primary.correct, totalPrimary)}%</strong><span>Précision</span></div>
                <div><strong>${formatNumber(primary.score)}</strong><span>Score</span></div>
                <div><strong>${primary.bestCombo}</strong><span>Série max.</span></div>
              </div>
            </section>
          </div>

          ${achievements.length ? `
            <section class="panel achievement-unlocks">
              <span class="kicker">NOUVEAUX SUCCÈS</span>
              <div>${achievements.map(item => `<article><span>${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></div></article>`).join('')}</div>
            </section>
          ` : ''}

          <div class="results-actions">
            <button class="button primary large" data-action="replay-session" data-mode="${replayMode}">Rejouer</button>
            ${session.campaignSector ? '<button class="button ghost large" data-action="campaign">Carte de l’Archive</button>' : ''}
            <button class="button ghost large" data-action="home">Accueil</button>
          </div>
        </section>
      `);
    }

    renderCampaign() {
      this.cancelTimer();
      Audio.stop();
      const progress = this.profile.campaign || {};
      this.setScreen('campaign', `
        <section class="page-header">
          <button class="back-button" data-action="home">← Accueil</button>
          <div><span class="kicker">MODE CAMPAGNE</span><h1>Archive Run</h1><p>Stabilise les cinq secteurs. Une étoile débloque le secteur suivant.</p></div>
        </section>
        <section class="campaign-map panel">
          <div class="campaign-line" aria-hidden="true"></div>
          ${CAMPAIGN_SECTORS.map((sector, index) => {
            const previous = index === 0 ? true : Number((progress[CAMPAIGN_SECTORS[index - 1].id] || {}).stars || 0) > 0;
            const result = progress[sector.id] || { stars: 0, best: 0 };
            const unlocked = previous;
            return `
              <article class="sector-node ${unlocked ? 'unlocked' : 'locked'} ${sector.boss ? 'boss' : ''}" style="--sector-index:${index}">
                <div class="sector-orb"><span>${unlocked ? sector.icon : '▣'}</span><i></i></div>
                <div class="sector-copy">
                  <small>SECTEUR ${String(index + 1).padStart(2, '0')}${sector.boss ? ' · BOSS' : ''}</small>
                  <h2>${escapeHtml(sector.name)}</h2>
                  <p>${escapeHtml(sector.description)}</p>
                  <div class="sector-tags">${sector.categories.slice(0, 4).map(id => `<span>${CATEGORIES[id] ? CATEGORIES[id].label : id}</span>`).join('')}${sector.categories.length > 4 ? `<span>+${sector.categories.length - 4}</span>` : ''}</div>
                </div>
                <div class="sector-score">
                  <div class="mini-stars">${[0, 1, 2].map(star => `<span class="${star < result.stars ? 'earned' : ''}">★</span>`).join('')}</div>
                  <small>MEILLEUR : ${formatNumber(result.best)}</small>
                  <button class="button ${unlocked ? 'primary' : 'ghost'}" data-action="start-sector" data-sector="${sector.id}" ${unlocked ? '' : 'disabled'}>${result.stars ? 'Rejouer' : 'Entrer'} →</button>
                </div>
              </article>
            `;
          }).join('')}
        </section>
      `);
    }

    startCampaignSector(id) {
      const sectorIndex = CAMPAIGN_SECTORS.findIndex(item => item.id === id);
      if (sectorIndex < 0) return;
      if (sectorIndex > 0) {
        const previous = this.profile.campaign[CAMPAIGN_SECTORS[sectorIndex - 1].id];
        if (!previous || !previous.stars) return;
      }
      const sector = CAMPAIGN_SECTORS[sectorIndex];
      const config = {
        mode: 'campaign',
        playerNames: [this.profile.name],
        difficulty: sector.boss ? 'expert' : sectorIndex < 2 ? 'discovery' : 'standard',
        questionCount: sector.boss ? 12 : 10,
        source: 'builtin',
        categories: sector.categories,
        types: sector.boss ? ['classic', 'signal', 'lightning', 'fracture', 'memory'] : ['classic', 'signal', 'lightning', 'fracture'],
        modules: true
      };
      this.startSession(config, sector);
    }

    renderArchive() {
      this.cancelTimer();
      const query = this.archiveFilter.query.toLowerCase().trim();
      const allTracks = TRACKS.concat(this.customTracks);
      const filtered = allTracks.filter(track => {
        const sourceMatch = this.archiveFilter.source === 'all' || (this.archiveFilter.source === 'custom' ? track.sourceType === 'custom' : track.sourceType !== 'custom');
        const categoryMatch = this.archiveFilter.category === 'all' || track.category === this.archiveFilter.category;
        const text = `${track.title} ${track.artist || ''} ${CATEGORIES[track.category] ? CATEGORIES[track.category].label : 'personnel'}`.toLowerCase();
        return sourceMatch && categoryMatch && (!query || text.includes(query));
      });
      const discoveredSet = new Set(this.profile.discovered);

      this.setScreen('archive', `
        <section class="page-header">
          <button class="back-button" data-action="home">← Accueil</button>
          <div><span class="kicker">ENTRAÎNEMENT</span><h1>Musée sonore</h1><p>Écoute librement les échos pour apprendre leurs titres avant une partie experte.</p></div>
        </section>
        <section class="archive-toolbar panel">
          <label class="search-field"><span>⌕</span><input id="archive-search" type="search" placeholder="Rechercher un titre ou un artiste…" value="${escapeHtml(this.archiveFilter.query)}"></label>
          <label>Univers<select id="archive-category"><option value="all">Tous</option>${Object.values(CATEGORIES).map(category => `<option value="${category.id}" ${this.archiveFilter.category === category.id ? 'selected' : ''}>${category.label}</option>`).join('')}</select></label>
          <label>Source<select id="archive-source"><option value="all">Toutes</option><option value="builtin" ${this.archiveFilter.source === 'builtin' ? 'selected' : ''}>Originale</option><option value="custom" ${this.archiveFilter.source === 'custom' ? 'selected' : ''}>Personnelle</option></select></label>
          <span class="archive-count">${filtered.length} échos</span>
        </section>
        <section class="track-grid">
          ${filtered.length ? filtered.map(track => {
            const category = CATEGORIES[track.category];
            const discovered = track.sourceType === 'custom' || discoveredSet.has(track.id);
            return `
              <article class="track-card panel ${discovered ? 'discovered' : ''}" style="--accent:${category ? category.accent : '#f5f7ff'}">
                <button class="track-play ${this.previewTrackId === track.id ? 'playing' : ''}" data-action="preview-track" data-track="${track.id}" aria-label="Écouter ${escapeHtml(track.title)}"><span>${this.previewTrackId === track.id ? '■' : '▶'}</span></button>
                <div class="track-symbol">${category ? category.icon : '♫'}</div>
                <div class="track-copy"><small>${category ? category.label : 'Bibliothèque personnelle'}</small><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist || 'Bibliothèque personnelle')}</span></div>
                <div class="track-meta"><span>${track.kind === 'sfx' ? 'BRUIT' : track.sourceType === 'custom' ? 'IMPORT' : `${track.bpm || '—'} BPM`}</span><span>${'◆'.repeat(Math.min(5, track.difficulty || 2))}</span></div>
              </article>
            `;
          }).join('') : '<div class="empty-state panel"><span>⌕</span><h2>Aucun écho trouvé</h2><p>Modifie les filtres ou ajoute des fichiers dans l’Atelier audio.</p></div>'}
        </section>
      `);
    }

    async previewTrack(id) {
      const track = TRACKS.find(item => item.id === id) || this.customTracks.find(item => item.id === id);
      if (!track) return;
      if (this.previewTrackId === id) {
        Audio.stop();
        this.previewTrackId = null;
        this.renderArchive();
        return;
      }
      this.previewTrackId = id;
      this.renderArchive();
      try {
        await Audio.play(track, { duration: Math.min(8, track.duration || 8) });
      } catch (error) {
        this.previewTrackId = null;
        this.toast(error.message, 'error');
        this.renderArchive();
      }
    }

    renderWorkshop() {
      this.cancelTimer();
      Audio.stop();
      const ready = this.customTracks.length >= 4;
      this.setScreen('workshop', `
        <section class="page-header">
          <button class="back-button" data-action="home">← Accueil</button>
          <div><span class="kicker">CRÉATEUR DE PACK</span><h1>Atelier audio</h1><p>Les fichiers restent dans le stockage local du navigateur et ne sont jamais envoyés sur Internet.</p></div>
        </section>

        <section class="workshop-overview">
          <label class="drop-zone panel ${ready ? 'ready' : ''}" for="audio-import">
            <input id="audio-import" type="file" accept="audio/*" multiple>
            <span class="drop-icon">＋</span>
            <strong>Ajouter des musiques ou bruitages</strong>
            <small>MP3, WAV, OGG, M4A et formats acceptés par ton navigateur</small>
            <b>${this.customTracks.length} / 4 minimum</b>
          </label>
          <aside class="panel library-status">
            <span class="kicker">ÉTAT DU PACK</span>
            <div class="status-ring ${ready ? 'ready' : ''}"><strong>${this.customTracks.length}</strong><small>ÉCHOS</small></div>
            <h2>${ready ? 'Pack prêt à jouer' : 'Ajoute encore des fichiers'}</h2>
            <p>${ready ? 'Sélectionne “Mes fichiers” dans la configuration d’une partie.' : `Il manque ${Math.max(0, 4 - this.customTracks.length)} écho(s) pour générer quatre réponses distinctes.`}</p>
            <div class="workshop-actions"><button class="button primary" data-action="setup" data-mode="solo" ${ready ? '' : 'disabled'}>Tester le pack</button><button class="button ghost" data-action="export-library" ${this.customTracks.length ? '' : 'disabled'}>Exporter les métadonnées</button></div>
          </aside>
        </section>

        <section class="panel custom-library">
          <div class="panel-heading"><div><span class="kicker">BIBLIOTHÈQUE PERSONNELLE</span><h2>Échos importés</h2></div>${this.customTracks.length ? '<button class="danger-button" data-action="clear-library">Tout supprimer</button>' : ''}</div>
          ${this.customTracks.length ? `
            <div class="custom-track-list">
              ${this.customTracks.map((track, index) => `
                <article class="custom-track-row" data-track-row="${track.id}">
                  <span class="custom-index">${String(index + 1).padStart(2, '0')}</span>
                  <button class="mini-play" data-action="preview-custom" data-track="${track.id}" title="Écouter">▶</button>
                  <label>Titre<input data-custom-field="title" value="${escapeHtml(track.title)}" maxlength="80"></label>
                  <label>Artiste / œuvre<input data-custom-field="artist" value="${escapeHtml(track.artist || '')}" maxlength="80"></label>
                  <button class="icon-button" data-action="save-custom" data-track="${track.id}" title="Enregistrer">✓</button>
                  <button class="icon-button danger" data-action="delete-custom" data-track="${track.id}" title="Supprimer">×</button>
                </article>
              `).join('')}
            </div>
          ` : '<div class="empty-state inline"><span>♫</span><h2>Ta bibliothèque est vide</h2><p>Clique sur la zone ci-dessus pour sélectionner plusieurs fichiers audio.</p></div>'}
        </section>
        <section class="legal-note panel"><span>ⓘ</span><p>Utilise uniquement des fichiers que tu as le droit d’employer. ECHO RIFT ne redistribue aucun fichier importé ; le pack reste sur cet appareil.</p></section>
      `);
    }

    async importAudioFiles(files) {
      if (this.pendingImport) return;
      const list = Array.from(files || []).filter(file => file.type && file.type.startsWith('audio/'));
      if (!list.length) {
        this.toast('Aucun fichier audio compatible sélectionné.', 'warning');
        return;
      }
      this.pendingImport = true;
      this.toast(`Import de ${list.length} fichier(s)…`, 'info');
      try {
        await Storage.addCustomFiles(list);
        this.customTracks = await this.safeLoadCustomTracks();
        this.toast(`${list.length} écho(s) ajouté(s) à la bibliothèque.`, 'success');
        this.renderWorkshop();
      } catch (error) {
        this.toast(`Import impossible : ${error.message}`, 'error');
      } finally {
        this.pendingImport = false;
      }
    }

    async saveCustomTrack(id) {
      const row = document.querySelector(`[data-track-row="${CSS.escape(id)}"]`);
      if (!row) return;
      const title = row.querySelector('[data-custom-field="title"]').value.trim();
      const artist = row.querySelector('[data-custom-field="artist"]').value.trim();
      if (!title) {
        this.toast('Le titre ne peut pas être vide.', 'warning');
        return;
      }
      try {
        await Storage.updateCustomTrack(id, { title, artist });
        this.customTracks = await this.safeLoadCustomTracks();
        this.toast('Métadonnées enregistrées.', 'success');
        this.renderWorkshop();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    async deleteCustomTrack(id) {
      if (!confirm('Supprimer cet écho de la bibliothèque locale ?')) return;
      try {
        Audio.stop();
        await Storage.deleteCustomTrack(id);
        this.customTracks = await this.safeLoadCustomTracks();
        this.toast('Écho supprimé.', 'success');
        this.renderWorkshop();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    async clearLibrary() {
      if (!confirm('Supprimer définitivement tous les fichiers audio importés sur cet appareil ?')) return;
      try {
        Audio.stop();
        await Storage.clearCustomTracks();
        this.customTracks = [];
        this.toast('Bibliothèque personnelle vidée.', 'success');
        this.renderWorkshop();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    exportLibrary() {
      const payload = {
        format: 'echo-rift-pack-metadata-v1',
        exportedAt: new Date().toISOString(),
        note: 'Les fichiers audio ne sont pas inclus dans cet export.',
        tracks: this.customTracks.map(({ id, title, artist, fileName, mimeType }) => ({ id, title, artist, fileName, mimeType }))
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'echo-rift-pack-metadata.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    renderHelp() {
      Audio.stop();
      this.setScreen('help', `
        <section class="page-header">
          <button class="back-button" data-action="home">← Accueil</button>
          <div><span class="kicker">GUIDE</span><h1>Comment jouer</h1><p>Tout ce qu’il faut pour lancer une partie immédiatement.</p></div>
        </section>
        <section class="help-grid">
          <article class="panel help-card"><span>01</span><h2>Écoute le signal</h2><p>Chaque question lance une musique, un bruitage ou une séquence de trois extraits. Le chronomètre commence dès que le son est prêt.</p></article>
          <article class="panel help-card"><span>02</span><h2>Réponds tôt</h2><p>Plus tu réponds vite, plus ton multiplicateur est élevé. Une réponse tardive reste valable, mais rapporte moins.</p></article>
          <article class="panel help-card"><span>03</span><h2>Entre dans le bon portail</h2><p>En solo, clique sur une réponse ou utilise 1 à 4. En Party local, chaque joueur dispose de sa propre rangée de quatre touches.</p></article>
          <article class="panel help-card"><span>04</span><h2>Construis une série</h2><p>Les bonnes réponses consécutives augmentent progressivement les gains. Une erreur remet la série à zéro.</p></article>
        </section>
        <section class="panel controls-panel">
          <div class="panel-heading"><div><span class="kicker">PARTY LOCAL</span><h2>Commandes clavier</h2></div></div>
          <div class="control-grid">
            ${PLAYER_KEYLABELS.map((keys, index) => `<div style="--player:${PLAYER_COLORS[index]}"><span>J${index + 1}</span>${keys.map((key, option) => `<kbd>${key}</kbd><small>Réponse ${option + 1}</small>`).join('')}</div>`).join('')}
          </div>
        </section>
        <section class="panel module-guide">
          <div class="panel-heading"><div><span class="kicker">MODULES DE RÉSONANCE</span><h2>Pouvoirs tactiques</h2></div></div>
          <div>${Object.entries(MODULE_INFO).map(([id, module]) => `<article><span>${module.icon}</span><div><strong>${module.label}</strong><p>${module.description}</p></div></article>`).join('')}</div>
        </section>
        <section class="panel scoring-guide">
          <div><span class="kicker">SCORE</span><h2>Formule lisible, risque réel</h2><p>Base de 1 000 points, puis multiplicateurs de vitesse, difficulté, type de manche et série. L’Amplificateur double le résultat de la question.</p></div>
          <div class="score-example"><span>BASE</span><b>1 000</b><i>×</i><span>VITESSE</span><b>1,42</b><i>×</i><span>SÉRIE</span><b>1,20</b><strong>= 1 704</strong></div>
        </section>
      `);
    }

    renderSettings() {
      Audio.stop();
      const needed = Storage.xpForLevel(this.profile.level);
      this.setScreen('settings', `
        <section class="page-header">
          <button class="back-button" data-action="home">← Accueil</button>
          <div><span class="kicker">SYSTÈME</span><h1>Paramètres</h1><p>Les réglages et la progression sont enregistrés localement.</p></div>
        </section>
        <form id="settings-form" class="settings-layout">
          <section class="panel form-section">
            <div class="form-section-title"><span>01</span><div><h2>Profil</h2></div></div>
            <label class="field">Nom du profil<input name="profile-name" value="${escapeHtml(this.profile.name)}" maxlength="18"></label>
            <div class="profile-progress-card"><div><span>NIVEAU ${this.profile.level}</span><strong>${formatNumber(this.profile.xp)} / ${formatNumber(needed)} XP</strong></div><div><i style="--progress:${clamp(this.profile.xp / needed, 0, 1)}"></i></div><small>${formatNumber(this.profile.credits)} fragments disponibles</small></div>
          </section>
          <section class="panel form-section">
            <div class="form-section-title"><span>02</span><div><h2>Audio</h2></div></div>
            <label class="field range-field">Volume général <span id="volume-output">${Math.round(this.settings.volume * 100)}%</span><input type="range" name="volume" min="0" max="1" step="0.01" value="${this.settings.volume}"></label>
            <label class="switch-row"><span><b>Visualiseur audio</b><small>Affiche le spectre animé pendant les questions</small></span><input type="checkbox" name="visualizer" ${this.settings.visualizer ? 'checked' : ''}><i></i></label>
          </section>
          <section class="panel form-section">
            <div class="form-section-title"><span>03</span><div><h2>Accessibilité</h2></div></div>
            <label class="switch-row"><span><b>Réduire les animations</b><small>Désactive les mouvements décoratifs et transitions fortes</small></span><input type="checkbox" name="reduced-motion" ${this.settings.reducedMotion ? 'checked' : ''}><i></i></label>
            <label class="switch-row"><span><b>Contraste renforcé</b><small>Accentue les contours, textes et états de réponse</small></span><input type="checkbox" name="high-contrast" ${this.settings.highContrast ? 'checked' : ''}><i></i></label>
            <label class="switch-row"><span><b>Secousse d’erreur</b><small>Petite vibration visuelle lors d’une mauvaise réponse</small></span><input type="checkbox" name="screen-shake" ${this.settings.screenShake ? 'checked' : ''}><i></i></label>
          </section>
          <section class="panel danger-zone">
            <div><span class="kicker">ZONE DE RÉINITIALISATION</span><h2>Progression locale</h2><p>La bibliothèque audio personnelle n’est pas effacée par cette action.</p></div>
            <button type="button" class="danger-button" data-action="reset-progress">Réinitialiser la progression</button>
          </section>
          <button class="button primary large" type="submit">Enregistrer les paramètres</button>
        </form>
      `);
      document.getElementById('settings-form').addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        this.profile.name = String(data.get('profile-name') || 'Récupérateur').trim() || 'Récupérateur';
        this.settings.volume = Number(data.get('volume') || 0);
        this.settings.visualizer = data.get('visualizer') === 'on';
        this.settings.reducedMotion = data.get('reduced-motion') === 'on';
        this.settings.highContrast = data.get('high-contrast') === 'on';
        this.settings.screenShake = data.get('screen-shake') === 'on';
        Storage.saveProfile(this.profile);
        Storage.saveSettings(this.settings);
        this.applySettings();
        this.updateProfileChip();
        this.toast('Paramètres enregistrés.', 'success');
        this.renderHome();
      });
    }

    resetProgress() {
      if (!confirm('Réinitialiser niveaux, scores, campagne et succès ? Cette action est définitive.')) return;
      this.profile = Storage.resetProfile();
      this.updateProfileChip();
      this.toast('Progression réinitialisée.', 'success');
      this.renderSettings();
    }

    replaySession() {
      const old = this.session;
      if (!old) {
        this.renderHome();
        return;
      }
      const config = JSON.parse(JSON.stringify(old.config));
      const sector = old.campaignSector;
      this.startSession(config, sector);
    }

    abandonGame() {
      if (!this.session) return;
      if (!confirm('Abandonner cette partie et revenir à l’accueil ?')) return;
      this.cancelTimer();
      Audio.stop();
      this.session = null;
      this.renderHome();
    }

    onClick(event) {
      const actionElement = event.target.closest('[data-action]');
      if (!actionElement) return;
      const action = actionElement.dataset.action;
      if (actionElement.disabled) return;
      switch (action) {
        case 'home': this.renderHome(); break;
        case 'settings': this.renderSettings(); break;
        case 'setup': this.renderSetup(actionElement.dataset.mode || 'solo'); break;
        case 'campaign': this.renderCampaign(); break;
        case 'archive': this.renderArchive(); break;
        case 'workshop': this.renderWorkshop(); break;
        case 'help': this.renderHelp(); break;
        case 'answer': this.submitAnswer(0, Number(actionElement.dataset.option)); break;
        case 'module': this.activateModule(Number(actionElement.dataset.player), actionElement.dataset.module); break;
        case 'replay-shared': Audio.replay().catch(error => this.toast(error.message, 'error')); break;
        case 'next-question': this.nextQuestion(); break;
        case 'abandon-game': this.abandonGame(); break;
        case 'replay-session': this.replaySession(); break;
        case 'start-sector': this.startCampaignSector(actionElement.dataset.sector); break;
        case 'preview-track': this.previewTrack(actionElement.dataset.track); break;
        case 'preview-custom': {
          const track = this.customTracks.find(item => item.id === actionElement.dataset.track);
          if (track) Audio.play(track, { duration: 8 }).catch(error => this.toast(error.message, 'error'));
          break;
        }
        case 'save-custom': this.saveCustomTrack(actionElement.dataset.track); break;
        case 'delete-custom': this.deleteCustomTrack(actionElement.dataset.track); break;
        case 'clear-library': this.clearLibrary(); break;
        case 'export-library': this.exportLibrary(); break;
        case 'select-all-categories': document.querySelectorAll('input[name="categories"]').forEach(input => { input.checked = true; }); break;
        case 'clear-categories': document.querySelectorAll('input[name="categories"]').forEach(input => { input.checked = false; }); break;
        case 'reset-progress': this.resetProgress(); break;
        default: break;
      }
    }

    onChange(event) {
      if (event.target.id === 'player-count') {
        const currentNames = Array.from(document.querySelectorAll('[name^="player-name-"]')).map(input => input.value);
        this.setupDraft.players = Number(event.target.value);
        this.setupDraft.names = this.setupDraft.names.map((name, index) => currentNames[index] || name);
        this.renderPlayerNameFields(this.setupDraft.players, this.setupDraft.names);
      } else if (event.target.id === 'audio-import') {
        this.importAudioFiles(event.target.files);
      } else if (event.target.id === 'archive-category') {
        this.archiveFilter.category = event.target.value;
        this.renderArchive();
      } else if (event.target.id === 'archive-source') {
        this.archiveFilter.source = event.target.value;
        this.renderArchive();
      }
    }

    onInput(event) {
      if (event.target.id === 'archive-search') {
        this.archiveFilter.query = event.target.value;
        clearTimeout(this.archiveSearchTimer);
        this.archiveSearchTimer = setTimeout(() => this.renderArchive(), 180);
      } else if (event.target.name === 'volume') {
        const output = document.getElementById('volume-output');
        if (output) output.textContent = `${Math.round(Number(event.target.value) * 100)}%`;
        Audio.setVolume(Number(event.target.value));
      }
    }

    onKeydown(event) {
      if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
      if (!this.session || this.currentScreen !== 'game') return;
      if (event.code === 'Escape') {
        event.preventDefault();
        this.abandonGame();
        return;
      }
      if (this.session.phase === 'reveal' && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        this.nextQuestion();
        return;
      }
      if (this.session.phase !== 'answering') return;
      for (let playerIndex = 0; playerIndex < this.session.players.length; playerIndex += 1) {
        const optionIndex = PLAYER_KEYMAPS[playerIndex].indexOf(event.code);
        if (optionIndex >= 0) {
          event.preventDefault();
          this.submitAnswer(playerIndex, optionIndex);
          return;
        }
      }
    }

    pollGamepads() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      if (this.session && this.currentScreen === 'game' && this.session.phase === 'answering') {
        for (let index = 0; index < Math.min(pads.length, this.session.players.length); index += 1) {
          const pad = pads[index];
          if (!pad) continue;
          const previous = this.gamepadState.get(index) || [];
          const current = pad.buttons.slice(0, 4).map(button => button.pressed);
          current.forEach((pressed, option) => {
            if (pressed && !previous[option]) this.submitAnswer(index, option);
          });
          this.gamepadState.set(index, current);
        }
      }
      requestAnimationFrame(() => this.pollGamepads());
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const app = new EchoRiftApp();
    window.EchoRiftApp = app;
    app.init().catch(error => {
      console.error(error);
      document.getElementById('screen').innerHTML = `<div class="fatal-error"><h1>Impossible de démarrer ECHO RIFT</h1><p>${escapeHtml(error.message)}</p></div>`;
    });
  });
})();
