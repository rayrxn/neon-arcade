import { useCallback } from 'react'
import { usePrefsStore } from '@/store/usePrefsStore'
import { setFormatLanguage } from '@/utils/format'
import idBase from './id'
import enBase from './en'
import id4 from './phase4.id'
import en4 from './phase4.en'
import id5 from './phase5.id'
import en5 from './phase5.en'
import id6 from './phase6.id'
import en6 from './phase6.en'

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
function deepMerge(base, extra) {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v
  return out
}
const id = deepMerge(deepMerge(deepMerge(idBase, id4), id5), id6)
const en = deepMerge(deepMerge(deepMerge(enBase, en4), en5), en6)

/**
 * i18n ringan tanpa library.
 *   const { t, lang } = useT()
 *   t('wallet.title')                 → "Wallet"
 *   t('send.toUser', { name: 'Rayhan' }) → "Kirim ke Rayhan"
 * Key yang hilang dicatat di window.__missingI18n (dicek saat testing).
 */

export const DICTIONARIES = { id, en }

/** Path bertitik; segmen terakhir boleh berisi titik (mis. admin.actions['wallet.add']). */
function lookup(dict, key) {
  const parts = key.split('.')
  let node = dict
  for (let i = 0; i < parts.length; i++) {
    if (node == null) return undefined
    const rest = parts.slice(i).join('.')
    if (i > 0 && typeof node === 'object' && rest in node) return node[rest]
    node = node[parts[i]]
  }
  return node
}

export function translate(lang, key, vars) {
  let value = lookup(DICTIONARIES[lang], key)
  if (value == null) value = lookup(DICTIONARIES.id, key)
  if (value == null) {
    if (vars?.defaultValue != null) return vars.defaultValue
    if (typeof window !== 'undefined') (window.__missingI18n ??= new Set()).add(`${lang}:${key}`)
    return key
  }
  if (typeof value === 'function') return value(vars ?? {})
  if (!vars) return value
  return value.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`))
}

/** Untuk kode di luar komponen (services, toast). */
export const t = (key, vars) => translate(usePrefsStore.getState().language, key, vars)

export function useT() {
  const lang = usePrefsStore((s) => s.language)
  setFormatLanguage(lang)
  const tt = useCallback((key, vars) => translate(lang, key, vars), [lang])
  return { t: tt, lang }
}

/** Pilih teks dari objek { id, en } (dipakai data seperti nama item). */
export const pick = (value, lang) => (value && typeof value === 'object' ? value[lang] ?? value.id : value)
