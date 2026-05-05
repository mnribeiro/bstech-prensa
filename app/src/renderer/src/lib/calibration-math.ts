export function mean(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

export function exatidaoPct(media: number, real: number): number {
  if (real === 0) return 0
  return ((media - real) / real) * 100
}

export function repetitividadePct(xs: number[], real: number): number {
  if (!xs.length || real === 0) return 0
  const max = Math.max(...xs)
  const min = Math.min(...xs)
  return ((max - min) / real) * 100
}

export interface PointResult {
  media_kgf: number
  desvio_padrao: number
  erro_exatidao_pct: number
  repetitividade_pct: number
}

export function computePoint(leituras: number[], cargaReal: number): PointResult {
  const m = mean(leituras)
  return {
    media_kgf: round2(m),
    desvio_padrao: round2(stddev(leituras)),
    erro_exatidao_pct: round2(exatidaoPct(m, cargaReal)),
    repetitividade_pct: round2(repetitividadePct(leituras, cargaReal))
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
