import clsx from 'clsx'

/** Koin Arcade 3D. `spin` memakai keyframes CSS (loop tanpa biaya JS). */
export default function CoinIcon({ size = 20, spin = false, className }) {
  return (
    <span
      className={clsx('coin inline-block shrink-0', spin && 'coin-spin', className)}
      style={{ '--size': `${size}px` }}
      aria-hidden
    >
      <span className="coin-face">
        <span>A</span>
      </span>
      <span className="coin-face coin-back">
        <span>A</span>
      </span>
    </span>
  )
}
