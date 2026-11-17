import { describe, expect, it } from 'vitest'
import { PressDriver, RUPTURE_CONFIRM_MS } from './press-driver'

// Ruptura por confirmacao: queda forte so vira ruptura se a carga nao voltar a
// passar do pico dentro da janela. Alimenta o driver leitura a leitura, no ritmo
// real do indicador (uma leitura a cada 109 ms).
const DT = 109
const AREA_100 = Math.PI * 50 ** 2 // mm2, CP de 100 mm
const kgfDeMpa = (mpa: number) => Math.round((mpa * AREA_100) / 9.80665)
const kgfPorS = (mpaPorS: number) => (mpaPorS * AREA_100) / 9.80665
const NORMA = kgfPorS(0.45) // ~360 kgf/s
const NORMA_MIN = kgfPorS(0.3) // ~240 kgf/s

const config = {
  port: 'MOCK',
  baud_rate: 9600,
  modbus_address: 1,
  register: 0,
  value_scale: 10,
  poll_interval_ms: 100,
  rupture_drop_threshold_kgf: 800
} as any

/** Monta a curva em trechos: sobe/desce ate o alvo no ritmo dado (kgf/s) ou segura por um tempo */
class Curva {
  vals: number[] = [0]
  get atual() {
    return this.vals[this.vals.length - 1]
  }
  ate(alvo: number, kgfS: number) {
    const passo = (kgfS * DT) / 1000
    let v = this.atual
    while (Math.abs(alvo - v) > passo) {
      v += alvo > v ? passo : -passo
      this.vals.push(v)
    }
    this.vals.push(alvo)
    return this
  }
  /** Queda rapida em poucas leituras (assentamento ou ruptura) */
  cai(alvo: number, leituras = 3) {
    const v0 = this.atual
    for (let i = 1; i <= leituras; i++) this.vals.push(v0 + ((alvo - v0) * i) / leituras)
    return this
  }
  segura(ms: number) {
    for (let i = 0; i < ms / DT; i++) this.vals.push(this.atual)
    return this
  }
}

function ensaio(pontos: { t: number; kgf: number }[]) {
  const log: string[] = []
  const press = new PressDriver(config, { defaultMode: 'mock', log: (m) => log.push(m) })
  const d = press as any
  d.sessionStartedAt = 1
  const rupturas: number[] = [] // t da leitura em que a ruptura foi avisada
  press.on('rupture', () => rupturas.push(d.readings[d.readings.length - 1].t))
  for (const p of pontos) d.handleSample(p.kgf, 1 + p.t)
  const leituras = press.getReadings()
  return {
    rupturas,
    assentou: log.filter((m) => m.includes('assentamento')).length,
    estado: press.getLiveState(),
    maior: Math.max(...leituras.map((r) => r.kgf))
  }
}
const noRitmo = (vals: number[]) => vals.map((kgf, i) => ({ t: i * DT, kgf }))

describe('ruptura por confirmacao', () => {
  const pico = kgfDeMpa(25.4) // ~20.340 kgf, o CP 009149 do Raitz

  it('curva do video do Raitz (2,26 tf, assenta em 1,56 tf, rompe em 25,4 MPa): uma ruptura so, no fim, com o pico real', () => {
    const c = new Curva().ate(2260, NORMA).cai(1560).ate(pico, NORMA).cai(9000, 9).ate(0, 3000).segura(RUPTURE_CONFIRM_MS + 1000)
    const r = ensaio(noRitmo(c.vals))
    expect(r.rupturas).toHaveLength(1)
    expect(r.estado.rupture_detected).toBe(true)
    expect(r.estado.peak_kgf).toBe(pico)
    expect(r.maior).toBe(pico)
    expect(r.estado.rupture_at!).toBeGreaterThan(r.estado.peak_at_ms!)
  })

  it('assentamento mais fundo (2,26 tf ate 0,9 tf): nenhuma ruptura falsa no comeco', () => {
    const c = new Curva().ate(2260, NORMA).cai(900).ate(pico, NORMA).cai(9000, 9).ate(0, 3000).segura(RUPTURE_CONFIRM_MS + 1000)
    const r = ensaio(noRitmo(c.vals))
    expect(r.assentou).toBe(1) // abriu suspeita na queda e cancelou quando a carga voltou
    expect(r.rupturas).toHaveLength(1)
    expect(r.estado.peak_kgf).toBe(pico)
    expect(r.maior).toBe(pico)
  })

  it('mesmo assentamento fundo na velocidade minima da norma: a janela ainda cobre', () => {
    const c = new Curva().ate(2260, NORMA_MIN).cai(900).ate(pico, NORMA_MIN).cai(9000, 9).ate(0, 3000).segura(RUPTURE_CONFIRM_MS + 1000)
    const r = ensaio(noRitmo(c.vals))
    expect(r.assentou).toBe(1)
    expect(r.rupturas).toHaveLength(1)
    expect(r.estado.peak_kgf).toBe(pico)
  })

  it('ruptura real do Raitz em 29/09 (34,5 tf caiu pra 13 tf em 1,5 s): detecta dentro da janela', () => {
    const cp18 =
      '64457:34430,64564:34430,64675:34430,64783:34430,64893:34540,65009:34540,65109:34540,65218:34560,65327:34560,65435:34560,65546:34510,65660:34510,65765:34510,65879:33850,65992:33850,66091:33850,66195:27110,66307:27110,66414:27110,66523:22060'
        .split(',')
        .map((p) => {
          const [t, kgf] = p.split(':').map(Number)
          return { t, kgf }
        })
    // Depois do trecho gravado: chega a 13 tf e o operador alivia
    const cauda = new Curva()
    cauda.vals = [22060]
    cauda.cai(13000, 9).ate(0, 3000).segura(RUPTURE_CONFIRM_MS + 1000)
    const fim = cp18[cp18.length - 1].t
    const pontos = [...cp18, ...cauda.vals.slice(1).map((kgf, i) => ({ t: fim + (i + 1) * DT, kgf }))]
    const r = ensaio(pontos)
    expect(r.rupturas).toHaveLength(1)
    expect(r.estado.peak_kgf).toBe(34560)
    expect(r.estado.rupture_at).toBe(66195) // instante da queda, nao o da confirmacao
    expect(r.rupturas[0] - 66195).toBeLessThanOrEqual(RUPTURE_CONFIRM_MS + DT)
  })

  it('CP fraco rompendo em ~3 tf: detecta', () => {
    const c = new Curva().ate(3000, NORMA).cai(1200, 9).ate(0, 3000).segura(RUPTURE_CONFIRM_MS + 1000)
    const r = ensaio(noRitmo(c.vals))
    expect(r.rupturas).toHaveLength(1)
    expect(r.estado.peak_kgf).toBe(3000)
  })

  it('alivio lento de pressao (~200 kgf por leitura do indicador): nao dispara', () => {
    const c = new Curva().ate(17000, NORMA).segura(1000)
    // O indicador atualiza a cada ~3 leituras da porta (ver CP 20 do Raitz)
    for (let v = 17000 - 200; v >= 9000; v -= 200) c.vals.push(v, v, v)
    c.segura(RUPTURE_CONFIRM_MS + 1000)
    const r = ensaio(noRitmo(c.vals))
    expect(r.rupturas).toHaveLength(0)
    expect(r.estado.rupture_detected).toBe(false)
  })
})
