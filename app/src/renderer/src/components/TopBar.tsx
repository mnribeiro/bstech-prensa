import { useState } from 'react'
import { FlaskConical, Gauge, LogOut, Moon, Sun, UserRound, X } from 'lucide-react'
import { useSession, isDemoEmail } from '../store/session'
import { getClient } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { UpdateBanner } from './UpdateBanner'
import type { Operator } from '@shared/types'

const WEEKDAY = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MONTH = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function shortName(n: string): string {
  const p = n.trim().split(/\s+/)
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0]
}
function initials(n: string): string {
  const p = n.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}
function brDate(iso: string | null): string {
  if (!iso) return 'n/d'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  calibration: boolean
  onToggleCalibration: () => void
  onPickEquipment: (id: string) => void
}

export function TopBar({ calibration, onToggleCalibration, onPickEquipment }: Props) {
  const { state, dispatch } = useSession()
  const { theme, toggle, logo } = useTheme()
  const [picking, setPicking] = useState(false)
  // Quem escolhe na lista e ainda nao escolheu: abre a lista logo na entrada
  const [pickingOp, setPickingOp] = useState(() => !state.operatorLocked && !state.operator)
  const eq = state.equipments.find((e) => e.id === state.equipmentId) ?? null
  const now = new Date()
  const op = state.operator

  return (
    <header className="h-[60px] shrink-0 flex items-center gap-3.5 px-5 border-b border-bs-border bg-bs-surface">
      <img src={logo} alt="BSTECH" className="h-6 w-auto" />
      <span className="font-semibold text-sm text-bs-text-dim">Prensa</span>
      <span className="w-px h-5 bg-bs-line2" />
      <span className="text-[13.5px] text-bs-text-dim whitespace-nowrap">
        {WEEKDAY[now.getDay()]}, {now.getDate()} de {MONTH[now.getMonth()]}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {isDemoEmail(state.demoEmail) && (
          <button
            onClick={() => dispatch({ type: 'set_demo_mode', on: !state.demoMode })}
            title="Modo demo: simula a prensa pra apresentação (só nesta conta de teste)"
            className={`pill transition ${state.demoMode ? 'bg-bs-purple/20 text-bs-purple' : 'text-bs-text-dim hover:text-bs-purple'}`}
          >
            <FlaskConical size={14} />
            Demo {state.demoMode ? 'ligado' : 'desligado'}
          </button>
        )}
        <UpdateBanner variant="compact" />
        <button className="pill hover:bg-bs-card3 transition" title="Prensa ligada a este computador" onClick={() => setPicking(true)}>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${state.press.connected ? 'bg-bs-success shadow-[0_0_0_3px_rgb(var(--bs-success)/0.15)]' : 'bg-bs-text-mute'}`}
          />
          {eq ? eq.name : 'Escolher a prensa'}
          {eq?.calibration_due_date && <small className="text-bs-text-mute text-xs">cal. até {brDate(eq.calibration_due_date)}</small>}
          {!state.press.connected && <small className="text-bs-text-mute text-xs">desconectada</small>}
        </button>
        {state.operatorLocked ? (
          op && (
            <span className="pill" title="Você entrou como operador de ruptura">
              <OpAvatar name={op.name} />
              {shortName(op.name)}
            </span>
          )
        ) : (
          <button
            className={`pill transition ${op ? 'hover:bg-bs-card3' : 'bg-bs-accent/15 text-bs-accent-text'} disabled:opacity-50`}
            title={state.phase === 'idle' ? 'Trocar quem está rompendo' : 'Termine o ensaio pra trocar o operador'}
            disabled={state.phase !== 'idle'}
            onClick={() => setPickingOp(true)}
          >
            {op ? <OpAvatar name={op.name} /> : <UserRound size={15} />}
            {op ? shortName(op.name) : 'Quem vai romper?'}
          </button>
        )}
        <button className={`icon-btn ${calibration ? 'bg-bs-panel-soft text-bs-text' : ''}`} title={calibration ? 'Voltar pra ruptura' : 'Calibração da prensa'} onClick={onToggleCalibration}>
          <Gauge size={16} />
        </button>
        <button className="icon-btn" title={theme === 'light' ? 'Tema escuro' : 'Tema claro'} onClick={toggle}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button className="icon-btn" title="Sair" onClick={async () => (await getClient()).auth.signOut()}>
          <LogOut size={16} />
        </button>
      </div>

      {pickingOp && (
        <OperatorPicker
          onClose={() => setPickingOp(false)}
          onPick={(o) => {
            dispatch({ type: 'set_operator', operator: o })
            setPickingOp(false)
          }}
        />
      )}
      {picking && (
        <EquipmentPicker
          onClose={() => setPicking(false)}
          onPick={(id) => {
            onPickEquipment(id)
            setPicking(false)
          }}
        />
      )}
    </header>
  )
}

// A prensa fica configurada no computador. Esta janela so aparece pra configurar
// da primeira vez ou quando o computador muda de prensa.
function EquipmentPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const { state } = useSession()
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55" onClick={onClose}>
      <div className="w-[440px] max-w-[92vw] rounded-xl bg-bs-bg border border-bs-line2 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Prensa deste computador</div>
            <div className="text-[13px] text-bs-text-dim mt-1">
              Fica gravada aqui e vai em todas as rupturas. Só troque se este computador mudou de prensa.
            </div>
          </div>
          <button className="icon-btn -mt-1 -mr-1" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-1.5">
          {state.equipments.length === 0 && <div className="text-[13px] text-bs-text-mute py-3">Nenhuma prensa cadastrada na BSTECH.</div>}
          {state.equipments.map((e) => (
            <button
              key={e.id}
              onClick={() => onPick(e.id)}
              className={`text-left rounded-lg px-3.5 py-3 transition ${e.id === state.equipmentId ? 'bg-bs-accent/15' : 'bg-bs-panel hover:bg-bs-card3'}`}
            >
              <div className="text-sm font-medium">{e.name}</div>
              <div className="text-xs text-bs-text-mute mt-0.5">
                {e.calibration_due_date ? `calibrada até ${brDate(e.calibration_due_date)}` : 'sem data de calibração'}
                {e.serial_number ? ` · série ${e.serial_number}` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function OpAvatar({ name }: { name: string }) {
  return (
    <span className="w-6 h-6 rounded-full bg-bs-accent/15 text-bs-accent-text grid place-items-center text-[11px] font-bold">{initials(name)}</span>
  )
}

// Dono, engenheiro e gestor escolhem quem esta rompendo. A lista sao os operadores
// com a funcao ruptura no cadastro do laboratorio; o nome vai junto no selo.
function OperatorPicker({ onClose, onPick }: { onClose: () => void; onPick: (o: Operator) => void }) {
  const { state } = useSession()
  const [q, setQ] = useState('')
  const list = state.operators.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55" onClick={onClose}>
      <div className="w-[440px] max-w-[92vw] rounded-xl bg-bs-bg border border-bs-line2 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Quem vai romper?</div>
            <div className="text-[13px] text-bs-text-dim mt-1">O nome vai no selo de cada ruptura. Operadores com a função ruptura no cadastro da BSTECH.</div>
          </div>
          <button className="icon-btn -mt-1 -mr-1" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>
        {state.operators.length > 6 && (
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar operador"
            className="mt-4 h-10 w-full rounded-lg border border-bs-line2 bg-bs-panel px-3 text-sm outline-none focus:border-bs-accent placeholder:text-bs-text-mute"
          />
        )}
        <div className="mt-4 grid gap-1.5 max-h-[50vh] overflow-y-auto">
          {list.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o)}
              className={`flex items-center gap-3 text-left rounded-lg px-3.5 py-2.5 transition ${o.id === state.operator?.id ? 'bg-bs-accent/15' : 'bg-bs-panel hover:bg-bs-card3'}`}
            >
              <OpAvatar name={o.name} />
              <span className="text-sm font-medium">{o.name}</span>
            </button>
          ))}
          {!list.length && <div className="text-[13px] text-bs-text-mute py-3">Nenhum operador com esse nome.</div>}
        </div>
      </div>
    </div>
  )
}
