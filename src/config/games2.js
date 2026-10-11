/** Mirrors api/lib/games2.php (display only — the server decides every result). */
export const KENO_POOL = 40
export const KENO_PAY = {"1": [0.0, 3.76], "2": [0.0, 1.81, 4.17], "3": [0.0, 0.0, 5.71, 13.13], "4": [0.0, 0.0, 2.96, 6.82, 15.68], "5": [0.0, 0.0, 1.8, 4.15, 9.56, 43.98], "6": [0.0, 0.0, 0.0, 4.85, 11.17, 25.7, 118.26], "7": [0.0, 0.0, 0.0, 2.96, 6.81, 15.67, 36.06, 165.88], "8": [0.0, 0.0, 0.0, 0.0, 8.36, 19.24, 44.27, 101.82, 468.4], "9": [0.0, 0.0, 0.0, 0.0, 5.04, 11.59, 26.66, 61.32, 141.05, 648.83], "10": [0.0, 0.0, 0.0, 0.0, 3.26, 7.5, 17.25, 39.69, 91.29, 209.98, 965.94]}

export const LADDER = {
  tower: { steps: 9, modes: { easy: { cols: 4, one: 'bomb' }, medium: { cols: 3, one: 'bomb' }, hard: { cols: 2, one: 'safe' }, expert: { cols: 3, one: 'safe' } } },
  cross: { steps: 20, modes: { easy: { p: 0.9 }, medium: { p: 0.8 }, hard: { p: 0.7 }, daredevil: { p: 0.55 } } },
  pump: { steps: 25, modes: { easy: { p: 0.96 }, medium: { p: 0.9 }, hard: { p: 0.8 }, expert: { p: 0.65 } } },
}

export function ladderP(game, mode) {
  const m = LADDER[game].modes[mode]
  if (game !== 'tower') return m.p
  return m.one === 'bomb' ? (m.cols - 1) / m.cols : 1 / m.cols
}

export const ladderMult = (game, mode, k) => (k <= 0 ? 1 : Math.floor((0.96 / ladderP(game, mode) ** k) * 100) / 100)

export const TAROT_CARDS = ["tower", "death", "devil", "hanged", "moon", "hermit", "fool", "temperance", "justice", "hierophant", "priestess", "strength", "emperor", "empress", "lovers", "chariot", "magician", "judgement", "wheel", "star", "sun", "world"]
export const TAROT_PAY = {"low": [0.26, 0.45, 0.54, 0.63, 0.72, 0.72, 0.81, 0.81, 0.9, 0.9, 0.9, 0.9, 0.98, 0.98, 1.07, 1.07, 1.16, 1.26, 1.35, 1.44, 1.62, 1.97], "medium": [0.0, 0.14, 0.29, 0.36, 0.43, 0.51, 0.58, 0.66, 0.73, 0.73, 0.73, 0.88, 0.88, 0.94, 1.09, 1.17, 1.31, 1.46, 1.61, 1.83, 2.19, 2.92], "high": [0.0, 0.0, 0.0, 0.0, 0.0, 0.11, 0.17, 0.29, 0.29, 0.47, 0.59, 0.59, 0.71, 0.88, 0.88, 1.17, 1.47, 1.77, 2.06, 2.36, 2.94, 4.72]}
