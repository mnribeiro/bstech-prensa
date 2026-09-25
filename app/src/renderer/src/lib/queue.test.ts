import { describe, it, expect } from 'vitest'
import type { Specimen } from '@shared/types'
import { groupObras, groupLateDays, lotOf, nextPending, normCode, splitPools, lateDays } from './queue'

const TODAY = '2026-09-25'

function cp(code: string, over: Partial<Specimen> = {}): Specimen {
  const [, lote] = code.split('-')
  return {
    id: code,
    specimen_code: code,
    status: 'PENDING',
    test_age_days: 28,
    due_date: TODAY,
    specimen_diameter_mm: 100,
    specimen_height_mm: 200,
    weight_kg: null,
    height_diameter_ratio: null,
    correction_factor: null,
    project_id: 'obra-a',
    batch_id: `b-${lote}`,
    project_name: 'Obra A',
    batch_code: lote,
    fck_spec_mpa: 30,
    structure_name: 'Laje',
    structure_type: null,
    supplier_name: null,
    molder_name: null,
    molding_date: '2026-08-28',
    applied_load_ton: null,
    calculated_fck_mpa: null,
    corrected_fck_mpa: null,
    rupture_type: null,
    ruptured_at: null,
    rupture_operator_name: null,
    ...over
  }
}

describe('agrupamento da fila', () => {
  it('separa hoje e atrasados pela data de vencimento', () => {
    const list = [cp('HOM-L01-1-28D'), cp('HOM-L02-1-28D', { due_date: '2026-09-20' })]
    const { hoje, late } = splitPools(list, TODAY)
    expect(hoje.map((s) => s.id)).toEqual(['HOM-L01-1-28D'])
    expect(late.map((s) => s.id)).toEqual(['HOM-L02-1-28D'])
    expect(lateDays(late[0], TODAY)).toBe(5)
  })

  it('obra > concretagem > lote, exemplares em ordem de etiqueta', () => {
    const list = [cp('HOM-L02-2-28D'), cp('HOM-L01-2-28D'), cp('HOM-L01-1-28D'), cp('HOM-L02-1-28D')]
    const [obra] = groupObras(list)
    const lots = obra.concretagens[0].lots
    expect(lots.map((l) => l.batchCode)).toEqual(['L01', 'L02'])
    expect(lots[0].specimens.map((s) => s.id)).toEqual(['HOM-L01-1-28D', 'HOM-L01-2-28D'])
  })

  it('atrasados vêm do vencimento mais recente pro mais antigo', () => {
    const list = [cp('A-L1-1-28D', { due_date: '2026-09-01' }), cp('A-L2-1-28D', { due_date: '2026-09-22' })]
    expect(groupLateDays(list, TODAY).map((d) => d.due)).toEqual(['2026-09-22', '2026-09-01'])
  })

  it('lote junta só a mesma idade', () => {
    const list = [cp('HOM-L01-1-28D'), cp('HOM-L01-2-28D'), cp('HOM-L01-3-7D', { test_age_days: 7 })]
    expect(lotOf(list, list[0]).map((s) => s.id)).toEqual(['HOM-L01-1-28D', 'HOM-L01-2-28D'])
  })
})

describe('próximo CP depois de selar', () => {
  it('vai primeiro pro outro exemplar do lote', () => {
    const list = [cp('HOM-L01-1-28D', { status: 'RUPTURED_APPROVED' }), cp('HOM-L01-2-28D'), cp('HOM-L02-1-28D')]
    expect(nextPending(list, 'HOM-L01-1-28D', TODAY)?.id).toBe('HOM-L01-2-28D')
  })

  it('com o par rompido, segue a ordem da fila', () => {
    const list = [
      cp('HOM-L01-1-28D', { status: 'RUPTURED_APPROVED' }),
      cp('HOM-L01-2-28D', { status: 'RUPTURED_APPROVED' }),
      cp('HOM-L02-1-28D'),
      cp('HOM-L02-2-28D')
    ]
    expect(nextPending(list, 'HOM-L01-2-28D', TODAY)?.id).toBe('HOM-L02-1-28D')
  })

  it('não pula de hoje pros atrasados', () => {
    const list = [cp('HOM-L01-1-28D', { status: 'RUPTURED_APPROVED' }), cp('HOM-L09-1-28D', { due_date: '2026-09-20' })]
    expect(nextPending(list, 'HOM-L01-1-28D', TODAY)).toBeNull()
  })

  it('volta pro começo da fila quando o selado era o último', () => {
    const list = [cp('HOM-L01-1-28D'), cp('HOM-L02-1-28D', { status: 'RUPTURED_REPROVED' })]
    expect(nextPending(list, 'HOM-L02-1-28D', TODAY)?.id).toBe('HOM-L01-1-28D')
  })
})

describe('busca por etiqueta', () => {
  it('ignora traço, espaço e caixa', () => {
    expect(normCode('hom l056 4')).toBe(normCode('HOM-L056-4'))
  })
})
