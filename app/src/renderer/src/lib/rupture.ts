// Contas do ensaio que a tela mostra ao vivo e no resultado (NBR 5739).
import type { PressReading, RuptureType, Specimen } from '@shared/types'
import { calcFckMpa, correctionFactor } from './format'

export const NBR_RATE = { min: 0.3, max: 0.6 } // 0,45 +- 0,15 MPa/s

export function diameterOf(sp: Specimen | null): number {
  return sp?.specimen_diameter_mm || 100
}
export function heightOf(sp: Specimen | null): number {
  return sp?.specimen_height_mm || 200
}

/** Tensao corrigida pelo fator H/D, igual ao que a trigger grava no laudo */
export function correctedMpa(kgf: number, sp: Specimen): number {
  const d = diameterOf(sp)
  return correctionFactor(heightOf(sp), d) * calcFckMpa(kgf, d)
}

export function peakPoint(readings: PressReading[]): PressReading | null {
  let best: PressReading | null = null
  for (const r of readings) if (!best || r.kgf > best.kgf) best = r
  return best
}

/** Velocidade instantanea: tensao ganha no ultimo segundo */
export function liveRate(readings: PressReading[], diameterMm: number): number {
  if (readings.length < 2) return 0
  const last = readings[readings.length - 1]
  let i = readings.length - 2
  while (i > 0 && last.t - readings[i].t < 1000) i--
  const first = readings[i]
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return 0
  return Math.max(0, (calcFckMpa(last.kgf, diameterMm) - calcFckMpa(first.kgf, diameterMm)) / dt)
}

/** Velocidade media ate o pico, contando a partir de quando a carga comecou a subir */
export function averageRate(readings: PressReading[], diameterMm: number): number {
  const pk = peakPoint(readings)
  if (!pk || pk.kgf <= 0) return 0
  const start = readings.find((r) => r.kgf > pk.kgf * 0.02) ?? readings[0]
  const dt = (pk.t - start.t) / 1000
  if (dt <= 0) return 0
  return calcFckMpa(pk.kgf - start.kgf, diameterMm) / dt
}

export type Verdict = 'pass' | 'fail' | 'neutral'
export function verdictOf(mpa: number, sp: Specimen): Verdict {
  if (sp.test_age_days < 28 || !sp.fck_spec_mpa) return 'neutral'
  return mpa >= sp.fck_spec_mpa ? 'pass' : 'fail'
}

// Mesma lista, letras e nomes da ficha de ruptura da BSTECH web (NBR 5739)
export const RUPTURE_TYPES: { value: RuptureType; letter: string; label: string; desc: string; path: string }[] = [
  { value: 'cone', letter: 'A', label: 'Cônica', desc: 'Cone bem formado nas duas faces', path: 'M8 12 L13 5 L18 12' },
  { value: 'split', letter: 'B', label: 'Cônica e bipartida', desc: 'Cone com partição vertical', path: 'M8 12 L13 5 L18 12 M13 5 L13 30' },
  {
    value: 'columnar',
    letter: 'C',
    label: 'Colunar',
    desc: 'Fissuras verticais paralelas, com formação de cones',
    path: 'M10 4 L10 30 M16 4 L16 30'
  },
  {
    value: 'cone_and_shear',
    letter: 'D',
    label: 'Cônica e cisalhada',
    desc: 'Cone numa face e plano inclinado',
    path: 'M8 12 L13 5 L18 12 M8 24 L18 16'
  },
  { value: 'shear', letter: 'E', label: 'Cisalhada', desc: 'Fratura diagonal única', path: 'M7 27 L19 7' },
  {
    value: 'top_bottom_fracture',
    letter: 'F',
    label: 'Fraturas no topo e/ou na base',
    desc: 'Fraturas no topo e/ou na base, abaixo do capeamento',
    path: 'M8 9 L13 6 L18 9 M8 25 L13 28 L18 25'
  },
  {
    value: 'top_fracture',
    letter: 'G',
    label: 'Fraturas próximas ao topo',
    desc: 'Similar ao tipo F, com as fraturas próximas ao topo',
    path: 'M8 9 L13 6 L18 9 M8 14 L13 11 L18 14'
  }
]

/** Tipo gravado na BSTECH (ja no mesmo codigo da tela) */
export function ruptureTypeFromBstech(code: string | null): RuptureType | null {
  return RUPTURE_TYPES.find((t) => t.value === code)?.value ?? null
}

export function fmt(n: number, digits = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
