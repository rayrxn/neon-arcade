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
  // iOS uses 'interrupted' after calls / backgrounding; both need resume() from a user gesture.
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {})
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

// ── Musik lobby: playlist generatif (semua disintesis, tanpa file audio) ──
// Tiap lagu punya tempo, progresi akor, pola arpeggio, dan warna suara sendiri.
// Satu lagu = BARS bar; setelah habis lanjut ke lagu berikutnya (acak, tidak mengulang lagu yang sama).
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
export const TRACKS = [
  { id: 'neon-drive', name: 'Neon Drive', bpm: 92, bars: 32, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]], arp: [0, 2, 1, 3, 2, 1, 3, 2], lead: 'square', pad: 900, hat: true },
  { id: 'midnight-arcade', name: 'Midnight Arcade', bpm: 104, bars: 32, chords: [[50, 53, 57, 60], [46, 50, 53, 57], [53, 57, 60, 64], [48, 52, 55, 58]], arp: [0, 1, 2, 3, 2, 1, 0, 2], lead: 'sawtooth', pad: 700, hat: true },
  { id: 'coin-rain', name: 'Coin Rain', bpm: 84, bars: 28, chords: [[52, 55, 59, 62], [48, 52, 55, 59], [45, 48, 52, 55], [47, 50, 54, 57]], arp: [3, 2, 1, 0, 1, 2, 3, 1], lead: 'triangle', pad: 1100, hat: false },
  { id: 'high-roller', name: 'High Roller', bpm: 112, bars: 36, chords: [[55, 58, 62, 65], [51, 55, 58, 62], [53, 57, 60, 63], [50, 53, 57, 60]], arp: [0, 2, 3, 2, 1, 2, 3, 0], lead: 'square', pad: 800, hat: true },
  { id: 'after-hours', name: 'After Hours', bpm: 78, bars: 24, chords: [[49, 52, 56, 59], [54, 57, 61, 64], [52, 56, 59, 63], [47, 51, 54, 58]], arp: [0, 1, 3, 1, 2, 1, 3, 1], lead: 'sine', pad: 1300, hat: false },
]
const trackDuration = (tr) => (tr.bars * 4 * 60) / tr.bpm

let duck = 1
let seq = null
/** Status pemutar untuk UI (MusicPlayer). */
const listeners = new Set()
let player = { index: -1, history: [], startedAt: 0, failed: false }
const emitPlayer = () => listeners.forEach((fn) => fn(getPlayerState()))
export function getPlayerState() {
  const { sound } = usePrefsStore.getState()
  const playing = !!seq
  const tr = TRACKS[player.index] ?? TRACKS[Math.max(0, TRACKS.findIndex((x) => x.id === sound.track))] ?? TRACKS[0]
  const elapsed = playing && ctx ? ctx.currentTime - player.startedAt : 0
  return { playing, track: tr, index: TRACKS.indexOf(tr), elapsed: Math.max(0, elapsed), duration: trackDuration(tr), failed: player.failed, enabled: !sound.muted && !sound.musicOff && sound.music > 0 }
}
export function subscribePlayer(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

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

function scheduleStep(tr, step, time) {
  const beat = 60 / tr.bpm
  const stepLen = beat / 2
  const bar = Math.floor(step / 8)
  const chord = tr.chords[bar % tr.chords.length]
  const root = chord[0]
  const inBar = step % 8
  if (inBar === 0) {
    for (const n of chord) voice(hz(n), time, beat * 4, { gain: 0.022, cutoff: tr.pad, attack: 0.6, release: 1.2 })
    voice(hz(root - 24), time, beat * 1.6, { type: 'triangle', gain: 0.11, cutoff: 500, attack: 0.01, release: 0.4 })
  }
  if (inBar === 4) voice(hz(root - 24), time, beat * 1.6, { type: 'triangle', gain: 0.09, cutoff: 500, attack: 0.01, release: 0.4 })
  // Arpeggio mulai bar 4, drum mulai bar 2; 2 bar terakhir dikosongkan sebagai outro.
  const outro = bar >= tr.bars - 2
  if (bar >= 4 && !outro) voice(hz(chord[tr.arp[inBar]] + 12), time, stepLen * 0.9, { type: tr.lead, gain: tr.lead === 'sine' ? 0.03 : 0.018, cutoff: 2200, attack: 0.005, release: 0.15, dest: seq.delayIn })
  if (bar >= 2 && !outro && inBar % 4 === 0) kick(time)
  if (tr.hat && bar >= 2 && !outro && inBar % 2 === 1) noise(time, 0.05, 0.03, 7000)
}

function pickNext() {
  // Acak, tapi tidak mengulang lagu yang baru diputar (ingat 2 terakhir).
  const recent = new Set(player.history.slice(-2))
  const pool = TRACKS.map((_, i) => i).filter((i) => !recent.has(i))
  return pool[Math.floor(Math.random() * pool.length)] ?? 0
}

function startTrack(index, fade = 2.5) {
  try {
    const tr = TRACKS[index]
    const bus = ctx.createGain()
    const delayIn = ctx.createGain()
    const delay = ctx.createDelay(1)
    const feedback = ctx.createGain()
    delay.delayTime.value = (60 / tr.bpm / 2) * 1.5
    feedback.gain.value = 0.35
    delayIn.connect(bus)
    delayIn.connect(delay).connect(feedback).connect(delay)
    delay.connect(bus)
    bus.gain.setValueAtTime(0.0001, ctx.currentTime)
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + fade)
    bus.connect(musicBus)
    const stepLen = 60 / tr.bpm / 2
    const total = tr.bars * 8
    seq = { tr, bus, delayIn, step: 0, next: ctx.currentTime + 0.1, timer: null }
    player = { ...player, index, startedAt: ctx.currentTime + 0.1, failed: false, history: [...player.history, index].slice(-5) }
    usePrefsStore.getState().setSound?.({ track: tr.id })
    const tick = () => {
      if (!seq) return
      while (seq && seq.step < total && seq.next < ctx.currentTime + 0.25) {
        scheduleStep(seq.tr, seq.step, seq.next)
        seq.step++
        seq.next += stepLen
      }
      // Lagu habis → lanjut lagu berikutnya.
      if (seq && seq.step >= total && ctx.currentTime >= seq.next) {
        const old = seq
        clearInterval(old.timer)
        old.bus.disconnect()
        seq = null
        startTrack(pickNext(), 0.8)
      }
    }
    tick()
    seq.timer = setInterval(tick, 90)
    emitPlayer()
  } catch {
    player = { ...player, failed: true }
    seq = null
    emitPlayer()
  }
}

function startMusic(index) {
  const { sound } = usePrefsStore.getState()
  const saved = TRACKS.findIndex((x) => x.id === sound.track)
  startTrack(index ?? (player.index >= 0 ? player.index : saved >= 0 ? saved : pickNext()))
}

function stopMusic() {
  if (!seq) return
  const { bus, timer } = seq
  clearInterval(timer)
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3)
  setTimeout(() => bus.disconnect(), 1500)
  seq = null
  emitPlayer()
}

function syncMusic() {
  if (!ctx) return
  const { sound } = usePrefsStore.getState()
  const want = !sound.muted && !sound.musicOff && sound.music > 0
  if (want && !seq) startMusic()
  else if (!want && seq) stopMusic()
}

function jump(index) {
  const { sound } = usePrefsStore.getState()
  if (!ensure()) return
  if (seq) {
    const old = seq
    clearInterval(old.timer)
    old.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15)
    setTimeout(() => old.bus.disconnect(), 800)
    seq = null
  }
  if (sound.musicOff || sound.muted || !(sound.music > 0)) usePrefsStore.getState().setSound({ musicOff: false, muted: false, music: sound.music > 0 ? sound.music : 0.4 })
  startTrack(index, 0.6)
}
/** Kontrol pemutar (tombol di header & Settings). */
export const musicNext = () => jump(pickNext())
export const musicPrev = () => {
  const prev = player.history.length >= 2 ? player.history[player.history.length - 2] : (player.index - 1 + TRACKS.length) % TRACKS.length
  player = { ...player, history: player.history.slice(0, -2) }
  jump(prev)
}
export const musicPlayTrack = (index) => jump(index)
export function musicToggle() {
  const { sound, setSound } = usePrefsStore.getState()
  const on = !sound.muted && !sound.musicOff && sound.music > 0
  if (on) setSound({ musicOff: true })
  else {
    ensure()
    setSound({ musicOff: false, muted: false, music: sound.music > 0 ? sound.music : 0.4 })
  }
}

/** Kecilkan musik saat main game (lobby = penuh). */
export function setMusicDuck(inGame) {
  duck = inGame ? 0.35 : 1
  applyVolumes()
}

/**
 * Dipanggil sekali di PlatformRuntime: aktifkan audio setelah interaksi & ikuti prefs.
 * Mobile: iOS/Android only start audio inside a real gesture (touchend/click count, pointerdown not always),
 * iOS mutes Web Audio on the silent switch unless the session is 'playback', and backgrounding suspends the
 * context. So: listen on every gesture type until the context runs, and re-arm after the tab comes back.
 */
export function initSound() {
  if (typeof window === 'undefined') return () => {}
  const EVENTS = ['pointerdown', 'touchend', 'click', 'keydown']
  let armed = false
  const unlock = () => {
    const { sound } = usePrefsStore.getState()
    if (sound.muted || (sound.musicOff && !(sound.sfx > 0))) return
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'
    } catch {
      /* not supported */
    }
    const c = ensure()
    if (sound.music > 0 && !sound.musicOff) syncMusic()
    if (c && c.state === 'running') disarm()
    else if (c) c.resume().then(() => c.state === 'running' && disarm()).catch(() => {})
  }
  const arm = () => {
    if (armed) return
    armed = true
    EVENTS.forEach((e) => window.addEventListener(e, unlock, { passive: true }))
  }
  const disarm = () => {
    armed = false
    EVENTS.forEach((e) => window.removeEventListener(e, unlock))
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') arm()
  }
  arm()
  document.addEventListener('visibilitychange', onVisible)
  const unsub = usePrefsStore.subscribe(() => applyVolumes())
  return () => {
    disarm()
    document.removeEventListener('visibilitychange', onVisible)
    unsub()
  }
}
