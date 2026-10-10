import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, FormField, Table, inputCls } from '@/components/admin/AdminKit'
import { Switch } from '@/components/ui/Controls'
import { STATUS_META } from '@/pages/StatusPage'
import { useAdminStore } from '@/store/useAdminStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import Modal from '@/components/ui/Modal'
import MaintenanceScreen from '@/components/layout/MaintenanceScreen'
import { endSeasonNow, setAutoFreeze, setMaintenance, setServiceStatus, setSlowMode } from '@/services/admin'
import { serviceStatus, SERVICES, STATUSES } from '@/services/system'
import { formatDate, formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

const toLocal = (ts) => (ts ? new Date(ts - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')

export function SystemAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  const system = useAdminStore((s) => s.system)
  const errors = useAdminStore((s) => s.errors)
  const season = usePlatformStore((s) => s.season)
  const slow = usePlatformStore((s) => s.chatSettings?.slowMode ?? 0)
  const [maint, setMaint] = useState({ enabled: system.maintenance.enabled, message: system.maintenance.message, until: toLocal(system.maintenance.until), startsAt: toLocal(system.maintenance.startsAt),
    bypassAdmins: system.maintenance.bypassAdmins !== false, bypassTesters: system.maintenance.bypassTesters !== false })
  const [preview, setPreview] = useState(false)
  const [svc, setSvc] = useState({ service: 'chat', status: 'DEGRADED', note: '' })
  const [slowValue, setSlowValue] = useState(slow)
  const [dialog, setDialog] = useState(null)
  const statuses = serviceStatus()

  const dialogs = {
    maintenance: { title: maint.enabled ? t('system.maintenanceOn') : t('system.maintenanceOff'), run: (r) => setMaintenance({ enabled: maint.enabled, message: maint.message, until: maint.until ? new Date(maint.until).getTime() : null, startsAt: maint.startsAt ? new Date(maint.startsAt).getTime() : null, bypassAdmins: maint.bypassAdmins, bypassTesters: maint.bypassTesters }, r) },
    service: { title: t('system.setService', { service: t(`status.services.${svc.service}`) }), run: (r) => setServiceStatus(svc.service, svc.status === 'auto' ? null : svc.status, r, svc.note) },
    autofreeze: { title: system.autoFreezeCritical ? t('system.autoFreezeOff') : t('system.autoFreezeOn'), run: (r) => setAutoFreeze(!system.autoFreezeCritical, r) },
    slow: { title: t('system.slowMode'), run: (r) => setSlowMode(slowValue, r) },
    season: { title: t('system.endSeason'), run: (r) => endSeasonNow(r) },
  }
  const d = dialog && dialogs[dialog]

  return (
    <AdminPage title={t('admin.nav.system')} description={t('system.desc')} actions={<Link to="/status" target="_blank"><Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /> /status</Button></Link>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('system.maintenance')}>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-300">{t('system.maintenanceEnabled')} <Switch checked={maint.enabled} onChange={(v) => setMaint({ ...maint, enabled: v })} label={t('system.maintenanceEnabled')} /></label>
            <FormField label={t('system.message')}><input value={maint.message} onChange={(e) => setMaint({ ...maint, message: e.target.value })} maxLength={300} placeholder={t('maintenance.defaultMessage')} className={inputCls} /></FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('system.startsAt')}><input type="datetime-local" value={maint.startsAt} onChange={(e) => setMaint({ ...maint, startsAt: e.target.value })} className={inputCls} /></FormField>
              <FormField label={t('system.eta')}><input type="datetime-local" value={maint.until} onChange={(e) => setMaint({ ...maint, until: e.target.value })} className={inputCls} /></FormField>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-300">{t('system.bypassAdmins')} <Switch checked={maint.bypassAdmins} onChange={(v) => setMaint({ ...maint, bypassAdmins: v })} label={t('system.bypassAdmins')} /></label>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-300">{t('system.bypassTesters')} <Switch checked={maint.bypassTesters} onChange={(v) => setMaint({ ...maint, bypassTesters: v })} label={t('system.bypassTesters')} /></label>
            <p className="text-[11px] text-slate-500">{t('system.maintenanceNote')}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setDialog('maintenance')}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(true)}>{t('system.preview')}</Button>
            </div>
          </div>
        </Card>

        <Card title={t('system.services')} bodyClassName="">
          <ul className="divide-y divide-white/[0.05]">
            {statuses.map((s) => {
              const m = STATUS_META[s.status]
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <m.icon className={clsx('h-4 w-4', m.cls)} />
                  <span className="flex-1 text-slate-200">{t(`status.services.${s.id}`)}</span>
                  <Badge tone={s.auto ? 'slate' : 'gold'}>{s.auto ? 'auto' : 'override'}</Badge>
                  <span className={clsx('w-28 text-right text-xs font-bold', m.cls)}>{t(`status.states.${s.status}`)}</span>
                </li>
              )
            })}
          </ul>
          <div className="grid gap-2 border-t hairline p-4 sm:grid-cols-3">
            <select value={svc.service} onChange={(e) => setSvc({ ...svc, service: e.target.value })} className={inputCls} aria-label={t('system.service')}>
              {SERVICES.map((s) => <option key={s} value={s}>{t(`status.services.${s}`)}</option>)}
            </select>
            <select value={svc.status} onChange={(e) => setSvc({ ...svc, status: e.target.value })} className={inputCls} aria-label={t('system.state')}>
              <option value="auto">auto</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.states.${s}`)}</option>)}
            </select>
            <Button size="sm" variant="ghost" onClick={() => setDialog('service')}>{t('system.apply')}</Button>
            <input value={svc.note} onChange={(e) => setSvc({ ...svc, note: e.target.value })} placeholder={t('system.notePh')} className={clsx(inputCls, 'sm:col-span-3')} />
          </div>
        </Card>

        <Card title={t('system.security')}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-slate-200">{t('system.autoFreeze')}</p>
                <p className="text-xs text-slate-500">{t('system.autoFreezeHint')}</p>
              </div>
              <Switch checked={!!system.autoFreezeCritical} onChange={() => setDialog('autofreeze')} label={t('system.autoFreeze')} />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <FormField label={t('system.slowMode')} hint={t('system.seconds')}>
                <input inputMode="numeric" value={slowValue} onChange={(e) => setSlowValue(Number(e.target.value.replace(/\D/g, '')) || 0)} className={clsx(inputCls, 'w-28')} />
              </FormField>
              <Button size="sm" variant="ghost" onClick={() => setDialog('slow')}>{t('system.apply')}</Button>
              <span className="text-xs text-slate-500">{t('system.currentSlow', { n: slow })}</span>
            </div>
          </div>
        </Card>

        <Card title={t('system.season')}>
          <div className="space-y-3 text-sm">
            {season && <p className="text-slate-300">{t('system.seasonInfo', { id: season.id, start: formatDate(season.startAt), end: formatDate(season.endAt) })}</p>}
            <p className="text-xs text-slate-500">{t('system.endSeasonHint')}</p>
            <Button size="sm" variant="danger" onClick={() => setDialog('season')}>{t('system.endSeason')}</Button>
          </div>
        </Card>
      </div>

      <Card title={t('system.errors', { n: errors.length })} bodyClassName="">
        <Table
          rows={errors.map((e, i) => ({ ...e, id: e.id ?? i }))}
          empty={t('system.noErrors')}
          columns={[
            { key: 'at', label: t('admin.cols.time'), render: (e) => <span className="whitespace-nowrap text-xs">{formatDateTime(e.at)}</span> },
            { key: 'ctx', label: t('system.context'), render: (e) => <span className="font-mono text-[11px] text-neon-cyan">{e.context}</span> },
            { key: 'msg', label: t('system.messageCol'), render: (e) => <span className="line-clamp-2 font-mono text-[11px] text-slate-400">{e.message}</span> },
          ]}
        />
      </Card>

      {d && <ReasonDialog open onClose={() => setDialog(null)} title={d.title} adminName={me.username} tone={dialog === 'season' ? 'danger' : 'primary'} onConfirm={d.run} />}
      <Modal open={preview} onClose={() => setPreview(false)} title={t('system.preview')} size="lg">
        <MaintenanceScreen preview={{ enabled: true, message: maint.message, until: maint.until ? new Date(maint.until).getTime() : null }} />
      </Modal>
    </AdminPage>
  )
}
