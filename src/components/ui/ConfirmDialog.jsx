import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { useT } from '@/i18n'

/** Konfirmasi untuk tindakan penting (logout, reset data, dll). */
export default function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, tone = 'danger' }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      locked={busy}
      title={title}
      icon={
        <span className={tone === 'danger' ? 'grid h-10 w-10 place-items-center rounded-xl bg-neon-red/10 text-neon-red' : 'grid h-10 w-10 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan'}>
          <AlertTriangle className="h-5 w-5" />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} className="flex-1" loading={busy} onClick={run}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-400">{body}</p>
    </Modal>
  )
}
