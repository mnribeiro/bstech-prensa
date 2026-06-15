// Helpers de formatacao numerica/data, equivalente ao que o BStech web ja usa.

export function formatTon(kgf: number, digits = 2): string {
  return (kgf / 1000).toFixed(digits)
}

export function formatKgf(kgf: number): string {
  return Math.round(kgf).toLocaleString('pt-BR')
}

export function formatMpa(mpa: number | null): string {
  if (mpa == null) return 'n/d'
  return mpa.toFixed(1)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

export function relativeDays(due: string): { label: string; tone: 'ok' | 'soon' | 'late' } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(due)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0) return { label: `Atrasado ${Math.abs(diff)}d`, tone: 'late' }
  if (diff === 0) return { label: 'Hoje', tone: 'soon' }
  if (diff === 1) return { label: 'Amanha', tone: 'soon' }
  return { label: `Em ${diff}d`, tone: 'ok' }
}

export function calcFckMpa(loadKgf: number, diameterMm: number): number {
  const area = Math.PI * (diameterMm / 2) ** 2
  return (loadKgf * 9.80665) / area
}

export function heightDiameterRatio(heightMm: number, diameterMm: number): number {
  if (!heightMm || !diameterMm || diameterMm <= 0) return 0
  return heightMm / diameterMm
}

// Espelha calculate_correction_factor do BStech (NBR 5739). O banco guarda a
// razao como DECIMAL(4,2), entao arredondamos pra 2 casas antes das faixas pra
// o fator mostrado na tela bater exatamente com o que a trigger grava no laudo.
export function correctionFactor(heightMm: number, diameterMm: number): number {
  if (!heightMm || !diameterMm || diameterMm <= 0) return 1
  const ratio = Math.round((heightMm / diameterMm) * 100) / 100
  if (ratio >= 1.94 && ratio <= 2.06) return 1.0
  if (ratio >= 1.75 && ratio < 1.94) return 0.98
  if (ratio > 2.06 && ratio <= 2.25) return 1.02
  return 1.0
}
