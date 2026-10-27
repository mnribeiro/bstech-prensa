import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Cliente Modbus falso: o teste muda a carga e o driver le na proxima volta
class FakeModbus extends EventEmitter {
  static last: FakeModbus | null = null
  isOpen = false
  carga = 0
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

async function ligada() {
  // Antes de conectar: a leitura de espera nasce no connect e tem que andar no relogio falso
  vi.useFakeTimers()
  const press = new PressDriver(config, { defaultMode: 'modbus', log: () => undefined })
  await press.connect('COM6')
  return { press, client: FakeModbus.last! }
}

describe('ensaio comeca pela carga', () => {
  afterEach(async () => {
    vi.useRealTimers()
  })

  it('CP pronto e carga subindo: comeca sozinho e a curva leva o comeco', async () => {
    const { press, client } = await ligada()
    const autostart = vi.fn()
    press.on('autostart', autostart)
    press.setAutoStart(true)

    client.carga = 0
    await vi.advanceTimersByTimeAsync(600)
    client.carga = 30 // 300 kgf
    await vi.advanceTimersByTimeAsync(200)
    expect(press.getLiveState().session_started_at).toBeNull()

    client.carga = 80 // 800 kgf, passou do limite
    await vi.advanceTimersByTimeAsync(200)
    expect(autostart).toHaveBeenCalledTimes(1)

    const r = press.getReadings()
    expect(r[0].t).toBe(0)
    expect(r[0].kgf).toBeLessThan(500)
    expect(r.some((x) => x.kgf === 300)).toBe(true)

    // Continua gravando no ritmo do ensaio
    client.carga = 2000
    await vi.advanceTimersByTimeAsync(300)
    expect(press.getLiveState().peak_kgf).toBe(20000)
    await press.disconnect()
  })

  it('prensa ja carregada quando o CP entra (caso Raitz 26/10): nao comeca na descarga', async () => {
    const { press, client } = await ligada()
    const autostart = vi.fn()
    press.on('autostart', autostart)

    client.carga = 482 // 4.820 kgf caindo, CP ja rompeu
    await vi.advanceTimersByTimeAsync(400)
    press.setAutoStart(true)
    client.carga = 381
    await vi.advanceTimersByTimeAsync(400)
    client.carga = 240
    await vi.advanceTimersByTimeAsync(400)
    expect(autostart).not.toHaveBeenCalled()
    expect(press.getLiveState().session_started_at).toBeNull()

    // Descarregou, posicionou o CP novo e a carga subiu: agora sim
    client.carga = 0
    await vi.advanceTimersByTimeAsync(400)
    client.carga = 60
    await vi.advanceTimersByTimeAsync(400)
    expect(autostart).toHaveBeenCalledTimes(1)
    await press.disconnect()
  })

  it('sem CP pronto na tela a carga nao comeca nada', async () => {
    const { press, client } = await ligada()
    const autostart = vi.fn()
    press.on('autostart', autostart)

    client.carga = 0
    await vi.advanceTimersByTimeAsync(400)
    client.carga = 100
    await vi.advanceTimersByTimeAsync(400)
    expect(autostart).not.toHaveBeenCalled()
    expect(press.getReadings()).toHaveLength(0)
    await press.disconnect()
  })

  it('depois da ruptura a tela desarma e a descarga nao abre outro ensaio', async () => {
    const { press, client } = await ligada()
    const autostart = vi.fn()
    press.on('autostart', autostart)
    press.setAutoStart(true)

    client.carga = 0
    await vi.advanceTimersByTimeAsync(400)
    client.carga = 100
    await vi.advanceTimersByTimeAsync(400)
    client.carga = 2000
    await vi.advanceTimersByTimeAsync(400)
    client.carga = 500 // rompeu
    await vi.advanceTimersByTimeAsync(300)
    expect(press.getLiveState().rupture_detected).toBe(true)

    press.setAutoStart(false)
    press.stopSession()
    client.carga = 300
    await vi.advanceTimersByTimeAsync(1000)
    expect(autostart).toHaveBeenCalledTimes(1)
    await press.disconnect()
  })
})
