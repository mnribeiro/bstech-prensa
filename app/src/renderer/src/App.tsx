import { useCallback, useEffect, useRef, useState } from 'react'
import { SessionProvider, useSession } from './store/session'
import { OperatorBar } from './components/OperatorBar'
import { Sidebar, type AppMode } from './components/Sidebar'
import { CPStage } from './components/CPStage'
import { InfoPanel } from './components/InfoPanel'
import { RuptureModal } from './components/RuptureModal'
import { CalibrationView } from './components/CalibrationView'
import {
  fetchPendingSpecimens,
  fetchRuptureOperators,
  fetchPressEquipment
} from './lib/supabase'

function Inner() {
  const { state, dispatch } = useSession()
  const ruptureTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [appMode, setAppMode] = useState<AppMode>('rupture')

  // ---- Bootstrap: carrega cadastros + conecta prensa ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [specs, ops, eqs] = await Promise.all([
          fetchPendingSpecimens(),
          fetchRuptureOperators(),
          fetchPressEquipment()
        ])
        if (cancelled) return
        dispatch({ type: 'set_specimens', specimens: specs })
        dispatch({ type: 'set_operators', operators: ops })
        dispatch({ type: 'set_equipments', equipments: eqs })
      } catch (err) {
        console.error('[bootstrap]', err)
        dispatch({
          type: 'toast',
          message: err instanceof Error ? err.message : String(err)
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dispatch])

  // Conecta prensa automaticamente (mock ou primeira porta disponivel)
  useEffect(() => {
    ;(async () => {
      try {
        const cfg = await window.bstech.press.getConfig()
        const ports = await window.bstech.press.listPorts()
        const port = ports.find((p) => p.path === cfg.port)?.path ?? ports[0]?.path
        if (port) {
          const r = await window.bstech.press.connect(port)
          if (!r.ok && r.error) console.warn('[press connect]', r.error)
        }
      } catch (err) {
        console.error('[press init]', err)
      }
    })()
  }, [])

  // ---- IPC subscribers ----
  useEffect(() => {
    const offState = window.bstech.press.onState((s) => dispatch({ type: 'press_state', state: s }))
    const offReading = window.bstech.press.onReading((r) =>
      dispatch({ type: 'press_reading', reading: r })
    )
    const offRupture = window.bstech.press.onRupture(() => {
      dispatch({ type: 'press_rupture' })
      // Modal abre 1.6s depois pra UX (igual ao simulator)
      if (ruptureTimeoutRef.current) clearTimeout(ruptureTimeoutRef.current)
      ruptureTimeoutRef.current = setTimeout(() => {
        dispatch({ type: 'open_modal' })
      }, 1600)
    })
    return () => {
      offState()
      offReading()
      offRupture()
      if (ruptureTimeoutRef.current) clearTimeout(ruptureTimeoutRef.current)
    }
  }, [dispatch])

  // ---- Acoes ----
  const handleStart = useCallback(async () => {
    const r = await window.bstech.press.startSession()
    if (r.ok) dispatch({ type: 'phase', phase: 'loading' })
    else dispatch({ type: 'toast', message: r.error ?? 'Falha ao iniciar' })
  }, [dispatch])

  const handleStop = useCallback(async () => {
    await window.bstech.press.stopSession()
    dispatch({ type: 'phase', phase: 'idle' })
  }, [dispatch])

  const handleReset = useCallback(async () => {
    await window.bstech.press.reset()
    dispatch({ type: 'reset_session' })
  }, [dispatch])

  const handleSealed = useCallback(
    async (specimenId: string) => {
      await window.bstech.press.reset()
      dispatch({ type: 'specimen_sealed', specimenId })
      // Recarrega fila
      try {
        const specs = await fetchPendingSpecimens()
        dispatch({ type: 'set_specimens', specimens: specs })
      } catch {
        // ignore
      }
    },
    [dispatch]
  )

  return (
    <div className="h-full flex flex-col">
      <OperatorBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar appMode={appMode} onModeChange={setAppMode} />
        {appMode === 'calibration' ? (
          <CalibrationView />
        ) : (
          <>
            <CPStage />
            <InfoPanel onStart={handleStart} onStop={handleStop} onReset={handleReset} />
          </>
        )}
      </div>
      {appMode === 'rupture' && (
        <RuptureModal
          onSealed={handleSealed}
          onError={(msg) => dispatch({ type: 'toast', message: msg })}
        />
      )}
      {state.toast && (
        <div className="fixed bottom-4 right-4 bg-bs-danger/90 text-white px-4 py-2 rounded-md shadow-lg max-w-sm">
          <div className="flex items-start gap-3">
            <span className="text-sm">{state.toast}</span>
            <button
              onClick={() => dispatch({ type: 'toast', message: null })}
              className="text-white/70 hover:text-white text-xs"
            >
              fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function App() {
  return (
    <SessionProvider>
      <Inner />
    </SessionProvider>
  )
}
