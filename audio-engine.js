(function () {
  'use strict';

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const OfflineAudioContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const MAX_BUFFER_CACHE = 12;
  const MAX_REVERSE_CACHE = 4;

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  class EchoAudioEngine {
    constructor() {
      this.context = null;
      this.master = null;
      this.analyser = null;
      this.currentSources = [];
      this.graphNodes = [];
      this.bufferCache = new Map();
      this.reverseCache = new Map();
      this.lastPlayback = null;
      this.volume = 0.72;
      this.canvas = null;
      this.canvasContext = null;
      this.visualizerEnabled = true;
      this.visualizerFrame = 0;
      this.loading = new Map();
      this.operationId = 0;
    }

    async ensureContext() {
      if (!AudioContextCtor) throw new Error('Web Audio n’est pas pris en charge par ce navigateur.');
      if (!this.context) {
        this.context = new AudioContextCtor();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context;
    }

    setVolume(value) {
      this.volume = clamp(Number(value) || 0, 0, 1);
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
      }
    }

    attachVisualizer(canvas) {
      if (this.visualizerFrame) cancelAnimationFrame(this.visualizerFrame);
      this.visualizerFrame = 0;
      this.canvas = canvas || null;
      this.canvasContext = canvas ? canvas.getContext('2d') : null;
      if (canvas && this.visualizerEnabled) this.drawVisualizer();
    }

    setVisualizerEnabled(enabled) {
      this.visualizerEnabled = Boolean(enabled);
      if (!this.visualizerEnabled && this.visualizerFrame) {
        cancelAnimationFrame(this.visualizerFrame);
        this.visualizerFrame = 0;
      }
      if (this.canvasContext && this.canvas) {
        this.canvasContext.clearRect(0, 0, this.canvas.width || 1, this.canvas.height || 1);
      }
      if (this.visualizerEnabled && this.canvas && !this.visualizerFrame) this.drawVisualizer();
    }

    rememberBuffer(cache, key, buffer, maximum) {
      if (cache.has(key)) cache.delete(key);
      cache.set(key, buffer);
      while (cache.size > maximum) cache.delete(cache.keys().next().value);
      return buffer;
    }

    async getBuffer(track) {
      if (!track) throw new Error('Écho audio manquant.');
      if (this.bufferCache.has(track.id)) {
        const cached = this.bufferCache.get(track.id);
        this.rememberBuffer(this.bufferCache, track.id, cached, MAX_BUFFER_CACHE);
        return cached;
      }
      if (this.loading.has(track.id)) return this.loading.get(track.id);

      const promise = track.sourceType === 'custom'
        ? this.decodeCustomTrack(track)
        : this.renderProceduralTrack(track);
      this.loading.set(track.id, promise);
      try {
        const buffer = await promise;
        return this.rememberBuffer(this.bufferCache, track.id, buffer, MAX_BUFFER_CACHE);
      } finally {
        this.loading.delete(track.id);
      }
    }

    async decodeCustomTrack(track) {
      const context = await this.ensureContext();
      const record = await window.EchoStorage.getCustomTrackRecord(track.id);
      if (!record || !record.blob) throw new Error('Le fichier audio personnalisé est introuvable.');
      const arrayBuffer = await record.blob.arrayBuffer();
      return context.decodeAudioData(arrayBuffer.slice(0));
    }

    async renderProceduralTrack(track) {
      if (!OfflineAudioContextCtor) throw new Error('La synthèse audio hors ligne n’est pas prise en charge.');
      const duration = track.duration || (track.kind === 'sfx' ? 5 : 8);
      const sampleRate = 44100;
      const offline = new OfflineAudioContextCtor(2, Math.ceil(duration * sampleRate), sampleRate);
      const compressor = offline.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.16;
      const out = offline.createGain();
      out.gain.value = 0.78;
      compressor.connect(out);
      out.connect(offline.destination);

      if (track.kind === 'sfx') {
        this.scheduleSfx(offline, compressor, track, duration);
      } else {
        this.scheduleMusic(offline, compressor, track, duration);
      }
      return offline.startRendering();
    }

    createTone(ctx, destination, start, duration, frequency, wave, amplitude, options = {}) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const attack = Math.max(0.003, options.attack == null ? 0.012 : options.attack);
      const release = Math.max(0.01, options.release == null ? 0.08 : options.release);
      const sustainEnd = Math.max(start + attack, start + duration - release);
      oscillator.type = wave || 'sine';
      oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
      if (options.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), start + duration);
      }
      if (options.detune) oscillator.detune.value = options.detune;

      gain.gain.setValueAtTime(0.0001, Math.max(0, start));
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), start + attack);
      gain.gain.setValueAtTime(Math.max(0.0002, amplitude * (options.sustain == null ? 0.75 : options.sustain)), sustainEnd);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      let node = gain;
      if (options.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = options.filter.type || 'lowpass';
        filter.frequency.value = options.filter.frequency || 1800;
        filter.Q.value = options.filter.q || 0.7;
        gain.connect(filter);
        node = filter;
      }
      if (options.pan != null && typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = clamp(options.pan, -1, 1);
        node.connect(panner);
        node = panner;
      }

      oscillator.connect(gain);
      node.connect(destination);
      oscillator.start(Math.max(0, start));
      oscillator.stop(Math.max(0.01, start + duration + 0.02));
      return oscillator;
    }

    createNoise(ctx, destination, start, duration, amplitude, options = {}, random = Math.random) {
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < length; i += 1) {
        const white = random() * 2 - 1;
        if (options.color === 'brown') {
          previous = (previous + 0.02 * white) / 1.02;
          data[i] = previous * 3.5;
        } else if (options.color === 'pink') {
          previous = previous * 0.86 + white * 0.14;
          data[i] = previous;
        } else {
          data[i] = white;
        }
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), start + Math.min(0.02, duration * 0.15));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.buffer = buffer;
      source.connect(gain);
      let node = gain;
      if (options.filterFrequency) {
        const filter = ctx.createBiquadFilter();
        filter.type = options.filterType || 'lowpass';
        filter.frequency.value = options.filterFrequency;
        filter.Q.value = options.q || 0.8;
        gain.connect(filter);
        node = filter;
      }
      if (options.pan != null && typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = clamp(options.pan, -1, 1);
        node.connect(panner);
        node = panner;
      }
      node.connect(destination);
      source.start(start);
      source.stop(start + duration + 0.02);
      return source;
    }

    createDelayBus(ctx, destination, delayTime = 0.24, feedbackAmount = 0.25, wet = 0.3) {
      const input = ctx.createGain();
      const dry = ctx.createGain();
      const delay = ctx.createDelay(1.2);
      const feedback = ctx.createGain();
      const wetGain = ctx.createGain();
      dry.gain.value = 1;
      delay.delayTime.value = delayTime;
      feedback.gain.value = feedbackAmount;
      wetGain.gain.value = wet;
      input.connect(dry);
      dry.connect(destination);
      input.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(destination);
      return input;
    }

    scheduleKick(ctx, destination, time, amplitude = 0.35) {
      this.createTone(ctx, destination, time, 0.22, 125, 'sine', amplitude, {
        endFrequency: 42, attack: 0.003, release: 0.15, sustain: 0.3
      });
    }

    scheduleSnare(ctx, destination, time, random, amplitude = 0.18) {
      this.createNoise(ctx, destination, time, 0.18, amplitude, {
        filterFrequency: 1800, filterType: 'bandpass', q: 0.8
      }, random);
      this.createTone(ctx, destination, time, 0.13, 180, 'triangle', amplitude * 0.35, {
        attack: 0.002, release: 0.1
      });
    }

    scheduleHat(ctx, destination, time, random, amplitude = 0.08, open = false) {
      this.createNoise(ctx, destination, time, open ? 0.18 : 0.055, amplitude, {
        filterFrequency: 6500, filterType: 'highpass'
      }, random);
    }

    scheduleMusic(ctx, destination, track, duration) {
      const random = mulberry32(track.seed || 1);
      const beat = 60 / (track.bpm || 110);
      const root = track.root || 48;
      const category = track.category;
      const style = {
        arcade: { scale: [0, 2, 4, 7, 9, 12], lead: 'square', bass: 'triangle', density: 1, octave: 12, delay: 0.11 },
        horror: { scale: [0, 1, 3, 6, 8, 12], lead: 'sine', bass: 'sawtooth', density: 0.45, octave: 0, delay: 0.36 },
        space: { scale: [0, 2, 5, 7, 9, 12], lead: 'sawtooth', bass: 'sine', density: 0.72, octave: 12, delay: 0.31 },
        fantasy: { scale: [0, 2, 4, 7, 9, 12], lead: 'triangle', bass: 'sine', density: 0.75, octave: 12, delay: 0.2 },
        cyber: { scale: [0, 3, 5, 7, 10, 12], lead: 'sawtooth', bass: 'square', density: 0.9, octave: 12, delay: 0.16 },
        industrial: { scale: [0, 1, 5, 6, 7, 10], lead: 'square', bass: 'sawtooth', density: 0.55, octave: 0, delay: 0.08 },
        ocean: { scale: [0, 2, 5, 7, 11, 12], lead: 'sine', bass: 'triangle', density: 0.5, octave: 12, delay: 0.42 },
        desert: { scale: [0, 1, 4, 5, 7, 8, 11, 12], lead: 'triangle', bass: 'sine', density: 0.76, octave: 12, delay: 0.19 },
        dream: { scale: [0, 4, 7, 9, 11, 12], lead: 'sine', bass: 'triangle', density: 0.62, octave: 12, delay: 0.44 },
        mystery: { scale: [0, 3, 5, 7, 10, 12], lead: 'triangle', bass: 'sine', density: 0.6, octave: 12, delay: 0.24 }
      }[category] || { scale: [0, 2, 4, 7, 9], lead: 'triangle', bass: 'sine', density: 0.7, octave: 12, delay: 0.2 };

      const musicBus = this.createDelayBus(ctx, destination, style.delay, category === 'dream' ? 0.42 : 0.24, category === 'horror' ? 0.38 : 0.24);
      const bassBus = ctx.createGain();
      bassBus.gain.value = category === 'horror' || category === 'industrial' ? 0.8 : 0.62;
      bassBus.connect(destination);

      const steps = Math.ceil(duration / (beat / 2));
      const motifLength = 8;
      const motif = [];
      for (let i = 0; i < motifLength; i += 1) {
        let degree = Math.floor(random() * style.scale.length);
        if (i === 0 || i === 4) degree = 0;
        motif.push(style.scale[degree]);
      }

      // Pads / drones give every family a recognizable silhouette.
      if (category === 'horror') {
        const droneRoot = midiToFrequency(root - 12);
        this.createTone(ctx, destination, 0, duration, droneRoot, 'sawtooth', 0.055, {
          attack: 1.2, release: 1.4, sustain: 0.85, filter: { type: 'lowpass', frequency: 420, q: 1.8 }
        });
        this.createTone(ctx, destination, 0.4, duration - 0.5, midiToFrequency(root - 6), 'sine', 0.042, {
          attack: 1.5, release: 1.2, sustain: 0.8, detune: 9
        });
        for (let t = 0.8; t < duration; t += beat * 2) {
          this.createNoise(ctx, destination, t, Math.min(0.8, duration - t), 0.035 + random() * 0.025, {
            color: 'brown', filterFrequency: 900, filterType: 'lowpass', pan: random() * 1.6 - 0.8
          }, random);
        }
      } else if (category === 'ocean') {
        this.createNoise(ctx, destination, 0, duration, 0.045, {
          color: 'pink', filterFrequency: 740, filterType: 'lowpass'
        }, random);
        for (let t = 0.4; t < duration; t += beat * 4) {
          this.createTone(ctx, musicBus, t, Math.min(2.4, duration - t), midiToFrequency(root + 24), 'sine', 0.05, {
            endFrequency: midiToFrequency(root + 17), attack: 0.08, release: 1.4, pan: random() * 1.4 - 0.7
          });
        }
      } else if (category === 'space' || category === 'dream') {
        const chord = [0, 7, category === 'dream' ? 11 : 12];
        for (let t = 0; t < duration; t += beat * 4) {
          chord.forEach((interval, idx) => {
            this.createTone(ctx, musicBus, t, Math.min(beat * 4.4, duration - t), midiToFrequency(root + interval), idx === 0 ? 'sine' : 'triangle', 0.035, {
              attack: 0.5, release: 1.1, sustain: 0.7, detune: idx * 3 - 3
            });
          });
        }
      }

      // Bass line.
      for (let t = 0, step = 0; t < duration - 0.05; t += beat, step += 1) {
        let interval = step % 4 === 3 ? style.scale[Math.min(3, style.scale.length - 1)] : 0;
        if (category === 'mystery' && step % 4 === 2) interval = 10;
        if (category === 'desert' && step % 4 === 2) interval = 1;
        const bassDuration = category === 'industrial' ? beat * 0.42 : beat * 0.78;
        this.createTone(ctx, bassBus, t, Math.min(bassDuration, duration - t), midiToFrequency(root - 12 + interval), style.bass, 0.095, {
          attack: 0.008, release: bassDuration * 0.55,
          filter: { type: 'lowpass', frequency: category === 'cyber' ? 900 : 620, q: 1.1 }
        });
      }

      // Lead motif.
      for (let step = 0; step < steps; step += 1) {
        const time = step * (beat / 2);
        if (time >= duration - 0.08) break;
        if (random() > style.density && step % 4 !== 0) continue;
        const interval = motif[step % motif.length] + (step % 16 >= 12 && category !== 'horror' ? 12 : 0);
        const noteLength = category === 'dream' || category === 'ocean' ? beat * 0.86 : beat * (0.28 + random() * 0.32);
        const amp = category === 'industrial' ? 0.045 : 0.06 + random() * 0.025;
        this.createTone(ctx, musicBus, time, Math.min(noteLength, duration - time), midiToFrequency(root + style.octave + interval), style.lead, amp, {
          attack: category === 'dream' ? 0.04 : 0.006,
          release: category === 'dream' ? noteLength * 0.75 : noteLength * 0.45,
          sustain: 0.55,
          pan: (step % 2 ? 0.28 : -0.28) + (random() - 0.5) * 0.25,
          filter: category === 'cyber' || category === 'industrial'
            ? { type: 'lowpass', frequency: 1450 + random() * 1200, q: 2.2 }
            : undefined
        });
      }

      // Percussion language.
      for (let step = 0, t = 0; t < duration; step += 1, t += beat / 2) {
        const half = step % 2;
        const quarter = Math.floor(step / 2) % 4;
        if (category === 'horror') {
          if (step % 8 === 0) this.scheduleKick(ctx, destination, t, 0.16);
          if (step % 8 === 6 && random() > 0.35) this.createNoise(ctx, destination, t, 0.12, 0.035, { color: 'brown', filterFrequency: 300 }, random);
          continue;
        }
        if (category === 'ocean' || category === 'dream') {
          if (step % 4 === 0) this.scheduleKick(ctx, destination, t, 0.12);
          if (step % 4 === 2) this.scheduleHat(ctx, destination, t, random, 0.035, true);
          continue;
        }
        if (half === 0 && (quarter === 0 || quarter === 2 || category === 'arcade')) {
          this.scheduleKick(ctx, destination, t, category === 'industrial' ? 0.33 : 0.23);
        }
        if (half === 0 && (quarter === 1 || quarter === 3)) {
          this.scheduleSnare(ctx, destination, t, random, category === 'industrial' ? 0.22 : 0.14);
        }
        if (category !== 'fantasy' || step % 2 === 0) {
          this.scheduleHat(ctx, destination, t, random, category === 'arcade' ? 0.065 : 0.045, step % 8 === 7);
        }
        if (category === 'industrial' && step % 4 === 1) {
          this.createTone(ctx, destination, t, 0.08, 700 + random() * 350, 'square', 0.035, { endFrequency: 120, release: 0.06 });
        }
        if (category === 'desert' && step % 4 === 3) {
          this.createTone(ctx, destination, t, 0.075, 220, 'sine', 0.07, { endFrequency: 115, release: 0.05, pan: random() > 0.5 ? 0.45 : -0.45 });
        }
      }

      // Signature earcons ensure each track is learnable and unique.
      const signatureStart = Math.min(duration - 1.25, beat * (1 + Math.floor(random() * 3)));
      const signatureDegrees = [motif[1], motif[3], motif[5]].map((value, i) => value + (i === 2 ? 12 : 0));
      signatureDegrees.forEach((interval, index) => {
        const t = signatureStart + index * 0.16;
        this.createTone(ctx, musicBus, t, 0.2 + index * 0.04, midiToFrequency(root + 24 + interval), category === 'arcade' ? 'square' : 'sine', 0.075, {
          attack: 0.004, release: 0.14, pan: index - 1
        });
      });
    }

    scheduleSfx(ctx, destination, track, duration) {
      const random = mulberry32(track.seed || 1);
      const tone = (start, length, frequency, wave, amplitude, options) =>
        this.createTone(ctx, destination, start, Math.min(length, duration - start), frequency, wave, amplitude, options || {});
      const noise = (start, length, amplitude, options) =>
        this.createNoise(ctx, destination, start, Math.min(length, duration - start), amplitude, options || {}, random);

      switch (track.sfxType) {
        case 'teleport':
          for (let i = 0; i < 18; i += 1) {
            const t = 0.25 + i * 0.095;
            tone(t, 0.3, 150 + i * 45, i % 2 ? 'sine' : 'triangle', 0.055, { endFrequency: 300 + i * 58, release: 0.2, pan: Math.sin(i) * 0.7 });
          }
          noise(1.4, 1.1, 0.12, { color: 'pink', filterFrequency: 2400, filterType: 'bandpass', q: 1.4 });
          tone(2.0, 1.7, 920, 'sine', 0.09, { endFrequency: 110, attack: 0.02, release: 1.2 });
          break;
        case 'plasma':
          tone(0.3, 1.8, 80, 'sawtooth', 0.085, { endFrequency: 1120, attack: 0.04, release: 0.2, filter: { type: 'lowpass', frequency: 1600, q: 2.8 } });
          for (let i = 0; i < 9; i += 1) tone(0.5 + i * 0.14, 0.09, 220 + i * 95, 'square', 0.035, { release: 0.06 });
          noise(2.0, 0.22, 0.2, { filterFrequency: 2300, filterType: 'bandpass', q: 1.8 });
          tone(2.02, 0.7, 920, 'sine', 0.14, { endFrequency: 70, release: 0.55 });
          break;
        case 'coin':
          [0, 4, 7, 12].forEach((interval, i) => tone(0.2 + i * 0.095, 0.24, midiToFrequency(84 + interval), 'square', 0.09, { release: 0.18 }));
          [0, 7, 12].forEach((interval, i) => tone(1.25 + i * 0.11, 0.22, midiToFrequency(88 + interval), 'square', 0.06, { release: 0.16 }));
          break;
        case 'door':
          noise(0.2, 2.5, 0.09, { color: 'brown', filterFrequency: 520, filterType: 'lowpass' });
          for (let i = 0; i < 8; i += 1) {
            tone(0.3 + i * 0.32, 0.18, 78 + (i % 3) * 18, 'sawtooth', 0.075, { endFrequency: 48, release: 0.14 });
            noise(0.31 + i * 0.32, 0.08, 0.08, { filterFrequency: 900, filterType: 'bandpass' });
          }
          tone(2.65, 0.75, 62, 'sine', 0.12, { endFrequency: 38, release: 0.6 });
          break;
        case 'growl':
          noise(0.15, 2.8, 0.12, { color: 'brown', filterFrequency: 260, filterType: 'lowpass', q: 3 });
          for (let i = 0; i < 7; i += 1) {
            tone(0.3 + i * 0.34, 0.48, 68 + random() * 22, 'sawtooth', 0.075, { endFrequency: 38 + random() * 18, attack: 0.05, release: 0.3, detune: random() * 50 - 25 });
          }
          break;
        case 'siren':
          for (let i = 0; i < 4; i += 1) {
            tone(0.2 + i * 0.9, 0.82, 420, 'sawtooth', 0.1, { endFrequency: 850, attack: 0.05, release: 0.08, filter: { type: 'lowpass', frequency: 1500, q: 2 } });
          }
          break;
        case 'rune':
          [0, 7, 12, 16, 19].forEach((interval, i) => tone(0.2 + i * 0.22, 1.3, midiToFrequency(60 + interval), 'sine', 0.07, { attack: 0.03, release: 0.85, pan: (i - 2) * 0.25 }));
          noise(1.1, 1.5, 0.045, { color: 'pink', filterFrequency: 3600, filterType: 'highpass' });
          tone(1.3, 1.5, 220, 'triangle', 0.06, { endFrequency: 880, attack: 0.1, release: 0.8 });
          break;
        case 'robot':
          for (let i = 0; i < 8; i += 1) {
            tone(0.15 + i * 0.23, 0.12, 110 + i * 65, 'square', 0.055, { release: 0.08 });
            noise(0.18 + i * 0.23, 0.04, 0.03, { filterFrequency: 4200, filterType: 'highpass' });
          }
          [0, 4, 7, 12].forEach((interval, i) => tone(2.15 + i * 0.11, 0.4, midiToFrequency(60 + interval), 'triangle', 0.06, { release: 0.3 }));
          break;
        case 'sonar':
          [0.2, 1.45, 2.7].forEach((start, i) => {
            tone(start, 0.08, 1250 - i * 80, 'sine', 0.15, { release: 0.06 });
            tone(start + 0.06, 0.8, 620 - i * 30, 'sine', 0.04, { endFrequency: 210, release: 0.72 });
          });
          noise(0, duration, 0.025, { color: 'brown', filterFrequency: 420, filterType: 'lowpass' });
          break;
        case 'boost':
          noise(0.15, 2.5, 0.1, { color: 'pink', filterFrequency: 1200, filterType: 'bandpass', q: 1.2 });
          tone(0.2, 2.4, 70, 'sawtooth', 0.1, { endFrequency: 620, attack: 0.05, release: 0.4, filter: { type: 'lowpass', frequency: 1300, q: 2.4 } });
          tone(1.6, 0.7, 850, 'sine', 0.09, { endFrequency: 120, release: 0.55 });
          break;
        case 'radio':
          noise(0, duration, 0.07, { color: 'pink', filterFrequency: 1800, filterType: 'bandpass', q: 0.7 });
          for (let i = 0; i < 13; i += 1) {
            const t = 0.2 + i * 0.27;
            tone(t, 0.12 + random() * 0.12, 260 + random() * 800, random() > 0.5 ? 'square' : 'sawtooth', 0.035 + random() * 0.03, { release: 0.08 });
          }
          tone(2.5, 0.9, 520, 'sine', 0.055, { endFrequency: 470, release: 0.6 });
          break;
        case 'scanner':
          for (let i = 0; i < 6; i += 1) {
            const t = 0.25 + i * 0.58;
            tone(t, 0.075, 760, 'sine', 0.11, { release: 0.05 });
            tone(t + 0.16, 0.06, 520, 'sine', 0.07, { release: 0.04 });
          }
          tone(3.65, 0.45, 1040, 'triangle', 0.08, { endFrequency: 1560, release: 0.3 });
          break;
        default:
          tone(0.2, 1.5, 220, 'sine', 0.1, { endFrequency: 880, release: 0.8 });
      }
    }

    getReversedBuffer(buffer, cacheKey) {
      const key = `reverse:${cacheKey}`;
      if (this.reverseCache.has(key)) {
        const cached = this.reverseCache.get(key);
        this.rememberBuffer(this.reverseCache, key, cached, MAX_REVERSE_CACHE);
        return cached;
      }
      const reversed = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const source = buffer.getChannelData(channel);
        const target = reversed.getChannelData(channel);
        for (let i = 0, j = source.length - 1; i < source.length; i += 1, j -= 1) target[i] = source[j];
      }
      return this.rememberBuffer(this.reverseCache, key, reversed, MAX_REVERSE_CACHE);
    }

    createPlaybackGraph(options = {}) {
      const ctx = this.context;
      this.master = ctx.createGain();
      this.master.gain.setValueAtTime(this.volume, ctx.currentTime);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;

      let input = this.master;
      this.graphNodes = [this.master, this.analyser];
      if (options.filterFrequency || options.highpassFrequency) {
        const filter = ctx.createBiquadFilter();
        if (options.highpassFrequency) {
          filter.type = 'highpass';
          filter.frequency.value = options.highpassFrequency;
        } else {
          filter.type = 'lowpass';
          filter.frequency.value = options.filterFrequency;
        }
        filter.Q.value = options.filterQ || 1.1;
        filter.connect(this.master);
        input = filter;
        this.graphNodes.push(filter);
      }
      this.master.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      return input;
    }

    stop(fade = 0.035, invalidatePending = true) {
      if (invalidatePending) this.operationId += 1;
      if (this.master && this.context) {
        try {
          this.master.gain.cancelScheduledValues(this.context.currentTime);
          this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), this.context.currentTime);
          this.master.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + fade);
        } catch (_) { /* no-op */ }
      }
      const sources = this.currentSources.slice();
      const graphNodes = this.graphNodes.slice();
      this.currentSources.length = 0;
      this.graphNodes.length = 0;
      this.master = null;
      this.analyser = null;
      setTimeout(() => {
        sources.forEach(source => {
          try { source.stop(); } catch (_) { /* already stopped */ }
          try { source.disconnect(); } catch (_) { /* no-op */ }
        });
        graphNodes.forEach(node => {
          try { node.disconnect(); } catch (_) { /* no-op */ }
        });
      }, Math.ceil((fade + 0.02) * 1000));
    }

    async play(track, options = {}) {
      const operationId = ++this.operationId;
      await this.ensureContext();
      const bufferOriginal = await this.getBuffer(track);
      if (operationId !== this.operationId) return { cancelled: true };
      this.stop(0.035, false);
      const buffer = options.reverse ? this.getReversedBuffer(bufferOriginal, track.id) : bufferOriginal;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.rate || 1;
      const graphInput = this.createPlaybackGraph(options);
      source.connect(graphInput);

      let offset = Math.max(0, Number(options.offset) || 0);
      const requestedDuration = Number(options.duration) || Math.min(track.duration || 8, 8);
      const maximumOffset = Math.max(0, buffer.duration - requestedDuration * (options.rate || 1) - 0.05);
      offset = Math.min(offset, maximumOffset);
      const safeDuration = Math.min(requestedDuration, Math.max(0.1, (buffer.duration - offset) / (options.rate || 1)));
      source.start(0, offset, safeDuration);
      this.currentSources = [source];
      this.lastPlayback = { kind: 'single', track, options: Object.assign({}, options) };
      return { duration: safeDuration, source };
    }

    async playSequence(tracks, segmentDuration = 1.4, options = {}) {
      const operationId = ++this.operationId;
      await this.ensureContext();
      const buffers = await Promise.all(tracks.map(track => this.getBuffer(track)));
      if (operationId !== this.operationId) return { cancelled: true };
      this.stop(0.035, false);
      const graphInput = this.createPlaybackGraph(options);
      const sources = [];
      let cursor = this.context.currentTime + 0.04;
      buffers.forEach((buffer, index) => {
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = 1;
        source.connect(graphInput);
        const maxOffset = Math.max(0, buffer.duration - segmentDuration - 0.05);
        const seeded = mulberry32((tracks[index].seed || index + 1) + index * 97);
        const offset = tracks[index].sourceType === 'custom' ? seeded() * maxOffset : 0;
        source.start(cursor, offset, Math.min(segmentDuration, buffer.duration - offset));
        sources.push(source);
        cursor += segmentDuration + 0.24;
      });
      this.currentSources = sources;
      this.lastPlayback = { kind: 'sequence', tracks, segmentDuration, options: Object.assign({}, options) };
      const total = tracks.length * segmentDuration + Math.max(0, tracks.length - 1) * 0.24;
      return { duration: total, sources };
    }

    async replay() {
      if (!this.lastPlayback) return;
      const last = this.lastPlayback;
      if (last.kind === 'sequence') return this.playSequence(last.tracks, last.segmentDuration, last.options);
      return this.play(last.track, last.options);
    }

    drawVisualizer() {
      if (!this.canvas || !this.canvasContext || !this.visualizerEnabled) {
        this.visualizerFrame = 0;
        return;
      }
      this.visualizerFrame = requestAnimationFrame(() => this.drawVisualizer());
      const canvas = this.canvas;
      const ctx = this.canvasContext;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      const bars = 48;
      let data = null;
      if (this.analyser && this.visualizerEnabled) {
        data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
      }
      const gap = Math.max(2, width * 0.003);
      const barWidth = (width - gap * (bars - 1)) / bars;
      const now = performance.now() * 0.002;
      for (let i = 0; i < bars; i += 1) {
        const value = data ? data[Math.floor((i / bars) * data.length)] / 255 : 0.06 + Math.sin(now + i * 0.35) * 0.025;
        const h = Math.max(height * 0.04, value * height * 0.85);
        const x = i * (barWidth + gap);
        const y = (height - h) / 2;
        const hue = 180 + (i / bars) * 105;
        const gradient = ctx.createLinearGradient(0, y, 0, y + h);
        gradient.addColorStop(0, `hsla(${hue}, 95%, 72%, .9)`);
        gradient.addColorStop(1, `hsla(${hue + 30}, 85%, 48%, .28)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, Math.max(1, barWidth), h);
      }
    }
  }

  window.EchoAudio = new EchoAudioEngine();
})();
