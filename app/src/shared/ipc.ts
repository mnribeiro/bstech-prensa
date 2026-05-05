// Canais IPC entre main e renderer.
// Centralizar aqui evita typo e da type-safety pra todo o app.

export const IPC = {
  // Modbus
  PRESS_CONNECT: 'press:connect',
  PRESS_DISCONNECT: 'press:disconnect',
  PRESS_LIST_PORTS: 'press:list-ports',
  PRESS_GET_CONFIG: 'press:get-config',
  PRESS_SET_CONFIG: 'press:set-config',
  PRESS_START_SESSION: 'press:start-session',
  PRESS_STOP_SESSION: 'press:stop-session',
  PRESS_RESET: 'press:reset',
  // Eventos broadcast (main -> renderer)
  PRESS_READING: 'press:reading', // PressReading individual
  PRESS_STATE: 'press:state', // PressLiveState snapshot
  PRESS_RUPTURE: 'press:rupture', // dispara quando ruptura detectada

  // Config app
  APP_GET_CONFIG: 'app:get-config',
  APP_SET_CONFIG: 'app:set-config',

  // Logs locais (SQLite futuro)
  LOG_SAVE_SESSION: 'log:save-session',
  LOG_LIST_PENDING: 'log:list-pending',

  // Calibração
  CALIBRATION_CAPTURE: 'calibration:capture',
  CALIBRATION_GENERATE_PDF: 'calibration:generate-pdf'
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]

// API exposta pelo preload para o renderer
export interface ElectronAPI {
  press: {
    listPorts: () => Promise<Array<{ path: string; manufacturer?: string }>>
    connect: (port: string) => Promise<{ ok: boolean; error?: string }>
    disconnect: () => Promise<void>
    getConfig: () => Promise<import('./types').PressConfig>
    setConfig: (cfg: Partial<import('./types').PressConfig>) => Promise<void>
    startSession: () => Promise<{ ok: boolean; error?: string }>
    stopSession: () => Promise<void>
    reset: () => Promise<void>
    onReading: (cb: (r: import('./types').PressReading) => void) => () => void
    onState: (cb: (s: import('./types').PressLiveState) => void) => () => void
    onRupture: (cb: () => void) => () => void
  }
  app: {
    getConfig: () => Promise<{ supabase_url: string; supabase_anon_key: string; client_id: string }>
    setConfig: (
      cfg: Partial<{ supabase_url: string; supabase_anon_key: string; client_id: string }>
    ) => Promise<void>
  }
  calibration: {
    capture: (
      durationMs?: number
    ) => Promise<{ media_kgf: number; samples: number[]; duration_ms: number }>
    generatePdf: (
      calibration: import('./types').Calibration
    ) => Promise<{ ok: boolean; path?: string; error?: string }>
  }
}
