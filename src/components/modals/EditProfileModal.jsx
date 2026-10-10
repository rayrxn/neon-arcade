import { useEffect, useRef, useState } from 'react'
import FormattedText, { stripCodes } from '@/components/ui/FormattedText'
import { PlayerName } from '@/components/ui/Identity'
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
import { SERVER_MODE } from '@/config/runtime'
import { uploadBanner } from '@/services/platform2'

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

/** Banner: crop to 4:1 and shrink to 1500×375 JPEG (≈ 100–300 KB), the server accepts up to 700 KB. */
function resizeBanner(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const W = 1500
        const H = 375
        const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
        const ctx = canvas.getContext('2d')
        const scale = Math.max(W / img.width, H / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
        let q = 0.85
        let out = canvas.toDataURL('image/jpeg', q)
        while (out.length > 900000 && q > 0.4) out = canvas.toDataURL('image/jpeg', (q -= 0.1))
        resolve(out)
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
  const bannerRef = useRef(null)
  const [banner, setBanner] = useState(undefined) // undefined = unchanged, null = removed, string = new image

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [frame, setFrame] = useState(null)
  const [status, setStatus] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !user) return
    setDisplayName(user.displayName ?? '')
    setUsername(user.username)
    setAvatar(user.avatar)
    setFrame(user.frame ?? null)
    setStatus(user.status ?? '')
    setBio(user.bio ?? '')
    setBanner(undefined)
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

  const onBanner = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('profile.errors.imageType')
    if (file.size > 10 * 1024 * 1024) return setError('profile.errors.imageSize')
    try {
      setBanner(await resizeBanner(file))
      setError(null)
    } catch {
      setError('profile.errors.imageType')
    }
  }
  const bannerShown = banner === undefined ? user?.bannerUrl : banner

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (banner !== undefined) await uploadBanner(banner)
      await updateProfile(SERVER_MODE ? { displayName, username, avatar, frame, status, bio } : { displayName, username, avatar, frame })
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
        {SERVER_MODE && (
          <div>
            <p className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-400">{t('profile.banner')} <span className="font-normal text-slate-600">{t('profile.bannerHint')}</span></p>
            <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-r from-neon-cyan/15 via-neon-purple/10 to-transparent ring-1 ring-inset ring-white/10" style={bannerShown ? { backgroundImage: `url("${bannerShown}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
              <div className="absolute inset-x-2 bottom-2 flex justify-end gap-2">
                {bannerShown && <button type="button" onClick={() => setBanner(null)} className="h-8 rounded-lg bg-black/50 px-3 text-xs font-bold text-white backdrop-blur hover:bg-black/70">{t('profile.bannerRemove')}</button>}
                <button type="button" onClick={() => bannerRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-lg bg-black/50 px-3 text-xs font-bold text-white backdrop-blur hover:bg-black/70"><ImagePlus className="h-3.5 w-3.5" /> {t('profile.bannerUpload')}</button>
              </div>
            </div>
            <input ref={bannerRef} id="banner-file" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onBanner} />
          </div>
        )}

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

        {SERVER_MODE && (
          <>
            <Field id="edit-status" label={t('profile.status')} value={status} maxLength={120} onChange={(e) => setStatus(e.target.value)} hint={<span className="font-normal text-slate-500">{stripCodes(status).length}/60</span>} />
            <div>
              <label htmlFor="edit-bio" className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-400">{t('profile.bio')} <span className="font-normal text-slate-600">{stripCodes(bio).length}/200</span></label>
              <textarea id="edit-bio" rows={3} maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} className="input-shell w-full resize-none px-3 py-2 text-sm text-white outline-none" />
              <p className="mt-1 text-[11px] text-slate-500">{t('nameDisplay.codesHint')}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-400">{t('nameDisplay.preview')}</p>
              <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-white/10">
                <div className="h-12 bg-gradient-to-r from-neon-cyan/25 to-neon-purple/25" style={bannerShown ? { backgroundImage: `url("${bannerShown}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
                <div className="flex gap-3 bg-ink-900 px-3 pb-3">
                  <span className="-mt-5 rounded-full ring-4 ring-ink-900"><Avatar user={preview} size="lg" /></span>
                  <div className="min-w-0 pt-1.5">
                    <p className="text-sm font-bold text-white"><PlayerName user={preview} compact={false} /></p>
                    {status && <p className="truncate text-xs text-slate-300"><FormattedText text={status} /></p>}
                    {bio && <p className="mt-1 whitespace-pre-line break-words text-xs text-slate-400"><FormattedText text={bio} /></p>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {error && <p className="rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red" role="alert">{t(error)}</p>}
      </div>
    </Modal>
  )
}
