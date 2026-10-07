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
import id7 from './phase7.id'
import en7 from './phase7.en'
import id8 from './phase8.id'
import en8 from './phase8.en'
import id9 from './phase9.id'
import en9 from './phase9.en'
import id10 from './phase10.id'
import en10 from './phase10.en'
import id11 from './phase11.id'
import en11 from './phase11.en'
import id12 from './phase12.id'
import en12 from './phase12.en'

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
function deepMerge(base, extra) {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v
  return out
}
const id = [id4, id5, id6, id7, id8, id9, id10, id11, id12].reduce(deepMerge, idBase)
const en = [en4, en5, en6, en7, en8, en9, en10, en11, en12].reduce(deepMerge, enBase)

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
  if (typeof value === 'object') {
    // Key points at a namespace, not a sentence: never render "[object Object]".
    if (typeof window !== 'undefined') (window.__objectI18n ??= new Set()).add(`key:${key}`)
    return value.title ?? value.label ?? value.name ?? key
  }
  if (!vars) return value
  return value.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name]
    return v == null ? `{${name}}` : textOf(v, lang, key)
  })
}

/** Turn an interpolation value into text: localized {id, en}, level-up {from, to}, arrays, numbers. */
function textOf(v, lang, key) {
  if (typeof v !== 'object') return String(v)
  if (Array.isArray(v)) return v.map((x) => textOf(x, lang, key)).join(', ')
  const out = v[lang] ?? v.en ?? v.id ?? v.to ?? v.level ?? v.name ?? v.title ?? v.label ?? v.value ?? v.amount
  if (out != null && typeof out !== 'object') return String(out)
  if (typeof window !== 'undefined') (window.__objectI18n ??= new Set()).add(`var:${key}`)
  return ''
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
