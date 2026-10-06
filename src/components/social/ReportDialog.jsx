import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createReport, REPORT_REASONS, REPORT_TYPES } from '@/services/reports'
import { toast } from '@/store/useUiStore'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

/**
 * Form report untuk semua jenis: pemain, pesan chat, profil, perilaku game, masalah teknis, lainnya.
 * preset: { targetType, targetUserId, targetName, messageId, sessionId, reason }
 */
export default function ReportDialog({ open, onClose, preset = {} }) {
  const { t } = useT()
  const [type, setType] = useState(preset.targetType ?? 'player')
  const [reason, setReason] = useState(preset.reason ?? 'cheating')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fixedType = !!preset.targetType

  useEffect(() => {
    if (!open) return
    setType(preset.targetType ?? 'technical')
    setReason(preset.reason ?? (preset.targetType === 'message' ? 'offensive' : preset.targetType === 'game' ? 'cheating' : preset.targetType ? 'harassment' : 'bug'))
    setText('')
    setError(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await new Promise((r) => setTimeout(r, 250))
      await createReport({ targetType: type, targetUserId: preset.targetUserId ?? null, messageId: preset.messageId ?? null, sessionId: preset.sessionId ?? null, reason, description: text })
      toast({ tone: 'success', title: t('reports.sent'), body: t('reports.sentBody') })
      onClose()
    } catch (err) {
      setError(t(errorKey(err), err?.vars))
    } finally {
      setBusy(false)
    }
  }

  const types = fixedType ? [type] : REPORT_TYPES.filter((x) => (preset.targetUserId ? true : ['technical', 'other'].includes(x)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      icon={Flag}
      title={preset.targetName ? t('reports.titleUser', { user: preset.targetName }) : t('reports.title')}
      description={t('reports.description')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={busy} onClick={submit} disabled={text.trim().length < 10}>{t('reports.submit')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!fixedType && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-400">{t('reports.type')}</p>
            <div className="flex flex-wrap gap-1.5">
              {types.map((x) => (
                <button key={x} onClick={() => setType(x)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 ring-inset ${type === x ? 'bg-neon-cyan/15 text-neon-cyan ring-neon-cyan/30' : 'text-slate-400 ring-white/10 hover:text-white'}`}>
                  {t(`reports.types.${x}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="report-reason" className="mb-1.5 block text-xs font-semibold text-slate-400">{t('reports.reason')}</label>
          <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="input-shell h-10 w-full px-3 text-sm text-white outline-none">
            {REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`reports.reasons.${r}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="report-text" className="mb-1.5 block text-xs font-semibold text-slate-400">{t('reports.details')}</label>
          <textarea
            id="report-text"
            rows={4}
            maxLength={1000}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            placeholder={t('reports.placeholder')}
            className="input-shell w-full resize-none px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>{preset.sessionId ? t('reports.attachedSession', { id: preset.sessionId }) : preset.messageId ? t('reports.attachedMessage') : ''}</span>
            <span className="num">{text.length}/1000</span>
          </div>
          {error && <p className="mt-1.5 text-xs font-semibold text-neon-red" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  )
}
