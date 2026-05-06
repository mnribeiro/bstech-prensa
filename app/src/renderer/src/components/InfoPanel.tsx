import { useState } from 'react'
import { useSession } from '../store/session'
import { formatMpa } from '../lib/format'
import {
  Building2,
  Layers,
  Box,
  Truck,
  User,
  Calendar,
  Cpu,
  Ruler,
  Play,
  Square,
  RotateCcw,
  ChevronDown
} from 'lucide-react'

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

  const canStart = !!sp && !!op && !!eq && state.press.connected && state.phase === 'idle'

  return (
    <aside className="w-[360px] border-l border-bs-border bg-bs-surface flex flex-col">
      <div className="px-5 py-3 border-b border-bs-border shrink-0">
        <div className="label-mute">CP em ensaio</div>
        {sp ? (
          <>
            <div className="mt-1 text-bs-text font-mono font-semibold text-lg tracking-tight">
              {sp.specimen_code}
            </div>
            <div className="text-bs-text-dim text-xs mt-0.5 flex items-center gap-1.5">
              <Calendar size={11} />
              Vence {sp.due_date} · {sp.test_age_days}d
            </div>
          </>
        ) : (
          <div className="mt-1 text-bs-text-mute text-sm">Nenhum selecionado</div>
        )}
      </div>

      {/* Sections com scroll */}
      <div className="flex-1 overflow-y-auto">
        {sp && (
          <Section title="Origem" defaultOpen>
            <Row icon={Building2} label="Obra" value={sp.project_name} />
            <Row icon={Layers} label="Estrutura" value={sp.structure_name ?? '—'} />
            <Row icon={Box} label="Lote" value={sp.batch_code} mono />
            <Row icon={Truck} label="Concreteira" value={sp.supplier_name ?? '—'} />
            <Row icon={User} label="Moldador" value={sp.molder_name ?? '—'} />
            <Row icon={Calendar} label="Moldado em" value={sp.molding_date ?? '—'} />
          </Section>
        )}

        {sp && (
          <Section title="Especificações" defaultOpen={false}>
            <Row label="FCK projeto" value={`${formatMpa(sp.fck_spec_mpa)} MPa`} mono />
            <Row label="Diâmetro" value={`${sp.specimen_diameter_mm} mm`} mono />
            <Row
              label="Altura"
              value={sp.specimen_height_mm ? `${sp.specimen_height_mm} mm` : '—'}
              mono
            />
            <Row label="Peso" value={sp.weight_kg ? `${sp.weight_kg} kg` : '—'} mono />
            <Row
              label="h/d"
              value={sp.height_diameter_ratio ? sp.height_diameter_ratio.toFixed(2) : '—'}
              mono
            />
            <Row
              label="Fator correção"
              value={sp.correction_factor ? sp.correction_factor.toFixed(3) : '1.000'}
              mono
            />
          </Section>
        )}

        {eq && (
          <Section title="Equipamento" defaultOpen={false}>
            <Row icon={Cpu} label="Nome" value={eq.name} />
            {eq.serial_number && <Row label="Série" value={eq.serial_number} mono />}
            {eq.machine_class && <Row label="Classe" value={eq.machine_class} />}
            {eq.capacity_kn && <Row label="Capacidade" value={`${eq.capacity_kn} kN`} mono />}
          </Section>
        )}
      </div>

      {/* Footer fixo */}
      <div className="border-t border-bs-border bg-bs-surface px-5 py-3 shrink-0">
        <div className="label-mute">Operador</div>
        <div className="mt-0.5 text-bs-text font-medium flex items-center gap-1.5 text-sm">
          <User size={13} className="text-bs-text-dim" />
          {op?.name ?? '—'}
        </div>
      </div>

      <div className="p-3 shrink-0">
        {state.phase === 'idle' && (
          <button
            disabled={!canStart}
            onClick={onStart}
            className={`w-full py-2.5 rounded-md font-semibold flex items-center justify-center gap-2 transition ${
              canStart
                ? 'bg-bs-accent text-white hover:brightness-110 shadow-sm'
                : 'bg-bs-panel border border-bs-border text-bs-text-mute cursor-not-allowed'
            }`}
          >
            <Play size={16} />
            Iniciar ensaio
          </button>
        )}
        {state.phase === 'loading' && (
          <button
            onClick={onStop}
            className="w-full py-2.5 rounded-md bg-bs-warning text-bs-bg font-semibold flex items-center justify-center gap-2 hover:brightness-110"
          >
            <Square size={16} />
            Parar (sem ruptura)
          </button>
        )}
        {(state.phase === 'ruptured' || state.phase === 'sealed') && (
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-md bg-bs-panel border border-bs-border text-bs-text font-medium flex items-center justify-center gap-2 hover:bg-bs-panel-soft"
          >
            <RotateCcw size={16} />
            Reset palco
          </button>
        )}

        {!canStart && state.phase === 'idle' && (
          <p className="text-xs text-bs-text-mute mt-2 text-center">
            {!state.press.connected
              ? 'Prensa não conectada'
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

function Section({
  title,
  children,
  defaultOpen = true
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-bs-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-2.5 flex items-center justify-between hover:bg-bs-panel/40 transition"
      >
        <span className="label-mute">{title}</span>
        <ChevronDown
          size={14}
          className={`text-bs-text-mute transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="px-5 pb-3 space-y-1.5">{children}</div>}
    </div>
  )
}

function Row({
  icon: Icon,
  label,
  value,
  mono
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm gap-3 min-h-[22px]">
      <span className="text-bs-text-dim flex items-center gap-1.5 min-w-0">
        {Icon && <Icon size={12} className="shrink-0 text-bs-text-mute" />}
        <span className="truncate text-xs">{label}</span>
      </span>
      <span
        className={`text-bs-text tabular-nums text-right truncate ${
          mono ? 'font-mono text-xs' : 'text-sm'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
