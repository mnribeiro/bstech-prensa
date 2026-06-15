// Driver da prensa.
// Implementacao: 2 modos selecionados via env BSTECH_PRESS_MODE = 'mock' | 'modbus'.
// - mock: gera leituras simuladas pra testar UI sem hardware (curva crescente + queda na ruptura).
// - modbus: usa modbus-serial pra ler do indicador Novus N1500-LC via USB-RS485.
//
// Emite eventos:
//   reading -> PressReading individual
//   state   -> PressLiveState snapshot
//   rupture -> quando detector identifica queda > threshold
//
// Detector de ruptura: olha drop entre amostras consecutivas filtradas (rolling avg de 3).

import { EventEmitter } from 'node:events'
import type { PressConfig, PressReading, PressLiveState } from '../shared/types'

export interface PressDriverEvents {
  reading: (r: PressReading) => void
  state: (s: PressLiveState) => void
  rupture: () => void
  error: (err: Error) => void
}

export class PressDriver extends EventEmitter {
  private config: PressConfig
  private mode: 'mock' | 'modbus'
  private modbusClient: any = null // ModbusRTU lazy import
  private connectInFlight: Promise<{ ok: boolean; error?: string }> | null = null
  private pollHandle: NodeJS.Timeout | null = null
  private idleHandle: NodeJS.Timeout | null = null
  private sessionStartedAt: number | null = null
  private readings: PressReading[] = []
  private peakKgf = 0
  private peakAtMs: number | null = null
  private lastSamples: number[] = []
  private connected = false
  private currentPort: string | null = null
  private ruptureDetected = false
  private ruptureAt: number | null = null
  // Estado interno do mock
  private mockTickMs = 0
  private mockPhase: 'idle' | 'loading' | 'ruptured' = 'idle'
  private mockPeakTarget = 0

  constructor(config: PressConfig, opts?: { defaultMode?: 'mock' | 'modbus' }) {
    super()
    this.config = config
    // Prioridade: env var explícita > default passado > 'mock'
    const envMode = process.env.BSTECH_PRESS_MODE
    if (envMode === 'modbus' || envMode === 'mock') {
      this.mode = envMode
    } else if (opts?.defaultMode) {
      this.mode = opts.defaultMode
    } else {
      this.mode = 'mock'
    }
  }

  setConfig(patch: Partial<PressConfig>) {
    this.config = { ...this.config, ...patch }
  }

  getConfig() {
    return this.config
  }

  async listPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
    if (this.mode === 'mock') {
      return [{ path: 'MOCK', manufacturer: 'Simulador BStech' }]
    }
    const { SerialPort } = await import('serialport')
    const ports = await SerialPort.list()
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer }))
  }

  async connect(port: string): Promise<{ ok: boolean; error?: string }> {
    if (this.connected) return { ok: true }
    if (this.connectInFlight) return this.connectInFlight
    this.connectInFlight = (async () => {
      try {
        if (this.mode === 'mock') {
          this.connected = true
          this.currentPort = 'MOCK'
          this.emitState()
          return { ok: true }
        }
        const ModbusRTUMod = await import('modbus-serial')
        const ModbusRTU = (ModbusRTUMod as any).default ?? ModbusRTUMod
        this.modbusClient = new ModbusRTU()
        await this.modbusClient.connectRTUBuffered(port, { baudRate: this.config.baud_rate })
        this.modbusClient.setID(this.config.modbus_address)
        this.modbusClient.setTimeout(500)
        this.connected = true
        this.currentPort = port
        this.startIdlePolling()
        this.emitState()
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[press] connect failed:', msg)
        return { ok: false, error: msg }
      } finally {
        this.connectInFlight = null
      }
    })()
    return this.connectInFlight
  }

  async disconnect(): Promise<void> {
    this.stopSession()
    this.stopIdlePolling()
    if (this.modbusClient && this.modbusClient.isOpen) {
      await new Promise<void>((res) => this.modbusClient.close(() => res()))
    }
    this.modbusClient = null
    this.connected = false
    this.currentPort = null
    this.emitState()
  }

  startSession(): { ok: boolean; error?: string } {
    if (!this.connected) return { ok: false, error: 'Prensa nao conectada' }
    if (this.pollHandle) return { ok: true }
    this.stopIdlePolling()
    this.sessionStartedAt = Date.now()
    this.readings = []
    this.peakKgf = 0
    this.peakAtMs = null
    this.lastSamples = []
    this.ruptureDetected = false
    this.ruptureAt = null
    this.mockTickMs = 0
    this.mockPhase = 'loading'
    // Pico simulado entre 18.000 e 32.000 kgf (CP comum 25-40 MPa pra D=100)
    this.mockPeakTarget = 18000 + Math.random() * 14000

    this.pollHandle = setInterval(() => this.poll(), this.config.poll_interval_ms)
    this.emitState()
    return { ok: true }
  }

  stopSession(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
    this.mockPhase = 'idle'
    if (this.connected) this.startIdlePolling()
    this.emitState()
  }

  reset(): void {
    this.stopSession()
    this.sessionStartedAt = null
    this.readings = []
    this.peakKgf = 0
    this.peakAtMs = null
    this.ruptureDetected = false
    this.ruptureAt = null
    this.lastSamples = []
    this.emitState()
  }

  getReadings(): PressReading[] {
    return this.readings
  }

  /**
   * Captura uma janela de leituras sem entrar em sessão de ruptura.
   * Usado em calibração: estabiliza com média da janela.
   */
  async captureSnapshot(
    durationMs: number = 2000
  ): Promise<{ media_kgf: number; samples: number[]; duration_ms: number }> {
    if (!this.connected) throw new Error('Prensa não conectada')
    // Pausa idle polling pra não competir pela porta serial (modbus-serial é single-request)
    const idleWasRunning = this.idleHandle !== null
    if (idleWasRunning) this.stopIdlePolling()

    const samples: number[] = []
    const start = Date.now()
    const interval = this.config.poll_interval_ms

    try {
      while (Date.now() - start < durationMs) {
        try {
          const v = this.mode === 'mock' ? this.readMockSnapshot() : await this.readModbus()
          if (v !== null) samples.push(v)
        } catch (err) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)))
        }
        await new Promise((r) => setTimeout(r, interval))
      }
    } finally {
      if (idleWasRunning && this.connected) this.startIdlePolling()
    }

    const media = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0
    return {
      media_kgf: Math.round(media * 100) / 100,
      samples,
      duration_ms: Date.now() - start
    }
  }

  private readMockSnapshot(): number {
    // Mock: simula carga estabilizada com ruído ±0.5%
    const base = 50000
    return base + (Math.random() - 0.5) * 500
  }

  getLiveState(): PressLiveState {
    return {
      connected: this.connected,
      port: this.currentPort,
      current_kgf: this.lastSamples.length ? this.lastSamples[this.lastSamples.length - 1] : 0,
      peak_kgf: this.peakKgf,
      peak_at_ms: this.peakAtMs,
      reading_count: this.readings.length,
      session_started_at: this.sessionStartedAt,
      rupture_detected: this.ruptureDetected,
      rupture_at: this.ruptureAt
    }
  }

  // ---- INTERNO ----

  private startIdlePolling() {
    if (this.idleHandle) return
    // Poll mais lento que sessão (5Hz), só pra UI saber que sensor responde
    const intervalMs = Math.max(200, this.config.poll_interval_ms * 2)
    this.idleHandle = setInterval(async () => {
      if (this.pollHandle) return // sessão ativa cuida do polling
      try {
        const kgf = this.mode === 'mock' ? 0 : await this.readModbus()
        if (kgf === null) return
        this.lastSamples = [kgf]
        this.emitState()
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
    }, intervalMs)
  }

  private stopIdlePolling() {
    if (this.idleHandle) {
      clearInterval(this.idleHandle)
      this.idleHandle = null
    }
  }

  private async poll() {
    try {
      const kgf = this.mode === 'mock' ? this.readMock() : await this.readModbus()
      if (kgf === null) return
      this.handleSample(kgf)
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  private async readModbus(): Promise<number | null> {
    if (!this.modbusClient || !this.modbusClient.isOpen) return null
    // FC=03 holding register, register configurado (default 0)
    const data = await this.modbusClient.readHoldingRegisters(this.config.register, 1)
    const raw = data.data[0] // unsigned int16
    // Decode signed (N1500-LC pode usar valores negativos em descarga)
    const signed = raw > 32767 ? raw - 65536 : raw
    return signed * this.config.value_scale
  }

  private readMock(): number {
    this.mockTickMs += this.config.poll_interval_ms
    if (this.mockPhase === 'idle') return 0
    if (this.mockPhase === 'ruptured') {
      // Decai gradualmente apos ruptura
      const last = this.lastSamples[this.lastSamples.length - 1] ?? 0
      return Math.max(0, last - 800 - Math.random() * 400)
    }
    // Loading: sobe pseudo-quadratico ate atingir target, com jitter de +-100
    const t = this.mockTickMs / 1000 // segundos
    const totalDuration = 12 // ~12s pra atingir pico
    const progress = Math.min(t / totalDuration, 1)
    const eased = Math.pow(progress, 1.6) // curva mais lenta no inicio
    const base = eased * this.mockPeakTarget
    const jitter = (Math.random() - 0.5) * 200
    const value = Math.max(0, base + jitter)
    if (progress >= 1) {
      // Hora da ruptura: drop forte na proxima leitura
      this.mockPhase = 'ruptured'
      // Retorna valor ligeiramente abaixo do pico pra simular queda
      return value * 0.45
    }
    return value
  }

  private handleSample(kgf: number) {
    if (!this.sessionStartedAt) return
    const t = Date.now() - this.sessionStartedAt
    const sample: PressReading = { t, kgf: Math.round(kgf * 100) / 100 }

    this.readings.push(sample)
    this.lastSamples.push(kgf)
    if (this.lastSamples.length > 5) this.lastSamples.shift()

    if (kgf > this.peakKgf) {
      this.peakKgf = kgf
      this.peakAtMs = t
    }

    this.emit('reading', sample)
    this.emitState()

    // Detector de ruptura: drop > threshold com peak ja > 1000 kgf
    if (!this.ruptureDetected && this.peakKgf > 1000 && this.lastSamples.length >= 3) {
      const recent = this.lastSamples[this.lastSamples.length - 1]
      const drop = this.peakKgf - recent
      if (drop > this.config.rupture_drop_threshold_kgf) {
        this.ruptureDetected = true
        this.ruptureAt = t
        this.emit('rupture')
        this.emitState()
      }
    }
  }

  private emitState() {
    this.emit('state', this.getLiveState())
  }
}
