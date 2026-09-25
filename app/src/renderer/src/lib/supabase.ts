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

// Fila do dia numa chamada so (funcao prensa_fila no banco): tudo que vence hoje
// ou ja venceu e ainda nao rompeu, mais o que foi rompido hoje (progresso e par do
// lote), e a contagem dos proximos dias. A permissao e resolvida por obra no banco;
// ler specimens direto avaliava a permissao CP por CP e estourava o tempo limite.
export async function fetchQueue(): Promise<{ specimens: Specimen[]; upcoming: { date: string; count: number }[] }> {
  const sb = await getClient()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const { data, error } = await sb.rpc('prensa_fila', {
    p_hoje: localIsoDate(),
    p_inicio_dia: startOfToday.toISOString(),
    p_dias_proximos: 3
  })
  if (error) throw error
  const fila = (data?.fila ?? []) as Record<string, unknown>[]
  return { specimens: fila.map(mapSpecimen), upcoming: data?.proximos ?? [] }
}

const num = (v: unknown): number | null => (v == null ? null : Number(v))

function mapSpecimen(row: any): Specimen {
  return {
    id: row.id,
    specimen_code: row.specimen_code,
    status: row.status,
    test_age_days: row.test_age_days,
    due_date: row.due_date,
    specimen_diameter_mm: Number(row.specimen_diameter_mm),
    specimen_height_mm: num(row.specimen_height_mm),
    weight_kg: num(row.weight_kg),
    height_diameter_ratio: num(row.height_diameter_ratio),
    correction_factor: num(row.correction_factor),
    project_id: row.project_id,
    batch_id: row.batch_id,
    project_name: row.project_name || 'n/d',
    batch_code: row.batch_code ?? 'n/d',
    fck_spec_mpa: num(row.fck_spec_mpa),
    structure_name: row.structure_name ?? null,
    structure_type: row.structure_type ?? null,
    supplier_name: row.supplier_name ?? null,
    molder_name: row.molder_name ?? null,
    molding_date: row.molding_date ?? null,
    applied_load_ton: num(row.applied_load_ton),
    calculated_fck_mpa: num(row.calculated_fck_mpa),
    corrected_fck_mpa: num(row.corrected_fck_mpa),
    rupture_type: row.rupture_type ?? null,
    ruptured_at: row.ruptured_at ?? null,
    rupture_operator_name: row.rupture_operator_name ?? null
  }
}

// Operador de ruptura ligado ao login (operators.user_id). Cada operador entra
// com o proprio acesso; sem esse vinculo a ruptura sairia sem o nome de quem rompeu.
// Quem pode romper nesta sessao, pelo perfil do login:
// - login de operador (perfil laboratorio): so ele mesmo, se tiver a funcao ruptura
// - dono, engenheiro e gestor: escolhem entre os operadores de ruptura do laboratorio
// O laboratorio liga login e funcao em Cadastros > Operadores na BSTECH web.
export type Access =
  | { kind: 'operator'; operator: Operator }
  | { kind: 'chooser'; operators: Operator[]; own: Operator | null }
  | { kind: 'blocked'; reason: 'sem_ruptura' | 'sem_operador' | 'lista_vazia' | 'perfil' }

const CHOOSER_ROLES = ['client', 'engineer', 'unit_manager', 'admin']
const OPERATOR_COLS = 'id, name, role, client_id, can_mold, can_rupture, active'

export async function resolveAccess(userId: string): Promise<Access> {
  const sb = await getClient()
  const [{ data: profile, error: pErr }, { data: mine, error: oErr }] = await Promise.all([
    sb.from('user_profiles').select('user_role, role, client_id').eq('id', userId).maybeSingle(),
    sb.from('operators').select(OPERATOR_COLS).eq('user_id', userId).limit(1)
  ])
  if (pErr) throw pErr
  if (oErr) throw oErr
  const own = (mine?.[0] as (Operator & { active: boolean | null }) | undefined) ?? null
  const ownActive = !!own && own.active !== false
  const role = profile?.user_role ?? profile?.role ?? null

  if (role && CHOOSER_ROLES.includes(role) && profile?.client_id) {
    const { data, error } = await sb
      .from('operators')
      .select(OPERATOR_COLS)
      .eq('client_id', profile.client_id)
      .eq('can_rupture', true)
      .order('name')
    if (error) throw error
    const operators = (data ?? []).filter((o) => o.active !== false) as Operator[]
    if (!operators.length) return { kind: 'blocked', reason: 'lista_vazia' }
    const ownRupture = own && ownActive && own.can_rupture ? operators.find((o) => o.id === own.id) ?? null : null
    return { kind: 'chooser', operators, own: ownRupture }
  }
  if (own && ownActive) {
    return own.can_rupture ? { kind: 'operator', operator: own } : { kind: 'blocked', reason: 'sem_ruptura' }
  }
  if (role === 'laboratory') return { kind: 'blocked', reason: 'sem_operador' }
  return { kind: 'blocked', reason: 'perfil' }
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
