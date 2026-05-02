import { useSession } from '../store/session'

export function OperatorBar() {
  const { state, dispatch } = useSession()
  const op = state.operators.find((o) => o.id === state.currentOperatorId) ?? null
  const eq = state.equipments.find((e) => e.id === state.currentEquipmentId) ?? null

  return (
    <header className="h-14 px-6 flex items-center justify-between border-b border-bs-border bg-bs-surface">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-tight text-bs-text">BStech Prensa</span>
        <span className="text-bs-text-mute text-xs">v0.1 dev</span>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <PressStatus />
        <div className="flex items-center gap-2">
          <span className="label-mute">Equipamento</span>
          <select
            className="bg-bs-panel border border-bs-border rounded px-2 py-1 text-bs-text"
            value={state.currentEquipmentId ?? ''}
            onChange={(e) => dispatch({ type: 'select_equipment', id: e.target.value || null })}
          >
            <option value="">— escolher —</option>
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
            <option value="">— escolher —</option>
            {state.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {op && <span className="text-bs-success text-xs">·</span>}
        </div>
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
        {ok ? `Prensa conectada (${state.press.port ?? '—'})` : 'Prensa desconectada'}
      </span>
    </div>
  )
}
