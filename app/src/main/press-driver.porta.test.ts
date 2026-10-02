import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Cliente Modbus falso: repassa erro da porta como 'error', igual ao modbus-serial
class FakeModbus extends EventEmitter {
  static last: FakeModbus | null = null
  isOpen = false
  carga = 1000
  constructor() {
    super()
    FakeModbus.last = this
  }
  async connectRTUBuffered() {
    this.isOpen = true
  }
  setID() {}
  setTimeout() {}
  async readHoldingRegisters() {
    return { data: [this.carga] }
  }
  close(cb: () => void) {
    this.isOpen = false
    cb()
  }
}
vi.mock('modbus-serial', () => ({ default: FakeModbus }))

import { PressDriver } from './press-driver'

const config = {
  port: 'COM6',
  baud_rate: 9600,
  modbus_address: 1,
  register: 0,
  value_scale: 10,
  poll_interval_ms: 100,
  rupture_drop_threshold_kgf: 800
} as any

// O que o modbus-serial emite (SerialPortError nao e instancia de Error)
function erro433() {
  return { name: 'SerialPortError', errno: 'ECONNREFUSED', message: 'Writing to COM port (GetOverlappedResult): Unknown error code 433' }
}

describe('porta da prensa caindo', () => {
  afterEach(() => vi.useRealTimers())

  it('erro 433 no meio do ensaio nao derruba o app, guarda o pico e avisa', async () => {
    const logs: string[] = []
    const press = new PressDriver(config, { defaultMode: 'modbus', log: (m) => logs.push(m) })
    expect((await press.connect('COM6')).ok).toBe(true)
    const client = FakeModbus.last!

    vi.useFakeTimers()
    press.startSession()
    client.carga = 2000
    await vi.advanceTimersByTimeAsync(350)
    const pico = press.getLiveState().peak_kgf
    expect(pico).toBe(20000)

    const lost = vi.fn()
    press.on('lost', lost)
    // Sem ouvinte de 'error' no cliente, esta linha lancava e o Electron mostrava a caixa de erro
    expect(() => client.emit('error', erro433())).not.toThrow()

    const s = press.getLiveState()
    expect(s.connected).toBe(false)
    expect(s.peak_kgf).toBe(pico)
    expect(press.getReadings().length).toBeGreaterThan(0)
    expect(lost).toHaveBeenCalledWith({ inSession: true, message: expect.stringContaining('433') })
    expect(logs.some((l) => l.includes('caiu durante o ensaio'))).toBe(true)

    // Parou de ler a porta morta
    const n = press.getReadings().length
    await vi.advanceTimersByTimeAsync(500)
    expect(press.getReadings().length).toBe(n)
  })

  it('reconecta depois que a porta volta', async () => {
    const press = new PressDriver(config, { defaultMode: 'modbus', log: () => undefined })
    await press.connect('COM6')
    FakeModbus.last!.emit('error', erro433())
    expect(press.getLiveState().connected).toBe(false)
    expect((await press.connect('COM6')).ok).toBe(true)
    expect(press.getLiveState().connected).toBe(true)
    await press.disconnect()
  })

  it('fechar a porta de proposito nao gera aviso de queda', async () => {
    const press = new PressDriver(config, { defaultMode: 'modbus', log: () => undefined })
    await press.connect('COM6')
    const lost = vi.fn()
    press.on('lost', lost)
    await press.disconnect()
    expect(lost).not.toHaveBeenCalled()
  })
})
