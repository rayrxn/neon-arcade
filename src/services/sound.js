import { usePrefsStore } from '@/store/usePrefsStore'

/**
 * Sound system — semua efek disintesis dengan Web Audio (tanpa file audio).
 * Volume: master × (sfx | music), mute global. Disimpan di prefs.
 * AudioContext baru dibuat setelah interaksi pertama (aturan autoplay browser).
 */

let ctx = null
let master, sfxBus, uiBus, musicBus, target
let music = null

function ensure() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    sfxBus = ctx.createGain()
    uiBus = ctx.createGain()
    musicBus = ctx.createGain()
    sfxBus.connect(master)
    uiBus.connect(master)
    musicBus.connect(master)
    master.connect(ctx.destination)
    applyVolumes()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function applyVolumes() {
  if (!ctx) return
  const { sound } = usePrefsStore.getState()
  const t = ctx.currentTime
  master.gain.setTargetAtTime(sound.muted ? 0 : sound.master, t, 0.02)
  sfxBus.gain.setTargetAtTime(sound.sfx, t, 0.02)
  uiBus.gain.setTargetAtTime(sound.ui ?? 0.7, t, 0.02)
  musicBus.gain.setTargetAtTime(sound.music * 0.6 * duck, t, 0.4)
  syncMusic()
}

function tone({ freq, to, dur = 0.12, type = 'sine', vol = 0.25, delay = 0, attack = 0.005 }) {
  const t0 = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(target ?? sfxBus)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const arp = (notes, step = 0.07, opts = {}) => notes.forEach((f, i) => tone({ freq: f, delay: i * step, dur: 0.18, type: 'triangle', vol: 0.2, ...opts }))

const SOUNDS = {
  click: () => tone({ freq: 620, dur: 0.035, type: 'triangle', vol: 0.08 }),
  modal: () => tone({ freq: 380, to: 520, dur: 0.09, type: 'sine', vol: 0.1 }),
  start: () => arp([392, 523], 0.06, { vol: 0.14 }),
  tick: () => tone({ freq: 880, dur: 0.025, type: 'square', vol: 0.03 }),
  peg: () => tone({ freq: 1200 + Math.random() * 500, dur: 0.03, type: 'triangle', vol: 0.05 }),
  flip: () => tone({ freq: 300, to: 900, dur: 0.18, type: 'triangle', vol: 0.1 }),
  card: () => tone({ freq: 2200, to: 900, dur: 0.05, type: 'triangle', vol: 0.06 }),
  reveal: () => tone({ freq: 740, to: 1100, dur: 0.08, type: 'sine', vol: 0.12 }),
  win: () => arp([523, 659, 784, 1046], 0.07),
  lose: () => tone({ freq: 220, to: 110, dur: 0.32, type: 'sawtooth', vol: 0.08 }),
  explode: () => {
    tone({ freq: 160, to: 40, dur: 0.45, type: 'sawtooth', vol: 0.16 })
    tone({ freq: 90, to: 30, dur: 0.5, type: 'square', vol: 0.06, delay: 0.02 })
  },
  reward: () => arp([659, 880, 1175], 0.06),
  success: () => arp([587, 880], 0.07, { vol: 0.15 }),
  error: () => arp([330, 247], 0.09, { type: 'square', vol: 0.06 }),
  quest: () => arp([523, 784, 1046], 0.08),
  daily: () => arp([523, 659, 784, 1046, 1318], 0.06),
  achievement: () => arp([392, 523, 659, 784, 1046], 0.08, { type: 'sine', vol: 0.18 }),
  levelup: () => arp([523, 659, 784, 1046, 1318, 1568], 0.07, { vol: 0.2 }),
  jackpot: () => arp([784, 988, 1175, 1568, 1175, 1568], 0.09, { type: 'square', vol: 0.07 }),
  notification: () => arp([880, 1175], 0.08, { type: 'sine', vol: 0.12 }),
  chat: () => tone({ freq: 980, to: 1320, dur: 0.06, type: 'sine', vol: 0.07 }),
}

/** Suara antarmuka (bus UI). Sisanya suara game (bus game). */
export const UI_SOUNDS = new Set(['click', 'modal', 'notification', 'chat', 'error', 'success', 'reward', 'quest', 'daily', 'achievement', 'levelup'])

export function play(name) {
  try {
    const { sound } = usePrefsStore.getState()
    const ui = UI_SOUNDS.has(name)
    if (sound.muted || sound.master === 0 || (ui ? sound.ui ?? 0.7 : sound.sfx) === 0) return
    if (!ensure()) return
    target = ui ? uiBus : sfxBus
    SOUNDS[name]?.()
    target = null
  } catch {
    /* audio tidak tersedia — abaikan */
  }
}

// ── Musik lobby: synthwave lo-fi generatif (Am7 – Fmaj7 – Cmaj7 – G6, 92 BPM) ──
// Pad hangat + bass + arpeggio dengan delay + kick & hat lembut. Dijadwalkan dengan
// lookahead scheduler supaya timing stabil walau tab sibuk.
const BPM = 92
const BEAT = 60 / BPM
const STEP = BEAT / 2 // 8th note
const CHORDS = [
  { root: 57, notes: [57, 60, 64, 67] }, // Am7
  { root: 53, notes: [53, 57, 60, 64] }, // Fmaj7
  { root: 48, notes: [48, 52, 55, 59] }, // Cmaj7
  { root: 55, notes: [55, 59, 62, 64] }, // G6
]
const ARP = [0, 2, 1, 3, 2, 1, 3, 2]
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
let duck = 1
let seq = null

function voice(freq, start, dur, { type = 'sawtooth', gain = 0.05, cutoff = 1200, attack = 0.02, release = 0.3, dest } = {}) {
  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(cutoff, start)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.linearRampToValueAtTime(gain, start + attack)
  g.gain.setValueAtTime(gain, start + Math.max(attack, dur - release))
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(filter).connect(g).connect(dest ?? seq.bus)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function noise(start, dur, gain, freq) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const g = ctx.createGain()
  src.buffer = buffer
  filter.type = 'highpass'
  filter.frequency.value = freq
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter).connect(g).connect(seq.bus)
  src.start(start)
}

function kick(start) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.setValueAtTime(110, start)
  osc.frequency.exponentialRampToValueAtTime(42, start + 0.18)
  g.gain.setValueAtTime(0.22, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
  osc.connect(g).connect(seq.bus)
  osc.start(start)
  osc.stop(start + 0.32)
}

function scheduleStep(step, time) {
  const bar = Math.floor(step / 8)
  const chord = CHORDS[bar % CHORDS.length]
  const inBar = step % 8
  if (inBar === 0) {
    for (const n of chord.notes) voice(hz(n), time, BEAT * 4, { gain: 0.022, cutoff: 900, attack: 0.6, release: 1.2 })
    voice(hz(chord.root - 24), time, BEAT * 1.6, { type: 'triangle', gain: 0.11, cutoff: 500, attack: 0.01, release: 0.4 })
  }
  if (inBar === 4) voice(hz(chord.root - 24), time, BEAT * 1.6, { type: 'triangle', gain: 0.09, cutoff: 500, attack: 0.01, release: 0.4 })
  // Arpeggio mulai dari putaran ke-2 supaya intro terasa pelan.
  if (step >= 32) voice(hz(chord.notes[ARP[inBar]] + 12), time, STEP * 0.9, { type: 'square', gain: 0.018, cutoff: 2200, attack: 0.005, release: 0.15, dest: seq.delayIn })
  if (step >= 16 && inBar % 4 === 0) kick(time)
  if (step >= 16 && inBar % 2 === 1) noise(time, 0.05, 0.03, 7000)
}

function startMusic() {
  const bus = ctx.createGain()
  const delayIn = ctx.createGain()
  const delay = ctx.createDelay(1)
  const feedback = ctx.createGain()
  delay.delayTime.value = STEP * 1.5
  feedback.gain.value = 0.35
  delayIn.connect(bus)
  delayIn.connect(delay).connect(feedback).connect(delay)
  delay.connect(bus)
  bus.gain.setValueAtTime(0.0001, ctx.currentTime)
  bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5) // fade in
  bus.connect(musicBus)
  seq = { bus, delayIn, step: 0, next: ctx.currentTime + 0.1, timer: null }
  const tick = () => {
    while (seq && seq.next < ctx.currentTime + 0.25) {
      scheduleStep(seq.step, seq.next)
      seq.step = (seq.step + 1) % (CHORDS.length * 8 * 8) // loop ~2,8 menit
      seq.next += STEP
    }
  }
  tick()
  seq.timer = setInterval(tick, 90)
}

function stopMusic() {
  if (!seq) return
  const { bus, timer } = seq
  clearInterval(timer)
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3)
  setTimeout(() => bus.disconnect(), 1500)
  seq = null
}

function syncMusic() {
  if (!ctx) return
  const { sound } = usePrefsStore.getState()
  const want = !sound.muted && !sound.musicOff && sound.music > 0
  if (want && !seq) startMusic()
  else if (!want && seq) stopMusic()
}

/** Kecilkan musik saat main game (lobby = penuh). */
export function setMusicDuck(inGame) {
  duck = inGame ? 0.35 : 1
  applyVolumes()
}

/** Dipanggil sekali di PlatformRuntime: aktifkan audio setelah interaksi pertama & ikuti prefs. */
export function initSound() {
  if (typeof window === 'undefined') return () => {}
  const unlock = () => {
    const { sound } = usePrefsStore.getState()
    if (sound.music > 0 && !sound.muted && !sound.musicOff) {
      ensure()
      syncMusic()
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  const unsub = usePrefsStore.subscribe(() => applyVolumes())
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    unsub()
  }
}
