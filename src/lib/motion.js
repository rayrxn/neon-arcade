/**
 * Game motion tokens. Source of truth: Figma file "Neon Arcade — Game Motion Kit"
 * (https://www.figma.com/design/giIP5BMmh3w09GkMM8pP9l). Figma springs (duration + bounce) map 1:1 to framer-motion springs.
 */
export const spring = (duration, bounce, delay = 0) => ({ type: 'spring', duration, bounce, delay })

/** Win badge: springs in from 40% with a small counter-rotation. */
export const winPop = {
  initial: { opacity: 0, scale: 0.4, rotate: -8 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  transition: { scale: spring(0.55, 0.45), rotate: spring(0.55, 0.35), opacity: { duration: 0.18, ease: 'easeOut' } },
}

/** Loss: short horizontal shake (0.45 s). */
export const lossShake = {
  animate: { x: [0, -12, 10, -6, 3, 0] },
  transition: { duration: 0.45, times: [0, 0.18, 0.38, 0.58, 0.78, 1], ease: 'easeOut' },
}

/** Tile reveal: flip through scaleX 0, then a settle bump. */
export const tileFlip = {
  animate: { scaleX: [1, 0.02, 1, 1.12, 1], scaleY: [1, 1, 1, 1.12, 1] },
  transition: { duration: 0.7, times: [0, 0.23, 0.49, 0.63, 1], ease: ['easeIn', 'easeOut', 'easeOut', 'easeOut'] },
}

/** Coin k of n flying out from the centre (staggered 25 ms). */
export const coinBurst = (k, n, dist = 90) => {
  const a = (k / n) * Math.PI * 2
  const d = dist + (k % 3) * 12
  const s = k * 0.025
  return {
    initial: { x: 0, y: 0, scale: 0.3, opacity: 1 },
    animate: { x: Math.cos(a) * d, y: Math.sin(a) * d + 24, scale: [0.3, 1.15, 0.7], opacity: [1, 1, 0] },
    transition: { duration: 0.75, delay: s, ease: 'easeOut', times: [0, 0.3, 1] },
  }
}

/** Falling piece (row 0 = top): springs down from above, lower rows land first. */
export const dropIn = (row, rows = 5, from = -260) => ({
  initial: { y: from, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { y: spring(0.6, 0.35, (rows - 1 - row) * 0.06), opacity: { duration: 0.12, delay: (rows - 1 - row) * 0.06 } },
})
