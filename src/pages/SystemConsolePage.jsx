import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Lock, TerminalSquare } from 'lucide-react'
import { api } from '@/services/server'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

/**
 * Owner Console (web). Separate authority boundary: unlocked with the console key, not with a user role.
 * The server keeps the session (HttpOnly cookie), runs only registered commands and audits every line.
 */
export default function SystemConsolePage() {
  const { t } = useT()
  const [state, setState] = useState(null)
  const [key, setKey] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [hIdx, setHIdx] = useState(-1)
  const [pending, setPending] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const load = () => api('console/state').then(setState).catch((e) => setErr(t(errorKey(e), e?.vars)))
  useEffect(() => { if (SERVER_MODE) load() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [lines])

  const unlock = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('console/unlock', { key })
      setKey('')
      setLines([{ kind: 'sys', text: t('console.welcome') }])
      await load()
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (e2) {
      setErr(t(errorKey(e2), e2?.vars))
    } finally {
      setBusy(false)
    }
  }

  const lock = async () => {
    await api('console/lock', {}).catch(() => null)
    setLines([])
    setPending(null)
    load()
  }

  const exec = async (e) => {
    e.preventDefault()
    const cmd = input.trim()
    if (!cmd || busy) return
    setInput('')
    setHIdx(-1)
    if (cmd === 'clear') { setLines([]); return }
    if (cmd === 'lock' || cmd === 'exit') { lock(); return }
    setHistory((h) => [cmd, ...h.filter((x) => x !== cmd)].slice(0, 50))
    setLines((l) => [...l, { kind: 'in', text: cmd }])
    setBusy(true)
    try {
      const confirming = pending && pending === cmd
      const r = await api('console/exec', confirming ? { command: cmd, confirm: cmd } : { command: cmd })
      setPending(r.confirm ? cmd : null)
      setLines((l) => [...l, { kind: r.confirm ? 'warn' : r.ok ? 'out' : 'err', text: r.output }])
    } catch (e2) {
      const code = errorKey(e2)
      setLines((l) => [...l, { kind: 'err', text: t(code, e2?.vars) }])
      if (code === 'console.errors.expired') load()
    } finally {
      setBusy(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const onKey = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const i = Math.min(history.length - 1, hIdx + 1)
      if (i >= 0) { setHIdx(i); setInput(history[i]) }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = hIdx - 1
      setHIdx(Math.max(-1, i))
      setInput(i >= 0 ? history[i] : '')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const word = input.split(' ')[0]
      const hits = (state?.commands ?? []).filter((c) => c.startsWith(word))
      if (hits.length === 1) setInput(hits[0] + ' ')
      else if (hits.length > 1) setLines((l) => [...l, { kind: 'sys', text: hits.join('  ') }])
    }
  }

  const tone = { in: 'text-cyan-300', out: 'text-slate-200', err: 'text-rose-400', warn: 'text-amber-300', sys: 'text-emerald-300' }

  return (
    <div className="console-page min-h-dvh bg-[#05070b] px-4 py-6 text-slate-200 sm:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-[0.2em] text-emerald-300"><TerminalSquare className="h-5 w-5" /> {t('console.title')}</h1>
        <div className="flex items-center gap-3 text-xs">
          {state?.unlocked && <button onClick={lock} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-slate-400 ring-1 ring-inset ring-white/10 hover:text-white"><Lock className="h-3.5 w-3.5" /> {t('console.lock')}</button>}
          <Link to="/" className="font-mono text-slate-500 hover:text-slate-300">{t('console.back')}</Link>
        </div>
      </div>

      {!SERVER_MODE ? (
        <p className="mx-auto mt-16 max-w-md text-center font-mono text-sm text-slate-500">{t('admin.serverOnly')}</p>
      ) : !state ? (
        <p className="mx-auto mt-16 max-w-md text-center font-mono text-sm text-slate-500">{err ?? '…'}</p>
      ) : !state.enabled ? (
        <div className="mx-auto mt-16 max-w-lg rounded-2xl bg-white/[0.03] p-6 font-mono text-sm ring-1 ring-inset ring-white/10">
          <p className="text-amber-300">{t('console.disabled')}</p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">php ~/neon-src/tools/owner-console.php --hash</pre>
        </div>
      ) : !state.unlocked ? (
        <form onSubmit={unlock} className="mx-auto mt-16 max-w-sm rounded-2xl bg-white/[0.03] p-6 ring-1 ring-inset ring-white/10">
          <p className="flex items-center gap-2 font-mono text-sm text-slate-300"><KeyRound className="h-4 w-4 text-emerald-300" /> {t('console.keyPrompt')}</p>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className="mt-4 h-11 w-full rounded-xl bg-black/50 px-3 font-mono text-sm text-emerald-200 outline-none ring-1 ring-inset ring-white/10 focus:ring-emerald-400/50" aria-label={t('console.keyPrompt')} />
          {err && <p className="mt-2 font-mono text-xs text-rose-400" role="alert">{err}</p>}
          <button disabled={busy || key.length < 8} className="mt-4 h-10 w-full rounded-xl bg-emerald-400 font-mono text-sm font-bold text-black disabled:opacity-40">{busy ? '…' : t('console.unlock')}</button>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-500">{t('console.note')}</p>
        </form>
      ) : (
        <div className="mx-auto mt-5 max-w-5xl overflow-hidden rounded-2xl bg-black/60 ring-1 ring-inset ring-white/10" onClick={() => inputRef.current?.focus()}>
          <div className="h-[70dvh] overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
            {lines.map((l, i) => (
              <pre key={i} className={`whitespace-pre-wrap break-words ${tone[l.kind]}`}>{l.kind === 'in' ? `neon# ${l.text}` : l.text}</pre>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={exec} className="flex items-center gap-2 border-t border-white/10 px-4 py-3 font-mono text-[13px]">
            <span className={pending ? 'text-amber-300' : 'text-emerald-300'}>{pending ? 'confirm>' : 'neon#'}</span>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} autoComplete="off" spellCheck={false} disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none" aria-label={t('console.input')} />
          </form>
        </div>
      )}
    </div>
  )
}
