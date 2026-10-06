import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useFairnessStore } from '@/store/useFairnessStore'
import { sha256Hex } from '@/utils/rng'
import { toast } from '@/store/useUiStore'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

function CopyButton({ value }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const el = Object.assign(document.createElement('textarea'), { value })
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button onClick={copy} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-white" aria-label={t('common.copy')}>
      {copied ? <Check className="h-3.5 w-3.5 text-neon-green" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function SeedRow({ label, value }) {
  return (
    <div>
      <p className="label-caps mb-1.5">{label}</p>
      <div className="flex items-center gap-2 rounded-lg bg-ink-950/60 py-1 pl-3 pr-1 ring-1 ring-inset ring-white/[0.08]">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300" title={value}>{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export default function FairnessPanel() {
  const { t } = useT()
  const serverSeedHash = useFairnessStore((s) => s.serverSeedHash)
  const clientSeed = useFairnessStore((s) => s.clientSeed)
  const nonce = useFairnessStore((s) => s.nonce)
  const previous = useFairnessStore((s) => s.previous)
  const rotateSeeds = useFairnessStore((s) => s.rotateSeeds)
  const [draft, setDraft] = useState(clientSeed)

  useEffect(() => setDraft(clientSeed), [clientSeed])
  const verified = previous ? sha256Hex(previous.serverSeed) === previous.serverSeedHash : null

  return (
    <section className="glass rounded-2xl">
      <div className="flex items-center justify-between border-b hairline px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold text-white">
          <ShieldCheck className="h-4 w-4 text-neon-green" /> {t('fair.title')}
        </h2>
        <span className="font-mono text-xs text-slate-500">nonce {nonce}</span>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-slate-400">{t('fair.intro')}</p>
        <SeedRow label={t('fair.serverHash')} value={serverSeedHash} />

        <div>
          <label htmlFor="client-seed" className="label-caps mb-1.5 block">{t('fair.clientSeed')}</label>
          <div className="flex gap-2">
            <div className="input-shell flex min-w-0 flex-1 items-center gap-2 px-3">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input id="client-seed" value={draft} maxLength={64} onChange={(e) => setDraft(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent font-mono text-base text-slate-200 outline-none sm:text-xs" />
            </div>
            <Button size="sm" variant="ghost" onClick={() => Promise.resolve().then(() => rotateSeeds(draft)).catch((err) => toast({ tone: 'error', title: t(errorKey(err), err?.vars) }))} disabled={!draft.trim()}>
              <RefreshCw className="h-3.5 w-3.5" /> {t('fair.rotate')}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{t('fair.rotateHint')}</p>
        </div>

        <AnimatePresence initial={false}>
          {previous && (
            <motion.div key={previous.serverSeedHash} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="space-y-3 rounded-xl border hairline bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-300">{t('fair.previous', { count: previous.rounds })}</p>
                  <span className={verified ? 'flex items-center gap-1 text-xs font-bold text-neon-green' : 'flex items-center gap-1 text-xs font-bold text-neon-red'}>
                    {verified ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
                    {verified ? t('fair.match') : t('fair.mismatch')}
                  </span>
                </div>
                <SeedRow label={t('fair.revealed')} value={previous.serverSeed} />
                <SeedRow label={t('fair.clientSeed')} value={previous.clientSeed} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
