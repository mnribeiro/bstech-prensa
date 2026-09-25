// Store leve com useReducer + Context. Suficiente pra esse app sem trazer zustand.
import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type {
  Specimen,
  Operator,
  LabEquipment,
  PressLiveState,
  PressReading,
  RuptureType
} from '@shared/types'
import type { QueueTab } from '../lib/queue'

export type Phase = 'idle' | 'loading' | 'ruptured'

// Modo demo: simula a prensa pra apresentar a BStech sem hardware conectado.
// Só fica disponível pra estas contas (gate por email do login).
export const DEMO_EMAILS = ['test2@gmail.com']
export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_EMAILS.includes(email.toLowerCase())
}
export type DemoOutcome = 'approve' | 'reprove'

export interface SealedToast {
  code: string
  mpa: number
  hash: string
}

export interface SessionState {
  // Quem esta na prensa (vem do login) e a prensa deste computador (vem da config)
  operator: Operator | null
  equipments: LabEquipment[]
  equipmentId: string | null
  // Fila do dia
  specimens: Specimen[]
  upcoming: { date: string; count: number }[]
  queueLoaded: boolean
  tab: QueueTab
  query: string
  queueCollapsed: boolean
  // CP na bancada
  selectedSpecimenId: string | null
  press: PressLiveState
  readings: PressReading[]
  phase: Phase
  ruptureType: RuptureType | null
  sealing: boolean
  sealError: string | null
  // Curvas dos CPs ja rompidos (desenho tracejado do outro exemplar)
  curves: Record<string, PressReading[]>
  // Avisos
  sealedToast: SealedToast | null
  toast: string | null
  // Modo demo (apresentacao sem hardware)
  demoEmail: string | null
  demoMode: boolean
  demoOutcome: DemoOutcome
}

const emptyPress: PressLiveState = {
  connected: false,
  port: null,
  current_kgf: 0,
  peak_kgf: 0,
  peak_at_ms: null,
  reading_count: 0,
  session_started_at: null,
  rupture_detected: false,
  rupture_at: null
}

const initialState: SessionState = {
  operator: null,
  equipments: [],
  equipmentId: null,
  specimens: [],
  upcoming: [],
  queueLoaded: false,
  tab: 'hoje',
  query: '',
  queueCollapsed: false,
  selectedSpecimenId: null,
  press: emptyPress,
  readings: [],
  phase: 'idle',
  ruptureType: null,
  sealing: false,
  sealError: null,
  curves: {},
  sealedToast: null,
  toast: null,
  demoEmail: null,
  demoMode: false,
  demoOutcome: 'approve'
}

type Action =
  | { type: 'set_operator'; operator: Operator | null }
  | { type: 'set_equipments'; equipments: LabEquipment[] }
  | { type: 'set_equipment'; id: string | null }
  | { type: 'set_queue'; specimens: Specimen[] }
  | { type: 'set_upcoming'; upcoming: { date: string; count: number }[] }
  | { type: 'set_tab'; tab: QueueTab }
  | { type: 'set_query'; query: string }
  | { type: 'set_queue_collapsed'; on: boolean }
  | { type: 'select_specimen'; id: string | null }
  | { type: 'press_state'; state: PressLiveState }
  | { type: 'press_reading'; reading: PressReading }
  | { type: 'press_rupture' }
  | { type: 'phase'; phase: Phase }
  | { type: 'reset_session' }
  | { type: 'set_rupture_type'; value: RuptureType }
  | { type: 'seal_start' }
  | { type: 'seal_error'; message: string }
  | { type: 'sealed'; specimen: Specimen; curve: PressReading[]; toast: SealedToast; nextId: string | null }
  | { type: 'set_curve'; specimenId: string; curve: PressReading[] }
  | { type: 'clear_sealed_toast' }
  | { type: 'toast'; message: string | null }
  | { type: 'set_demo_mode'; on: boolean }
  | { type: 'set_demo_outcome'; outcome: DemoOutcome }

// Zera a medição da prensa (carga, pico, tempo, leituras) mantendo conexão/porta.
// Usado ao trocar de CP, resetar ou selar pra não ficar resíduo do ensaio anterior.
function clearedPress(p: PressLiveState): PressLiveState {
  return { ...emptyPress, connected: p.connected, port: p.port }
}

const cleanBench = (state: SessionState) => ({
  readings: [] as PressReading[],
  phase: 'idle' as Phase,
  ruptureType: null,
  sealing: false,
  sealError: null,
  press: clearedPress(state.press)
})

function reducer(state: SessionState, a: Action): SessionState {
  switch (a.type) {
    case 'set_operator':
      return { ...state, operator: a.operator }
    case 'set_equipments':
      return { ...state, equipments: a.equipments }
    case 'set_equipment':
      return { ...state, equipmentId: a.id }
    case 'set_queue':
      return { ...state, specimens: a.specimens, queueLoaded: true }
    case 'set_upcoming':
      return { ...state, upcoming: a.upcoming }
    case 'set_tab':
      return { ...state, tab: a.tab }
    case 'set_query':
      return { ...state, query: a.query }
    case 'set_queue_collapsed':
      return { ...state, queueCollapsed: a.on }
    case 'select_specimen':
      // Troca de CP limpa a medição da prensa pra não herdar o ensaio anterior
      return { ...state, selectedSpecimenId: a.id, ...cleanBench(state) }
    case 'press_state':
      return { ...state, press: a.state }
    case 'press_reading':
      return { ...state, readings: [...state.readings, a.reading] }
    case 'press_rupture':
      return { ...state, phase: 'ruptured' }
    case 'phase':
      return { ...state, phase: a.phase }
    case 'reset_session':
      return { ...state, ...cleanBench(state) }
    case 'set_rupture_type':
      return { ...state, ruptureType: a.value }
    case 'seal_start':
      return { ...state, sealing: true, sealError: null }
    case 'seal_error':
      return { ...state, sealing: false, sealError: a.message }
    case 'sealed':
      return {
        ...state,
        specimens: state.specimens.map((s) => (s.id === a.specimen.id ? a.specimen : s)),
        curves: { ...state.curves, [a.specimen.id]: a.curve },
        sealedToast: a.toast,
        selectedSpecimenId: a.nextId ?? a.specimen.id,
        ...cleanBench(state)
      }
    case 'set_curve':
      return { ...state, curves: { ...state.curves, [a.specimenId]: a.curve } }
    case 'clear_sealed_toast':
      return { ...state, sealedToast: null }
    case 'toast':
      return { ...state, toast: a.message }
    case 'set_demo_mode':
      return { ...state, demoMode: a.on }
    case 'set_demo_outcome':
      return { ...state, demoOutcome: a.outcome }
    default:
      return state
  }
}

const Ctx = createContext<{ state: SessionState; dispatch: Dispatch<Action> } | null>(null)

export function SessionProvider({
  children,
  demoEmail = null,
  operator = null
}: {
  children: ReactNode
  demoEmail?: string | null
  operator?: Operator | null
}) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, demoEmail, operator })
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession fora do SessionProvider')
  return v
}
