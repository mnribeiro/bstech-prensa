import { describe, expect, it, vi } from 'vitest'
import { createScanDetector, tokenDoTexto } from './scanner'

function digitar(det: ReturnType<typeof createScanDetector>, texto: string, clock: { t: number }, gap: number) {
  for (const ch of [...texto, 'Enter']) {
    clock.t += gap
    det({ key: ch === 'Enter' ? 'Enter' : ch, preventDefault: () => {} })
  }
}

describe('leitor de etiqueta', () => {
  it('acha o token no link, mesmo com a barra trocada pelo teclado ABNT2', () => {
    expect(tokenDoTexto('https://www.bstlab.com.br/e/ab12cd34ef')).toBe('AB12CD34EF')
    expect(tokenDoTexto('https:;;www.bstlab.com.br;e;AB12CD34EF')).toBe('AB12CD34EF')
    expect(tokenDoTexto('AB12CD34EF')).toBe('AB12CD34EF')
    expect(tokenDoTexto('observacao qualquer')).toBeNull()
  })

  it('dispara com a digitacao rapida do leitor', () => {
    const onScan = vi.fn()
    const clock = { t: 0 }
    const det = createScanDetector({ onScan, now: () => clock.t })
    digitar(det, 'https://www.bstlab.com.br/e/AB12CD34EF', clock, 8)
    expect(onScan).toHaveBeenCalledWith('AB12CD34EF')
  })

  it('ignora gente digitando devagar', () => {
    const onScan = vi.fn()
    const clock = { t: 0 }
    const det = createScanDetector({ onScan, now: () => clock.t })
    digitar(det, 'AB12CD34EF', clock, 150)
    expect(onScan).not.toHaveBeenCalled()
  })
})
