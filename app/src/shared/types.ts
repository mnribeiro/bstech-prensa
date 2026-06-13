// Tipos compartilhados entre main process, preload e renderer
// Refletem o schema do BStech (specimens, operators, lab_equipment, rupture_readings).

export type SpecimenStatus =
  | 'PENDING'
  | 'MOLDED'
  | 'RUPTURED_APPROVED'
  | 'RUPTURED_REPROVED'

export type RuptureType =
  | 'conica'
  | 'conica_bipartida'
  | 'colunar'
  | 'cisalhada'
  | 'conica_cisalhada'
  | 'lateral'

export const RUPTURE_TYPE_LABELS: Record<RuptureType, string> = {
  conica: 'Conica',
  conica_bipartida: 'Conica e bipartida',
  colunar: 'Colunar',
  cisalhada: 'Cisalhada',
  conica_cisalhada: 'Conica e cisalhada',
  lateral: 'Lateral'
}

// Specimen vindo do BStech (subset relevante pro app de prensa)
export interface Specimen {
  id: string
  specimen_code: string
  status: SpecimenStatus
  test_age_days: number
  due_date: string
  specimen_diameter_mm: number
  specimen_height_mm: number | null
  weight_kg: number | null
  height_diameter_ratio: number | null
  correction_factor: number | null
  // Vinculos
  project_id: string
  batch_id: string
  // Dados do contexto (JOIN)
  project_name: string
  batch_code: string
  fck_spec_mpa: number | null
  structure_name: string | null
  structure_type: string | null
  supplier_name: string | null
  molder_name: string | null
  molding_date: string | null
  // Resultado (preenchido quando rompe)
  applied_load_ton: number | null
  calculated_fck_mpa: number | null
  corrected_fck_mpa: number | null
  rupture_type: string | null
  ruptured_at: string | null
}

export interface Operator {
  id: string
  name: string
  role: 'molding' | 'rupture'
  client_id: string
  can_mold?: boolean
  can_rupture?: boolean
}

export interface LabEquipment {
  id: string
  name: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  capacity_kn: number | null
  machine_class: string | null
  certificate_id: string | null
  calibration_due_date: string | null
}

// Leitura instantanea da prensa (Modbus)
export interface PressReading {
  /** Offset em ms desde o inicio da sessao */
  t: number
  /** Forca medida em kgf (raw da prensa) */
  kgf: number
}

// Snapshot ao vivo do estado da sessao
export interface PressLiveState {
  connected: boolean
  port: string | null
  current_kgf: number
  peak_kgf: number
  peak_at_ms: number | null
  reading_count: number
  session_started_at: number | null
  rupture_detected: boolean
  rupture_at: number | null
}

// Payload final mandado pra RPC seal_rupture
export interface SealRupturePayload {
  specimen_id: string
  equipment_id: string | null
  operator_id: string
  peak_load_kgf: number
  rupture_type: RuptureType
  observations?: string
  photo_path?: string
  readings: PressReading[]
  session_started_at: string // ISO timestamp
  status_override?: SpecimenStatus
}

export interface SealRuptureResponse {
  success: boolean
  specimen_id: string
  rupture_reading_id: string
  peak_load_kgf: number
  peak_load_ton: number
  calculated_fck_mpa: number
  reading_count: number
  hash_sha256: string
  sealed_at: string
  status: SpecimenStatus
}

// Snapshot de leitura pra calibração (lê janela fixa, retorna média + amostras)
export interface CalibrationSnapshot {
  /** Média estabilizada das leituras */
  media_kgf: number
  /** Amostras coletadas durante a janela */
  samples: number[]
  /** Tempo total da captura em ms */
  duration_ms: number
}

export interface CalibrationPoint {
  ordem: number
  carga_real_kgf: number
  leitura_1_kgf: number | null
  leitura_2_kgf: number | null
  leitura_3_kgf: number | null
  media_kgf: number | null
  desvio_padrao: number | null
  erro_exatidao_pct: number | null
  repetitividade_pct: number | null
}

export interface Calibration {
  id?: string
  client_id?: string
  equipment_id: string | null
  numero: string
  identificacao: string | null
  equipamento_nome: string
  carga_digital_ton: number | null
  transdutor_marca: string | null
  escala_min_kgf: number
  escala_max_kgf: number
  validade: string // YYYY-MM-DD
  temperatura_celsius: number | null
  calibrado_por: string | null
  observacoes: string | null
  pdf_path: string | null
  points: CalibrationPoint[]
  created_at?: string
}

/** Pontos default do FRE-987 (kgf) */
export const DEFAULT_CALIBRATION_POINTS_KGF = [10000, 20000, 30000, 50000, 70000, 80000, 90000]

// Configuracao da prensa (carregada do arquivo de config)
export interface PressConfig {
  port: string // COM3, COM4, etc
  baud_rate: number // 9600
  modbus_address: number // 1
  register: number // 0 (do N1500-LC)
  poll_interval_ms: number // 100 (10 Hz)
  // Threshold pra detectar ruptura: queda absoluta entre leituras consecutivas
  rupture_drop_threshold_kgf: number // ex 500
  /** Multiplicador opcional caso o registrador retorne valor escalado */
  value_scale: number // ex 1.0 (raw) ou 0.1
}

// Estado do auto-update (electron-updater).
// idle      → ainda não checou ou checou e não tem update
// checking  → checagem em andamento
// available → versão nova achada, baixando
// ready     → download concluído, basta reiniciar pra aplicar
// error     → falhou em algum passo (mostra mensagem)
// disabled  → modo dev / instância não empacotada (auto-update desligado)
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'ready'
  | 'error'
  | 'disabled'

export interface UpdateState {
  phase: UpdatePhase
  /** Versão atual do app rodando */
  current_version: string
  /** Versão remota encontrada (quando phase >= 'available') */
  remote_version?: string
  /** Bytes baixados (durante 'available') */
  downloaded_bytes?: number
  /** Bytes totais (durante 'available') */
  total_bytes?: number
  /** Mensagem de erro (quando phase = 'error') */
  error?: string
}
