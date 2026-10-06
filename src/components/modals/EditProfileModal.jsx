import { useEffect, useRef, useState } from 'react'
import { AtSign, Check, ImagePlus, Pencil, UserRound } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import Avatar, { PRESET_STYLES } from '@/components/ui/Avatar'
import { AVATAR_PRESETS, useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useActiveWallet } from '@/store/useWalletStore'
import { toast } from '@/store/useUiStore'
import { ITEMS } from '@/config/economy'
import { USERNAME_RE } from '@/utils/validation'
import { errorKey } from '@/utils/errors'
import { pick, useT } from '@/i18n'

/** Perkecil foto ke 160px (JPEG) supaya muat di penyimpanan lokal. */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const size = 160
        const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
        const ctx = canvas.getContext('2d')
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function EditProfileModal({ open, onClose }) {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const wallet = useActiveWallet()
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const fileRef = useRef(null)

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [frame, setFrame] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !user) return
    setDisplayName(user.displayName ?? '')
    setUsername(user.username)
    setAvatar(user.avatar)
    setFrame(user.frame ?? null)
    setError(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const frames = (wallet?.inventory ?? []).filter((id) => ITEMS[id]?.kind === 'frame')
  const usernameError = username && !USERNAME_RE.test(username) ? 'validation.usernameFormat' : null
  const nameError = displayName.trim().length < 2 || displayName.trim().length > 24 ? 'errors.displayNameLength' : null
  const preview = user ? { ...user, displayName, avatar: avatar ?? user.avatar, frame } : null

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('profile.errors.imageType')
    if (file.size > 5 * 1024 * 1024) return setError('profile.errors.imageSize')
    try {
      setAvatar({ kind: 'image', src: await resizeImage(file) })
      setError(null)
    } catch {
      setError('profile.errors.imageType')
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateProfile({ displayName, username, avatar, frame })
      toast({ tone: 'success', title: t('profile.saved') })
      onClose()
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      title={t('profile.editTitle')}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan"><Pencil className="h-5 w-5" /></span>}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button className="flex-1" loading={busy} disabled={!!usernameError || !!nameError} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar user={preview} size="xl" />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-white">{displayName || '—'}</p>
            <p className="truncate text-sm text-slate-500">@{username}</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-400">{t('profile.avatar')}</p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_PRESETS.map((id) => (
              <button
                key={id}
                onClick={() => setAvatar({ kind: 'preset', id })}
                aria-label={id}
                className={clsx('relative h-10 w-10 rounded-xl bg-gradient-to-br transition focus-ring', PRESET_STYLES[id], avatar?.kind === 'preset' && avatar.id === id ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'opacity-80 hover:opacity-100')}
              >
                {avatar?.kind === 'preset' && avatar.id === id && <Check className="absolute inset-0 m-auto h-4 w-4 text-onaccent" />}
              </button>
            ))}
            <button onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-slate-300 ring-1 ring-inset ring-white/15 transition hover:bg-white/[0.05] focus-ring">
              <ImagePlus className="h-4 w-4" /> {t('profile.upload')}
            </button>
            <input ref={fileRef} id="avatar-file" type="file" accept="image/*" className="hidden" onChange={onFile} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-400">{t('profile.frame')}</p>
          {frames.length === 0 ? (
            <p className="text-xs text-slate-500">{t('profile.noFrames')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[null, ...frames].map((id) => (
                <button
                  key={id ?? 'none'}
                  onClick={() => setFrame(id)}
                  className={clsx('rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition', frame === id ? 'bg-neon-cyan/10 text-neon-cyan ring-neon-cyan/40' : 'text-slate-400 ring-white/10 hover:text-white')}
                >
                  {id ? pick(ITEMS[id].name, lang) : t('profile.noFrame')}
                </button>
              ))}
            </div>
          )}
        </div>

        <Field id="edit-display-name" label={t('profile.displayName')} icon={UserRound} value={displayName} maxLength={24} onChange={(e) => setDisplayName(e.target.value)} error={displayName && nameError ? t(nameError) : undefined} />
        <Field id="edit-username" label={t('profile.username')} icon={AtSign} value={username} maxLength={16} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} error={usernameError ? t(usernameError) : undefined} hint={<span className="font-normal text-slate-500">{t('profile.usernameHint')}</span>} />

        {error && <p className="rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red" role="alert">{t(error)}</p>}
      </div>
    </Modal>
  )
}
