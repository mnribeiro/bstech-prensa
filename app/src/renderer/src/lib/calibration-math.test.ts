import { describe, it, expect } from 'vitest'
import { mean, stddev, exatidaoPct, repetitividadePct, computePoint } from './calibration-math'

describe('mean', () => {
  it('média simples', () => {
    expect(mean([10, 20, 30])).toBe(20)
  })
  it('lista vazia retorna 0', () => {
    expect(mean([])).toBe(0)
  })
})

describe('stddev', () => {
  it('desvio padrão amostral (n-1) bate com FRE-987 ponto 10000', () => {
    // 9950, 9880, 9850 -> sd ~ 51.32
    expect(stddev([9950, 9880, 9850])).toBeCloseTo(51.32, 1)
  })
  it('desvio com 1 elemento é 0', () => {
    expect(stddev([42])).toBe(0)
  })
})

describe('exatidaoPct', () => {
  it('erro de exatidão = (média - real) / real * 100', () => {
    expect(exatidaoPct(9893.33, 10000)).toBeCloseTo(-1.07, 1)
  })
  it('real=0 retorna 0', () => {
    expect(exatidaoPct(100, 0)).toBe(0)
  })
})

describe('repetitividadePct', () => {
  it('(max - min) / real * 100', () => {
    // ponto 20000: 19870, 19700, 19900 -> (19900-19700)/20000*100 = 1.00
    expect(repetitividadePct([19870, 19700, 19900], 20000)).toBeCloseTo(1.0, 2)
  })
  it('lista vazia retorna 0', () => {
    expect(repetitividadePct([], 100)).toBe(0)
  })
})

describe('computePoint', () => {
  it('calcula tudo a partir de 3 leituras + carga real (FRE-987 linha 10000)', () => {
    const r = computePoint([9950, 9880, 9850], 10000)
    expect(r.media_kgf).toBeCloseTo(9893.33, 1)
    expect(r.desvio_padrao).toBeCloseTo(51.32, 1)
    expect(r.erro_exatidao_pct).toBeCloseTo(-1.07, 1)
  })
})
