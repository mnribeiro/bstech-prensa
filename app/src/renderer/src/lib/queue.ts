// Organizacao da fila de ruptura, do jeito que o laboratorio trabalha:
// dia (hoje / atrasados) > obra > concretagem > lote com o par de exemplares.
// Funcoes puras, sem React, pra dar pra testar.

import type { Specimen } from '@shared/types'

export type QueueTab = 'hoje' | 'late' | 'next'

const DAY = 86_400_000

function dayDiff(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`)
  const b = new Date(`${toIso}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / DAY)
}

/** Dias de atraso em relacao a hoje (0 quando vence hoje) */
export function lateDays(sp: Specimen, today: string): number {
  return Math.max(0, dayDiff(sp.due_date, today))
}

export function isLate(sp: Specimen, today: string): boolean {
  return sp.due_date < today
}

export function isDone(sp: Specimen): boolean {
  return sp.status !== 'PENDING'
}

/** Resultado em MPa de um CP ja rompido (corrigido quando existe) */
export function mpaOf(sp: Specimen): number | null {
  return sp.corrected_fck_mpa ?? sp.calculated_fck_mpa ?? null
}

/** Numero do CP dentro da etiqueta: HOM-L056-4-28D -> 4 */
export function cpNumber(sp: Specimen): string {
  const parts = sp.specimen_code.split('-')
  return parts.length >= 3 ? parts[2] : sp.specimen_code
}

export function concretagemKey(sp: Specimen): string {
  return [sp.project_id, sp.molding_date, sp.test_age_days, sp.structure_name, sp.due_date].join('|')
}

function lotKey(sp: Specimen): string {
  return `${sp.batch_id}|${sp.test_age_days}|${sp.due_date}`
}

const byCode = (a: Specimen, b: Specimen) =>
  a.specimen_code.localeCompare(b.specimen_code, 'pt-BR', { numeric: true })

/** Os exemplares do mesmo lote e idade, em ordem de etiqueta */
export function lotOf(list: Specimen[], sp: Specimen): Specimen[] {
  const k = lotKey(sp)
  return list.filter((x) => lotKey(x) === k).sort(byCode)
}

export function exemplarIndex(list: Specimen[], sp: Specimen): { n: number; total: number } {
  const lot = lotOf(list, sp)
  return { n: lot.findIndex((x) => x.id === sp.id) + 1, total: lot.length }
}

export function partnerOf(list: Specimen[], sp: Specimen): Specimen | null {
  return lotOf(list, sp).find((x) => x.id !== sp.id) ?? null
}

export interface LotGroup {
  batchCode: string
  specimens: Specimen[]
}
export interface ConcretagemGroup {
  key: string
  molding_date: string | null
  test_age_days: number
  structure_name: string | null
  fck: number | null
  lots: LotGroup[]
}
export interface ObraGroup {
  key: string
  name: string
  concretagens: ConcretagemGroup[]
  all: Specimen[]
}
export interface DayGroup {
  due: string
  late: number
  obras: ObraGroup[]
  all: Specimen[]
}

function groupConcretagens(list: Specimen[]): ConcretagemGroup[] {
  const map = new Map<string, Specimen[]>()
  for (const sp of list) {
    const k = concretagemKey(sp)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(sp)
  }
  return [...map.entries()]
    .map(([key, items]) => {
      const lots = new Map<string, Specimen[]>()
      for (const sp of items) {
        const k = lotKey(sp)
        if (!lots.has(k)) lots.set(k, [])
        lots.get(k)!.push(sp)
      }
      const c0 = items[0]
      return {
        key,
        molding_date: c0.molding_date,
        test_age_days: c0.test_age_days,
        structure_name: c0.structure_name,
        fck: c0.fck_spec_mpa,
        lots: [...lots.values()]
          .map((s) => ({ batchCode: s[0].batch_code, specimens: s.sort(byCode) }))
          .sort((a, b) => a.batchCode.localeCompare(b.batchCode, 'pt-BR', { numeric: true }))
      }
    })
    .sort(
      (a, b) =>
        (a.molding_date ?? '').localeCompare(b.molding_date ?? '') ||
        a.test_age_days - b.test_age_days ||
        (a.structure_name ?? '').localeCompare(b.structure_name ?? '')
    )
}

export function groupObras(list: Specimen[]): ObraGroup[] {
  const map = new Map<string, Specimen[]>()
  for (const sp of list) {
    if (!map.has(sp.project_id)) map.set(sp.project_id, [])
    map.get(sp.project_id)!.push(sp)
  }
  return [...map.entries()]
    .map(([key, all]) => ({ key, name: all[0].project_name, concretagens: groupConcretagens(all), all }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Atrasados por dia de vencimento, o mais recente primeiro */
export function groupLateDays(list: Specimen[], today: string): DayGroup[] {
  const map = new Map<string, Specimen[]>()
  for (const sp of list) {
    if (!map.has(sp.due_date)) map.set(sp.due_date, [])
    map.get(sp.due_date)!.push(sp)
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([due, all]) => ({ due, late: dayDiff(due, today), obras: groupObras(all), all }))
}

export function splitPools(list: Specimen[], today: string) {
  return {
    hoje: list.filter((s) => s.due_date === today),
    late: list.filter((s) => isLate(s, today))
  }
}

/** Ordem em que a fila aparece na tela (a mesma que o app segue ao selar) */
export function displayOrder(pool: Specimen[], late: boolean, today: string): Specimen[] {
  const flat = (obras: ObraGroup[]) =>
    obras.flatMap((o) => o.concretagens.flatMap((c) => c.lots.flatMap((l) => l.specimens)))
  return late ? groupLateDays(pool, today).flatMap((d) => flat(d.obras)) : flat(groupObras(pool))
}

/**
 * Proximo CP depois de selar: primeiro o outro exemplar do mesmo lote, depois
 * o proximo pendente na ordem da fila (mesma aba: hoje ou atrasados).
 */
export function nextPending(list: Specimen[], fromId: string, today: string): Specimen | null {
  const cur = list.find((s) => s.id === fromId)
  if (!cur) return null
  const partner = partnerOf(list, cur)
  if (partner && !isDone(partner)) return partner
  const late = isLate(cur, today)
  const pool = displayOrder(
    list.filter((s) => isLate(s, today) === late && s.due_date <= today),
    late,
    today
  )
  const i = pool.findIndex((s) => s.id === fromId)
  const rotated = [...pool.slice(i + 1), ...pool.slice(0, Math.max(0, i))]
  return rotated.find((s) => !isDone(s) && s.id !== fromId) ?? null
}

/** Busca por etiqueta ignorando traco e espaco: "hom l056 4" acha HOM-L056-4-28D */
export function normCode(s: string): string {
  return s.toUpperCase().replace(/[-\s]/g, '')
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return 'n/d'
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

const PT_LOWER = /\b(De|Da|Do|Dos|Das|E|Ao|A)\b/g
/** OBRA EM CAIXA ALTA -> Obra em Caixa Alta (MRV continua MRV) */
export function titleCase(s: string | null): string {
  if (!s) return 'n/d'
  return s
    .toLowerCase()
    .replace(/(^|[\s\-(/])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\bMrv\b/g, 'MRV')
    .replace(PT_LOWER, (w) => w.toLowerCase())
    .replace(/^(\p{L})/u, (c) => c.toUpperCase())
}
