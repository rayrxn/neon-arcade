import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, Check, ChevronRight, Coins, Compass, Copy, Gamepad2, History, KeyRound, Lock, MessagesSquare,
  Package, Play, Search, Server, ShieldCheck, TerminalSquare, Users, X,
} from 'lucide-react'
import { api } from '@/services/server'
import { SERVER_MODE } from '@/config/runtime'
import { Switch } from '@/components/ui/Controls'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

const GROUP_ICONS = { start: Compass, players: Users, economy: Coins, games: Gamepad2, community: MessagesSquare, content: Package, security: ShieldCheck, system: Server, recent: History }
const TONE = { in: 'text-cyan-300', out: 'text-slate-200', err: 'text-rose-400', warn: 'text-amber-300', sys: 'text-emerald-300' }
const RECENT_KEY = 'console-recent'

const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
const writeRecent = (v) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(v)) } catch { /* storage blocked */ } }
const itemId = (it) => `${it.kind}:${it.name}`

/** Quote one value for the console's word splitter. */
function quote(v) {
  const s = String(v)
  if (s === '') return '""'
  if (!/[\s"']/.test(s)) return s
  return s.includes('"') ? `'${s}'` : `"${s}"`
}
const asUser = (v) => { const s = String(v).trim(); return /^@|^\d+$/.test(s) ? s : `@${s}` }

/** Form values → the command line the server runs. Returns { line } or { error: [key, vars] }. */
function buildLine(item, values, loose = false) {
  const filled = (f) => f.type === 'bool' || String(values[f.key] ?? '').trim() !== ''
  for (const f of item.fields) {
    if (f.type === 'json' && filled(f) && !loose) { try { JSON.parse(values[f.key]) } catch { return { error: ['console.ui.badJson', { field: f.label }] } } }
  }
  if (item.kind === 'action') {
    const parts = ['do', item.name]
    for (const f of item.fields) {
      if (!filled(f)) { if (!f.optional) { if (!loose) return { error: ['console.ui.required', { field: f.label }] }; parts.push(`${f.key}=<${f.key}>`) } continue }
      const raw = values[f.key]
      const v = f.type === 'bool' ? (raw ? 'true' : 'false') : f.type === 'user' ? asUser(raw) : f.type === 'json' ? (loose ? String(raw).replace(/\s*\n\s*/g, ' ') : JSON.stringify(JSON.parse(raw))) : String(raw).trim()
      parts.push(`${f.key}=${quote(v)}`)
    }
    return { line: parts.join(' ') }
  }
  // Classic commands take positional words; the last text field may hold spaces.
  const vals = item.fields.map((f) => (filled(f) ? (f.type === 'bool' ? (values[f.key] ? 'on' : 'off') : String(values[f.key]).trim()) : loose && !f.optional ? `<${f.key}>` : ''))
  let last = vals.length - 1
  while (last >= 0 && vals[last] === '') last--
  for (let i = 0; i <= last; i++) {
    if (vals[i] === '') return { error: [item.fields[i].optional ? 'console.ui.gap' : 'console.ui.required', { field: item.fields[i].label }] }
  }
  const missing = item.fields.find((f, i) => !f.optional && f.type !== 'reason' && vals[i] === '')
  if (missing) return { error: ['console.ui.required', { field: missing.label }] }
  const words = vals.slice(0, last + 1).map((v, i) => (i === last && ['text', 'reason'].includes(item.fields[i].type) ? v : quote(v)))
  return { line: [item.name, ...words].join(' ') }
}

const inputCls = 'h-10 w-full rounded-xl bg-black/40 px-3 text-sm text-slate-100 outline-none ring-1 ring-inset ring-white/10 transition placeholder:text-slate-600 focus:ring-emerald-400/50'

function FieldInput({ field, value, onChange, games, t }) {
  const id = `cf-${field.key}`
  if (field.type === 'bool') return <Switch id={id} checked={!!value} onChange={onChange} label={field.label} />
  if (field.type === 'select' || field.type === 'game') {
    const opts = field.type === 'game' ? games : field.options ?? []
    if (opts.length <= 4) {
      return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={field.label}>
          {field.optional && <button type="button" onClick={() => onChange('')} className={clsx('h-9 rounded-lg px-3 text-xs font-bold ring-1 ring-inset', !value ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/40' : 'text-slate-400 ring-white/10 hover:text-white')}>{t('console.ui.all')}</button>}
          {opts.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={clsx('h-9 rounded-lg px-3 font-mono text-xs font-bold ring-1 ring-inset transition', value === o ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/40' : 'text-slate-400 ring-white/10 hover:text-white')}>{o}</button>
          ))}
        </div>
      )
    }
    return (
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={clsx(inputCls, 'font-mono')}>
        <option value="">{field.optional ? `— ${t('console.ui.optional')} —` : '—'}</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (field.type === 'json') {
    return <textarea id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} spellCheck={false} placeholder='{"key": "value"}' className={clsx(inputCls, 'h-auto py-2 font-mono text-[13px]')} />
  }
  const user = field.type === 'user'
  return (
    <div className="relative">
      {user && <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center font-mono text-sm text-slate-500">@</span>}
      <input id={id} value={value ?? ''} onChange={(e) => onChange(user ? e.target.value.replace(/^@/, '') : e.target.value)} autoComplete="off" spellCheck={false}
        inputMode={['int', 'num'].includes(field.type) ? 'decimal' : undefined}
        placeholder={user ? t('console.ui.userHint') : field.type === 'reason' ? t('console.ui.reasonHint') : ''}
        className={clsx(inputCls, user && 'pl-7', ['int', 'num', 'user'].includes(field.type) && 'font-mono')} />
    </div>
  )
}

function Guide({ t, onQuick, parity }) {
  const quick = [['status', 'quickStatus', Server], ['economy', 'quickEconomy', Coins], ['games', 'quickGames', Gamepad2], ['flags', 'quickFlags', ShieldCheck], ['errors', 'quickErrors', AlertTriangle]]
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">{parity}</p>
        <h2 className="mt-2 text-lg font-bold text-white">{t('console.ui.guideTitle')}</h2>
        <ol className="mt-3 space-y-2.5">
          {['guide1', 'guide2', 'guide3'].map((k, i) => (
            <li key={k} className="flex gap-3 text-sm leading-relaxed text-slate-300">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-400/10 font-mono text-xs font-bold text-emerald-300 ring-1 ring-inset ring-emerald-400/25">{i + 1}</span>
              {t(`console.ui.${k}`)}
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {quick.map(([cmd, k, Icon]) => (
          <button key={cmd} type="button" onClick={() => onQuick(cmd)} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left text-sm font-semibold text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06] hover:ring-emerald-400/40">
            <Icon className="h-4 w-4 shrink-0 text-emerald-300" /> <span className="truncate">{t(`console.ui.${k}`)}</span>
          </button>
        ))}
      </div>
      <div className="rounded-xl bg-black/30 p-4 ring-1 ring-inset ring-white/[0.06]">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('console.ui.tipsTitle')}</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-slate-400">
          {['tipTab', 'tipHistory', 'tipQuote', 'tipUser', 'tipClear'].map((k) => <li key={k} className="flex gap-2"><ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />{t(`console.ui.${k}`)}</li>)}
        </ul>
      </div>
    </div>
  )
}

/**
 * Owner Console (web). Separate authority boundary: unlocked with the console key, not with a user role.
 * Every Admin panel action plus server tools, as guided forms that build the text command, next to a terminal.
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
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('start')
  const [selected, setSelected] = useState(null)
  const [values, setValues] = useState({})
  const [formErr, setFormErr] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [recent, setRecent] = useState(readRecent)
  const [tab, setTab] = useState('actions')
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const catalog = state?.catalog
  const items = catalog?.items ?? []
  const byId = useMemo(() => Object.fromEntries(items.map((it) => [itemId(it), it])), [items])
  const groupLabel = (g) => t(`console.groups.${g}`)

  const load = () => api('console/state').then(setState).catch((e) => setErr(t(errorKey(e), e?.vars)))
  useEffect(() => { if (SERVER_MODE) load() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [lines])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) return items.filter((it) => `${it.name} ${it.title} ${it.help}`.toLowerCase().includes(q))
    if (group === 'recent') return recent.map((id) => byId[id]).filter(Boolean)
    return items.filter((it) => it.group === group)
  }, [items, query, group, recent, byId])

  const counts = useMemo(() => items.reduce((a, it) => ({ ...a, [it.group]: (a[it.group] ?? 0) + 1 }), {}), [items])
  const built = selected ? buildLine(selected, values) : null
  const previewLine = selected ? (built.line ?? buildLine(selected, values, true).line) : null

  const pick = (it) => {
    setSelected(it)
    setValues(Object.fromEntries(it.fields.filter((f) => f.type === 'bool').map((f) => [f.key, false])))
    setFormErr(null)
    setResult(null)
  }

  const unlock = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('console/unlock', { key })
      setKey('')
      setLines([{ kind: 'sys', text: t('console.welcome') }])
      await load()
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
    setSelected(null)
    load()
  }

  /** Runs one line; returns the server answer (or null). `fromForm` keeps the result next to the form too. */
  const run = async (cmd, { fromForm = false, confirmed = false } = {}) => {
    if (!cmd || busy) return null
    if (cmd === 'clear') { setLines([]); return null }
    if (cmd === 'lock' || cmd === 'exit') { lock(); return null }
    setHistory((h) => [cmd, ...h.filter((x) => x !== cmd)].slice(0, 50))
    setLines((l) => [...l, { kind: 'in', text: cmd }])
    setBusy(true)
    try {
      const confirming = confirmed || (pending && pending === cmd)
      const r = await api('console/exec', confirming ? { command: cmd, confirm: cmd } : { command: cmd })
      setPending(r.confirm ? cmd : null)
      const kind = r.confirm ? 'warn' : r.ok ? 'out' : 'err'
      setLines((l) => [...l, { kind, text: r.output }])
      if (fromForm) setResult({ kind, text: r.output, confirm: !!r.confirm, cmd })
      return r
    } catch (e2) {
      const code = errorKey(e2)
      const text = t(code, e2?.vars)
      setLines((l) => [...l, { kind: 'err', text }])
      if (fromForm) setResult({ kind: 'err', text })
      if (code === 'console.errors.expired') load()
      return null
    } finally {
      setBusy(false)
    }
  }

  const submitForm = async (e, confirmed = false) => {
    e?.preventDefault()
    if (!selected) return
    const b = buildLine(selected, values)
    if (b.error) { setFormErr(t(b.error[0], b.error[1])); return }
    setFormErr(null)
    const next = [itemId(selected), ...recent.filter((x) => x !== itemId(selected))].slice(0, 12)
    setRecent(next)
    writeRecent(next)
    await run(b.line, { fromForm: true, confirmed })
  }

  const execTerminal = (e) => {
    e.preventDefault()
    const cmd = input.trim()
    setInput('')
    setHIdx(-1)
    run(cmd)
  }

  // Terminal autocomplete: command names, then action names after `do `, then `help` targets.
  const completions = useMemo(() => {
    const raw = input
    const doMatch = raw.match(/^(do|help do)\s+(\S*)$/)
    if (doMatch) return items.filter((it) => it.kind === 'action' && it.name.toLowerCase().startsWith(doMatch[2].toLowerCase())).map((it) => ({ text: `${doMatch[1]} ${it.name} `, label: it.name, title: it.title }))
    if (!raw || /\s/.test(raw)) return []
    return items.filter((it) => it.kind === 'command' && it.name.startsWith(raw)).map((it) => ({ text: `${it.name} `, label: it.name, title: it.title }))
  }, [input, items])

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
      if (completions.length === 1) setInput(completions[0].text)
      else if (completions.length > 1) {
        const texts = completions.map((c) => c.text)
        let p = texts[0]
        for (const s of texts) while (!s.startsWith(p)) p = p.slice(0, -1)
        if (p.length > input.length) setInput(p)
      }
    }
  }

  const copyLine = async () => {
    if (!built?.line) return
    try { await navigator.clipboard.writeText(built.line); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* clipboard blocked */ }
  }
  const toTerminal = (text) => { setInput(text); setTab('terminal'); setTimeout(() => inputRef.current?.focus(), 30) }
  const quickRun = (cmd) => { setTab('terminal'); run(cmd) }

  const actionCount = items.filter((it) => it.kind === 'action').length
  const parity = t('console.ui.parity', { actions: actionCount, commands: items.length - actionCount })

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-6">
      <h1 className="flex items-center gap-2.5 font-mono text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/10 ring-1 ring-inset ring-emerald-400/25"><TerminalSquare className="h-4 w-4" /></span>
        {t('console.title')}
      </h1>
      <div className="flex items-center gap-2 text-xs">
        {state?.unlocked && (
          <>
            <span className="hidden items-center gap-1.5 rounded-lg bg-emerald-400/[0.07] px-2.5 py-1.5 font-mono text-emerald-300 sm:inline-flex" title={t('console.ui.idle')}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {t('console.ui.session')}
            </span>
            <button onClick={lock} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-slate-400 ring-1 ring-inset ring-white/10 hover:text-white"><Lock className="h-3.5 w-3.5" /> {t('console.lock')}</button>
          </>
        )}
        <Link to="/" className="rounded-lg px-2 py-1.5 font-mono text-slate-500 hover:text-slate-300">{t('console.back')}</Link>
      </div>
    </header>
  )

  if (!SERVER_MODE || !state || !state.enabled || !state.unlocked) {
    return (
      <div className="console-page min-h-dvh bg-[#05070b] text-slate-200">
        {header}
        {!SERVER_MODE ? (
          <p className="mx-auto mt-16 max-w-md px-4 text-center font-mono text-sm text-slate-500">{t('admin.serverOnly')}</p>
        ) : !state ? (
          <p className="mx-auto mt-16 max-w-md px-4 text-center font-mono text-sm text-slate-500">{err ?? '…'}</p>
        ) : !state.enabled ? (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl bg-white/[0.03] p-6 font-mono text-sm ring-1 ring-inset ring-white/10">
            <p className="text-amber-300">{t('console.disabled')}</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">php ~/neon-src/tools/owner-console.php --hash</pre>
          </div>
        ) : (
          <form onSubmit={unlock} className="mx-4 mt-16 rounded-2xl bg-white/[0.03] p-6 ring-1 ring-inset ring-white/10 sm:mx-auto sm:max-w-sm">
            <p className="flex items-center gap-2 font-mono text-sm text-slate-300"><KeyRound className="h-4 w-4 text-emerald-300" /> {t('console.keyPrompt')}</p>
            <input type="password" autoComplete="off" autoFocus value={key} onChange={(e) => setKey(e.target.value)} className="mt-4 h-11 w-full rounded-xl bg-black/50 px-3 font-mono text-sm text-emerald-200 outline-none ring-1 ring-inset ring-white/10 focus:ring-emerald-400/50" aria-label={t('console.keyPrompt')} />
            {err && <p className="mt-2 font-mono text-xs text-rose-400" role="alert">{err}</p>}
            <button disabled={busy || key.length < 8} className="mt-4 h-10 w-full rounded-xl bg-emerald-400 font-mono text-sm font-bold text-black disabled:opacity-40">{busy ? '…' : t('console.unlock')}</button>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-500">{t('console.note')}</p>
          </form>
        )}
      </div>
    )
  }

  const groups = [...Object.keys(catalog?.groups ?? {}), ...(recent.length ? ['recent'] : [])]

  return (
    <div className="console-page flex h-dvh flex-col bg-[#05070b] text-slate-200">
      {header}

      {/* Mobile switch between the tool forms and the terminal. */}
      <div className="flex gap-1 border-b border-white/[0.06] p-2 lg:hidden">
        {['actions', 'terminal'].map((k) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('h-9 flex-1 rounded-lg text-sm font-bold', tab === k ? 'bg-white/[0.07] text-white' : 'text-slate-500')}>{t(`console.ui.${k}`)}</button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Tools */}
        <aside className={clsx('min-h-0 flex-col border-white/[0.06] lg:flex lg:border-r', tab === 'actions' && !selected ? 'flex' : 'hidden')}>
          <div className="p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('console.ui.search')} className={clsx(inputCls, 'pl-9 pr-8 text-[13px]')} aria-label={t('console.ui.search')} />
              {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label={t('console.ui.clear')}><X className="h-4 w-4" /></button>}
            </label>
          </div>
          {!query && (
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible">
              {groups.map((g) => {
                const Icon = GROUP_ICONS[g] ?? Compass
                return (
                  <button key={g} onClick={() => setGroup(g)} className={clsx('flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition', group === g ? 'bg-emerald-400/10 text-emerald-200' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white')}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 whitespace-nowrap">{groupLabel(g)}</span>
                    <span className="hidden font-mono text-[11px] text-slate-600 lg:inline">{g === 'recent' ? recent.length : counts[g] ?? 0}</span>
                  </button>
                )
              })}
            </nav>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06] p-2">
            {query && <p className="px-2 pb-2 pt-1 font-mono text-[11px] text-slate-500">{t('console.ui.items', { n: visible.length })}</p>}
            {visible.length === 0 && <p className="px-2 py-4 text-center text-sm text-slate-500">{t('console.ui.noResults', { q: query })}</p>}
            {visible.map((it) => (
              <button key={itemId(it)} onClick={() => pick(it)} className={clsx('mb-0.5 w-full rounded-lg px-2.5 py-2 text-left transition', selected && itemId(selected) === itemId(it) ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]')}>
                <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-100">
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {it.danger && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label={t('console.ui.danger')} />}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">{it.kind === 'action' ? `do ${it.name}` : it.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Form / guide */}
        <section className={clsx('min-h-0 overflow-y-auto border-white/[0.06] p-4 sm:p-6 lg:block lg:border-r', tab === 'actions' && selected ? 'block' : 'hidden')}>
          {!selected ? (
            <Guide t={t} onQuick={quickRun} parity={parity} />
          ) : (
            <form onSubmit={submitForm} className="space-y-5">
              <div>
                <button type="button" onClick={() => setSelected(null)} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-white lg:hidden"><X className="h-3.5 w-3.5" /> {t('console.ui.cancel')}</button>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">{selected.kind === 'action' ? t('console.ui.admin') : t('console.ui.quick')}</span>
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{groupLabel(selected.group)}</span>
                  {selected.danger && <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300"><AlertTriangle className="h-3 w-3" /> {t('console.ui.danger')}</span>}
                </div>
                <h2 className="mt-2.5 text-xl font-bold text-white">{selected.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{selected.help}</p>
              </div>

              {selected.fields.length > 0 && (
                <div className="space-y-4">
                  {selected.fields.map((f) => (
                    <div key={f.key}>
                      <label htmlFor={`cf-${f.key}`} className="mb-1.5 flex items-baseline gap-2 text-[13px] font-semibold text-slate-200">
                        {f.label}
                        {f.optional && <span className="text-[11px] font-normal text-slate-500">{t('console.ui.optional')}</span>}
                        <span className="ml-auto font-mono text-[10px] text-slate-600">{f.key}</span>
                      </label>
                      <FieldInput field={f} value={values[f.key]} games={catalog?.games ?? []} t={t} onChange={(v) => { setValues((s) => ({ ...s, [f.key]: v })); setFormErr(null) }} />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-black/40 ring-1 ring-inset ring-white/[0.08]">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('console.ui.preview')}</span>
                  <button type="button" onClick={copyLine} disabled={!built?.line} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white disabled:opacity-40">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t('console.ui.copied') : t('console.ui.copy')}
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2.5 font-mono text-[12.5px] text-cyan-300"><span className="select-none text-emerald-400">neon# </span>{previewLine ?? '…'}</pre>
              </div>

              {formErr && <p className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm font-semibold text-rose-300" role="alert">{formErr}</p>}

              {result?.confirm ? (
                <div className="rounded-xl bg-amber-400/[0.07] p-4 ring-1 ring-inset ring-amber-400/30">
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-200"><AlertTriangle className="h-4 w-4" /> {t('console.ui.confirmTitle')}</p>
                  <p className="mt-1 text-[13px] text-amber-100/80">{t('console.ui.confirmBody')}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => run(result.cmd, { fromForm: true, confirmed: true })} className="h-9 rounded-lg bg-amber-400 px-4 text-sm font-bold text-black disabled:opacity-50">{t('console.ui.confirm')}</button>
                    <button type="button" onClick={() => { setResult(null); setPending(null) }} className="h-9 rounded-lg px-4 text-sm font-semibold text-slate-300 ring-1 ring-inset ring-white/15 hover:text-white">{t('console.ui.cancel')}</button>
                  </div>
                </div>
              ) : (
                <button disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50 sm:w-auto sm:px-6">
                  <Play className="h-4 w-4" /> {busy ? t('console.ui.running') : t('console.ui.run')}
                </button>
              )}

              {result && !result.confirm && (
                <div className={clsx('rounded-xl p-3.5 ring-1 ring-inset', result.kind === 'err' ? 'bg-rose-500/[0.06] ring-rose-500/25' : 'bg-emerald-400/[0.05] ring-emerald-400/20')}>
                  <p className={clsx('text-[11px] font-bold uppercase tracking-wider', result.kind === 'err' ? 'text-rose-300' : 'text-emerald-300')}>{t('console.ui.result')} · {result.kind === 'err' ? t('console.ui.failed') : t('console.ui.ok')}</p>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-slate-200">{result.text}</pre>
                </div>
              )}

              {selected.examples?.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('console.ui.examples')}</p>
                  <div className="mt-2 space-y-1.5">
                    {selected.examples.map((ex) => (
                      <button key={ex} type="button" onClick={() => toTerminal(ex)} title={t('console.ui.tryIt')} className="flex w-full items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-left font-mono text-[12px] text-slate-300 ring-1 ring-inset ring-white/[0.06] hover:text-white hover:ring-emerald-400/30">
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> <span className="truncate">{ex}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}
        </section>

        {/* Terminal */}
        <section className={clsx('relative min-h-0 flex-col bg-black/50 lg:flex', tab === 'terminal' ? 'flex' : 'hidden')} onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus() }}>
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('console.ui.terminal')}</span>
            <button onClick={() => setLines([])} className="font-mono text-[11px] text-slate-500 hover:text-white">{t('console.ui.clear')}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed" onClick={() => inputRef.current?.focus()}>
            {lines.length === 0 && <p className="text-slate-600">{t('console.ui.empty')}</p>}
            {lines.map((l, i) => (
              <pre key={i} className={clsx('whitespace-pre-wrap break-words', TONE[l.kind], l.kind === 'in' && i > 0 && 'mt-3')}>{l.kind === 'in' ? <><span className="select-none text-emerald-400">neon# </span>{l.text}</> : l.text}</pre>
            ))}
            {busy && <pre className="animate-pulse text-slate-500">…</pre>}
            <div ref={endRef} />
          </div>
          {completions.length > 0 && input && (
            <div className="max-h-44 overflow-y-auto border-t border-white/[0.06] bg-[#080b12] p-1.5">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{t('console.ui.suggestions')}</p>
              {completions.slice(0, 8).map((c) => (
                <button key={c.text} type="button" onClick={() => { setInput(c.text); inputRef.current?.focus() }} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.05]">
                  <span className="font-mono text-[12px] text-cyan-300">{c.label}</span>
                  <span className="truncate text-[12px] text-slate-500">{c.title}</span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={execTerminal} className="flex items-center gap-2 border-t border-white/10 px-4 py-3 font-mono text-[13px]">
            <span className={pending ? 'text-amber-300' : 'text-emerald-300'}>{pending ? 'confirm>' : 'neon#'}</span>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none" aria-label={t('console.input')} />
          </form>
        </section>
      </div>
    </div>
  )
}
