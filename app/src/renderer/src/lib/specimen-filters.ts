// Filtros da fila de ruptura. A fila é sempre só de CPs PENDENTES; status
// (aprovado/reprovado) é coisa da BStech web, não entra aqui. Filtramos a lista
// já carregada por vencimento, idade, projeto e estrutura.

import type { Specimen } from '@shared/types'

export type DuePreset = 'all' | 'late' | 'today' | '7d'

export interface QueueFilters {
  due: DuePreset
  dueFrom: string // yyyy-mm-dd ou ''
  dueTo: string // yyyy-mm-dd ou ''
  ages: number[] // test_age_days selecionados
  projects: string[] // project_name
  structures: string[] // structure_name
}

export const emptyFilters = (): QueueFilters => ({
  due: 'all',
  dueFrom: '',
  dueTo: '',
  ages: [],
  projects: [],
  structures: []
})

function daysFromToday(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return NaN
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

export function matchesFilters(sp: Specimen, f: QueueFilters): boolean {
  if (f.projects.length && !f.projects.includes(sp.project_name)) return false
  if (f.structures.length && !f.structures.includes(sp.structure_name ?? 'n/d')) return false
  if (f.ages.length && !f.ages.includes(sp.test_age_days)) return false

  if (f.due !== 'all' && sp.due_date) {
    const diff = daysFromToday(sp.due_date)
    if (!isNaN(diff)) {
      if (f.due === 'late' && diff >= 0) return false
      if (f.due === 'today' && diff !== 0) return false
      if (f.due === '7d' && (diff < 0 || diff > 7)) return false
    }
  }
  // range custom (due_date vem como yyyy-mm-dd, compara lexicograficamente)
  if (f.dueFrom && sp.due_date && sp.due_date < f.dueFrom) return false
  if (f.dueTo && sp.due_date && sp.due_date > f.dueTo) return false
  return true
}

export function countActiveFilters(f: QueueFilters): number {
  let n = 0
  if (f.due !== 'all') n++
  if (f.dueFrom || f.dueTo) n++
  if (f.ages.length) n++
  if (f.projects.length) n++
  if (f.structures.length) n++
  return n
}

// Opções disponíveis a partir da lista carregada
export function projectOptions(specimens: Specimen[]): string[] {
  return [...new Set(specimens.map((s) => s.project_name))].sort((a, b) => a.localeCompare(b))
}

export function structureOptions(specimens: Specimen[], projects: string[]): string[] {
  const pool = projects.length
    ? specimens.filter((s) => projects.includes(s.project_name))
    : specimens
  return [...new Set(pool.map((s) => s.structure_name ?? 'n/d'))].sort((a, b) => a.localeCompare(b))
}

export function ageOptions(specimens: Specimen[]): number[] {
  return [...new Set(specimens.map((s) => s.test_age_days))].sort((a, b) => a - b)
}
