import { useMemo, useState } from 'react'
import { useSession } from '../store/session'
import { relativeDays } from '../lib/format'
import type { Specimen } from '@shared/types'
import {
  Building2,
  Layers,
  Clock,
  ChevronRight,
  Hammer,
  AlertTriangle,
  Search,
  X
} from 'lucide-react'

export type AppMode = 'rupture' | 'calibration'

interface SidebarProps {
  appMode: AppMode
  onModeChange: (m: AppMode) => void
}

export function Sidebar({ appMode, onModeChange }: SidebarProps) {
  const { state, dispatch } = useSession()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return state.specimens
    return state.specimens.filter((s) => {
      const haystack = [
        s.specimen_code,
        s.batch_code,
        s.project_name,
        s.structure_name ?? '',
        s.supplier_name ?? '',
        s.molder_name ?? ''
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [state.specimens, query])

  const grouped = useMemo(() => {
    const projects = new Map<string, Map<string, Specimen[]>>()
    for (const s of filtered) {
      const proj = s.project_name
      const struct = s.structure_name ?? 'Sem estrutura'
      if (!projects.has(proj)) projects.set(proj, new Map())
      const structs = projects.get(proj)!
      if (!structs.has(struct)) structs.set(struct, [])
      structs.get(struct)!.push(s)
    }
    return Array.from(projects.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([proj, structs]) =>
          [
            proj,
            Array.from(structs.entries()).sort(([a], [b]) => a.localeCompare(b))
          ] as const
      )
  }, [filtered])

  const total = state.specimens.length
  const visible = filtered.length
  const lateCount = state.specimens.filter((s) => relativeDays(s.due_date).tone === 'late').length

  return (
    <aside className="w-[340px] border-r border-bs-border bg-bs-surface flex flex-col">
      <div className="px-3 py-2 border-b border-bs-border flex gap-1">
        <button
          onClick={() => onModeChange('rupture')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition font-medium ${
            appMode === 'rupture'
              ? 'bg-bs-accent text-white shadow-sm'
              : 'bg-bs-panel text-bs-text-dim hover:bg-bs-panel-soft hover:text-bs-text'
          }`}
        >
          <Hammer size={13} />
          Ruptura
        </button>
        <button
          onClick={() => onModeChange('calibration')}
          className={`flex-1 text-xs px-2 py-1.5 rounded-md transition font-medium ${
            appMode === 'calibration'
              ? 'bg-bs-accent text-white shadow-sm'
              : 'bg-bs-panel text-bs-text-dim hover:bg-bs-panel-soft hover:text-bs-text'
          }`}
        >
          Calibração
        </button>
      </div>

      <div className="px-4 py-3 border-b border-bs-border">
        <div className="label-mute">Fila de ruptura</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-bs-text font-semibold text-lg tabular-nums">
            {query ? `${visible}/${total}` : total}
          </span>
          <span className="text-bs-text-dim text-xs">
            {query ? 'resultados' : 'CPs prontos'}
          </span>
          {lateCount > 0 && !query && (
            <span className="ml-auto badge badge-late flex items-center gap-1">
              <AlertTriangle size={10} />
              {lateCount} atrasado{lateCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-bs-border">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bs-text-mute pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar CP, lote, obra, concreteira..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md bg-bs-panel border border-bs-border text-bs-text placeholder:text-bs-text-mute focus:outline-none focus:border-bs-accent focus:ring-1 focus:ring-bs-accent-ring transition"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-bs-border text-bs-text-mute hover:text-bs-text transition"
              title="Limpar"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {grouped.length === 0 && (
          <div className="px-4 py-8 text-center text-bs-text-mute text-sm">
            {query
              ? `Nada encontrado pra "${query}".`
              : 'Nenhum CP pendente. Confere o BStech.'}
          </div>
        )}
        {grouped.map(([projectName, structs]) => (
          <div key={projectName}>
            <div className="px-2 pb-1 flex items-center gap-1.5 text-[11px] text-bs-text uppercase tracking-wider font-semibold">
              <Building2 size={12} className="text-bs-text-dim" />
              <span className="truncate">{projectName}</span>
            </div>
            <div className="space-y-2">
              {structs.map(([structName, items]) => (
                <div key={structName}>
                  <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] text-bs-text-dim uppercase tracking-wider">
                    <Layers size={10} />
                    <span className="truncate">{structName}</span>
                    <span className="text-bs-text-mute">· {items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((sp) => (
                      <SpecimenCard
                        key={sp.id}
                        sp={sp}
                        selected={state.selectedSpecimenId === sp.id}
                        onClick={() => dispatch({ type: 'select_specimen', id: sp.id })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function SpecimenCard({
  sp,
  selected,
  onClick
}: {
  sp: Specimen
  selected: boolean
  onClick: () => void
}) {
  const r = relativeDays(sp.due_date)
  const badgeClass =
    r.tone === 'late' ? 'badge-late' : r.tone === 'soon' ? 'badge-soon' : 'badge-ok'
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-3 py-2 rounded-md border transition flex items-center gap-2 ${
        selected
          ? 'bg-bs-accent-soft border-bs-accent'
          : 'bg-bs-panel border-bs-border hover:border-bs-accent/40 hover:bg-bs-panel-soft'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-bs-text font-semibold truncate">
            {sp.specimen_code}
          </span>
          <span className="badge badge-ok shrink-0 flex items-center gap-1">
            <Clock size={9} />
            {sp.test_age_days}d
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-bs-text-dim truncate">
          Lote {sp.batch_code}
          {sp.supplier_name ? ` · ${sp.supplier_name}` : ''}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`badge ${badgeClass}`}>{r.label}</span>
      </div>
      <ChevronRight
        size={14}
        className={`shrink-0 transition ${
          selected ? 'text-bs-accent' : 'text-bs-text-mute group-hover:text-bs-text-dim'
        }`}
      />
    </button>
  )
}
