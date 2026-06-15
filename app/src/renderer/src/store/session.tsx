// Store leve com useReducer + Context. Suficiente pra esse app sem trazer zustand.
import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type { Specimen, Operator, LabEquipment, PressLiveState, PressReading } from '@shared/types'

export type Phase = 'idle' | 'loading' | 'ruptured' | 'sealed'

// Modo demo: simula a prensa pra apresentar a BStech sem hardware conectado.
// Só fica disponível pra estas contas (gate por email do login).
export const DEMO_EMAILS = ['test2@gmail.com']
export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_EMAILS.includes(email.toLowerCase())
}
export type DemoOutcome = 'approve' | 'reprove'

export interface SessionState {
  // Cadastros carregados
  specimens: Specimen[]
  operators: Operator[]
  equipments: LabEquipment[]
  // Selecao do operador (escolhe no inicio do turno)
  currentOperatorId: string | null
  currentEquipmentId: string | null
  // Specimen ativo no centro do palco
  selectedSpecimenId: string | null
  // Estado da prensa
  press: PressLiveState
  readings: PressReading[]
  phase: Phase
  // Modal pos-ruptura
  modalOpen: boolean
  // Erros transitorios
  toast: string | null
  // Modo demo (apresentacao sem hardware)
  demoEmail: string | null
  demoMode: boolean
  demoOutcome: DemoOutcome
}

const initialState: SessionState = {
  specimens: [],
  operators: [],
  equipments: [],
  currentOperatorId: null,
  currentEquipmentId: null,
  selectedSpecimenId: null,
  press: {
    connected: false,
    port: null,
    current_kgf: 0,
    peak_kgf: 0,
    peak_at_ms: null,
    reading_count: 0,
    session_started_at: null,
    rupture_detected: false,
    rupture_at: null
  },
  readings: [],
  phase: 'idle',
  modalOpen: false,
  toast: null,
  demoEmail: null,
  demoMode: false,
  demoOutcome: 'approve'
}

type Action =
  | { type: 'set_specimens'; specimens: Specimen[] }
  | { type: 'set_operators'; operators: Operator[] }
  | { type: 'set_equipments'; equipments: LabEquipment[] }
  | { type: 'select_operator'; id: string | null }
  | { type: 'select_equipment'; id: string | null }
  | { type: 'select_specimen'; id: string | null }
  | { type: 'press_state'; state: PressLiveState }
  | { type: 'press_reading'; reading: PressReading }
  | { type: 'press_rupture' }
  | { type: 'phase'; phase: Phase }
  | { type: 'reset_session' }
  | { type: 'open_modal' }
  | { type: 'close_modal' }
  | { type: 'specimen_sealed'; specimenId: string }
  | { type: 'toast'; message: string | null }
  | { type: 'set_demo_mode'; on: boolean }
  | { type: 'set_demo_outcome'; outcome: DemoOutcome }

// Zera a medição da prensa (carga, pico, tempo, leituras) mantendo conexão/porta.
// Usado ao trocar de CP, resetar ou selar pra não ficar resíduo do ensaio anterior.
function clearedPress(p: PressLiveState): PressLiveState {
  return {
    ...p,
    current_kgf: 0,
    peak_kgf: 0,
    peak_at_ms: null,
    reading_count: 0,
    session_started_at: null,
    rupture_detected: false,
    rupture_at: null
  }
}

function reducer(state: SessionState, a: Action): SessionState {
  switch (a.type) {
    case 'set_specimens':
      return { ...state, specimens: a.specimens }
    case 'set_operators':
      return { ...state, operators: a.operators }
    case 'set_equipments':
      return { ...state, equipments: a.equipments }
    case 'select_operator':
      return { ...state, currentOperatorId: a.id }
    case 'select_equipment':
      return { ...state, currentEquipmentId: a.id }
    case 'select_specimen':
      // Troca de CP limpa a medição da prensa pra não herdar o ensaio anterior
      return {
        ...state,
        selectedSpecimenId: a.id,
        readings: [],
        phase: 'idle',
        modalOpen: false,
        press: clearedPress(state.press)
      }
    case 'press_state':
      return { ...state, press: a.state }
    case 'press_reading':
      return { ...state, readings: [...state.readings, a.reading] }
    case 'press_rupture':
      return { ...state, phase: 'ruptured' }
    case 'phase':
      return { ...state, phase: a.phase }
    case 'reset_session':
      return {
        ...state,
        readings: [],
        phase: 'idle',
        modalOpen: false,
        press: clearedPress(state.press)
      }
    case 'open_modal':
      return { ...state, modalOpen: true }
    case 'close_modal':
      return { ...state, modalOpen: false }
    case 'specimen_sealed':
      return {
        ...state,
        specimens: state.specimens.filter((s) => s.id !== a.specimenId),
        selectedSpecimenId: null,
        readings: [],
        phase: 'idle',
        modalOpen: false,
        press: clearedPress(state.press)
      }
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
  demoEmail = null
}: {
  children: ReactNode
  demoEmail?: string | null
}) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, demoEmail })
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession fora do SessionProvider')
  return v
}
