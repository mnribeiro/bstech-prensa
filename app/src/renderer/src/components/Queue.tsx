// Fila de ruptura: Hoje / Atrasados / Proximos, organizada como o laboratorio
// trabalha (obra > concretagem > lote com o par). A busca aceita a etiqueta sem
// traco e, quando so um CP bate, ja seleciona ele.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import type { Specimen } from '@shared/types'
import { useSession } from '../store/session'
import { localIsoDate } from '../lib/supabase'
import {
  cpNumber,
  formatShortDate,
  groupLateDays,
  groupObras,
  isDone,
  isLate,
  mpaOf,
  normCode,
  splitPools,
  titleCase,
  type ConcretagemGroup,
  type QueueTab
} from '../lib/queue'
import { fmt } from '../lib/rupture'

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

interface Props {
  onSelect: (id: string) => void
}

export function Queue({ onSelect }: Props) {
  const { state, dispatch } = useSession()
  const today = localIsoDate()
  const { hoje, late } = useMemo(() => splitPools(state.specimens, today), [state.specimens, today])
  const [openObras, setOpenObras] = useState<Set<string>>(new Set())
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())

  const sel = state.specimens.find((s) => s.id === state.selectedSpecimenId) ?? null

  // O grupo do CP selecionado fica sempre aberto
  useEffect(() => {
    if (!sel) return
    if (isLate(sel, today)) setOpenDays((s) => (s.has(sel.due_date) ? s : new Set(s).add(sel.due_date)))
    else setOpenObras((s) => (s.has(sel.project_id) ? s : new Set(s).add(sel.project_id)))
  }, [sel?.id, today])

  const q = normCode(state.query)
  const match = (s: Specimen) => !q || normCode(s.specimen_code).includes(q)

  function setQuery(v: string) {
    dispatch({ type: 'set_query', query: v })
    const k = normCode(v)
    const hits = k.length >= 6 ? state.specimens.filter((s) => !isDone(s) && normCode(s.specimen_code).startsWith(k)) : []
    if (hits.length === 1) {
      onSelect(hits[0].id)
      return
    }
    // Se a etiqueta so existe na outra aba, troca de aba sozinho
    if (k.length >= 3 && state.tab !== 'next') {
      const pool = state.tab === 'late' ? late : hoje
      if (!pool.some((s) => normCode(s.specimen_code).includes(k))) {
        const other = state.specimens.find((s) => normCode(s.specimen_code).includes(k))
        if (other) dispatch({ type: 'set_tab', tab: isLate(other, today) ? 'late' : 'hoje' })
      }
    }
  }

  const toggle = (set: Set<string>, key: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set)
    if (n.has(key)) n.delete(key)
    else n.add(key)
    fn(n)
  }

  const pending = (arr: Specimen[]) => arr.filter((s) => !isDone(s)).length
  const done = (arr: Specimen[]) => arr.filter(isDone).length
  const cur = state.tab === 'late' ? late : hoje
  const curDone = done(cur)
  const upcomingTotal = state.upcoming.reduce((a, u) => a + u.count, 0)

  let list: JSX.Element[] = []
  if (state.tab === 'hoje') {
    list = groupObras(hoje)
      .map((o) => {
        const mine = o.all.filter(match)
        if (!mine.length) return null
        const open = !!q || openObras.has(o.key)
        return (
          <div key={o.key} className="mt-1">
            <GroupHeader
              open={open}
              onClick={() => toggle(openObras, o.key, setOpenObras)}
              title={titleCase(o.name)}
              count={`${done(o.all)}/${o.all.length}`}
              full={done(o.all) === o.all.length}
            />
            {open && groupObras(mine)[0].concretagens.map((c) => <Concretagem key={c.key} c={c} onSelect={onSelect} />)}
          </div>
        )
      })
      .filter(Boolean) as JSX.Element[]
  } else if (state.tab === 'late') {
    list = groupLateDays(late, today)
      .map((d) => {
        const mine = d.all.filter(match)
        if (!mine.length) return null
        const open = !!q || openDays.has(d.due)
        return (
          <div key={d.due} className="mt-1">
            <GroupHeader
              open={open}
              onClick={() => toggle(openDays, d.due, setOpenDays)}
              title={`Venceu ${formatShortDate(d.due)}`}
              tag={
                <span className={`late-tag ${d.late <= 1 ? 'late-tag-soft' : ''}`}>
                  {d.late} {d.late === 1 ? 'dia' : 'dias'}
                </span>
              }
              count={`${done(d.all)}/${d.all.length}`}
              full={done(d.all) === d.all.length}
            />
            {open &&
              groupObras(mine).map((o) => (
                <div key={o.key}>
                  <div className="px-2.5 pt-2 pb-0.5 text-[12.5px] font-semibold text-bs-text">{titleCase(o.name)}</div>
                  {o.concretagens.map((c) => (
                    <Concretagem key={c.key} c={c} onSelect={onSelect} />
                  ))}
                </div>
              ))}
          </div>
        )
      })
      .filter(Boolean) as JSX.Element[]
  }

  return (
    <div className="flex flex-col min-h-0 h-full bg-bs-surface">
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <SearchBox value={state.query} onChange={setQuery} placeholder="Etiqueta do CP, ex. HOM-L056-4" />
        <button
          className="w-[46px] h-[46px] shrink-0 rounded-[10px] bg-bs-panel grid place-items-center text-bs-text-dim hover:bg-bs-card3 hover:text-bs-text transition"
          title="Recolher a fila"
          onClick={() => dispatch({ type: 'set_queue_collapsed', on: true })}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 px-3.5">
        {tabButton('hoje', pending(hoje), 'Hoje')}
        {tabButton('late', pending(late), 'Atrasados', true)}
        {tabButton('next', upcomingTotal, 'Próximos')}
      </div>

      {state.tab !== 'next' && (
        <div className="px-4 py-3">
          <div className="flex justify-between text-[12.5px] text-bs-text-dim">
            <span>
              <b className="text-bs-text font-semibold tabular-nums">{curDone}</b> de {cur.length}{' '}
              {state.tab === 'late' ? 'atrasados rompidos' : 'rompidos hoje'}
            </span>
            <span className="tabular-nums">{cur.length ? Math.round((curDone / cur.length) * 100) : 0}%</span>
          </div>
          <div className="h-1 rounded-full bg-bs-card3 mt-[7px] overflow-hidden">
            <i
              className={`block h-full rounded-full transition-[width] duration-500 ${state.tab === 'late' ? 'bg-bs-warning' : 'bg-bs-success'}`}
              style={{ width: `${cur.length ? (curDone / cur.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-4 border-t border-bs-border">
        {state.tab === 'next' ? (
          <div className="px-2 py-2.5">
            {state.upcoming.map((u) => {
              const d = new Date(`${u.date}T00:00:00`)
              const tomorrow = new Date()
              tomorrow.setDate(tomorrow.getDate() + 1)
              const label = u.date === localIsoDate(tomorrow) ? 'amanhã' : WEEKDAY[d.getDay()]
              return (
                <div key={u.date} className="flex justify-between items-center px-2.5 py-[11px] rounded-lg text-[13px]">
                  <b className="font-semibold">{formatShortDate(u.date)}</b>
                  <span className="text-bs-text-mute text-xs">{label}</span>
                  <b className="font-semibold tabular-nums">{u.count} CPs</b>
                </div>
              )
            })}
          </div>
        ) : !state.queueLoaded ? (
          <div className="px-4 py-8 text-center text-[13px] text-bs-text-mute">Carregando a fila…</div>
        ) : list.length ? (
          list
        ) : (
          <div className="px-4 py-8 text-center text-[13px] text-bs-text-mute">
            {state.query
              ? `Nenhum CP com "${state.query}" nesta aba.`
              : state.tab === 'late'
                ? 'Nenhum CP atrasado.'
                : 'Nenhum CP vence hoje.'}
          </div>
        )}
      </div>

      {state.tab !== 'hoje' && (
        <div className="px-4 pt-2.5 pb-3.5 text-xs text-bs-text-mute border-t border-bs-border">
          {state.tab === 'late'
            ? 'Atrasado rompe na prensa igual. O laudo registra a idade real do ensaio.'
            : 'Próximos entram na fila no dia do vencimento.'}
        </div>
      )}
    </div>
  )

  function tabButton(tab: QueueTab, value: number, label: string, isLateTab = false) {
    const on = state.tab === tab
    return (
      <button
        key={tab}
        onClick={() => dispatch({ type: 'set_tab', tab })}
        className={`py-2 px-1.5 rounded-lg text-center text-[12.5px] transition ${on ? 'bg-bs-panel-soft text-bs-text' : 'text-bs-text-dim hover:text-bs-text'}`}
      >
        <b className={`block text-[17px] font-[650] tabular-nums ${isLateTab ? 'text-bs-danger' : 'text-bs-text'}`}>{value}</b>
        {label}
      </button>
    )
  }
}

export function QueueRail() {
  const { state, dispatch } = useSession()
  const today = localIsoDate()
  const { hoje, late } = splitPools(state.specimens, today)
  const pending = (arr: Specimen[]) => arr.filter((s) => !isDone(s)).length
  const open = (tab: QueueTab) => {
    dispatch({ type: 'set_tab', tab })
    dispatch({ type: 'set_queue_collapsed', on: false })
  }
  return (
    <div className="flex flex-col items-center gap-1.5 py-3.5 bg-bs-surface min-h-0 h-full overflow-hidden">
      <button
        className="w-11 h-11 mb-2 rounded-[10px] bg-bs-panel grid place-items-center text-bs-text-dim hover:bg-bs-card3 hover:text-bs-text transition"
        title="Abrir a fila"
        onClick={() => dispatch({ type: 'set_queue_collapsed', on: false })}
      >
        <PanelLeftOpen size={16} />
      </button>
      <RailCount value={pending(hoje)} label="Hoje" onClick={() => open('hoje')} />
      <RailCount value={pending(late)} label="Atras." late onClick={() => open('late')} />
    </div>
  )
}

function RailCount({ value, label, late, onClick }: { value: number; label: string; late?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-12 py-2 rounded-lg text-center text-[10.5px] text-bs-text-mute hover:bg-bs-panel-soft transition">
      <b className={`block text-[15px] font-[650] tabular-nums ${late ? 'text-bs-danger' : 'text-bs-text'}`}>{value}</b>
      {label}
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder, compact }: { value: string; onChange: (v: string) => void; placeholder: string; compact?: boolean }) {
  return (
    <label className="relative block flex-1">
      <Search size={16} className={`absolute left-3.5 text-bs-text-mute ${compact ? 'top-3' : 'top-[15px]'}`} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`w-full rounded-[10px] border border-bs-line2 bg-bs-panel pl-[42px] pr-3.5 outline-none transition focus:border-bs-accent placeholder:text-bs-text-mute text-bs-text ${compact ? 'h-10 text-sm' : 'h-[46px] text-[15px]'}`}
      />
    </label>
  )
}

function GroupHeader({
  open,
  onClick,
  title,
  tag,
  count,
  full
}: {
  open: boolean
  onClick: () => void
  title: string
  tag?: JSX.Element
  count: string
  full: boolean
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left hover:bg-bs-panel transition">
      <ChevronRight size={16} className={`text-bs-text-mute transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      <span className="flex-1 min-w-0 truncate font-semibold text-[13.5px]">{title}</span>
      {tag}
      <span className={`text-xs tabular-nums ${full ? 'text-bs-success' : 'text-bs-text-mute'}`}>{count}</span>
    </button>
  )
}

function Concretagem({ c, onSelect }: { c: ConcretagemGroup; onSelect: (id: string) => void }) {
  return (
    <div className="mt-0.5 mb-2 ml-2">
      <div className="px-2 pt-1.5 pb-1 text-[11.5px] text-bs-text-mute flex gap-1.5 flex-wrap items-center">
        <span className={`age ${c.test_age_days === 28 ? 'age-28' : ''}`}>{c.test_age_days} dias</span>
        <b className="text-bs-text-dim font-semibold">moldada {formatShortDate(c.molding_date)}</b>
        {c.structure_name && <span>{titleCase(c.structure_name)}</span>}
        {c.fck != null && <span>fck {c.fck}</span>}
      </div>
      {c.lots.map((l) => (
        <div key={l.batchCode + l.specimens[0].id} className="grid grid-cols-[58px_1fr_1fr] gap-1.5 items-center px-2 py-[3px]">
          <span className="font-mono text-xs text-bs-text-dim">{l.batchCode}</span>
          {l.specimens.map((s) => (
            <CpChip key={s.id} sp={s} onSelect={onSelect} />
          ))}
        </div>
      ))}
    </div>
  )
}

function CpChip({ sp, onSelect }: { sp: Specimen; onSelect: (id: string) => void }) {
  const { state } = useSession()
  const sel = sp.id === state.selectedSpecimenId
  const done = isDone(sp)
  const mpa = mpaOf(sp)
  const fail = done && sp.status === 'RUPTURED_REPROVED'
  const right = done && mpa != null ? fmt(mpa) : sel && state.phase === 'loading' ? 'na prensa' : ''
  return (
    <button
      onClick={() => onSelect(sp.id)}
      className={`h-[34px] rounded-[7px] flex items-center justify-between px-2.5 text-[12.5px] transition ${
        sel ? 'bg-bs-accent text-white' : done ? 'bg-bs-panel text-bs-text-mute hover:bg-bs-card3' : 'bg-bs-panel text-bs-text-dim hover:bg-bs-card3 hover:text-bs-text'
      }`}
    >
      <span>CP {cpNumber(sp)}</span>
      <span
        className={`text-xs tabular-nums ${sel ? 'text-white/85' : done ? (fail ? 'text-bs-danger font-semibold' : 'text-bs-success font-semibold') : 'text-bs-text-mute'}`}
      >
        {right}
      </span>
    </button>
  )
}
