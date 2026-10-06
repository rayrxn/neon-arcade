import { useEffect, useState } from 'react'
import { Bot, Package, UserRound } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { Choice, Field, GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import { ItemCard } from './CaseOpening'
import { CASES, playCaseBattle } from '@/services/games'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

function Side({ title, icon: Icon, items, shown, total, winner }) {
  const visible = items.slice(0, shown)
  const sum = visible.reduce((s, it) => s + it.value, 0)
  return (
    <div className={clsx('rounded-2xl p-3 ring-1 ring-inset sm:p-4', winner ? 'bg-neon-green/[0.06] ring-neon-green/40' : 'ring-white/[0.07]')}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-white"><Icon className="h-4 w-4 text-slate-400" /> {title}</span>
        <span className="num font-mono text-sm font-bold text-neon-gold">{formatCoins(shown >= items.length ? total : sum)}</span>
      </div>
      <div className="flex min-h-[7rem] flex-wrap gap-2">
        {visible.map((it, i) => <ItemCard key={i} item={it} size="sm" />)}
        {items.length > shown && <div className="grid h-32 w-24 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.07]"><Package className="h-6 w-6 animate-pulse text-slate-500" /></div>}
      </div>
    </div>
  )
}

export default function CaseBattle({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [caseId, setCaseId] = useState('starter')
  const [rounds, setRounds] = useState(2)
  const [battle, setBattle] = useState(null)
  const [shown, setShown] = useState(0)
  const def = CASES.find((c) => c.id === caseId)
  const total = battle ? battle.player.length : 0
  const finished = battle && shown >= total

  useEffect(() => {
    if (!battle || shown >= total) return
    const id = setTimeout(() => {
      play('reveal')
      setShown((s) => s + 1)
    }, 900)
    return () => clearTimeout(id)
  }, [battle, shown, total])

  useEffect(() => {
    if (finished) playOutcome(battle)
  }, [finished, battle])

  const start = () => {
    const res = run(() => playCaseBattle({ caseId, rounds }))
    if (!res) return
    setShown(0)
    setBattle(res)
  }

  const controls = (
    <>
      <Field label={t('play.battle.case')}>
        <Choice value={caseId} onChange={setCaseId} disabled={battle && !finished} options={CASES.map((c) => ({ value: c.id, label: t(`play.case.names.${c.id}`) }))} />
      </Field>
      <Field label={t('play.battle.rounds')}>
        <Choice value={rounds} onChange={setRounds} disabled={battle && !finished} options={[1, 2, 3].map((r) => ({ value: r, label: `${r}×` }))} />
      </Field>
      <Button size="lg" className="w-full" onClick={start} disabled={battle && !finished}>
        {t('play.battle.start')} · {formatCoins(def.price * rounds)} AC
      </Button>
      <p className="text-xs leading-relaxed text-slate-500">{t('play.battle.rules')}</p>
    </>
  )

  const result = finished ? battle.session.result : null
  const stage = (
    <Stage className="p-4 sm:p-5">
      {battle ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Side title={t('play.bj.you')} icon={UserRound} items={battle.player} shown={shown} total={battle.playerTotal} winner={result === 'win'} />
          <Side title="Bot" icon={Bot} items={battle.bot} shown={shown} total={battle.botTotal} winner={result === 'loss'} />
        </div>
      ) : (
        <div className="grid min-h-[260px] place-items-center text-center text-sm text-slate-500">{t('play.battle.idle')}</div>
      )}
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={finished ? battle : null} />
}
