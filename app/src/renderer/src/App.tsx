import { useCallback, useEffect, useRef, useState } from 'react'
import { SessionProvider, useSession, type SessionAccess } from './store/session'
import { TopBar } from './components/TopBar'
import { Queue, QueueRail } from './components/Queue'
import { BenchCenter, BenchSide } from './components/Bench'
import { CalibrationView } from './components/CalibrationView'
import { LoginScreen } from './components/LoginScreen'
import { DemoControlBar } from './components/DemoControlBar'
import {
  getClient,
  fetchQueue,
  fetchPressEquipment,
  resolveAccess,
  type Access,
  fetchSealedCurve,
  sealRupture,
  localIsoDate,
  lerEtiqueta
} from './lib/supabase'
import { createScanDetector } from './lib/scanner'
import { apagarPendente, guardarPendente, lerPendente } from './lib/pendente'
import { useColumnWidths } from './hooks/useColumnWidths'
import { errorMessage } from './lib/error-message'
import { runDemoSimulation, type DemoHandle } from './lib/demo-runner'
import { displayOrder, isDone, lotOf, nextPending, splitPools } from './lib/queue'
import { correctedMpa, peakPoint, fmt } from './lib/rupture'
import { calcFckMpa, correctionFactor } from './lib/format'
import type { LabEquipment, PressLiveState, SealRupturePayload, Specimen } from '@shared/types'

// Prensa do computador guardada tambem aqui, pra entrada mostrar o nome antes do login
const EQUIPMENT_KEY = 'bstech-prensa-equipamento'
function readSavedEquipment(): LabEquipment | null {
  try {
    const raw = localStorage.getItem(EQUIPMENT_KEY)
    return raw ? (JSON.parse(raw) as LabEquipment) : null
  } catch {
    return null
  }
}
function saveEquipment(eq: LabEquipment | null) {
  try {
    if (eq) localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(eq))
  } catch {
    // sem storage a entrada so nao mostra o nome da prensa
  }
}

// Depois da ruptura a leitura continua um pouco pra curva mostrar a queda inteira
const AFTER_RUPTURE_MS = 1500

// Alca entre colunas: arrasta pra redimensionar, duplo clique volta ao padrao
function ColumnHandle({
  style,
  active,
  onPointerDown,
  onDoubleClick
}: {
  style: React.CSSProperties
  active: boolean
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onDoubleClick: () => void
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Arraste pra ajustar a largura (duplo clique volta ao padrão)"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={style}
      className="group absolute inset-y-0 z-20 w-2 cursor-col-resize flex justify-center"
    >
      <span className={`w-[2px] h-full transition-colors ${active ? 'bg-bs-accent' : 'bg-transparent group-hover:bg-bs-accent/50'}`} />
    </div>
  )
}

function Inner() {
  const { state, dispatch } = useSession()
  const cols = useColumnWidths()
  const demoHandleRef = useRef<DemoHandle | null>(null)
  const afterRuptureRef = useRef<NodeJS.Timeout | null>(null)
  const toastRef = useRef<NodeJS.Timeout | null>(null)
  // Em modo demo a fonte de verdade é a simulação; o driver real (mock no dev)
  // fica em idle polling mandando peak=0 via IPC e zeraria a carga. Ref pra os
  // subscribers do IPC saberem que devem ignorar enquanto o demo está ligado.
  const demoModeRef = useRef(state.demoMode)
  useEffect(() => {
    demoModeRef.current = state.demoMode
  }, [state.demoMode])
  const [calibration, setCalibration] = useState(false)

  const today = localIsoDate()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId) ?? null

  const loadQueue = useCallback(async () => {
    const { specimens: specs, upcoming } = await fetchQueue()
    dispatch({ type: 'set_queue', specimens: specs })
    dispatch({ type: 'set_upcoming', upcoming })
    return specs
  }, [dispatch])

  // ---- Bootstrap: fila do dia + prensa deste computador ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [specs, eqs, cfg] = await Promise.all([loadQueue(), fetchPressEquipment(), window.bstech.app.getConfig()])
        if (cancelled) return
        dispatch({ type: 'set_equipments', equipments: eqs })
        let eqId = cfg.equipment_id && eqs.some((e) => e.id === cfg.equipment_id) ? cfg.equipment_id : null
        // Uma prensa so no laboratorio: ja fica configurada sem perguntar
        if (!eqId && eqs.length === 1) {
          eqId = eqs[0].id
          await window.bstech.app.setConfig({ equipment_id: eqId })
        }
        dispatch({ type: 'set_equipment', id: eqId })
        saveEquipment(eqs.find((e) => e.id === eqId) ?? null)
        // Abre no primeiro CP pendente de hoje (ou o atrasado mais recente)
        const { hoje, late } = splitPools(specs, localIsoDate())
        const first =
          displayOrder(hoje, false, localIsoDate()).find((s) => !isDone(s)) ??
          displayOrder(late, true, localIsoDate()).find((s) => !isDone(s))
        if (first) {
          dispatch({ type: 'select_specimen', id: first.id })
          if (!hoje.some((s) => !isDone(s)) && first) dispatch({ type: 'set_tab', tab: 'late' })
        }
      } catch (err) {
        console.error('[bootstrap]', err)
        dispatch({ type: 'toast', message: errorMessage(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dispatch, loadQueue])

  // ---- Curvas gravadas dos CPs ja rompidos (este e o outro exemplar do lote) ----
  useEffect(() => {
    if (!sp) return
    const need = lotOf(state.specimens, sp).filter((x) => isDone(x) && !state.curves[x.id])
    need.forEach(async (x) => {
      try {
        const curve = await fetchSealedCurve(x.id)
        dispatch({ type: 'set_curve', specimenId: x.id, curve: curve ?? [] })
      } catch (err) {
        console.warn('[curva]', err)
        dispatch({ type: 'set_curve', specimenId: x.id, curve: [] })
      }
    })
  }, [sp?.id, state.specimens, state.curves, dispatch])

  // ---- Rompido e ainda nao selado: guarda no computador ate selar ----
  useEffect(() => {
    if (state.demoMode || state.phase !== 'ruptured' || !sp || isDone(sp) || !state.readings.length) return
    guardarPendente(sp.id, {
      readings: state.readings,
      sessionStartedAt: state.press.session_started_at,
      ruptureType: state.ruptureType
    })
  }, [state.demoMode, state.phase, state.readings, state.ruptureType, state.press.session_started_at, sp])

  // Voltou num CP que rompeu e nao selou (troca de CP, app reaberto): traz a curva de volta
  useEffect(() => {
    if (!sp || state.phase !== 'idle' || state.readings.length) return
    if (isDone(sp)) return apagarPendente(sp.id)
    const p = lerPendente(sp.id)
    if (p) dispatch({ type: 'restore_pending', readings: p.readings, sessionStartedAt: p.sessionStartedAt, ruptureType: p.ruptureType })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.id])

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
      if (afterRuptureRef.current) clearTimeout(afterRuptureRef.current)
      afterRuptureRef.current = setTimeout(() => void window.bstech.press.stopSession(), AFTER_RUPTURE_MS)
    })
    return () => {
      offState()
      offReading()
      offRupture()
      if (afterRuptureRef.current) clearTimeout(afterRuptureRef.current)
    }
  }, [dispatch])

  // ---- Modo demo ----
  // Liga: marca a prensa como "conectada (demo)". Desliga: para a simulacao e
  // restaura o estado REAL do driver (senao a UI fica presa em "conectada DEMO").
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

  useEffect(() => () => demoHandleRef.current?.stop(), [])

  // ---- Acoes ----
  const startBlocker = !sp
    ? 'Selecione um CP na fila'
    : !state.equipmentId
      ? 'Escolha a prensa deste computador no topo'
      : !state.press.connected
        ? 'Prensa não conectada'
        : !state.operator
          ? 'Escolha no topo quem vai romper'
          : null

  const handleStart = useCallback(async () => {
    if (!sp || isDone(sp) || startBlocker || state.phase !== 'idle') return
    if (state.demoMode) {
      demoHandleRef.current?.stop()
      dispatch({ type: 'reset_session' })
      dispatch({ type: 'phase', phase: 'loading' })
      demoHandleRef.current = runDemoSimulation(sp, state.demoOutcome, {
        reading: (r) => dispatch({ type: 'press_reading', reading: r }),
        state: (s) => dispatch({ type: 'press_state', state: s }),
        rupture: () => dispatch({ type: 'press_rupture' })
      })
      return
    }
    dispatch({ type: 'reset_session' })
    const r = await window.bstech.press.startSession()
    if (r.ok) dispatch({ type: 'phase', phase: 'loading' })
    else dispatch({ type: 'toast', message: r.error ?? 'Falha ao iniciar' })
  }, [sp, startBlocker, state.phase, state.demoMode, state.demoOutcome, dispatch])

  const handleStop = useCallback(async () => {
    demoHandleRef.current?.stop()
    await window.bstech.press.reset()
    dispatch({ type: 'reset_session' })
  }, [dispatch])

  // Rompeu e o detector nao pegou (carga parada no topo): o operador registra o pico
  const handleManualRupture = useCallback(async () => {
    if (state.phase !== 'loading') return
    const pk = peakPoint(state.readings)
    if (!pk || pk.kgf < 1000) {
      dispatch({ type: 'toast', message: 'A carga ainda não subiu. Sem pico pra registrar.' })
      return
    }
    demoHandleRef.current?.stop()
    if (!state.demoMode) await window.bstech.press.stopSession()
    dispatch({ type: 'press_rupture' })
  }, [state.phase, state.readings, state.demoMode, dispatch])

  const handleSeal = useCallback(async () => {
    if (!sp || !state.operator || !state.ruptureType || state.sealing) return
    const pk = peakPoint(state.readings)
    if (!pk) return
    dispatch({ type: 'seal_start' })
    const d = sp.specimen_diameter_mm || 100
    const h = sp.specimen_height_mm || 200
    const mpa = correctedMpa(pk.kgf, sp)
    const status =
      sp.test_age_days >= 28 && sp.fck_spec_mpa ? (mpa >= sp.fck_spec_mpa ? 'RUPTURED_APPROVED' : 'RUPTURED_REPROVED') : 'RUPTURED_APPROVED'
    try {
      const payload: SealRupturePayload = {
        specimen_id: sp.id,
        equipment_id: state.equipmentId,
        operator_id: state.operator.id,
        peak_load_kgf: pk.kgf,
        rupture_type: state.ruptureType,
        readings: state.readings,
        session_started_at: state.press.session_started_at
          ? new Date(state.press.session_started_at).toISOString()
          : new Date().toISOString(),
        status_override: status,
        diameter_mm: d,
        height_mm: h
      }
      const res = await sealRupture(payload)
      apagarPendente(sp.id)
      const calc = res.calculated_fck_mpa ?? calcFckMpa(pk.kgf, d)
      const sealedSp: Specimen = {
        ...sp,
        status: res.status ?? status,
        applied_load_ton: pk.kgf / 1000,
        calculated_fck_mpa: calc,
        corrected_fck_mpa: correctionFactor(h, d) * calc,
        rupture_type: state.ruptureType,
        ruptured_at: res.sealed_at ?? new Date().toISOString(),
        rupture_operator_name: state.operator.name
      }
      const list = state.specimens.map((s) => (s.id === sp.id ? sealedSp : s))
      const next = nextPending(list, sp.id, localIsoDate())
      demoHandleRef.current?.stop()
      await window.bstech.press.reset()
      dispatch({
        type: 'sealed',
        specimen: sealedSp,
        curve: state.readings,
        toast: { code: sp.specimen_code, mpa: sealedSp.corrected_fck_mpa ?? mpa, hash: res.hash_sha256.slice(0, 12) },
        nextId: next?.id ?? null
      })
      if (toastRef.current) clearTimeout(toastRef.current)
      toastRef.current = setTimeout(() => dispatch({ type: 'clear_sealed_toast' }), 3200)
    } catch (err) {
      console.error('[seal_rupture] erro:', err)
      dispatch({ type: 'seal_error', message: errorMessage(err) })
    }
  }, [sp, state.operator, state.ruptureType, state.sealing, state.readings, state.equipmentId, state.press.session_started_at, state.specimens, dispatch])

  // Espaco inicia o ensaio; durante o ensaio registra a ruptura (nunca descarta o ensaio)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Space' || calibration) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      if (state.phase === 'idle') void handleStart()
      else if (state.phase === 'loading') void handleManualRupture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, handleStart, handleManualRupture, calibration])

  const selectSpecimen = useCallback(
    (id: string) => {
      if (state.phase === 'loading') return
      const target = state.specimens.find((s) => s.id === id)
      if (target) dispatch({ type: 'set_tab', tab: target.due_date < today ? 'late' : 'hoje' })
      demoHandleRef.current?.stop()
      void window.bstech.press.reset()
      dispatch({ type: 'select_specimen', id })
    },
    [state.phase, state.specimens, today, dispatch]
  )

  // ---- Leitor USB: bipou a etiqueta, o CP abre na bancada ----
  const ddmm = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : 'n/d')
  const tratarEtiqueta = async (token: string) => {
    try {
      const r = await lerEtiqueta(token)
      const s = r?.specimen
      if (!r) return dispatch({ type: 'toast', message: 'Etiqueta não encontrada' })
      if (r.label.cancelled) return dispatch({ type: 'toast', message: `${r.label.code} foi cancelada` })
      if (!s) return dispatch({ type: 'toast', message: `${r.label.code} ainda não virou CP. Lance o lote na BSTECH.` })
      if (s.deleted) return dispatch({ type: 'toast', message: `${s.code} foi excluído do lote` })
      if (state.phase === 'loading') return dispatch({ type: 'toast', message: 'Termine o ensaio antes de trocar de CP' })
      if (state.specimens.some((x) => x.id === s.id)) {
        selectSpecimen(s.id)
        return
      }
      if (s.status.startsWith('RUPTURED')) return dispatch({ type: 'toast', message: `${s.code} já foi rompido em ${ddmm(s.rupture_date)}` })
      dispatch({ type: 'toast', message: `${s.code} rompe em ${ddmm(s.due_date)}, fora da fila de hoje` })
    } catch (err) {
      dispatch({ type: 'toast', message: errorMessage(err) })
    }
  }
  const scanRef = useRef(tratarEtiqueta)
  scanRef.current = tratarEtiqueta
  useEffect(() => {
    const detectar = createScanDetector({ onScan: (t) => void scanRef.current(t) })
    // Fase de captura: o Enter do leitor nao pode clicar no botao que estiver em foco.
    const onKey = (e: KeyboardEvent) => detectar(e)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const pickEquipment = useCallback(
    async (id: string) => {
      await window.bstech.app.setConfig({ equipment_id: id })
      dispatch({ type: 'set_equipment', id })
      saveEquipment(state.equipments.find((e) => e.id === id) ?? null)
    },
    [state.equipments, dispatch]
  )

  return (
    <div className="h-full flex flex-col px-6 bg-bs-bg">
      <TopBar calibration={calibration} onToggleCalibration={() => setCalibration((c) => !c)} onPickEquipment={pickEquipment} />
      {!calibration && state.demoMode && <DemoControlBar />}
      {calibration ? (
        <CalibrationView />
      ) : (
        <div
          className={`relative flex-1 grid min-h-0 ${cols.dragging ? '' : 'transition-[grid-template-columns] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)]'}`}
          style={{
            gridTemplateColumns: `${state.queueCollapsed ? 64 : cols.widths.left}px minmax(0, 1fr) ${cols.widths.right}px`
          }}
        >
          <div className="border-r border-bs-border min-h-0 min-w-0 overflow-hidden">
            {state.queueCollapsed ? <QueueRail /> : <Queue onSelect={selectSpecimen} />}
          </div>
          {!state.queueCollapsed && (
            <ColumnHandle
              style={{ left: cols.widths.left - 4 }}
              active={cols.dragging === 'left'}
              onPointerDown={(e) => cols.begin('left', e)}
              onDoubleClick={() => cols.reset('left')}
            />
          )}
          <ColumnHandle
            style={{ right: cols.widths.right - 4 }}
            active={cols.dragging === 'right'}
            onPointerDown={(e) => cols.begin('right', e)}
            onDoubleClick={() => cols.reset('right')}
          />
          <BenchCenter />
          <BenchSide
            onStart={handleStart}
            onStop={handleStop}
            onRupture={handleManualRupture}
            onSeal={handleSeal}
            startBlocker={startBlocker}
          />
        </div>
      )}

      {state.sealedToast && (
        <div className="fixed left-1/2 top-[74px] -translate-x-1/2 z-40 flex items-center gap-2.5 whitespace-nowrap rounded-[10px] px-4 py-[11px] text-[13px] bg-bs-success/15 text-bs-text backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)] animate-toast">
          <span className="w-2 h-2 rounded-full bg-bs-success" />
          Selado na BSTECH · {state.sealedToast.code} · {fmt(state.sealedToast.mpa)} MPa
          <code className="font-mono text-xs text-bs-success">{state.sealedToast.hash}…</code>
        </div>
      )}
      {state.toast && (
        <div className="fixed bottom-4 right-4 z-40 bg-bs-danger text-white px-4 py-2 rounded-lg shadow-lg max-w-sm">
          <div className="flex items-start gap-3">
            <span className="text-sm">{state.toast}</span>
            <button onClick={() => dispatch({ type: 'toast', message: null })} className="text-white/70 hover:text-white text-xs">
              fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type BlockReason = Extract<Access, { kind: 'blocked' }>['reason']
type Auth = { phase: 'loading' } | { phase: 'out' } | { phase: 'in'; email: string | null; access: SessionAccess }

// Acesso do login atual. Devolve o motivo quando esse login nao pode romper.
async function resolveLogin(): Promise<{ email: string | null; access: SessionAccess } | BlockReason> {
  const sb = await getClient()
  const { data } = await sb.auth.getUser()
  const user = data.user
  if (!user) return 'perfil'
  const access = await resolveAccess(user.id)
  if (access.kind === 'blocked') return access.reason
  return { email: user.email ?? null, access }
}

function AuthGate() {
  const [auth, setAuth] = useState<Auth>({ phase: 'loading' })
  const [press, setPress] = useState<PressLiveState | null>(null)

  // A prensa conecta sozinha no processo principal (acha a porta e reconecta);
  // aqui so acompanha o estado, que ja aparece antes do login
  useEffect(() => {
    ;(async () => {
      try {
        const s = await window.bstech.press.getState()
        if (s) setPress(s)
      } catch (err) {
        console.error('[press init]', err)
      }
    })()
    return window.bstech.press.onState(setPress)
  }, [])

  useEffect(() => {
    let mounted = true
    let unsub: (() => void) | null = null
    ;(async () => {
      try {
        const sb = await getClient()
        const { data } = await sb.auth.getSession()
        if (data.session) {
          const r = await resolveLogin()
          if (!mounted) return
          if (typeof r !== 'string') setAuth({ phase: 'in', ...r })
          else {
            await sb.auth.signOut()
            setAuth({ phase: 'out' })
          }
        } else if (mounted) setAuth({ phase: 'out' })
        const { data: sub } = sb.auth.onAuthStateChange((event) => {
          if (mounted && event === 'SIGNED_OUT') setAuth({ phase: 'out' })
        })
        unsub = () => sub.subscription.unsubscribe()
      } catch {
        if (mounted) setAuth({ phase: 'out' })
      }
    })()
    return () => {
      mounted = false
      unsub?.()
    }
  }, [])

  const onLogged = useCallback(async (): Promise<BlockReason | null> => {
    const r = await resolveLogin()
    if (typeof r === 'string') return r
    setAuth({ phase: 'in', ...r })
    return null
  }, [])

  if (auth.phase === 'loading') {
    return <div className="h-full flex items-center justify-center bg-bs-bg text-bs-text-mute text-sm">Carregando…</div>
  }
  if (auth.phase === 'out') {
    return (
      <LoginScreen
        onLogged={onLogged}
        equipment={readSavedEquipment()}
        pressConnected={!!press?.connected}
        liveKgf={press?.current_kgf ?? 0}
      />
    )
  }
  return (
    <SessionProvider demoEmail={auth.email} access={auth.access}>
      <Inner />
    </SessionProvider>
  )
}

export function App() {
  return <AuthGate />
}
