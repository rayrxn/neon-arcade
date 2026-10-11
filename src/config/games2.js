/** Mirrors api/lib/games2.php (display only — the server decides every result). */
export const KENO_POOL = 40
export const KENO_PAY = {"1": [0.0, 3.76], "2": [0.0, 1.81, 4.17], "3": [0.0, 0.0, 5.71, 13.13], "4": [0.0, 0.0, 2.96, 6.82, 15.68], "5": [0.0, 0.0, 1.8, 4.15, 9.56, 43.98], "6": [0.0, 0.0, 0.0, 4.85, 11.17, 25.7, 118.26], "7": [0.0, 0.0, 0.0, 2.96, 6.81, 15.67, 36.06, 165.88], "8": [0.0, 0.0, 0.0, 0.0, 8.36, 19.24, 44.27, 101.82, 468.4], "9": [0.0, 0.0, 0.0, 0.0, 5.04, 11.59, 26.66, 61.32, 141.05, 648.83], "10": [0.0, 0.0, 0.0, 0.0, 3.26, 7.5, 17.25, 39.69, 91.29, 209.98, 965.94]}

export const LADDER = {
  tower: { steps: 9, modes: { easy: { cols: 4, one: 'bomb' }, medium: { cols: 3, one: 'bomb' }, hard: { cols: 2, one: 'safe' }, expert: { cols: 3, one: 'safe' } } },
  cross: { steps: 20, rtp: 0.94, modes: { easy: { p: 0.6 }, medium: { p: 0.45 }, hard: { p: 0.33 }, daredevil: { p: 0.22 } } },
  pump: { steps: 25, modes: { easy: { p: 0.96 }, medium: { p: 0.9 }, hard: { p: 0.8 }, expert: { p: 0.65 } } },
  moles: { steps: 15, rtp: 0.95, modes: { easy: { p: 0.75 }, medium: { p: 0.6 }, hard: { p: 0.45 }, expert: { p: 0.3 } } },
  layer: { steps: 50, rtp: 0.97, modes: { easy: { p: 0.98 }, medium: { p: 0.95 }, hard: { p: 0.9 }, expert: { p: 0.8 } } },
}
/** Slice fruit → safe chance (mirrors SLICE_FRUITS). Multiplier per cut ×1/p; the first cut also takes the 5% edge. */
export const SLICE_FRUITS = { watermelon: 0.8, apple: 0.6, orange: 0.55, lemon: 0.4, pineapple: 0.25, cherry: 0.12, grape: 0.04 }
export const SLICE_RTP = 0.95

/** Snake board per mode (tile = dice sum − 2; 0 = snake). Mirrors SNAKE_BOARD in api/lib/games2.php. */
export const SNAKE_BOARD = {
  easy: [1.94, 1.26, 1.16, 1.06, 1.01, 0, 1.01, 1.06, 1.16, 1.26, 1.94],
  medium: [4.0, 2.5, 1.35, 1.06, 0, 0, 0, 1.06, 1.35, 2.5, 4.0],
  hard: [7.2, 2.88, 1.44, 0, 0, 0, 0, 0, 1.44, 2.88, 7.2],
  expert: [8.64, 4.32, 0, 0, 0, 0, 0, 0, 0, 4.32, 8.64],
}

export function ladderP(game, mode) {
  const m = LADDER[game].modes[mode]
  if (game !== 'tower') return m.p
  return m.one === 'bomb' ? (m.cols - 1) / m.cols : 1 / m.cols
}

export const ladderMult = (game, mode, k) => (k <= 0 ? 1 : Math.min(1_000_000, Math.floor(((LADDER[game].rtp ?? 0.96) / ladderP(game, mode) ** k) * 100) / 100))

export const TAROT_CARDS = ["tower", "death", "devil", "hanged", "moon", "hermit", "fool", "temperance", "justice", "hierophant", "priestess", "strength", "emperor", "empress", "lovers", "chariot", "magician", "judgement", "wheel", "star", "sun", "world"]
export const TAROT_PAY = {"low": [0.26, 0.45, 0.54, 0.63, 0.72, 0.72, 0.81, 0.81, 0.9, 0.9, 0.9, 0.9, 0.98, 0.98, 1.07, 1.07, 1.16, 1.26, 1.35, 1.44, 1.62, 1.97], "medium": [0.0, 0.14, 0.29, 0.36, 0.43, 0.51, 0.58, 0.66, 0.73, 0.73, 0.73, 0.88, 0.88, 0.94, 1.09, 1.17, 1.31, 1.46, 1.61, 1.83, 2.19, 2.92], "high": [0.0, 0.0, 0.0, 0.0, 0.0, 0.11, 0.17, 0.29, 0.29, 0.47, 0.59, 0.59, 0.71, 0.88, 0.88, 1.17, 1.47, 1.77, 2.06, 2.36, 2.94, 4.72]}
