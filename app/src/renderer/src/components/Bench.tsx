// Bancada de ruptura: centro (CP, grafico, numeros ao vivo) e coluna da direita
// (o par do lote, dados do CP, iniciar/parar e o resultado com o selo).
import { Check, Lock, Play, Square } from 'lucide-react'
import type { PressReading, RuptureType, Specimen } from '@shared/types'
import { useSession } from '../store/session'
import { localIsoDate } from '../lib/supabase'
import { correctionFactor } from '../lib/format'
import { cpNumber, exemplarIndex, formatShortDate, isDone, lateDays, lotOf, mpaOf, titleCase } from '../lib/queue'
import {
  NBR_RATE,
  RUPTURE_TYPES,
  averageRate,
  correctedMpa,
  diameterOf,
  fmt,
  heightOf,
  liveRate,
  mmss,
  peakPoint,
  ruptureTypeFromBstech,
  verdictOf
} from '../lib/rupture'
import { PressChart } from './PressChart'

/** O que a bancada mostra pro CP selecionado: ensaio ao vivo ou curva ja selada */
export function useBench() {
  const { state } = useSession()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId) ?? null
  const sealed = !!sp && isDone(sp)
  const readings: PressReading[] = sealed ? (state.curves[sp!.id] ?? []) : state.readings
  const ruptured = sealed || state.phase === 'ruptured'
  const pk = peakPoint(readings)
  // Selado sem curva gravada (ex.: rompido pela web): usa a carga do banco
  const peakKgf = sealed && !pk ? (sp!.applied_load_ton ?? 0) * 1000 : (pk?.kgf ?? 0)
  const peakMpa = !sp ? 0 : sealed ? (mpaOf(sp) ?? correctedMpa(peakKgf, sp)) : correctedMpa(peakKgf, sp)
  return { sp, sealed, readings, ruptured, pk, peakKgf, peakMpa }
}

export function BenchCenter() {
  const { state } = useSession()
  const { sp, readings, ruptured, peakKgf } = useBench()

  if (!sp) {
    return (
      <main className="grid place-items-center text-center px-6 min-w-0">
        <div>
          <div className="text-lg font-semibold">Escolha um CP na fila</div>
          <div className="text-[13.5px] text-bs-text-dim mt-1.5">ou bipe a etiqueta do CP que está na mão</div>
        </div>
      </main>
    )
  }

  const partner = lotOf(state.specimens, sp).find((x) => x.id !== sp.id) ?? null
  const ghost = partner && isDone(partner) ? (state.curves[partner.id] ?? null) : null
  const { n, total } = exemplarIndex(state.specimens, sp)
  const today = localIsoDate()
  const late = lateDays(sp, today)
  const d = diameterOf(sp)

  // Numeros: ao vivo durante o ensaio, pico depois da ruptura
  const last = readings[readings.length - 1]
  const pk = peakPoint(readings)
  const shownKgf = ruptured ? peakKgf : state.phase === 'loading' ? (last?.kgf ?? 0) : 0
  const mpa = correctedMpa(shownKgf, sp)
  const rate = ruptured ? averageRate(readings, d) : state.phase === 'loading' ? liveRate(readings, d) : 0
  const active = state.phase !== 'idle' || ruptured
  const rateOk = rate >= NBR_RATE.min && rate <= NBR_RATE.max
  const rateText = !active ? 'norma: 0,45 ± 0,15' : rate < NBR_RATE.min ? 'devagar, abaixo da norma' : rate > NBR_RATE.max ? 'rápido, acima da norma' : 'dentro da norma'
  const tMs = ruptured ? (pk?.t ?? 0) : (last?.t ?? 0)
  const passNow = active && sp.test_age_days >= 28 && sp.fck_spec_mpa != null && mpa >= sp.fck_spec_mpa

  return (
    <main className="grid grid-rows-[auto_1fr_auto] gap-4 px-6 py-[22px] min-h-0 min-w-0">
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[26px] font-bold tracking-[-0.01em]">{sp.specimen_code}</div>
          <div className="text-[13.5px] text-bs-text-dim mt-1">
            Exemplar {n} de {total} · <b className="text-bs-text font-semibold">Lote {sp.batch_code}</b> · {titleCase(sp.project_name)}
            {sp.structure_name ? ` · ${titleCase(sp.structure_name)}` : ''} · moldada {formatShortDate(sp.molding_date)}
          </div>
        </div>
        <div className="flex gap-1.5 items-center shrink-0">
          {late > 0 && (
            <span className="late-tag h-[26px] text-[12.5px] px-2.5">
              venceu {formatShortDate(sp.due_date)} · {late} {late === 1 ? 'dia' : 'dias'} de atraso
            </span>
          )}
          <span className={`age h-[26px] text-[13px] px-2.5 ${sp.test_age_days === 28 ? 'age-28' : ''}`}>{sp.test_age_days} dias</span>
        </div>
      </div>

      <div className="bg-bs-panel rounded-xl pt-3.5 pb-2 px-4 min-h-0 flex flex-col">
        <div className="flex items-center gap-3.5 text-xs text-bs-text-mute h-[22px] shrink-0">
          <Legend swatch="bg-bs-accent" label="Este CP" />
          {ghost && <Legend dashed label={`Exemplar ${exemplarIndex(state.specimens, partner!).n}`} />}
          <Legend swatch="bg-bs-warning" label={`fck ${sp.fck_spec_mpa ?? 'n/d'} MPa`} />
          <span className="ml-auto">
            {state.phase === 'loading' && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-bs-danger font-semibold">
                <i className="w-[7px] h-[7px] rounded-full bg-bs-danger animate-live" />
                ao vivo
              </span>
            )}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <PressChart sp={sp} readings={readings} ruptured={ruptured} ghost={ghost} />
        </div>
      </div>

      <div className="grid grid-cols-[1.15fr_1fr_1.25fr_.8fr] gap-2.5">
        <Readout k={ruptured ? 'Carga de pico' : 'Carga'} v={fmt(shownKgf / 1000, 2)} unit="tf" />
        <Readout
          k="Tensão"
          v={fmt(mpa)}
          unit="MPa"
          sub={`fck ${sp.fck_spec_mpa ?? 'n/d'} MPa aos 28 dias`}
          tone={passNow ? 'text-bs-success' : undefined}
        />
        <div className="ro">
          <div className="ro-k">{ruptured ? 'Velocidade média' : 'Velocidade'}</div>
          <div className={`text-[30px] font-bold mt-1 tracking-[-0.02em] tabular-nums ${active && !rateOk ? 'text-bs-warning' : ''}`}>
            {fmt(rate, 2)}
            <small className="text-sm text-bs-text-mute font-medium ml-1">MPa/s</small>
          </div>
          <div className="relative h-2 rounded-full bg-bs-card3 mt-3">
            <span className="absolute inset-y-0 left-[30%] w-[30%] rounded-full bg-bs-success/15" />
            <span className="absolute -top-1 w-1 h-4 rounded-sm bg-bs-text -translate-x-0.5 transition-[left] duration-100" style={{ left: `${Math.min(100, rate * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10.5px] text-bs-text-mute mt-1.5">
            <span>0</span>
            <span>{rateText}</span>
            <span>1,0</span>
          </div>
        </div>
        <Readout k="Tempo" v={mmss(tMs)} />
      </div>
    </main>
  )
}

function Legend({ swatch, dashed, label }: { swatch?: string; dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span className="w-3.5 h-[3px]" style={{ background: 'repeating-linear-gradient(90deg, rgb(var(--bs-text-mute)) 0 4px, transparent 4px 7px)' }} />
      ) : (
        <span className={`w-3.5 h-[3px] rounded-sm ${swatch}`} />
      )}
      {label}
    </span>
  )
}

function Readout({ k, v, unit, sub, tone }: { k: string; v: string; unit?: string; sub?: string; tone?: string }) {
  return (
    <div className="ro">
      <div className="ro-k">{k}</div>
      <div className={`text-[30px] font-bold mt-1 tracking-[-0.02em] tabular-nums ${tone ?? ''}`}>
        {v}
        {unit && <small className="text-sm text-bs-text-mute font-medium ml-1">{unit}</small>}
      </div>
      {sub && <div className="text-xs text-bs-text-mute mt-0.5">{sub}</div>}
    </div>
  )
}

interface SideProps {
  onStart: () => void
  onStop: () => void
  onSeal: () => void
  startBlocker: string | null
}

export function BenchSide({ onStart, onStop, onSeal, startBlocker }: SideProps) {
  const { state } = useSession()
  const { sp, ruptured } = useBench()
  if (!sp) return <aside className="border-l border-bs-border bg-bs-surface" />
  const lot = lotOf(state.specimens, sp)

  return (
    <aside className="border-l border-bs-border bg-bs-surface flex flex-col min-h-0 overflow-y-auto">
      <div className="px-5 py-[18px] border-b border-bs-border">
        <div className="lbl">Lote {sp.batch_code} · o par</div>
        <div className="grid gap-1.5 mt-2.5">
          {lot.map((x) => (
            <PairRow key={x.id} x={x} current={x.id === sp.id} ruptured={ruptured} />
          ))}
        </div>
      </div>

      {!ruptured && (
        <div className="px-5 py-[18px] border-b border-bs-border">
          <div className="lbl">Dados do CP</div>
          <div className="mt-2">
            <Kv k="Dimensões" v={`${fmt(diameterOf(sp), 0)} x ${fmt(heightOf(sp), 0)} mm`} />
            <Kv k="Fator de correção" v={fmt(correctionFactor(heightOf(sp), diameterOf(sp)), 2)} />
            <Kv k="Moldado em" v={formatShortDate(sp.molding_date)} />
            <Kv k="Vencimento" v={`${formatShortDate(sp.due_date)}${lateDays(sp, localIsoDate()) > 0 ? ' (atrasado)' : ''}`} />
          </div>
        </div>
      )}

      <div className="mt-auto px-5 pt-4 pb-5 grid gap-2.5">
        {!ruptured && state.phase === 'idle' && (
          <>
            <button
              disabled={!!startBlocker}
              onClick={onStart}
              className="h-[52px] rounded-[10px] w-full font-[650] text-[15px] flex items-center justify-center gap-2.5 bg-bs-accent text-white transition hover:brightness-110 active:scale-[0.985] disabled:opacity-45 disabled:pointer-events-none"
            >
              <Play size={18} fill="currentColor" /> Iniciar ensaio <span className="text-[11px] px-1.5 py-px rounded bg-white/15 font-semibold">Espaço</span>
            </button>
            <div className="text-xs text-bs-text-mute text-center">{startBlocker ?? 'CP posicionado e prensa zerada'}</div>
          </>
        )}
        {!ruptured && state.phase === 'loading' && (
          <>
            <button
              onClick={onStop}
              className="h-[52px] rounded-[10px] w-full font-[650] text-[15px] flex items-center justify-center gap-2.5 bg-bs-warning text-bs-on-color transition active:scale-[0.985]"
            >
              <Square size={18} fill="currentColor" /> Parar sem ruptura
            </button>
            <div className="text-xs text-bs-text-mute text-center">A ruptura é detectada sozinha</div>
          </>
        )}
        {ruptured && <ResultBlock onSeal={onSeal} />}
      </div>
    </aside>
  )
}

function PairRow({ x, current, ruptured }: { x: Specimen; current: boolean; ruptured: boolean }) {
  const { state } = useSession()
  const { peakMpa } = useBench()
  const { n } = exemplarIndex(state.specimens, x)
  const done = isDone(x)
  const live = current && !done && ruptured
  const v = done ? mpaOf(x) : live ? peakMpa : null
  const fail = done ? x.status === 'RUPTURED_REPROVED' : v != null && verdictOf(v, x) === 'fail'
  return (
    <div className={`grid grid-cols-[1fr_auto] items-center gap-2.5 rounded-[9px] px-3 py-2.5 ${current ? 'bg-bs-accent/15' : 'bg-bs-panel'}`}>
      <div className="text-[13px]">
        Exemplar {n} · CP {cpNumber(x)}
        <small className="block text-bs-text-mute text-[11.5px]">
          {done ? 'rompido e selado' : live ? 'rompido, falta selar' : current ? 'na prensa agora' : 'aguardando'}
        </small>
      </div>
      <div className={`text-[17px] font-bold tabular-nums ${v == null ? 'text-bs-text-mute' : fail ? 'text-bs-danger' : 'text-bs-success'}`}>
        {v == null ? 'n/d' : fmt(v)}
      </div>
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13px] py-[5px] text-bs-text-dim">
      <span>{k}</span>
      <b className="text-bs-text font-medium text-right">{v}</b>
    </div>
  )
}

function ResultBlock({ onSeal }: { onSeal: () => void }) {
  const { state, dispatch } = useSession()
  const { sp, sealed, readings, peakKgf, peakMpa, pk } = useBench()
  if (!sp) return null
  const lot = lotOf(state.specimens, sp)
  const partner = lot.find((x) => x.id !== sp.id) ?? null
  const verdict = sealed
    ? sp.test_age_days < 28 || !sp.fck_spec_mpa
      ? 'neutral'
      : sp.status === 'RUPTURED_REPROVED'
        ? 'fail'
        : 'pass'
    : verdictOf(peakMpa, sp)
  const late = lateDays(sp, sealed && sp.ruptured_at ? localIsoDate(new Date(sp.ruptured_at)) : localIsoDate())
  const type: RuptureType | null = sealed ? ruptureTypeFromBstech(sp.rupture_type) : state.ruptureType
  const partnerMpa = partner && isDone(partner) ? mpaOf(partner) : null
  const avg = averageRate(readings, diameterOf(sp))
  const sealedAt = sp.ruptured_at ? new Date(sp.ruptured_at) : null

  const pill = {
    pass: { cls: 'bg-bs-success/15 text-bs-success', text: `Atende o fck ${sp.fck_spec_mpa}` },
    fail: { cls: 'bg-bs-danger/15 text-bs-danger', text: `Abaixo do fck ${sp.fck_spec_mpa}` },
    neutral: { cls: 'bg-bs-accent/15 text-bs-accent-text', text: `Parcial · ${sp.test_age_days} dias` }
  }[verdict]

  return (
    <>
      <div className="grid gap-2.5">
        <div className="lbl">Resultado</div>
        <div className="flex items-baseline gap-2">
          <b className="text-[48px] font-[750] tracking-[-0.02em] leading-none tabular-nums">{fmt(peakMpa)}</b>
          <span className="text-base text-bs-text-mute">MPa</span>
        </div>
        <div>
          <span className={`inline-flex items-center gap-1.5 h-7 px-[11px] rounded-full text-[13px] font-semibold ${pill.cls}`}>
            {verdict === 'pass' && <Check size={14} />}
            {pill.text}
          </span>
        </div>
        {(pk || !sealed) && (
          <div className="text-[13px] text-bs-text-dim">
            Pico {fmt(peakKgf / 1000, 2)} tf em {mmss(pk?.t ?? 0)} · {fmt(avg, 2)} MPa/s
          </div>
        )}
        {late > 0 && (
          <div className="text-[13px] text-bs-warning">
            Rompido com {late} {late === 1 ? 'dia' : 'dias'} de atraso · idade real {sp.test_age_days + late} dias
          </div>
        )}
        {partner && partnerMpa != null && (
          <div className="text-[13px] text-bs-text-dim">
            Exemplar {exemplarIndex(state.specimens, partner).n}: {fmt(partnerMpa)} MPa · vale o maior no laudo
          </div>
        )}
      </div>

      <div className="lbl mt-1.5">Tipo de ruptura</div>
      <div className="grid grid-cols-3 gap-1.5">
        {RUPTURE_TYPES.map((t) => {
          const on = type === t.value
          return (
            <button
              key={t.value}
              disabled={sealed}
              onClick={() => dispatch({ type: 'set_rupture_type', value: t.value })}
              className={`h-[62px] rounded-[9px] flex flex-col items-center justify-center gap-[3px] text-[11.5px] transition ${
                on ? 'bg-bs-accent text-white' : 'bg-bs-panel-soft text-bs-text-dim hover:bg-bs-card3 hover:text-bs-text'
              } ${sealed ? 'cursor-default' : ''}`}
            >
              <svg viewBox="0 0 26 34" className="w-5 h-[26px]" aria-hidden>
                <rect x="4" y="3" width="18" height="28" rx="2" fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.6} />
                <path d={t.path} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
              <span>{t.letter ? `${t.letter} · ${t.label}` : t.label}</span>
            </button>
          )
        })}
      </div>

      {sealed ? (
        <div className="text-xs text-bs-text-mute text-center py-1.5">
          {sealedAt
            ? `Selado às ${sealedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${sp.rupture_operator_name ? ` por ${sp.rupture_operator_name}` : ''}`
            : 'Selado na BSTECH'}
        </div>
      ) : (
        <>
          {state.sealError && (
            <div className="text-xs rounded-lg bg-bs-danger/10 text-bs-danger px-3 py-2 break-words">
              <div className="font-medium mb-0.5">Não selou na BSTECH</div>
              {state.sealError}
            </div>
          )}
          <button
            disabled={!state.ruptureType || state.sealing}
            onClick={onSeal}
            className="h-[52px] rounded-[10px] w-full font-[650] text-[15px] flex items-center justify-center gap-2.5 bg-bs-success text-bs-on-color transition hover:brightness-110 active:scale-[0.985] disabled:opacity-45 disabled:pointer-events-none"
          >
            <Lock size={18} /> {state.sealing ? 'Selando na BSTECH…' : state.sealError ? 'Tentar de novo' : 'Selar na BSTECH'}
          </button>
          <div className="text-xs text-bs-text-mute text-center">
            {state.ruptureType ? 'Grava na BSTECH com todas as leituras e o selo' : 'Escolha o tipo de ruptura pra selar'}
          </div>
        </>
      )}
    </>
  )
}
