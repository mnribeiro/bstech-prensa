import { describe, it, expect, vi } from 'vitest'
import type { PressReading, Specimen } from '@shared/types'
import { runDemoSimulation } from './demo-runner'
import { NBR_RATE, averageRate, liveRate } from './rupture'

const sp = {
  id: 'x',
  specimen_code: 'QB13-L002-1-7D',
  test_age_days: 7,
  specimen_diameter_mm: 100,
  specimen_height_mm: 200,
  correction_factor: 1,
  fck_spec_mpa: 30
} as Specimen

function simular(): PressReading[] {
  vi.useFakeTimers()
  const readings: PressReading[] = []
  let rompeu = false
  const h = runDemoSimulation(sp, 'approve', {
    reading: (r) => readings.push(r),
    state: () => {},
    rupture: () => {
      rompeu = true
    }
  })
  vi.advanceTimersByTime(200_000)
  h.stop()
  vi.useRealTimers()
  expect(rompeu).toBe(true)
  return readings
}

describe('ensaio simulado do modo demo', () => {
  it('carrega na velocidade média da NBR 5739', () => {
    const rate = averageRate(simular(), 100)
    expect(rate).toBeGreaterThanOrEqual(NBR_RATE.min)
    expect(rate).toBeLessThanOrEqual(NBR_RATE.max)
  })

  it('a velocidade ao vivo fica na faixa da norma depois do assentamento', () => {
    const readings = simular()
    const peakIdx = readings.reduce((b, r, i) => (r.kgf > readings[b].kgf ? i : b), 0)
    for (let i = 50; i < peakIdx; i += 10) {
      const rate = liveRate(readings.slice(0, i + 1), 100)
      expect(rate).toBeGreaterThanOrEqual(NBR_RATE.min)
      expect(rate).toBeLessThanOrEqual(NBR_RATE.max)
    }
  })
})
