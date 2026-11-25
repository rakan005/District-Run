// Small, asset-free game audio built with Web Audio.
// Call initAudio() from a click/keyboard gesture before enabling game sounds.

let context = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let disposed = false;

const AudioContextClass = () =>
  typeof window === "undefined"
    ? null
    : window.AudioContext || window.webkitAudioContext || null;

function ensureContext() {
  if (disposed) return null;
  if (context) return context;

  const Context = AudioContextClass();
  if (!Context) return null;

  try {
    context = new Context();
    master = context.createGain();
    master.gain.value = 0.52;
    master.connect(context.destination);
    return context;
  } catch {
    context = null;
    master = null;
    return null;
  }
}

function safeStop(node) {
  if (!node) return;
  try {
    node.stop();
  } catch {
    // A node may already have stopped or never have started.
  }
  try {
    node.disconnect();
  } catch {
    // Ignore nodes that were already disconnected.
  }
}

function startEngine(ctx) {
  if (engineNodes || !ctx || !master) return;

  try {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 360;
    filter.Q.value = 0.7;
    filter.connect(master);

    const body = ctx.createOscillator();
    body.type = "sawtooth";
    body.frequency.value = 48;

    const harmonic = ctx.createOscillator();
    harmonic.type = "triangle";
    harmonic.frequency.value = 96;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.0001;
    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.0001;
    body.connect(bodyGain).connect(filter);
    harmonic.connect(harmonicGain).connect(filter);

    body.start();
    harmonic.start();
    engineNodes = { filter, body, harmonic, bodyGain, harmonicGain };
  } catch {
    engineNodes = null;
  }
}

function startSiren(ctx) {
  if (sirenNodes || !ctx || !master) return;

  try {
    const voice = ctx.createOscillator();
    voice.type = "sine";
    voice.frequency.value = 690;

    const sweep = ctx.createOscillator();
    sweep.type = "triangle";
    sweep.frequency.value = 0.72;

    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 245;
    sweep.connect(sweepDepth).connect(voice.frequency);

    const tone = ctx.createGain();
    tone.gain.value = 0;
    voice.connect(tone).connect(master);

    voice.start();
    sweep.start();
    tone.gain.setTargetAtTime(0.055, ctx.currentTime, 0.12);
    sirenNodes = { voice, sweep, sweepDepth, tone };
  } catch {
    sirenNodes = null;
  }
}

function stopSiren() {
  if (!sirenNodes) return;
  const nodes = sirenNodes;
  sirenNodes = null;
  try {
    nodes.tone.gain.setTargetAtTime(0, context.currentTime, 0.06);
    window.setTimeout(() => {
      safeStop(nodes.voice);
      safeStop(nodes.sweep);
      try {
        nodes.sweepDepth.disconnect();
        nodes.tone.disconnect();
      } catch {
        // Nodes may be gone after context shutdown.
      }
    }, 260);
  } catch {
    safeStop(nodes.voice);
    safeStop(nodes.sweep);
  }
}

/** Start or resume audio. Call directly from the start button gesture. */
export function initAudio() {
  const ctx = ensureContext();
  if (!ctx) return Promise.resolve(false);

  try {
    startEngine(ctx);
    if (ctx.state === "suspended") {
      return ctx.resume().then(() => true).catch(() => false);
    }
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

/** Update the engine loop from 0..1 (normalized vehicle speed). */
export function setEngine(speed01) {
  const ctx = context;
  if (!ctx || !engineNodes || disposed) return;

  const amount = Math.max(0, Math.min(1, Number(speed01) || 0));
  const now = ctx.currentTime;
  const rpm = 48 + amount * 115;
  const cutoff = 360 + amount * 1250;

  try {
    engineNodes.body.frequency.setTargetAtTime(rpm, now, 0.08);
    engineNodes.harmonic.frequency.setTargetAtTime(rpm * 2.03, now, 0.08);
    engineNodes.filter.frequency.setTargetAtTime(cutoff, now, 0.12);
    const active = amount > 0.015;
    engineNodes.bodyGain.gain.setTargetAtTime(active ? 0.026 + amount * 0.034 : 0.0001, now, 0.12);
    engineNodes.harmonicGain.gain.setTargetAtTime(active ? 0.009 + amount * 0.014 : 0.0001, now, 0.12);
  } catch {
    // Audio can be suspended or torn down while a frame is updating.
  }
}

/** Enable the police siren while a pursuit is active. */
export function setSiren(active) {
  if (active) {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === "running") startSiren(ctx);
    else ctx.resume().then(() => startSiren(ctx)).catch(() => {});
  } else {
    stopSiren();
  }
}

/** Play a short three-note delivery confirmation. */
export function playDelivery() {
  const ctx = context;
  if (!ctx || !master || ctx.state !== "running" || disposed) return;

  const startAt = ctx.currentTime + 0.015;
  const notes = [659.25, 830.61, 987.77];
  notes.forEach((frequency, index) => {
    try {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      const at = startAt + index * 0.105;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.006, at + 0.16);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(0.075, at + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      oscillator.connect(envelope).connect(master);
      oscillator.start(at);
      oscillator.stop(at + 0.44);
      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          envelope.disconnect();
        } catch {
          // Already disconnected during cleanup.
        }
      };
    } catch {
      // A missing audio device must never interrupt mission completion.
    }
  });
}

/** Silence loops but retain the context so the game can resume audio later. */
export function stopAudio() {
  const nodes = engineNodes;
  engineNodes = null;
  if (nodes) {
    safeStop(nodes.body);
    safeStop(nodes.harmonic);
    try {
      nodes.bodyGain.disconnect();
      nodes.harmonicGain.disconnect();
      nodes.filter.disconnect();
    } catch {
      // Context shutdown below handles remaining resources.
    }
  }
  stopSiren();
}

/** Permanently release audio resources, for page teardown or a full reset. */
export function cleanupAudio() {
  if (disposed) return;
  stopAudio();
  disposed = true;

  if (context) {
    try {
      context.close();
    } catch {
      // Ignore browsers that have already closed the context.
    }
  }
  context = null;
  master = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", cleanupAudio, { once: true });
}
