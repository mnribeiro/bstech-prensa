import { useMemo } from 'react'
import { useSession } from '../store/session'
import { relativeDays } from '../lib/format'
import type { Specimen } from '@shared/types'

export type AppMode = 'rupture' | 'calibration'

interface SidebarProps {
  appMode: AppMode
  onModeChange: (m: AppMode) => void
}

export function Sidebar({ appMode, onModeChange }: SidebarProps) {
  const { state, dispatch } = useSession()

  const grouped = useMemo(() => {
    const map = new Map<string, Specimen[]>()
    for (const s of state.specimens) {
      const key = s.project_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [state.specimens])

  return (
    <aside className="w-[320px] border-r border-bs-border bg-bs-surface flex flex-col">
      <div className="px-3 py-2 border-b border-bs-border flex gap-1">
        <button
          onClick={() => onModeChange('rupture')}
          className={`flex-1 text-xs px-2 py-1.5 rounded transition ${
            appMode === 'rupture'
              ? 'bg-bs-accent text-white'
              : 'bg-bs-border/40 text-bs-text-mute hover:bg-bs-border/60'
          }`}
        >
          Ruptura
        </button>
        <button
          onClick={() => onModeChange('calibration')}
          className={`flex-1 text-xs px-2 py-1.5 rounded transition ${
            appMode === 'calibration'
              ? 'bg-bs-accent text-white'
              : 'bg-bs-border/40 text-bs-text-mute hover:bg-bs-border/60'
          }`}
        >
          Calibração
        </button>
      </div>
      <div className="px-4 py-3 border-b border-bs-border">
        <div className="label-mute">Fila de ruptura</div>
        <div className="mt-1 text-bs-text font-medium text-sm">
          {state.specimens.length} CPs prontos
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {grouped.length === 0 && (
          <div className="px-4 py-8 text-center text-bs-text-mute text-sm">
            Nenhum CP MOLDED com data hoje. Confere o BStech.
          </div>
        )}
        {grouped.map(([projectName, items]) => (
          <div key={projectName} className="mb-3">
            <div className="px-4 py-1.5 text-xs text-bs-text-mute uppercase tracking-wider">
              {projectName}
            </div>
            {items.map((sp) => {
              const r = relativeDays(sp.due_date)
              const isSelected = state.selectedSpecimenId === sp.id
              return (
                <button
                  key={sp.id}
                  onClick={() => dispatch({ type: 'select_specimen', id: sp.id })}
                  className={`w-full text-left px-4 py-2 border-l-2 transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-bs-accent-soft border-bs-accent'
                      : 'border-transparent hover:bg-bs-border/40'
                  }`}
                >
                  <div>
                    <div className="text-sm text-bs-text font-medium">{sp.specimen_code}</div>
                    <div className="text-xs text-bs-text-mute mt-0.5">
                      Lote {sp.batch_code} · {sp.test_age_days}d
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      r.tone === 'late'
                        ? 'bg-bs-danger/15 text-bs-danger'
                        : r.tone === 'soon'
                          ? 'bg-bs-warning/15 text-bs-warning'
                          : 'bg-bs-text-mute/15 text-bs-text-dim'
                    }`}
                  >
                    {r.label}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}
