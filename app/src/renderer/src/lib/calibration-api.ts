import { getClient, getClientId } from './supabase'
import type { Calibration } from '@shared/types'

export async function saveCalibration(cal: Calibration): Promise<string> {
  const sb = await getClient()
  const clientId = await getClientId()

  const { data: header, error: e1 } = await sb
    .schema('calibration')
    .from('calibrations')
    .insert({
      client_id: clientId,
      equipment_id: cal.equipment_id,
      numero: cal.numero,
      identificacao: cal.identificacao,
      equipamento_nome: cal.equipamento_nome,
      carga_digital_ton: cal.carga_digital_ton,
      transdutor_marca: cal.transdutor_marca,
      escala_min_kgf: cal.escala_min_kgf,
      escala_max_kgf: cal.escala_max_kgf,
      validade: cal.validade,
      temperatura_celsius: cal.temperatura_celsius,
      calibrado_por: cal.calibrado_por,
      observacoes: cal.observacoes,
      pdf_path: cal.pdf_path
    })
    .select('id')
    .single()
  if (e1) throw e1

  const calibrationId = (header as any).id as string

  const points = cal.points.map((p) => ({
    calibration_id: calibrationId,
    ordem: p.ordem,
    carga_real_kgf: p.carga_real_kgf,
    leitura_1_kgf: p.leitura_1_kgf,
    leitura_2_kgf: p.leitura_2_kgf,
    leitura_3_kgf: p.leitura_3_kgf,
    media_kgf: p.media_kgf,
    desvio_padrao: p.desvio_padrao,
    erro_exatidao_pct: p.erro_exatidao_pct,
    repetitividade_pct: p.repetitividade_pct
  }))

  const { error: e2 } = await sb.schema('calibration').from('calibration_points').insert(points)
  if (e2) throw e2

  return calibrationId
}

export async function listCalibrations(): Promise<Calibration[]> {
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .schema('calibration')
    .from('calibrations')
    .select('*, calibration_points(*)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    points: (row.calibration_points ?? []).sort((a: any, b: any) => a.ordem - b.ordem)
  }))
}

export async function nextCalibrationNumber(): Promise<string> {
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .schema('calibration')
    .from('calibrations')
    .select('numero')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data?.length) return 'FRE-988'
  const m = /FRE-(\d+)/.exec((data[0] as any).numero)
  if (!m) return 'FRE-988'
  return `FRE-${parseInt(m[1], 10) + 1}`
}
