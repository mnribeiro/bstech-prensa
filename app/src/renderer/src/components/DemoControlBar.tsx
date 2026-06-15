// Barra de controle do Modo Demo. Aparece só quando o demo está ligado.
// Deixa escolher o resultado do próximo ensaio (aprovar/reprovar) e disparar
// a simulação. Adição funcional, não mexe no visual do resto do app.
import { useSession, type DemoOutcome } from '../store/session'
import { FlaskConical, Play } from 'lucide-react'

interface Props {
  onStart: () => void
}

export function DemoControlBar({ onStart }: Props) {
  const { state } = useSession()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId) ?? null
  const running = state.phase === 'loading'
  const canStart = !!sp && state.phase === 'idle'

  return (
    <div className="px-4 py-2.5 border-b border-bs-border bg-bs-purple/[0.07] flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical size={14} className="text-bs-purple shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-bs-purple/90">
          Ensaio simulado
        </span>
        <span className="text-[11px] text-bs-text-mute hidden md:inline">
          prensa física não precisa estar conectada
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[11px] text-bs-text-dim mr-1">Resultado:</span>
        <OutcomeBtn value="approve" label="Aprovar" />
        <OutcomeBtn value="reprove" label="Reprovar" />
      </div>

      <div className="flex items-center gap-2">
        {!sp && <span className="text-[11px] text-bs-text-mute">selecione um CP na fila →</span>}
        <button
          disabled={!canStart}
          onClick={onStart}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition ${
            canStart
              ? 'bg-bs-accent text-white hover:brightness-110'
              : 'bg-bs-panel border border-bs-border text-bs-text-mute cursor-not-allowed'
          }`}
        >
          <Play size={13} />
          {running ? 'Ensaiando…' : 'Iniciar ensaio'}
        </button>
      </div>
    </div>
  )
}

function OutcomeBtn({ value, label }: { value: DemoOutcome; label: string }) {
  const { state, dispatch } = useSession()
  const active = state.demoOutcome === value
  const activeCls =
    value === 'approve'
      ? 'border-bs-success/50 bg-bs-success/15 text-bs-success'
      : 'border-bs-danger/50 bg-bs-danger/15 text-bs-danger'
  return (
    <button
      onClick={() => dispatch({ type: 'set_demo_outcome', outcome: value })}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
        active ? activeCls : 'border-bs-border text-bs-text-dim hover:border-bs-text-mute'
      }`}
    >
      {label}
    </button>
  )
}
