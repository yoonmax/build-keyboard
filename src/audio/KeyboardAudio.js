import { renderKeySound, renderRoomTone, soundProfile } from './synth.js';

const VARIATIONS = 4;
const MAX_VOICES = 24;

/**
 * Plays key sounds through Web Audio. Sounds are computed the first time they are needed
 * and cached by build, and old voices are cut off past a fixed limit, so very fast typing
 * can't pile up work. A browser only starts audio after a user gesture, so the context is
 * created lazily and playback does nothing until then.
 */
class KeyboardAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.voices = [];
    this.cache = new Map();
    this.counter = 0;
    this.profile = null;
    this.profileKey = '';
    this.volume = 0.7;
    this.muted = false;
    this.variation = true;
    this.ambientSource = null;
    this.ambientGain = null;
    this.ambientOn = false;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      this.context = new Context({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.ratio.value = 8;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.08;
      this.master.connect(this.limiter);
      this.limiter.connect(this.context.destination);
      this.#applyVolume();
      if (this.ambientOn) this.#startAmbient();
    }
    if (this.context.state === 'suspended') this.context.resume();
    return true;
  }

  get ready() {
    return this.context?.state === 'running';
  }

  #applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(value) {
    this.volume = value;
    this.#applyVolume();
  }

  setMuted(value) {
    this.muted = value;
    this.#applyVolume();
  }

  setVariation(value) {
    this.variation = value;
  }

  /** Sets the sound to match the current components. */
  configure({ sw, plateId, caseId, foam, keycapMaterial }) {
    const key = `${sw.id}|${plateId}|${caseId}|${foam}|${keycapMaterial}`;
    if (key === this.profileKey) return;
    this.profileKey = key;
    this.profile = soundProfile({ sw, plateId, caseId, foam, keycapMaterial });
    // Old sounds are dropped so a long session can't grow without limit.
    if (this.cache.size > 160) this.cache.clear();
  }

  #buffer(stroke, width, variation) {
    const sampleRate = this.context.sampleRate;
    const widthClass = width >= 6 ? 6.25 : width >= 2 ? 2 : 1;
    const key = `${this.profileKey}|${stroke}|${widthClass}|${variation}`;
    let buffer = this.cache.get(key);
    if (!buffer) {
      const samples = renderKeySound(this.profile, { sampleRate, stroke, variation, width: widthClass });
      buffer = this.context.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      this.cache.set(key, buffer);
    }
    return buffer;
  }

  /**
   * Plays a key's sound immediately.
   * @param {{stroke?:'down'|'up', width?:number, pan?:number, gain?:number}} [options]
   */
  play({ stroke = 'down', width = 1, pan = 0, gain = 1 } = {}) {
    if (!this.context || !this.profile || this.muted) return;
    this.counter += 1;
    const variation = this.variation ? this.counter % VARIATIONS : 0;
    const source = this.context.createBufferSource();
    source.buffer = this.#buffer(stroke, width, variation);
    if (this.variation) source.playbackRate.value = 0.98 + ((this.counter * 7) % 5) * 0.01;
    const voice = this.context.createGain();
    voice.gain.value = gain;
    const panner = this.context.createStereoPanner?.();
    source.connect(voice);
    if (panner) {
      panner.pan.value = pan;
      voice.connect(panner);
      panner.connect(this.master);
    } else {
      voice.connect(this.master);
    }
    source.start();
    const entry = { source, voice, panner };
    this.voices.push(entry);
    source.onended = () => {
      voice.disconnect();
      panner?.disconnect();
      const i = this.voices.indexOf(entry);
      if (i >= 0) this.voices.splice(i, 1);
    };
    if (this.voices.length > MAX_VOICES) {
      const oldest = this.voices.shift();
      try {
        oldest.source.stop();
      } catch {
        // It had already finished.
      }
    }
  }

  setAmbient(on) {
    this.ambientOn = on;
    if (!this.context) return;
    if (on) this.#startAmbient();
    else this.#stopAmbient();
  }

  #startAmbient() {
    if (this.ambientSource) return;
    const samples = renderRoomTone(this.context.sampleRate);
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.07, this.context.currentTime + 0.8);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.ambientSource = source;
    this.ambientGain = gain;
  }

  #stopAmbient() {
    if (!this.ambientSource) return;
    const source = this.ambientSource;
    const gain = this.ambientGain;
    gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.4);
    setTimeout(() => {
      try {
        source.stop();
      } catch {
        // It had already finished.
      }
      gain.disconnect();
    }, 450);
    this.ambientSource = null;
    this.ambientGain = null;
  }

  /** Current number of playing voices, for the tests. */
  get activeVoices() {
    return this.voices.length;
  }
}

export const keyboardAudio = new KeyboardAudio();
