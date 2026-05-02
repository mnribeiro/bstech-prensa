import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  Specimen,
  Operator,
  LabEquipment,
  SealRupturePayload,
  SealRuptureResponse
} from '@shared/types'
import { DEMO_SPECIMENS, DEMO_OPERATORS, DEMO_EQUIPMENTS } from './demo-data'

// Demo mode: liga em dev por padrao (sem auth no Supabase). Em prod, vai pelo fluxo real.
const DEMO_MODE = import.meta.env.DEV

let _client: SupabaseClient | null = null

export async function getClient(): Promise<SupabaseClient> {
  if (_client) return _client
  const cfg = await window.bstech.app.getConfig()
  if (!cfg.supabase_url || !cfg.supabase_anon_key) {
    throw new Error('Supabase nao configurado. Edite a config do app.')
  }
  _client = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
    auth: { persistSession: true, autoRefreshToken: true }
  })
  return _client
}

export async function getClientId(): Promise<string> {
  const cfg = await window.bstech.app.getConfig()
  return cfg.client_id
}

// Carrega CPs prontos pra ruptura (status MOLDED + due_date <= hoje + alguns dias)
export async function fetchPendingSpecimens(): Promise<Specimen[]> {
  if (DEMO_MODE) return DEMO_SPECIMENS
  const sb = await getClient()
  const { data, error } = await sb
    .from('specimens')
    .select(
      `
      id, specimen_code, status, test_age_days, due_date,
      specimen_diameter_mm, specimen_height_mm, weight_kg,
      height_diameter_ratio, correction_factor,
      project_id, batch_id,
      applied_load_ton, calculated_fck_mpa, corrected_fck_mpa, rupture_type, ruptured_at,
      projects!inner(name),
      concrete_batches!inner(batch_code, structures!inner(global_concrete_specs(fck_mpa)))
    `
    )
    .eq('status', 'MOLDED')
    .order('due_date', { ascending: true })
    .limit(100)

  if (error) throw error

  return (data ?? []).map((row: any) => ({
    id: row.id,
    specimen_code: row.specimen_code,
    status: row.status,
    test_age_days: row.test_age_days,
    due_date: row.due_date,
    specimen_diameter_mm: Number(row.specimen_diameter_mm),
    specimen_height_mm: row.specimen_height_mm ? Number(row.specimen_height_mm) : null,
    weight_kg: row.weight_kg ? Number(row.weight_kg) : null,
    height_diameter_ratio: row.height_diameter_ratio ? Number(row.height_diameter_ratio) : null,
    correction_factor: row.correction_factor ? Number(row.correction_factor) : null,
    project_id: row.project_id,
    batch_id: row.batch_id,
    project_name: row.projects?.name ?? '—',
    batch_code: row.concrete_batches?.batch_code ?? '—',
    fck_spec_mpa:
      row.concrete_batches?.structures?.global_concrete_specs?.fck_mpa ?? null,
    applied_load_ton: row.applied_load_ton ? Number(row.applied_load_ton) : null,
    calculated_fck_mpa: row.calculated_fck_mpa ? Number(row.calculated_fck_mpa) : null,
    corrected_fck_mpa: row.corrected_fck_mpa ? Number(row.corrected_fck_mpa) : null,
    rupture_type: row.rupture_type ?? null,
    ruptured_at: row.ruptured_at ?? null
  }))
}

export async function fetchRuptureOperators(): Promise<Operator[]> {
  if (DEMO_MODE) return DEMO_OPERATORS
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .from('operators')
    .select('id, name, role, client_id')
    .eq('role', 'rupture')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchPressEquipment(): Promise<LabEquipment[]> {
  if (DEMO_MODE) return DEMO_EQUIPMENTS
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .from('lab_equipment')
    .select(
      'id, name, manufacturer, model, serial_number, capacity_kn, machine_class, certificate_id, calibration_due_date'
    )
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function sealRupture(payload: SealRupturePayload): Promise<SealRuptureResponse> {
  if (DEMO_MODE) {
    // Simula RPC sem mexer no banco — pra ver UX completo no dev
    await new Promise((r) => setTimeout(r, 800))
    return {
      success: true,
      specimen_id: payload.specimen_id,
      rupture_reading_id: 'demo-' + Date.now(),
      peak_load_kgf: payload.peak_load_kgf,
      peak_load_ton: payload.peak_load_kgf / 1000,
      calculated_fck_mpa: 0,
      reading_count: payload.readings.length,
      hash_sha256: 'demo-hash',
      sealed_at: new Date().toISOString(),
      status: payload.status_override ?? 'RUPTURED_APPROVED'
    }
  }
  const sb = await getClient()
  const { data, error } = await sb.rpc('seal_rupture', {
    p_specimen_id: payload.specimen_id,
    p_equipment_id: payload.equipment_id,
    p_operator_id: payload.operator_id,
    p_peak_load_kgf: payload.peak_load_kgf,
    p_rupture_type: payload.rupture_type,
    p_observations: payload.observations ?? null,
    p_photo_path: payload.photo_path ?? null,
    p_readings: payload.readings,
    p_session_started_at: payload.session_started_at,
    p_status_override: payload.status_override ?? null
  })
  if (error) throw error
  return data as SealRuptureResponse
}
