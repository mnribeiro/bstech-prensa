import { useEffect, useMemo, useState } from 'react'
import { Lock, Calendar } from 'lucide-react'
import { useSession } from '../store/session'
import { sealRupture } from '../lib/supabase'
import { errorMessage } from '../lib/error-message'
import { formatTon, calcFckMpa, formatMpa, heightDiameterRatio, correctionFactor } from '../lib/format'
import { type RuptureType, type SealRupturePayload, type SealRuptureResponse } from '@shared/types'

interface Props {
  onSealed: (specimenId: string) => void
  onError: (msg: string) => void
}

// Tipos de ruptura com o desenho/letra da NBR 5739, idênticos à bancada web.
// value = enum interno do app (traduzido pro código BStech no envio).
const RUPTURE_TYPES: {
  value: RuptureType
  letter: string
  short: string
  label: string
  path: string
}[] = [
  { value: 'conica', letter: 'A', short: 'Cônica', label: 'Cônica', path: 'M8 12 L13 5 L18 12' },
  {
    value: 'conica_cisalhada',
    letter: 'C',
    short: 'Cônica/cis.',
    label: 'Cônica e cisalhamento',
    path: 'M8 12 L13 5 L18 12 M8 24 L18 16'
  },
  { value: 'cisalhada', letter: 'D', short: 'Cisalham.', label: 'Cisalhamento', path: 'M7 27 L19 7' },
  { value: 'conica_bipartida', letter: 'E', short: 'Fendida', label: 'Fendida', path: 'M13 4 L13 30' },
  {
    value: 'colunar',
    letter: 'F',
    short: 'Colunar',
    label: 'Colunar',
    path: 'M10 4 L10 30 M16 4 L16 30'
  },
  { value: 'lateral', letter: '·', short: 'Irregular', label: 'Irregular', path: 'M8 7 L15 14 L9 20 L16 27' }
]

function RuptureIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg width="22" height="28" viewBox="0 0 26 34" className={className} aria-hidden>
      <rect x="4" y="3" width="18" height="28" rx="2" fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.6} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function RuptureModal({ onSealed, onError }: Props) {
  const { state, dispatch } = useSession()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId)
  const op = state.operators.find((o) => o.id === state.currentOperatorId)
  const eq = state.equipments.find((e) => e.id === state.currentEquipmentId)

  const [ruptureType, setRuptureType] = useState<RuptureType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [sealedResponse, setSealedResponse] = useState<SealRuptureResponse | null>(null)
  // Medidas do CP: editaveis na ruptura (a prensa so da a carga). Default pega
  // o cadastro; se a altura vier vazia assume 200mm (CP cilindrico padrao 10x20).
  const [diameter, setDiameter] = useState(0)
  const [height, setHeight] = useState(0)

  // Sincroniza estado interno com o ciclo do modal
  useEffect(() => {
    if (state.modalOpen) {
      setRuptureType(null)
      setSubmitting(false)
      setLastError(null)
      setSealedResponse(null)
    } else {
      setSealedResponse(null)
      setLastError(null)
      setSubmitting(false)
    }
  }, [state.modalOpen])

  // Carrega as medidas do CP selecionado (ao abrir ou trocar de specimen)
  useEffect(() => {
    if (!sp) return
    setDiameter(sp.specimen_diameter_mm ?? 100)
    setHeight(sp.specimen_height_mm ?? 200)
  }, [sp?.id, state.modalOpen])

  // Auto-close após sucesso (8s)
  useEffect(() => {
    if (!state.modalOpen || !sealedResponse || !sp) return
    const sealedSpecimenId = sp.id
    const id = setTimeout(() => onSealed(sealedSpecimenId), 8000)
    return () => clearTimeout(id)
  }, [state.modalOpen, sealedResponse, onSealed, sp])

  // Saída de emergência: ESC fecha o modal (só pra destravar em caso de erro).
  function discardAndClose() {
    dispatch({ type: 'close_modal' })
    dispatch({ type: 'reset_session' })
  }
  useEffect(() => {
    if (!state.modalOpen || sealedResponse) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') discardAndClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.modalOpen, sealedResponse])

  const peakKgf = state.press.peak_kgf
  // Tudo recalcula ao vivo a partir das medidas editaveis, igual a bancada web.
  // O diametro entra no fck, a altura no fator de correcao (NBR 5739).
  const measuresOk = diameter > 0 && height > 0
  const fckCalculated = measuresOk ? calcFckMpa(peakKgf, diameter) : 0
  const cf = correctionFactor(height, diameter)
  const hdRatio = heightDiameterRatio(height, diameter)
  const fckCorrected = cf * fckCalculated
  const ratioOff = hdRatio > 0 && (hdRatio < 1.94 || hdRatio > 2.06)

  // Veredito NBR: verde se atingiu o alvo na idade de projeto (>=28d), vermelho se não.
  const matured = (sp?.test_age_days ?? 0) >= 28
  const verdict: 'pass' | 'fail' | 'neutral' =
    sp && matured && sp.fck_spec_mpa ? (fckCorrected >= sp.fck_spec_mpa ? 'pass' : 'fail') : 'neutral'

  // Status mandado pro BStech (sub-28d não reprova por carga → aprovado por padrão)
  const status =
    sp && matured && sp.fck_spec_mpa
      ? fckCorrected >= sp.fck_spec_mpa
        ? 'RUPTURED_APPROVED'
        : 'RUPTURED_REPROVED'
      : 'RUPTURED_APPROVED'

  const daysOverdue = useMemo(() => {
    if (!sp?.due_date) return 0
    const due = new Date(sp.due_date)
    if (isNaN(due.getTime())) return 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000))
  }, [sp?.due_date])

  // Barra de resultado (escala de referência igual à bancada web)
  const targetFck = sp?.fck_spec_mpa ?? null
  const maxScale = Math.max(50, (targetFck ?? 0) * 1.5, fckCorrected * 1.25)
  const fillPct = Math.min(100, (fckCorrected / maxScale) * 100)
  const targetPct = targetFck ? Math.min(100, (targetFck / maxScale) * 100) : null
  const deltaPct = targetFck && targetFck > 0 ? ((fckCorrected - targetFck) / targetFck) * 100 : null

  const vStyle = {
    pass: { pill: 'text-bs-success border-bs-success/40 bg-bs-success/10', bar: 'bg-bs-success', label: 'Aprovado' },
    fail: { pill: 'text-bs-danger border-bs-danger/40 bg-bs-danger/10', bar: 'bg-bs-danger', label: 'Reprovado' },
    neutral: {
      pill: 'text-bs-accent border-bs-accent/40 bg-bs-accent/10',
      bar: 'bg-bs-accent',
      label: `Parcial · ${sp?.test_age_days ?? 0}d`
    }
  }[verdict]

  async function handleSubmit() {
    if (!sp || !op || !ruptureType || !measuresOk) return
    setSubmitting(true)
    try {
      const sessionStartedIso = state.press.session_started_at
        ? new Date(state.press.session_started_at).toISOString()
        : new Date().toISOString()
      const payload: SealRupturePayload = {
        specimen_id: sp.id,
        equipment_id: eq?.id ?? null,
        operator_id: op.id,
        peak_load_kgf: peakKgf,
        rupture_type: ruptureType,
        readings: state.readings,
        session_started_at: sessionStartedIso,
        status_override: status,
        diameter_mm: diameter,
        height_mm: height
      }
      const response = await sealRupture(payload)
      setSealedResponse(response)
      setSubmitting(false)
    } catch (err) {
      const msg = errorMessage(err)
      console.error('[seal_rupture] erro:', err)
      setLastError(msg)
      onError(msg)
      setSubmitting(false)
    }
  }

  if (!state.modalOpen || !sp) return null

  // ---------- TELA DE SELO (hash) ----------
  if (sealedResponse) {
    const sealedAt = new Date(sealedResponse.sealed_at)
    const hashShort = sealedResponse.hash_sha256.slice(0, 16)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
        <div className="panel w-[560px] max-w-[92vw] shadow-2xl border-bs-success/40">
          <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-bs-success/15 border border-bs-success/40 flex items-center justify-center mb-4">
              <svg className="w-9 h-9 text-bs-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-bs-success text-sm font-medium tracking-wide uppercase">
              Ensaio selado na BStech
            </div>
            <div className="text-bs-text text-2xl font-medium mt-1">{sp.specimen_code}</div>
            <div className="text-bs-text-mute text-xs mt-1">Selado em {sealedAt.toLocaleString('pt-BR')}</div>
          </div>

          <div className="px-6 pb-5 grid grid-cols-3 gap-4 border-y border-bs-border">
            <Stat label="Carga maxima" value={`${formatTon(sealedResponse.peak_load_kgf, 2)} ton`} />
            <Stat label="fck calculado" value={`${formatMpa(sealedResponse.calculated_fck_mpa)} MPa`} />
            <Stat label="Leituras" value={`${sealedResponse.reading_count}`} />
          </div>

          <div className="px-6 py-4 space-y-1">
            <div className="label-mute">Hash SHA-256 (selo de imutabilidade)</div>
            <div className="font-mono text-[11px] text-bs-text-mute break-all leading-snug">
              {sealedResponse.hash_sha256}
            </div>
            <div className="text-xs text-bs-text-mute pt-1">
              ID: <span className="font-mono">{hashShort}…</span> · status:{' '}
              <span className="text-bs-success">{sealedResponse.status}</span>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-bs-border bg-bs-surface/40">
            <button
              onClick={() => onSealed(sp.id)}
              className="w-full py-2.5 rounded-md font-medium bg-bs-success/20 text-bs-success hover:bg-bs-success/30 transition border border-bs-success/40"
            >
              Concluir
            </button>
            <p className="text-[11px] text-bs-text-mute text-center mt-2">
              Fecha automaticamente em alguns segundos
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------- BANCADA DE RUPTURA (espelha a web) ----------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-[840px] max-w-full max-h-[94vh] overflow-y-auto rounded-xl border border-bs-border bg-black shadow-2xl">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-bs-border/70">
          <div className="min-w-0">
            <div className="text-[22px] font-bold tracking-tight tabular-nums text-bs-text">
              {sp.specimen_code}
            </div>
            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[13px] text-bs-text-dim mt-1.5">
              <span className="font-semibold text-bs-text">{sp.project_name}</span>
              {sp.structure_name && (
                <>
                  <span className="text-bs-text-mute">›</span>
                  <span>{sp.structure_name}</span>
                </>
              )}
              {sp.batch_code && sp.batch_code !== 'n/d' && (
                <>
                  <span className="text-bs-text-mute">›</span>
                  <span>Lote {sp.batch_code}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end shrink-0">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md border border-bs-border text-bs-text">
              {sp.test_age_days} dias
            </span>
            {daysOverdue > 0 && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md border border-bs-danger/40 bg-bs-danger/[0.07] text-bs-danger">
                {daysOverdue}d atrasado
              </span>
            )}
            {targetFck && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md border border-bs-accent/40 bg-bs-accent/[0.07] text-bs-accent">
                alvo {targetFck} MPa
              </span>
            )}
          </div>
        </div>

        {/* MEDIR (travado, vem da prensa) + RESULTADO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-bs-border/70">
          {/* MEDIR */}
          <div className="p-6 sm:border-r border-bs-border/70">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="label-mute">Medido pela prensa</span>
              <Lock size={11} className="text-bs-text-mute" />
            </div>

            <LockedField className="relative">
              <div className="text-[11px] text-bs-text-mute">Carga de ruptura · lida da prensa</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="tabular-nums text-[40px] leading-none font-bold text-bs-text">
                  {formatTon(peakKgf, 2)}
                </span>
                <span className="text-bs-text-dim text-lg">t</span>
                <Lock size={15} className="text-bs-text-mute ml-auto self-center" />
              </div>
            </LockedField>

            <div className="flex items-center justify-between mt-5 mb-2.5">
              <span className="label-mute">Medidas do corpo de prova</span>
              <span className="text-[10px] text-bs-text-mute">medidas no paquímetro, edite se precisar</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MeasureField label="Diâmetro (mm)" value={diameter} onChange={setDiameter} />
              <MeasureField label="Altura (mm)" value={height} onChange={setHeight} />
            </div>
          </div>

          {/* RESULTADO */}
          <div className="p-6 flex flex-col">
            <span className="label-mute">Resultado</span>
            <div className="flex items-center justify-between gap-2.5 mt-3">
              <div className="label-mute">FCK corrigido</div>
              <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${vStyle.pill}`}>
                {vStyle.label}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-4">
              <span className="tabular-nums text-[46px] leading-none font-semibold text-bs-text">
                {fckCorrected.toFixed(2)}
              </span>
              <span className="text-base text-bs-text-dim">MPa</span>
              {deltaPct !== null && (
                <span className={`tabular-nums text-sm font-semibold ml-auto ${deltaPct >= 0 ? 'text-bs-success' : 'text-bs-danger'}`}>
                  {deltaPct >= 0 ? '+' : ''}
                  {deltaPct.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="relative h-2 rounded-full bg-bs-panel mt-5">
              <div className={`absolute left-0 top-0 bottom-0 rounded-full ${vStyle.bar}`} style={{ width: `${fillPct}%` }} />
              {targetPct !== null && (
                <div className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-bs-text/60" style={{ left: `${targetPct}%` }} />
              )}
            </div>
            <div className="flex items-center justify-between mt-3 tabular-nums text-xs">
              <span className="text-bs-text-dim">{targetFck ? `alvo ${targetFck} MPa` : 'sem alvo'}</span>
              <span className="text-bs-text-mute">
                H/D {hdRatio > 0 ? hdRatio.toFixed(2) : 'n/d'} · fator {cf.toFixed(3)}
              </span>
            </div>
            {ratioOff && (
              <p className="text-[11px] text-bs-warning/90 mt-2 leading-snug">
                Relação H/D fora do ideal NBR (1,94 a 2,06). Fator {cf.toFixed(2)} aplicado, confira
                as medidas.
              </p>
            )}
            {verdict === 'neutral' && (
              <p className="text-[11px] text-bs-warning/90 mt-2 leading-snug">
                Resultado parcial ({sp.test_age_days}d). O veredito de aprovação só sai na idade de
                projeto (28 dias).
              </p>
            )}
            <div className="mt-auto pt-5 flex items-center gap-1.5 text-[11px] text-bs-text-mute">
              <Lock size={11} />
              carga e fck travados, calculados pela prensa
            </div>
          </div>
        </div>

        {/* TIPO DE RUPTURA: único campo editável */}
        <div className="px-6 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="label-mute text-bs-accent">Tipo de ruptura</span>
            <span className="text-[11px] text-bs-text-mute">o único campo que você preenche</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {RUPTURE_TYPES.map((t) => {
              const sel = ruptureType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  title={t.label}
                  onClick={() => setRuptureType(t.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-1 py-3 transition active:scale-[0.97] ${
                    sel
                      ? 'border-bs-accent bg-bs-accent/10 text-bs-text'
                      : 'border-bs-border bg-bs-panel text-bs-text-mute hover:border-bs-text-mute'
                  }`}
                >
                  <RuptureIcon path={t.path} className={sel ? 'text-bs-accent' : 'text-bs-text-mute'} />
                  <span className={`text-lg font-bold leading-none ${sel ? 'text-bs-accent' : 'text-bs-text-dim'}`}>
                    {t.letter}
                  </span>
                  <span className="text-[11px] leading-tight text-center text-bs-text-dim">{t.short}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* REGISTRO: operador, prensa, data, todos travados */}
        <div className="px-6 pt-5 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RegisterField label="Operador" value={op?.name ?? 'n/d'} />
          <RegisterField label="Prensa" value={eq?.name ?? 'n/d'} />
          <RegisterField label="Data da ruptura" value="Hoje" icon={<Calendar size={16} className="text-bs-accent shrink-0" />} />
        </div>

        {/* FOOTER sem cancelar: CP rompido é irreversível */}
        <div className="px-6 py-4 border-t border-bs-border/70 bg-bs-panel/30 space-y-2">
          {lastError && (
            <div className="text-xs bg-bs-danger/10 border border-bs-danger/40 rounded px-3 py-2 text-bs-danger break-words">
              <div className="font-medium mb-0.5">Falha ao selar na BStech</div>
              <div className="font-mono text-[11px] leading-snug">{lastError}</div>
            </div>
          )}
          <p className="text-[11px] text-bs-text-mute text-center">
            O corpo de prova já está rompido. O resultado é imutável, só resta selar.
          </p>
          <button
            disabled={submitting || !ruptureType || !measuresOk}
            onClick={handleSubmit}
            className={`w-full h-11 rounded-md font-medium transition ${
              submitting
                ? 'bg-bs-border text-bs-text-mute cursor-wait'
                : !ruptureType || !measuresOk
                  ? 'bg-bs-panel border border-bs-border text-bs-text-mute cursor-not-allowed'
                  : 'bg-bs-accent text-white hover:brightness-110'
            }`}
          >
            {submitting
              ? 'Selando na BStech...'
              : !measuresOk
                ? 'Preencha diâmetro e altura'
                : !ruptureType
                  ? 'Selecione o tipo de ruptura'
                  : lastError
                    ? 'Tentar novamente'
                    : 'Confirmar e selar na BStech'}
          </button>
          {lastError && (
            <button
              onClick={discardAndClose}
              className="w-full text-[11px] text-bs-text-mute hover:text-bs-text-dim text-center pt-0.5"
            >
              Descartar e fechar (Esc)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function LockedField({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 bg-[#171717] border border-bs-border ${className}`}>{children}</div>
  )
}

function MeasureField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="rounded-xl px-4 py-3 bg-[#171717] border border-bs-border focus-within:border-bs-accent transition">
      <div className="text-[11px] text-bs-text-mute">{label}</div>
      <input
        type="number"
        step="0.1"
        inputMode="decimal"
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent border-0 outline-none tabular-nums text-base font-semibold text-bs-text pt-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  )
}

function RegisterField({
  label,
  value,
  icon
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="label-mute">{label}</div>
      <div className="flex items-center gap-2 h-10 rounded-lg border border-bs-border bg-bs-panel px-3 text-sm text-bs-text-dim">
        {icon ?? <Lock size={15} className="text-bs-text-mute shrink-0" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-mute">{label}</div>
      <div className="mt-1 font-mono text-bs-text text-lg tabular-nums">{value}</div>
    </div>
  )
}
