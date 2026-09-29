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
// Detector de ruptura: queda brusca perto do pico (ver isRupture).

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
  private pollBusy = false
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
  // Reconexao automatica: procura a porta sozinho e tenta de novo se o cabo sair
  private autoHandle: NodeJS.Timeout | null = null
  private autoBusy = false
  private readFailures = 0
  private lastAutoHint = ''
  private log: (msg: string) => void

  constructor(
    config: PressConfig,
    opts?: { defaultMode?: 'mock' | 'modbus'; log?: (msg: string) => void }
  ) {
    super()
    this.config = config
    this.log = opts?.log ?? ((msg) => console.log('[press]', msg))
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
        // Porta aberta nao quer dizer prensa: so conta como conectada se o indicador responder
        try {
          await this.readModbus()
        } catch {
          await this.readModbus()
        }
        this.readFailures = 0
        this.connected = true
        this.currentPort = port
        this.startIdlePolling()
        this.emitState()
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.log(`connect ${port} falhou: ${msg}`)
        await this.closeClient()
        return { ok: false, error: msg }
      } finally {
        this.connectInFlight = null
      }
    })()
    return this.connectInFlight
  }

  private async closeClient(): Promise<void> {
    const client = this.modbusClient
    this.modbusClient = null
    if (client && client.isOpen) {
      await new Promise<void>((res) => client.close(() => res()))
    }
  }

  /**
   * Procura a prensa sozinho e fica tentando a cada poucos segundos enquanto
   * estiver desconectada (cabo plugado depois de abrir o app, cabo que saiu).
   * Ordem: porta salva, depois adaptadores USB-serial, depois o resto.
   * Bluetooth fica de fora. onFound recebe a porta que respondeu, pra salvar.
   */
  startAutoConnect(onFound?: (port: string) => void, everyMs = 5000) {
    if (this.autoHandle) return
    const tick = async () => {
      if (this.connected || this.autoBusy) return
      this.autoBusy = true
      try {
        const port = await this.autoConnectOnce()
        if (port) onFound?.(port)
      } finally {
        this.autoBusy = false
      }
    }
    void tick()
    this.autoHandle = setInterval(tick, everyMs)
  }

  stopAutoConnect() {
    if (this.autoHandle) {
      clearInterval(this.autoHandle)
      this.autoHandle = null
    }
  }

  private async autoConnectOnce(): Promise<string | null> {
    if (this.mode === 'mock') {
      const r = await this.connect('MOCK')
      return r.ok ? 'MOCK' : null
    }
    const { SerialPort } = await import('serialport')
    const all = await SerialPort.list()
    const candidates = rankPorts(all, this.config.port)
    if (!candidates.length) {
      this.hint(
        all.length
          ? `nenhuma porta USB-serial (portas vistas: ${all.map((p) => p.path).join(', ')})`
          : 'nenhuma porta COM no Windows: cabo desplugado ou driver do adaptador faltando'
      )
      return null
    }
    const erros: string[] = []
    for (const p of candidates) {
      const r = await this.connect(p.path)
      if (r.ok) {
        this.lastAutoHint = ''
        this.log(`conectada em ${p.path} (${p.manufacturer ?? 'fabricante n/d'})`)
        return p.path
      }
      erros.push(`${p.path}: ${r.error ?? 'sem resposta'}`)
    }
    this.hint(
      `portas abertas mas o indicador nao respondeu (${this.config.baud_rate} baud, endereco ${this.config.modbus_address}): ${erros.join('; ')}`
    )
    return null
  }

  // Loga so quando o motivo muda, pra nao encher o arquivo a cada 5s
  private hint(msg: string) {
    if (msg === this.lastAutoHint) return
    this.lastAutoHint = msg
    this.log(msg)
  }

  async disconnect(): Promise<void> {
    this.stopSession()
    this.stopIdlePolling()
    await this.closeClient()
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
        this.readFailures = 0
        this.lastSamples = [kgf]
        this.emitState()
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
        // ~2s sem resposta fora de ensaio: cabo saiu ou prensa desligou
        if (++this.readFailures >= 10 && !this.pollHandle) {
          this.log(`sem resposta em ${this.currentPort}, desconectando pra procurar de novo`)
          this.readFailures = 0
          void this.disconnect()
        }
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
    // Indicador responde um pedido por vez: sem essa trava, uma resposta lenta
    // empilhava leituras na porta serial
    if (this.pollBusy) return
    this.pollBusy = true
    try {
      const kgf = this.mode === 'mock' ? this.readMock() : await this.readModbus()
      if (kgf === null) return
      this.handleSample(kgf)
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.pollBusy = false
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
    // Loading: sobe ate o target na velocidade da norma, com jitter de +-30
    const t = this.mockTickMs / 1000 // segundos
    // Sobe perto do teto da NBR 5739 (0,52 MPa/s, limite 0,6) num CP de 100 mm, quase linear
    const peakMpa = (this.mockPeakTarget * 9.80665) / (Math.PI * 50 ** 2)
    const totalDuration = peakMpa / 0.52
    const progress = Math.min(t / totalDuration, 1)
    const eased = Math.pow(progress, 1.05)
    const base = eased * this.mockPeakTarget
    const jitter = (Math.random() - 0.5) * 60
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

    if (!this.ruptureDetected && isRupture(this.readings, this.peakKgf, this.config.rupture_drop_threshold_kgf)) {
      this.ruptureDetected = true
      this.ruptureAt = t
      this.emit('rupture')
      this.emitState()
    }
  }

  private emitState() {
    this.emit('state', this.getLiveState())
  }
}

// Ruptura de CP e queda brusca: na Raitz (29/09) a carga caiu de 34 para 13 tf em
// 1,5 s. Alivio de pressao cai devagar (uns 200 kgf a cada leitura do indicador) e
// antes disparava ruptura falsa so por acumular 800 kgf abaixo do pico.
const RUPTURE_WINDOW_MS = 1200
const RUPTURE_FAST_DROP = 0.08 // fracao do pico que precisa cair dentro da janela
const RUPTURE_COLLAPSE = 0.5 // caiu pra menos da metade do pico: rompeu, em qualquer ritmo

export function isRupture(readings: { t: number; kgf: number }[], peakKgf: number, thresholdKgf: number): boolean {
  if (peakKgf <= 1000 || readings.length < 3) return false
  const last = readings[readings.length - 1]
  if (last.kgf < peakKgf * RUPTURE_COLLAPSE) return true
  let windowMax = last.kgf
  for (let i = readings.length - 2; i >= 0 && last.t - readings[i].t <= RUPTURE_WINDOW_MS; i--) {
    if (readings[i].kgf > windowMax) windowMax = readings[i].kgf
  }
  const fastDrop = windowMax - last.kgf
  return windowMax >= peakKgf * 0.9 && fastDrop > Math.max(thresholdKgf, peakKgf * RUPTURE_FAST_DROP)
}

interface PortInfoLike {
  path: string
  manufacturer?: string
  pnpId?: string
  vendorId?: string
}

// Chips comuns de adaptador USB-RS485 (FTDI, CH340, Prolific, CP210x) ou qualquer USB
const USB_SERIAL = /ftdi|wch|ch34|prolific|silicon labs|cp210|usb/i
const BLUETOOTH = /bthenum|bluetooth/i

export function rankPorts<T extends PortInfoLike>(ports: T[], saved?: string): T[] {
  const score = (p: T) => {
    const text = `${p.manufacturer ?? ''} ${p.pnpId ?? ''}`
    if (BLUETOOTH.test(text)) return -1
    if (saved && p.path === saved) return 0
    if (p.vendorId || USB_SERIAL.test(text)) return 1
    return 2 // porta da placa-mae (COM1): tenta por ultimo
  }
  return ports
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.p)
}
