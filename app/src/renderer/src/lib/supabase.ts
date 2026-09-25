import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  Specimen,
  Operator,
  LabEquipment,
  PressReading,
  SealRupturePayload,
  SealRuptureResponse
} from '@shared/types'
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

// Data local no formato do banco (due_date e DATE, sem fuso)
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const SPECIMEN_SELECT = `
  id, specimen_code, status, test_age_days, due_date,
  specimen_diameter_mm, specimen_height_mm, weight_kg,
  height_diameter_ratio, correction_factor,
  project_id, batch_id,
  applied_load_ton, calculated_fck_mpa, corrected_fck_mpa, rupture_type, ruptured_at,
  specimen_molder:operators!specimens_molding_operator_id_fkey(name),
  rupture_operator:operators!specimens_rupture_operator_id_fkey(name),
  projects!inner(name),
  concrete_batches!inner(
    batch_code,
    molding_date,
    concrete_suppliers(name),
    batch_molder:operators!concrete_batches_molding_operator_id_fkey(name),
    batch_structure_allocations(
      structures(name, structure_type, target_fck_mpa)
    )
  )
`

// Fila do dia: tudo que vence hoje ou ja venceu e ainda nao rompeu, mais o que
// foi rompido hoje (pra mostrar o progresso e o par do lote). O filtro e no
// servidor, por data, entao o CP de hoje nunca fica de fora por limite de linhas.
export async function fetchQueue(): Promise<Specimen[]> {
  const sb = await getClient()
  const today = localIsoDate()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const PAGE = 1000
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('specimens')
      .select(SPECIMEN_SELECT)
      .lte('due_date', today)
      .is('deleted_at', null)
      .or(`status.eq.PENDING,ruptured_at.gte.${startOfToday.toISOString()}`)
      .order('due_date', { ascending: true })
      .order('specimen_code', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows.map(mapSpecimen)
}

// Proximos dias: so a contagem, os CPs entram na fila no dia do vencimento
export async function fetchUpcomingCounts(days = 3): Promise<{ date: string; count: number }[]> {
  const sb = await getClient()
  const out: { date: string; count: number }[] = []
  for (let i = 1; i <= days; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const iso = localIsoDate(d)
    const { count, error } = await sb
      .from('specimens')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING')
      .eq('due_date', iso)
      .is('deleted_at', null)
    if (error) throw error
    out.push({ date: iso, count: count ?? 0 })
  }
  return out
}

function mapSpecimen(row: any): Specimen {
  const batch = row.concrete_batches
  const struct = pickStructure(batch?.batch_structure_allocations)
  return {
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
    project_name: row.projects?.name?.trim() ?? 'n/d',
    batch_code: batch?.batch_code ?? 'n/d',
    fck_spec_mpa: struct?.target_fck_mpa != null ? Number(struct.target_fck_mpa) : null,
    structure_name: struct?.name ?? null,
    structure_type: struct?.structure_type ?? null,
    supplier_name: batch?.concrete_suppliers?.name ?? null,
    molder_name: row.specimen_molder?.name ?? batch?.batch_molder?.name ?? null,
    molding_date: batch?.molding_date ?? null,
    applied_load_ton: row.applied_load_ton ? Number(row.applied_load_ton) : null,
    calculated_fck_mpa: row.calculated_fck_mpa ? Number(row.calculated_fck_mpa) : null,
    corrected_fck_mpa: row.corrected_fck_mpa ? Number(row.corrected_fck_mpa) : null,
    rupture_type: row.rupture_type ?? null,
    ruptured_at: row.ruptured_at ?? null,
    rupture_operator_name: row.rupture_operator?.name ?? null
  }
}

function pickStructure(
  allocations: any
): { name: string; structure_type: string | null; target_fck_mpa: number | null } | null {
  if (!Array.isArray(allocations)) return null
  for (const alloc of allocations) {
    const s = alloc?.structures
    if (s?.name) return s
  }
  return null
}

// Operador de ruptura ligado ao login (operators.user_id). Cada operador entra
// com o proprio acesso; sem esse vinculo a ruptura sairia sem o nome de quem rompeu.
export async function fetchMyOperator(userId: string): Promise<Operator | null> {
  const sb = await getClient()
  const { data, error } = await sb
    .from('operators')
    .select('id, name, role, client_id, can_mold, can_rupture')
    .eq('user_id', userId)
    .eq('can_rupture', true)
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

// So pro modo demo (conta de apresentacao sem operador ligado)
export async function fetchFirstRuptureOperator(): Promise<Operator | null> {
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .from('operators')
    .select('id, name, role, client_id, can_mold, can_rupture')
    .eq('can_rupture', true)
    .eq('client_id', clientId)
    .order('name')
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

export async function fetchPressEquipment(): Promise<LabEquipment[]> {
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

// Curva gravada no selo (pra desenhar o outro exemplar do lote tracejado)
export async function fetchSealedCurve(specimenId: string): Promise<PressReading[] | null> {
  const sb = await getClient()
  const { data, error } = await sb
    .from('rupture_readings')
    .select('readings, sealed_at')
    .eq('specimen_id', specimenId)
    .not('sealed_at', 'is', null)
    .order('sealed_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const r = data?.[0]?.readings
  return Array.isArray(r) ? (r as PressReading[]) : null
}

// BStech specimens.rupture_type usa nomenclatura NBR em inglês (check constraint ck_rupture_type).
// O app trabalha em PT pra UI, traduzimos no envio.
const RUPTURE_TYPE_TO_BSTECH: Record<string, string> = {
  conica: 'cone',
  conica_bipartida: 'split',
  colunar: 'columnar',
  cisalhada: 'shear',
  conica_cisalhada: 'cone_and_shear',
  lateral: 'irregular'
}

export async function sealRupture(payload: SealRupturePayload): Promise<SealRuptureResponse> {
  const sb = await getClient()
  const ruptureTypeBstech = RUPTURE_TYPE_TO_BSTECH[payload.rupture_type] ?? payload.rupture_type
  const { data, error } = await sb.rpc('seal_rupture', {
    p_specimen_id: payload.specimen_id,
    p_equipment_id: payload.equipment_id,
    p_operator_id: payload.operator_id,
    p_peak_load_kgf: payload.peak_load_kgf,
    p_rupture_type: ruptureTypeBstech,
    p_observations: payload.observations ?? null,
    p_photo_path: payload.photo_path ?? null,
    p_readings: payload.readings,
    p_session_started_at: payload.session_started_at,
    p_status_override: payload.status_override ?? null,
    p_diameter_mm: payload.diameter_mm ?? null,
    p_height_mm: payload.height_mm ?? null
  })
  if (error) throw error
  return data as SealRuptureResponse
}
