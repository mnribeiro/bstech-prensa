import { describe, expect, it } from 'vitest'
import { rankPorts } from './press-driver'

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
