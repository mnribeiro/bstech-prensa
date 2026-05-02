import { useSession } from '../store/session'
import { formatMpa } from '../lib/format'

interface Props {
  onStart: () => void
  onStop: () => void
  onReset: () => void
}

export function InfoPanel({ onStart, onStop, onReset }: Props) {
  const { state } = useSession()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId) ?? null
  const eq = state.equipments.find((e) => e.id === state.currentEquipmentId) ?? null
  const op = state.operators.find((o) => o.id === state.currentOperatorId) ?? null

  const canStart =
    !!sp &&
    !!op &&
    !!eq &&
    state.press.connected &&
    state.phase === 'idle'

  return (
    <aside className="w-[360px] border-l border-bs-border bg-bs-surface flex flex-col">
      <div className="p-4 border-b border-bs-border">
        <div className="label-mute">CP em ensaio</div>
        {sp ? (
          <>
            <div className="mt-1 text-bs-text font-medium">{sp.specimen_code}</div>
            <div className="text-bs-text-mute text-xs mt-0.5">
              Vence {sp.due_date} · {sp.test_age_days}d
            </div>
          </>
        ) : (
          <div className="mt-1 text-bs-text-mute text-sm">Nenhum selecionado</div>
        )}
      </div>

      {/* Especificacoes */}
      {sp && (
        <div className="p-4 border-b border-bs-border space-y-3">
          <Row label="FCK projeto" value={`${formatMpa(sp.fck_spec_mpa)} MPa`} />
          <Row label="Diametro" value={`${sp.specimen_diameter_mm} mm`} />
          <Row
            label="Altura"
            value={sp.specimen_height_mm ? `${sp.specimen_height_mm} mm` : '—'}
          />
          <Row label="Peso" value={sp.weight_kg ? `${sp.weight_kg} kg` : '—'} />
          <Row
            label="h/d"
            value={sp.height_diameter_ratio ? sp.height_diameter_ratio.toFixed(2) : '—'}
          />
          <Row
            label="Fator correcao"
            value={sp.correction_factor ? sp.correction_factor.toFixed(3) : '1.000'}
          />
        </div>
      )}

      {/* Equipamento */}
      {eq && (
        <div className="p-4 border-b border-bs-border space-y-2">
          <div className="label-mute">Equipamento</div>
          <Row label="Nome" value={eq.name} />
          {eq.serial_number && <Row label="Serie" value={eq.serial_number} />}
          {eq.machine_class && <Row label="Classe" value={eq.machine_class} />}
          {eq.capacity_kn && <Row label="Capacidade" value={`${eq.capacity_kn} kN`} />}
        </div>
      )}

      {/* Operador */}
      <div className="p-4 border-b border-bs-border">
        <div className="label-mute">Operador de ruptura</div>
        <div className="mt-1 text-bs-text font-medium">{op?.name ?? '—'}</div>
      </div>

      {/* Controles */}
      <div className="p-4 mt-auto space-y-2">
        {state.phase === 'idle' && (
          <button
            disabled={!canStart}
            onClick={onStart}
            className={`w-full py-2.5 rounded-md font-medium transition ${
              canStart
                ? 'bg-bs-accent text-white hover:brightness-110'
                : 'bg-bs-border text-bs-text-mute cursor-not-allowed'
            }`}
          >
            Iniciar ensaio
          </button>
        )}
        {state.phase === 'loading' && (
          <button
            onClick={onStop}
            className="w-full py-2.5 rounded-md bg-bs-warning text-bs-bg font-medium hover:brightness-110"
          >
            Parar (sem ruptura)
          </button>
        )}
        {(state.phase === 'ruptured' || state.phase === 'sealed') && (
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-md bg-bs-border text-bs-text hover:bg-bs-border/70"
          >
            Reset palco
          </button>
        )}

        {!canStart && state.phase === 'idle' && (
          <p className="text-xs text-bs-text-mute mt-2">
            {!state.press.connected
              ? 'Prensa nao conectada'
              : !op
                ? 'Selecione um operador'
                : !eq
                  ? 'Selecione o equipamento'
                  : !sp
                    ? 'Selecione um CP'
                    : ''}
          </p>
        )}
      </div>
    </aside>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-bs-text-mute">{label}</span>
      <span className="text-bs-text font-mono tabular-nums">{value}</span>
    </div>
  )
}
