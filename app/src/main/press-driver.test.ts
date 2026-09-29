import { describe, expect, it } from 'vitest'
import { isRupture, rankPorts } from './press-driver'

// Leituras reais da Raitz em 29/09 (o indicador repete o valor ~3 vezes)
const pts = (vals: number[], t0 = 0) => vals.map((kgf, i) => ({ t: t0 + i * 109, kgf }))
const parse = (s: string) =>
  s.split(',').map((p) => {
    const [t, kgf] = p.split(':').map(Number)
    return { t, kgf }
  })
function primeiraRuptura(readings: { t: number; kgf: number }[]) {
  let peak = 0
  for (let i = 0; i < readings.length; i++) {
    peak = Math.max(peak, readings[i].kgf)
    if (isRupture(readings.slice(0, i + 1), peak, 800)) return i
  }
  return -1
}

describe('isRupture', () => {
  it('pega a queda brusca da ruptura real (CP 18: 34,5 para 13 tf)', () => {
    const cp18 = parse(
      '64457:34430,64564:34430,64675:34430,64783:34430,64893:34540,65009:34540,65109:34540,65218:34560,65327:34560,65435:34560,65546:34510,65660:34510,65765:34510,65879:33850,65992:33850,66091:33850,66195:27110,66307:27110,66414:27110,66523:22060'
    )
    expect(cp18[primeiraRuptura(cp18)].kgf).toBe(27110)
  })

  it('nao corta o ensaio na carga caindo devagar (CP 20, antes disparava em 16,05 tf)', () => {
    const cp20 = parse(
      '60984:16900,61094:16900,61203:16900,61312:16870,61421:16870,61529:16870,61642:16830,61752:16830,61858:16830,61968:16770,62075:16770,62186:16770,62296:16710,62402:16710,62511:16710,62619:16710,62727:16640,62837:16640,62944:16640,63054:16550,63163:16550,63275:16550,63385:16430,63494:16430,63602:16430,63709:16260,63819:16260,63928:16260,64036:16050,64145:16050,64255:16050,64360:15850,64469:15850,64575:15850,64682:15610,64791:15610,64900:15610,65011:15330,65120:15330,65227:15330,65335:15060'
    )
    expect(primeiraRuptura([{ t: 60000, kgf: 17010 }, ...cp20])).toBe(-1)
  })

  it('carga que caiu pra menos da metade do pico rompeu, mesmo devagar', () => {
    const lenta = pts(Array.from({ length: 60 }, (_, i) => 20000 - i * 200))
    expect(primeiraRuptura(lenta)).toBeGreaterThan(0)
  })

  it('carga parada no topo nao dispara', () => {
    expect(primeiraRuptura(pts(Array(40).fill(39050)))).toBe(-1)
  })
})

describe('rankPorts', () => {
  const placaMae = { path: 'COM1', manufacturer: '(Standard port types)', pnpId: 'ACPI\\PNP0501\\0' }
  const bluetooth = { path: 'COM4', manufacturer: 'Microsoft', pnpId: 'BTHENUM\\{00001101}' }
  const ch340 = { path: 'COM7', manufacturer: 'wch.cn', pnpId: 'USB\\VID_1A86&PID_7523\\5', vendorId: '1A86' }
  const ftdi = { path: 'COM5', manufacturer: 'FTDI', pnpId: 'FTDIBUS\\VID_0403+PID_6001' }

  it('poe o adaptador USB antes da porta da placa-mae e tira o Bluetooth', () => {
    expect(rankPorts([placaMae, bluetooth, ch340]).map((p) => p.path)).toEqual(['COM7', 'COM1'])
  })

  it('tenta primeiro a porta salva que ainda existe', () => {
    expect(rankPorts([ch340, ftdi], 'COM5').map((p) => p.path)).toEqual(['COM5', 'COM7'])
  })

  it('porta salva que sumiu nao atrapalha (COM3 de fabrica em PC novo)', () => {
    expect(rankPorts([placaMae, ftdi], 'COM3').map((p) => p.path)).toEqual(['COM5', 'COM1'])
  })
})
