// Modal de filtros da fila de ruptura. Abre num overlay pra não apertar a
// sidebar. Filtra por vencimento (presets e range de data), idade, projeto e
// estrutura. Mantém um rascunho interno e só aplica no "Aplicar".
import { useMemo, useState } from 'react'
import type { Specimen } from '@shared/types'
import {
  type QueueFilters,
  type DuePreset,
  emptyFilters,
  matchesFilters,
  projectOptions,
  structureOptions,
  ageOptions
} from '../lib/specimen-filters'

interface Props {
  specimens: Specimen[]
  initial: QueueFilters
  onApply: (f: QueueFilters) => void
  onClose: () => void
}

const DUE_PRESETS: { key: DuePreset; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'late', label: 'Atrasados' },
  { key: 'today', label: 'Vence hoje' },
  { key: '7d', label: 'Próx. 7 dias' }
]

export function FilterModal({ specimens, initial, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<QueueFilters>(initial)

  const projects = useMemo(() => projectOptions(specimens), [specimens])
  const structures = useMemo(
    () => structureOptions(specimens, draft.projects),
    [specimens, draft.projects]
  )
  const ages = useMemo(() => ageOptions(specimens), [specimens])

  const resultCount = useMemo(
    () => specimens.filter((s) => matchesFilters(s, draft)).length,
    [specimens, draft]
  )

  function countWith(patch: Partial<QueueFilters>): number {
    return specimens.filter((s) => matchesFilters(s, { ...draft, ...patch })).length
  }
  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-[760px] max-w-full max-h-[92vh] overflow-y-auto rounded-xl border border-bs-border bg-black shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bs-border/70">
          <div>
            <div className="text-lg font-semibold text-bs-text">Filtrar fila de ruptura</div>
            <div className="text-xs text-bs-text-mute mt-0.5">Só CPs pendentes de ruptura</div>
          </div>
          <button
            onClick={onClose}
            className="text-bs-text-mute hover:text-bs-text text-2xl leading-none w-8 h-8 grid place-items-center rounded hover:bg-bs-border/40"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* VENCIMENTO + IDADE */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <div className="label-mute mb-2.5">Vencimento</div>
              <div className="flex flex-wrap gap-2">
                {DUE_PRESETS.map((p) => (
                  <Chip
                    key={p.key}
                    label={p.label}
                    active={draft.due === p.key}
                    onClick={() => setDraft((d) => ({ ...d, due: p.key }))}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <input
                  type="date"
                  value={draft.dueFrom}
                  onChange={(e) => setDraft((d) => ({ ...d, dueFrom: e.target.value }))}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-bs-panel border border-bs-border text-bs-text outline-none focus:border-bs-accent [color-scheme:dark]"
                />
                <span className="text-bs-text-mute text-xs">até</span>
                <input
                  type="date"
                  value={draft.dueTo}
                  onChange={(e) => setDraft((d) => ({ ...d, dueTo: e.target.value }))}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-bs-panel border border-bs-border text-bs-text outline-none focus:border-bs-accent [color-scheme:dark]"
                />
              </div>
            </div>
            <div>
              <div className="label-mute mb-2.5">Idade do ensaio</div>
              <div className="flex flex-wrap gap-2">
                {ages.map((a) => (
                  <Chip
                    key={a}
                    label={`${a} dias`}
                    active={draft.ages.includes(a)}
                    count={countWith({ ages: [a] })}
                    onClick={() => setDraft((d) => ({ ...d, ages: toggle(d.ages, a) }))}
                  />
                ))}
                {ages.length === 0 && <span className="text-xs text-bs-text-mute">nenhuma</span>}
              </div>
            </div>
          </div>

          {/* PROJETO + ESTRUTURA */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="label-mute">Projeto</div>
                {draft.projects.length > 0 && (
                  <button
                    onClick={() => setDraft((d) => ({ ...d, projects: [], structures: [] }))}
                    className="text-[11px] text-bs-accent hover:underline"
                  >
                    limpar
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {projects.map((p) => (
                  <CheckRow
                    key={p}
                    label={p}
                    active={draft.projects.includes(p)}
                    count={countWith({ projects: [p] })}
                    onClick={() => setDraft((d) => ({ ...d, projects: toggle(d.projects, p) }))}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="label-mute">Estrutura</div>
                {draft.structures.length > 0 && (
                  <button
                    onClick={() => setDraft((d) => ({ ...d, structures: [] }))}
                    className="text-[11px] text-bs-accent hover:underline"
                  >
                    limpar
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {structures.map((s) => (
                  <CheckRow
                    key={s}
                    label={s}
                    active={draft.structures.includes(s)}
                    count={countWith({ structures: [s] })}
                    onClick={() => setDraft((d) => ({ ...d, structures: toggle(d.structures, s) }))}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-bs-border/70 bg-bs-panel/30">
          <button
            onClick={() => setDraft(emptyFilters())}
            className="text-sm text-bs-text-dim hover:text-bs-text px-3 py-2"
          >
            Limpar tudo
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-bs-text-mute">
              <span className="text-bs-text font-semibold tabular-nums">{resultCount}</span> CPs
              encontrados
            </span>
            <button
              onClick={() => onApply(draft)}
              className="px-5 h-10 rounded-md font-medium bg-bs-accent text-white hover:brightness-110 transition"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({
  label,
  active,
  count,
  onClick
}: {
  label: string
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
        active
          ? 'border-bs-accent/50 bg-bs-accent/15 text-bs-accent'
          : 'border-bs-border text-bs-text-dim hover:border-bs-text-mute'
      }`}
    >
      {label}
      {count != null && <span className="opacity-60 ml-1">{count}</span>}
    </button>
  )
}

function CheckRow({
  label,
  active,
  count,
  onClick
}: {
  label: string
  active: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition text-left ${
        active ? 'border-bs-accent/50 bg-bs-accent/[0.08]' : 'border-bs-border hover:border-bs-text-mute/50'
      }`}
    >
      <span
        className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
          active ? 'bg-bs-accent border-bs-accent' : 'border-bs-text-mute'
        }`}
      >
        {active && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className={`flex-1 text-sm truncate ${active ? 'text-bs-text' : 'text-bs-text-dim'}`}>
        {label}
      </span>
      <span className="text-[11px] text-bs-text-mute tabular-nums">{count}</span>
    </button>
  )
}
