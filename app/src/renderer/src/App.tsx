import { useCallback, useEffect, useRef, useState } from 'react'
import { SessionProvider, useSession } from './store/session'
import { OperatorBar } from './components/OperatorBar'
import { Sidebar, type AppMode } from './components/Sidebar'
import { CPStage } from './components/CPStage'
import { InfoPanel } from './components/InfoPanel'
import { RuptureModal } from './components/RuptureModal'
import { CalibrationView } from './components/CalibrationView'
import { LoginScreen } from './components/LoginScreen'
import { DemoControlBar } from './components/DemoControlBar'
import {
  fetchPendingSpecimens,
  fetchRuptureOperators,
  fetchPressEquipment
} from './lib/supabase'
import { getClient } from './lib/supabase'
import { errorMessage } from './lib/error-message'
import { runDemoSimulation, type DemoHandle } from './lib/demo-runner'

function Inner() {
  const { state, dispatch } = useSession()
  const ruptureTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const demoHandleRef = useRef<DemoHandle | null>(null)
  // Em modo demo a fonte de verdade é a simulação; o driver real (mock no dev)
  // fica em idle polling mandando peak=0 via IPC e zeraria a carga. Ref pra os
  // subscribers do IPC saberem que devem ignorar enquanto o demo está ligado.
  const demoModeRef = useRef(state.demoMode)
  useEffect(() => {
    demoModeRef.current = state.demoMode
  }, [state.demoMode])
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
        dispatch({ type: 'toast', message: errorMessage(err) })
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
    const offState = window.bstech.press.onState((s) => {
      if (demoModeRef.current) return // demo controla o estado da prensa
      dispatch({ type: 'press_state', state: s })
    })
    const offReading = window.bstech.press.onReading((r) => {
      if (demoModeRef.current) return
      dispatch({ type: 'press_reading', reading: r })
    })
    const offRupture = window.bstech.press.onRupture(() => {
      if (demoModeRef.current) return
      dispatch({ type: 'press_rupture' })
      // Modal abre 1.6s depois pra UX (igual ao simulator)
      if (ruptureTimeoutRef.current) clearTimeout(ruptureTimeoutRef.current)
      ruptureTimeoutRef.current = setTimeout(() => {
        dispatch({ type: 'open_modal' })
      }, 3500)
    })
    return () => {
      offState()
      offReading()
      offRupture()
      if (ruptureTimeoutRef.current) clearTimeout(ruptureTimeoutRef.current)
    }
  }, [dispatch])

  // ---- Modo demo ----
  // Quando liga o demo, ja deixa operador + prensa preenchidos (no demo nao se escolhe).
  useEffect(() => {
    if (!state.demoMode) return
    if (!state.currentOperatorId && state.operators[0]) {
      dispatch({ type: 'select_operator', id: state.operators[0].id })
    }
    if (!state.currentEquipmentId && state.equipments[0]) {
      dispatch({ type: 'select_equipment', id: state.equipments[0].id })
    }
  }, [
    state.demoMode,
    state.operators,
    state.equipments,
    state.currentOperatorId,
    state.currentEquipmentId,
    dispatch
  ])

  // Liga o demo: marca a prensa como "conectada (demo)" pra UI nao mostrar
  // desconectada. Desliga: para a simulacao e restaura o estado REAL do driver
  // (senao a UI fica presa em "conectada DEMO").
  useEffect(() => {
    if (state.demoMode) {
      dispatch({
        type: 'press_state',
        state: {
          connected: true,
          port: 'DEMO',
          current_kgf: 0,
          peak_kgf: 0,
          peak_at_ms: null,
          reading_count: 0,
          session_started_at: null,
          rupture_detected: false,
          rupture_at: null
        }
      })
      return
    }
    // Demo desligado: encerra qualquer simulacao em curso, limpa a sessao e
    // volta pro estado real da prensa (conectada ou nao).
    demoHandleRef.current?.stop()
    dispatch({ type: 'reset_session' })
    let cancelled = false
    ;(async () => {
      try {
        const real = await window.bstech.press.getState()
        if (!cancelled && real) dispatch({ type: 'press_state', state: real })
      } catch (err) {
        console.error('[demo off] getState', err)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.demoMode, dispatch])

  // Limpa a simulacao se o componente sair
  useEffect(() => () => demoHandleRef.current?.stop(), [])

  const handleStartDemo = useCallback(() => {
    const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId)
    if (!sp) {
      dispatch({ type: 'toast', message: 'Selecione um CP na fila antes de simular.' })
      return
    }
    demoHandleRef.current?.stop()
    dispatch({ type: 'reset_session' })
    dispatch({ type: 'phase', phase: 'loading' })
    demoHandleRef.current = runDemoSimulation(sp, state.demoOutcome, {
      reading: (r) => dispatch({ type: 'press_reading', reading: r }),
      state: (s) => dispatch({ type: 'press_state', state: s }),
      rupture: () => dispatch({ type: 'press_rupture' }),
      openModal: () => dispatch({ type: 'open_modal' })
    })
  }, [state.specimens, state.selectedSpecimenId, state.demoOutcome, dispatch])

  // ---- Acoes ----
  const handleStart = useCallback(async () => {
    const r = await window.bstech.press.startSession()
    if (r.ok) dispatch({ type: 'phase', phase: 'loading' })
    else dispatch({ type: 'toast', message: r.error ?? 'Falha ao iniciar' })
  }, [dispatch])

  const handleStop = useCallback(async () => {
    demoHandleRef.current?.stop()
    await window.bstech.press.stopSession()
    dispatch({ type: 'phase', phase: 'idle' })
  }, [dispatch])

  const handleReset = useCallback(async () => {
    demoHandleRef.current?.stop()
    await window.bstech.press.reset()
    dispatch({ type: 'reset_session' })
  }, [dispatch])

  const handleSealed = useCallback(
    async (specimenId: string) => {
      demoHandleRef.current?.stop()
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
      {appMode === 'rupture' && state.demoMode && <DemoControlBar onStart={handleStartDemo} />}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar appMode={appMode} onModeChange={setAppMode} />
        {appMode === 'calibration' ? (
          <CalibrationView />
        ) : (
          <>
            <CPStage />
            <InfoPanel
              onStart={handleStart}
              onStop={handleStop}
              onReset={handleReset}
              demoMode={state.demoMode}
            />
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

function AuthGate() {
  const [authState, setAuthState] = useState<'loading' | 'logged-in' | 'logged-out'>('loading')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sb = await getClient()
        const { data } = await sb.auth.getSession()
        if (!mounted) return
        setAuthState(data.session ? 'logged-in' : 'logged-out')
        setUserEmail(data.session?.user?.email ?? null)

        const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
          if (!mounted) return
          setAuthState(session ? 'logged-in' : 'logged-out')
          setUserEmail(session?.user?.email ?? null)
        })
        return () => sub.subscription.unsubscribe()
      } catch {
        if (mounted) setAuthState('logged-out')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (authState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-bs-bg text-bs-text-mute text-sm">
        Carregando...
      </div>
    )
  }
  if (authState === 'logged-out') {
    return <LoginScreen onLogged={() => setAuthState('logged-in')} />
  }
  return (
    <SessionProvider demoEmail={userEmail}>
      <Inner />
    </SessionProvider>
  )
}

export function App() {
  return <AuthGate />
}
