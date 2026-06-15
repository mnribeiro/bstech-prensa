import { useSession, isDemoEmail } from '../store/session'
import { getClient } from '../lib/supabase'
import { UpdateBanner } from './UpdateBanner'
import { useAppVersion } from '../hooks/useAppVersion'
import logoBStech from '../assets/bstech-logo-white.png'
import { LogOut, FlaskConical } from 'lucide-react'

async function handleLogout() {
  const sb = await getClient()
  await sb.auth.signOut()
}

export function OperatorBar() {
  const { state, dispatch } = useSession()
  const op = state.operators.find((o) => o.id === state.currentOperatorId) ?? null
  const eq = state.equipments.find((e) => e.id === state.currentEquipmentId) ?? null
  const version = useAppVersion()

  return (
    <header className="h-14 px-6 flex items-center justify-between border-b border-bs-border bg-bs-surface">
      <div className="flex items-center gap-1">
        <img src={logoBStech} alt="BStech" className="h-12 w-auto" />
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-bs-text font-medium text-sm tracking-tight">Prensa</span>
          <span className="text-bs-text-mute text-[10px]">v{version ?? '...'}</span>
        </div>
      </div>
      <div className="flex items-center gap-6 text-sm">
        {isDemoEmail(state.demoEmail) && (
          <button
            onClick={() => dispatch({ type: 'set_demo_mode', on: !state.demoMode })}
            title="Modo demo: simula a prensa pra apresentação (só nesta conta de teste)"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
              state.demoMode
                ? 'border-bs-purple/50 bg-bs-purple/20 text-bs-purple'
                : 'border-bs-border text-bs-text-dim hover:border-bs-purple/40 hover:text-bs-purple'
            }`}
          >
            <FlaskConical size={13} />
            Modo demo: {state.demoMode ? 'ON' : 'OFF'}
          </button>
        )}
        <UpdateBanner variant="compact" />
        <PressStatus />
        <div className="flex items-center gap-2">
          <span className="label-mute">Equipamento</span>
          <select
            className="bg-bs-panel border border-bs-border rounded px-2 py-1 text-bs-text"
            value={state.currentEquipmentId ?? ''}
            onChange={(e) => dispatch({ type: 'select_equipment', id: e.target.value || null })}
          >
            <option value="">Selecione</option>
            {state.equipments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.serial_number ? `· ${e.serial_number}` : ''}
              </option>
            ))}
          </select>
          {eq?.calibration_due_date && (
            <span className="label-mute">Cal. ate {eq.calibration_due_date}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="label-mute">Operador</span>
          <select
            className="bg-bs-panel border border-bs-border rounded px-2 py-1 text-bs-text"
            value={state.currentOperatorId ?? ''}
            onChange={(e) => dispatch({ type: 'select_operator', id: e.target.value || null })}
          >
            <option value="">Selecione</option>
            {state.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {op && <span className="text-bs-success text-xs">·</span>}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-bs-text-dim hover:text-bs-danger px-2.5 py-1.5 rounded-md border border-bs-border hover:border-bs-danger/40 hover:bg-bs-danger/10 transition"
          title="Sair da conta"
        >
          <LogOut size={13} />
          Sair
        </button>
      </div>
    </header>
  )
}

function PressStatus() {
  const { state } = useSession()
  const ok = state.press.connected
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          ok ? 'bg-bs-success animate-pulse_slow' : 'bg-bs-text-mute'
        }`}
      />
      <span className="text-bs-text-dim text-xs">
        {ok ? `Prensa conectada (${state.press.port ?? 'n/d'})` : 'Prensa desconectada'}
      </span>
    </div>
  )
}
