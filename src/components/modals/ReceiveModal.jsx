import { useState } from 'react'
import { ArrowDownLeft, Check, Copy } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useCurrentUser } from '@/store/useAuthStore'
import { useT } from '@/i18n'

export default function ReceiveModal({ open, onClose }) {
  const { t } = useT()
  const user = useCurrentUser()
  const [copied, setCopied] = useState(false)
  const handle = `@${user?.username ?? ''}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handle)
    } catch {
      const el = Object.assign(document.createElement('textarea'), { value: handle })
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('receive.title')}
      description={t('receive.description')}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-green/10 text-neon-green"><ArrowDownLeft className="h-5 w-5" /></span>}
    >
      <div className="flex flex-col items-center rounded-2xl bg-white/[0.03] px-4 py-6 text-center ring-1 ring-inset ring-white/[0.06]">
        <Avatar user={user} size="xl" />
        <p className="mt-3 font-display text-lg font-bold text-white">{user?.displayName}</p>
        <p className="mt-0.5 select-all font-mono text-sm text-neon-cyan">{handle}</p>
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><CurrencyIcon currency="AC" size={14} /> AC</span>
          <span className="flex items-center gap-1.5"><CurrencyIcon currency="AG" size={14} /> AG</span>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-400">{t('receive.howTo')}</p>
      <Button className="mt-5 w-full" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t('common.copied') : t('receive.copy')}
      </Button>
    </Modal>
  )
}
