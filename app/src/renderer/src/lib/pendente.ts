// Ensaio rompido que ainda nao selou fica guardado neste computador ate selar.
// Na Raitz (29/09) o selo caiu num erro do servidor, o operador trocou de CP e o
// resultado sumiu. Agora voltar no CP traz a curva de volta pra selar de novo.
import type { PressReading, RuptureType } from '@shared/types'

export interface Pendente {
  readings: PressReading[]
  sessionStartedAt: number | null
  ruptureType: RuptureType | null
}

const key = (specimenId: string) => `bstech-prensa-pendente-${specimenId}`

export function guardarPendente(specimenId: string, p: Pendente) {
  try {
    localStorage.setItem(key(specimenId), JSON.stringify(p))
  } catch {
    // sem storage o resultado so vive enquanto a tela estiver aberta
  }
}

export function lerPendente(specimenId: string): Pendente | null {
  try {
    const raw = localStorage.getItem(key(specimenId))
    const p = raw ? (JSON.parse(raw) as Pendente) : null
    return p && Array.isArray(p.readings) && p.readings.length ? p : null
  } catch {
    return null
  }
}

export function apagarPendente(specimenId: string) {
  try {
    localStorage.removeItem(key(specimenId))
  } catch {
    // nada a fazer
  }
}
