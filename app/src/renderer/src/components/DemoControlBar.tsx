// Barra de controle do Modo Demo. Aparece só quando o demo está ligado.
// Deixa escolher o resultado do próximo ensaio (aprovar/reprovar); o ensaio
// começa pelo mesmo botão da bancada.
import { useSession, type DemoOutcome } from '../store/session'
import { FlaskConical } from 'lucide-react'

export function DemoControlBar() {
  return (
    <div className="px-4 py-2 border-b border-bs-border bg-bs-purple/[0.07] flex items-center gap-4 flex-wrap">
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
