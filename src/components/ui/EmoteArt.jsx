/** Drawn SVG versions of the shop emotes, so they look the same on every device (no system emoji). */
const ART = {
  skull: <><path d="M16 3C9 3 5 8 5 13c0 4 2 6 3.5 7v4h15v-4C25 19 27 17 27 13c0-5-4-10-11-10z" fill="#f1f5f9" stroke="#475569" /><circle cx="11.5" cy="14" r="3" fill="#1e293b" /><circle cx="20.5" cy="14" r="3" fill="#1e293b" /><path d="M14.5 19.5l1.5-2.5 1.5 2.5z" fill="#1e293b" /><path d="M12 24v3M16 24v3M20 24v3" stroke="#475569" strokeWidth="1.5" /></>,
  clown: <><circle cx="16" cy="17" r="11" fill="#fff7ed" stroke="#9a3412" /><circle cx="7" cy="10" r="4.5" fill="#22d3ee" /><circle cx="25" cy="10" r="4.5" fill="#f472b6" /><circle cx="12" cy="15" r="1.6" fill="#111827" /><circle cx="20" cy="15" r="1.6" fill="#111827" /><circle cx="16" cy="19" r="3" fill="#ef4444" /><path d="M10 23q6 5 12 0" stroke="#ef4444" strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  sus: <><path d="M9 28V12a7 7 0 0 1 14 0v16h-4v-4h-6v4z" fill="#ef4444" stroke="#7f1d1d" /><rect x="5" y="14" width="4" height="9" rx="2" fill="#b91c1c" /><rect x="14" y="9" width="11" height="6" rx="3" fill="#bae6fd" stroke="#0c4a6e" /></>,
  moai: <><path d="M10 4h12l2 8-1 16H9L8 12z" fill="#a8a29e" stroke="#57534e" /><path d="M10 13h5M17 13h5" stroke="#44403c" strokeWidth="2" /><path d="M16 13v7h-2" stroke="#57534e" strokeWidth="1.5" fill="none" /><path d="M12 24h8" stroke="#44403c" strokeWidth="2" /></>,
  rocket: <><path d="M16 3c5 4 6 11 4 18h-8C10 14 11 7 16 3z" fill="#e2e8f0" stroke="#475569" /><circle cx="16" cy="12" r="2.6" fill="#22d3ee" stroke="#0e7490" /><path d="M12 17l-5 5 5 0zM20 17l5 5-5 0z" fill="#ef4444" /><path d="M13.5 21l2.5 7 2.5-7z" fill="#fb923c" /></>,
  crown: <><path d="M4 11l6 6 6-11 6 11 6-6-2 15H6z" fill="#facc15" stroke="#92400e" strokeLinejoin="round" /><rect x="6" y="25" width="20" height="3" rx="1" fill="#f59e0b" stroke="#92400e" /><circle cx="16" cy="17" r="2" fill="#ef4444" /></>,
  jackpot: <><rect x="4" y="6" width="24" height="20" rx="3" fill="#7c3aed" stroke="#3b0764" /><rect x="7" y="10" width="18" height="9" rx="1.5" fill="#fff" />{[9.5, 14.5, 19.5].map((x) => <text key={x} x={x + 1.5} y="17.5" fontSize="6.5" fontWeight="900" textAnchor="middle" fill="#dc2626" fontFamily="ui-monospace,monospace">7</text>)}<path d="M28 9h2v8" stroke="#94a3b8" strokeWidth="1.5" fill="none" /><circle cx="30" cy="8" r="1.8" fill="#ef4444" /><rect x="10" y="21" width="12" height="2.5" rx="1" fill="#facc15" /></>,
}

export const hasEmoteArt = (code) => !!ART[code]

export default function EmoteArt({ code, className }) {
  return <svg viewBox="0 0 32 32" className={className} style={{ width: '1.15em', height: '1.15em', verticalAlign: '-0.2em' }} aria-hidden>{ART[code]}</svg>
}
