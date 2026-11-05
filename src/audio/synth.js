/**
 * Procedural keyboard sound. No recordings: each sound is computed from a small set of
 * damped resonances and filtered noise bursts, so all audio here is original and needs no
 * attribution. It's a stylised model that gives the components audible character, not
 * an acoustic simulation of any real keyboard.
 *
 * Pure functions with a seeded generator, so the tests can measure the results.
 */

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How the plate colours the bottom-out. */
export const PLATE_ACOUSTICS = {
  'plate-aluminum': { pitch: 1.22, decay: 1.25, brightness: 1.25, body: 0.8 },
  'plate-polycarbonate': { pitch: 0.74, decay: 0.68, brightness: 0.62, body: 1.2 },
  'plate-fr4': { pitch: 0.96, decay: 0.92, brightness: 0.92, body: 1 },
};

/** How the case colours it. */
export const CASE_ACOUSTICS = {
  'case-anodized': { resonance: 1.3, ring: 1.3, level: 1 },
  'case-painted': { resonance: 1.25, ring: 1.05, level: 1 },
  'case-polycarbonate': { resonance: 0.86, ring: 0.7, level: 0.92 },
  'case-frosted': { resonance: 0.82, ring: 0.66, level: 0.9 },
};

/**
 * Turns a build's choices into synthesis parameters.
 * @param {{sw:object, plateId:string, caseId:string, foam:boolean, keycapMaterial?:string}} parts
 */
export function soundProfile({ sw, plateId, caseId, foam, keycapMaterial = 'pbt' }) {
  const plate = PLATE_ACOUSTICS[plateId] ?? PLATE_ACOUSTICS['plate-fr4'];
  const body = CASE_ACOUSTICS[caseId] ?? CASE_ACOUSTICS['case-anodized'];
  const cap =
    keycapMaterial === 'aluminum'
      ? { pitch: 1.5, level: 1.2 }
      : keycapMaterial === 'abs'
        ? { pitch: 1.14, level: 1.05 }
        : { pitch: 0.92, level: 0.95 };
  return {
    type: sw.sound,
    pitch: sw.pitch * plate.pitch * cap.pitch,
    decay: plate.decay * (foam ? 0.72 : 1),
    brightness: plate.brightness,
    bodyLevel: plate.body * body.level * (foam ? 0.82 : 1.15),
    bodyPitch: body.resonance,
    ring: body.ring * (foam ? 0.5 : 1),
    capLevel: cap.level,
    force: Math.sqrt(sw.bottomOutForce / 62),
    clickSharpness: sw.tactile?.sharpness === 'click' ? sw.tactile.drop / 20 : 0,
    bumpLevel: sw.tactile?.sharpness === 'sharp' ? 1.2 : 0.75,
    bumpLead: 0.011 + (sw.tactile?.position ?? 1.5) * 0.002,
  };
}

/** Adds a decaying sine wave into a buffer. */
function addMode(out, sampleRate, { at = 0, freq, decay, level, phase = 0 }) {
  const start = Math.floor(at * sampleRate);
  const tau = decay;
  const end = Math.min(out.length, start + Math.ceil(tau * 7 * sampleRate));
  const w = (2 * Math.PI * freq) / sampleRate;
  for (let i = start; i < end; i += 1) {
    const t = (i - start) / sampleRate;
    const attack = Math.min(1, t / 0.00035);
    out[i] += Math.sin(w * (i - start) + phase) * Math.exp(-t / tau) * level * attack;
  }
}

/** Adds a burst of filtered noise. High-pass and low-pass are one-pole filters. */
function addNoise(out, sampleRate, random, { at = 0, duration, level, highpass = 0, lowpass = 20000 }) {
  const start = Math.floor(at * sampleRate);
  const count = Math.min(out.length - start, Math.ceil(duration * sampleRate * 5));
  const lpA = 1 - Math.exp((-2 * Math.PI * lowpass) / sampleRate);
  const hpA = 1 - Math.exp((-2 * Math.PI * highpass) / sampleRate);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const white = random() * 2 - 1;
    lp += (white - lp) * lpA;
    hp += (lp - hp) * hpA;
    out[start + i] += (lp - hp) * Math.exp(-t / duration) * level;
  }
}

/**
 * Renders one sound.
 * @param {ReturnType<typeof soundProfile>} profile
 * @param {{sampleRate?:number, stroke?:'down'|'up', variation?:number, width?:number}} [options]
 * @returns {Float32Array} mono samples, peak normalised to about 0.9
 */
export function renderKeySound(profile, { sampleRate = 44100, stroke = 'down', variation = 0, width = 1 } = {}) {
  const random = mulberry32(1000 + variation * 97 + (stroke === 'up' ? 31 : 0) + Math.round(width * 8));
  const out = new Float32Array(Math.ceil(sampleRate * 0.22));
  const detune = 1 + (random() - 0.5) * 0.05;
  const big = width >= 2;
  const longPitch = big ? 0.8 - Math.min(0.16, (width - 2) * 0.03) : 1;
  const pitch = profile.pitch * detune * longPitch;
  const down = stroke === 'down';
  const hit = (profile.force * (down ? 1 : 0.34) * (0.92 + random() * 0.16));

  // Leading sound from the mechanism, before the bottom-out.
  let at = 0;
  if (down && profile.type === 'tactile') {
    addMode(out, sampleRate, { freq: 1500 * pitch, decay: 0.0024, level: 0.1 * profile.bumpLevel });
    addNoise(out, sampleRate, random, { duration: 0.002, level: 0.09 * profile.bumpLevel, highpass: 500, lowpass: 3400 });
    at = profile.bumpLead;
  }
  if (profile.type === 'clicky') {
    const sharp = Math.max(0.8, profile.clickSharpness);
    const level = (down ? 0.86 : 0.34) * sharp;
    addNoise(out, sampleRate, random, { duration: 0.0016, level, highpass: 3200, lowpass: 11000 });
    addMode(out, sampleRate, { freq: 4700 * detune, decay: 0.0026, level: level * 0.8 });
    addMode(out, sampleRate, { freq: 7100 * detune, decay: 0.0017, level: level * 0.5 });
    at = down ? 0.016 : 0.006;
  }

  // The stem and keycap meeting the housing, then the board's response to that.
  const bodyDecay = 0.019 * profile.decay;
  addNoise(out, sampleRate, random, { at, duration: 0.0016, level: 0.2 * hit * profile.capLevel, highpass: 500, lowpass: 7000 * profile.brightness });
  addMode(out, sampleRate, { at, freq: 2550 * pitch, decay: 0.0036 * profile.decay, level: 0.22 * hit * profile.brightness * profile.capLevel });
  addMode(out, sampleRate, { at, freq: 1280 * pitch, decay: 0.0065 * profile.decay, level: 0.42 * hit * profile.brightness });
  addMode(out, sampleRate, { at, freq: 640 * pitch, decay: bodyDecay * 0.62, level: 0.5 * hit });
  addMode(out, sampleRate, { at, freq: 285 * pitch * profile.bodyPitch, decay: bodyDecay, level: 0.62 * hit * profile.bodyLevel });
  addMode(out, sampleRate, { at, freq: 148 * profile.bodyPitch, decay: bodyDecay * 1.2, level: 0.34 * hit * profile.bodyLevel });

  // Metal cases carry a faint, high ring when they aren't damped.
  if (profile.ring > 0.9) {
    addMode(out, sampleRate, { at, freq: 3320 * profile.bodyPitch, decay: 0.022 * profile.ring, level: 0.018 * hit * profile.ring });
  }

  // Long keys have a wire that rattles a little.
  if (big) {
    addNoise(out, sampleRate, random, { at: at + 0.002, duration: 0.012, level: 0.026 * hit, highpass: 700, lowpass: 2600 });
    addMode(out, sampleRate, { at, freq: 92 * profile.bodyPitch, decay: bodyDecay * 1.5, level: 0.28 * hit });
  }

  let peak = 0;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const target = (down ? 0.9 : 0.5) * Math.min(1.1, hit + 0.1);
  if (peak > 0) {
    const gain = Math.min(0.95, target) / peak;
    for (let i = 0; i < out.length; i += 1) out[i] *= gain;
  }
  // A short fade so the buffer never ends on a click of its own.
  const fade = Math.floor(sampleRate * 0.01);
  for (let i = 0; i < fade; i += 1) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Low brown noise that loops without a seam, for the optional room tone. */
export function renderRoomTone(sampleRate = 44100, seconds = 6) {
  const count = Math.floor(sampleRate * seconds);
  const out = new Float32Array(count);
  const random = mulberry32(5);
  let last = 0;
  let peak = 0;
  for (let i = 0; i < count; i += 1) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last;
    peak = Math.max(peak, Math.abs(last));
  }
  const crossfade = Math.floor(sampleRate * 0.5);
  for (let i = 0; i < crossfade; i += 1) {
    const t = i / crossfade;
    out[i] = out[i] * t + out[count - crossfade + i] * (1 - t);
  }
  for (let i = 0; i < count; i += 1) out[i] /= peak || 1;
  return out.subarray(0, count - crossfade);
}

/** Spectral centroid in Hz. A brightness measure used by tests and by nothing at runtime. */
export function spectralCentroid(samples, sampleRate = 44100, size = 2048) {
  let weighted = 0;
  let total = 0;
  const n = Math.min(size, samples.length);
  for (let bin = 1; bin < n / 2; bin += 4) {
    const w = (2 * Math.PI * bin) / n;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i += 1) {
      // A half window: a key sound starts at full level, so the attack must not be faded out.
      const windowed = samples[i] * (0.5 + 0.5 * Math.cos((Math.PI * i) / n));
      re += windowed * Math.cos(w * i);
      im -= windowed * Math.sin(w * i);
    }
    const magnitude = Math.hypot(re, im);
    weighted += magnitude * (bin * sampleRate) / n;
    total += magnitude;
  }
  return total ? weighted / total : 0;
}
