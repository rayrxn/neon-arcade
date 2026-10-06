import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { toast } from '@/store/useUiStore'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

/**
 * Konfirmasi tindakan sensitif: wajib alasan, menampilkan admin & waktu yang akan dicatat.
 * `onConfirm(reason)` memanggil services/admin.js (yang juga memvalidasi ulang).
 */
export default function ReasonDialog({ open, onClose, title, description, children, confirmLabel, tone = 'danger', onConfirm, adminName }) {
  const { t } = useT()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open])

  const submit = async () => {
    if (reason.trim().length < 5) return setError(t('admin.errors.reason'))
    setBusy(true)
    try {
      await onConfirm(reason.trim())
      toast({ tone: 'success', title: t('admin.done') })
      onClose()
    } catch (err) {
      setError(t(errorKey(err), err?.vars))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={AlertTriangle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={submit}>{confirmLabel ?? t('admin.confirm')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {children}
        <div>
          <label htmlFor="admin-reason" className="mb-1.5 block text-xs font-semibold text-slate-400">{t('admin.reason')}</label>
          <textarea
            id="admin-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
            }}
            placeholder={t('admin.reasonPlaceholder')}
            className="input-shell w-full resize-none px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
          />
          {error && <p className="mt-1.5 text-xs font-semibold text-neon-red">{error}</p>}
        </div>
        <p className="text-[11px] text-slate-500">{t('admin.auditNote', { admin: adminName ?? '—', time: new Date().toLocaleString() })}</p>
      </div>
    </Modal>
  )
}
