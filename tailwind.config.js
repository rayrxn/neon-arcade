/** @type {import('tailwindcss').Config} */

// Semua warna tema dibaca dari CSS variables (lihat src/index.css), jadi satu set
// kelas Tailwind bekerja untuk dark dan light. `white` = warna teks/overlay utama
// (putih di dark, hampir hitam di light). `night` = hitam tetap untuk teks di atas
// permukaan terang (tombol emas/cyan, avatar). `gem` = warna AG (Arcade Gems).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        white: v('white'),
        night: '#05060b',
        onaccent: '#05060b', // teks di atas tombol cyan/emas, sama di dark & light
        gem: v('gem'),
        ink: {
          950: v('ink-950'),
          900: v('ink-900'),
          850: v('ink-850'),
          800: v('ink-800'),
          700: v('ink-700'),
          600: v('ink-600'),
        },
        slate: {
          100: v('slate-100'),
          200: v('slate-200'),
          300: v('slate-300'),
          400: v('slate-400'),
          500: v('slate-500'),
          600: v('slate-600'),
          700: v('slate-700'),
        },
        neon: {
          cyan: v('neon-cyan'),
          gold: v('neon-gold'),
          purple: v('neon-purple'),
          pink: v('neon-pink'),
          green: v('neon-green'),
          red: v('neon-red'),
        },
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        pop: 'var(--shadow-pop)',
        'glow-cyan': '0 0 0 1px rgb(var(--neon-cyan) / 0.35), 0 6px 18px -8px rgb(var(--neon-cyan) / 0.55)',
        'glow-gold': '0 0 0 1px rgb(var(--neon-gold) / 0.4), 0 6px 18px -8px rgb(var(--neon-gold) / 0.5)',
        'glow-purple': '0 0 0 1px rgb(var(--gem) / 0.4), 0 6px 18px -8px rgb(var(--gem) / 0.5)',
      },
    },
  },
  plugins: [],
}
