/** Mirrors api/lib/games2.php (display only — the server decides every result). */
export const KENO_POOL = 40
export const KENO_PAY = {"1": [0.0, 3.88], "2": [0.0, 1.88, 4.31], "3": [0.0, 0.0, 5.89, 13.56], "4": [0.0, 0.0, 3.06, 7.04, 16.19], "5": [0.0, 0.0, 1.87, 4.29, 9.87, 45.38], "6": [0.0, 0.0, 0.0, 5.02, 11.53, 26.53, 122.04], "7": [0.0, 0.0, 0.0, 3.06, 7.03, 16.18, 37.21, 171.18], "8": [0.0, 0.0, 0.0, 0.0, 8.64, 19.86, 45.69, 105.08, 483.35], "9": [0.0, 0.0, 0.0, 0.0, 5.2, 11.96, 27.51, 63.28, 145.55, 669.54], "10": [0.0, 0.0, 0.0, 0.0, 3.37, 7.74, 17.81, 40.96, 94.21, 216.69, 996.77]}

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

export const ladderMult = (game, mode, k) => (k <= 0 ? 1 : Math.floor((0.99 / ladderP(game, mode) ** k) * 100) / 100)
