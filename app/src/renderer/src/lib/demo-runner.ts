// Simulador de ensaio pro Modo Demo (apresentacao da BStech sem prensa fisica).
// Roda 100% no renderer: gera a curva de carga subindo e a ruptura, emitindo
// os MESMOS eventos que o driver real mandaria via IPC (reading/state/rupture).
// Assim o resto do app (CPStage ao vivo, modal, selagem real) funciona identico.

import type { Specimen, PressLiveState, PressReading } from '@shared/types'
import type { DemoOutcome } from '../store/session'
import { calcFckMpa } from './format'

const POLL_MS = 100 // 10 Hz, igual ao driver real
const RAMP_MS = 9000 // ~9s subindo a carga, tempo de narrar na apresentacao
const MODAL_DELAY_MS = 1800 // espera depois da ruptura pra abrir a bancada

// Carga de pico (kgf) que faz o CP aprovar ou reprovar.
// Resolve o peak pra que o fck CORRIGIDO caia ~8% acima do alvo (aprovar)
// ou ~15% abaixo (reprovar). Inverte calcFckMpa: fck = peak*9.80665/area.
export function demoTargetKgf(sp: Specimen, outcome: DemoOutcome): number {
  const d = sp.specimen_diameter_mm || 100
  const area = Math.PI * (d / 2) ** 2
  const cf = sp.correction_factor ?? 1
  const fckSpec = sp.fck_spec_mpa ?? 30
  const factor = outcome === 'approve' ? 1.08 : 0.85
  const fckCorrectedDesired = fckSpec * factor
  // fckCorrected = cf * (peak*9.80665/area)  =>  peak = fckCorrected*area/(9.80665*cf)
  return (fckCorrectedDesired * area) / (9.80665 * cf)
}

export interface DemoEmitters {
  reading: (r: PressReading) => void
  state: (s: PressLiveState) => void
  rupture: () => void
  openModal: () => void
}

export interface DemoHandle {
  stop: () => void
}

export function runDemoSimulation(
  sp: Specimen,
  outcome: DemoOutcome,
  emit: DemoEmitters
): DemoHandle {
  const target = demoTargetKgf(sp, outcome)
  const startedAt = Date.now()
  let elapsed = 0
  let peak = 0
  let peakAt: number | null = null
  let count = 0
  let ruptured = false
  let ramp: ReturnType<typeof setInterval> | null = null
  let modalTimer: ReturnType<typeof setTimeout> | null = null

  function snapshot(currentKgf: number): PressLiveState {
    return {
      connected: true,
      port: 'DEMO',
      current_kgf: currentKgf,
      peak_kgf: peak,
      peak_at_ms: peakAt,
      reading_count: count,
      session_started_at: startedAt,
      rupture_detected: ruptured,
      rupture_at: ruptured ? elapsed : null
    }
  }

  ramp = setInterval(() => {
    elapsed += POLL_MS
    const progress = Math.min(elapsed / RAMP_MS, 1)

    if (progress < 1) {
      const eased = Math.pow(progress, 1.6) // sobe lento no inicio, igual ao mock do driver
      const value = Math.max(0, eased * target + (Math.random() - 0.5) * 150)
      count++
      if (value > peak) {
        peak = value
        peakAt = elapsed
      }
      emit.reading({ t: elapsed, kgf: Math.round(value * 100) / 100 })
      emit.state(snapshot(value))
      return
    }

    // Atingiu o topo: trava o pico no alvo e a carga cai a zero (CP rompeu, carga liberada).
    if (peak < target) {
      peak = target
      peakAt = elapsed
    }
    ruptured = true
    count++
    emit.reading({ t: elapsed, kgf: 0 })
    emit.state(snapshot(0))
    emit.rupture()
    if (ramp) {
      clearInterval(ramp)
      ramp = null
    }
    modalTimer = setTimeout(() => emit.openModal(), MODAL_DELAY_MS)
  }, POLL_MS)

  return {
    stop() {
      if (ramp) clearInterval(ramp)
      if (modalTimer) clearTimeout(modalTimer)
      ramp = null
      modalTimer = null
    }
  }
}

// fck corrigido que o demo vai produzir, usado pra rotular o botao (Aprovar/Reprovar).
export function demoExpectedFck(sp: Specimen, outcome: DemoOutcome): number {
  const peak = demoTargetKgf(sp, outcome)
  const cf = sp.correction_factor ?? 1
  return cf * calcFckMpa(peak, sp.specimen_diameter_mm || 100)
}
