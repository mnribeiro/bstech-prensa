import { useEffect, useState } from 'react'
import { useSession } from '../store/session'
import { sealRupture } from '../lib/supabase'
import { errorMessage } from '../lib/error-message'
import { formatTon, calcFckMpa, formatMpa } from '../lib/format'
import {
  RUPTURE_TYPE_LABELS,
  type RuptureType,
  type SealRupturePayload,
  type SealRuptureResponse
} from '@shared/types'

interface Props {
  onSealed: (specimenId: string) => void
  onError: (msg: string) => void
}

export function RuptureModal({ onSealed, onError }: Props) {
  const { state, dispatch } = useSession()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId)
  const op = state.operators.find((o) => o.id === state.currentOperatorId)
  const eq = state.equipments.find((e) => e.id === state.currentEquipmentId)

  const [ruptureType, setRuptureType] = useState<RuptureType>('conica')
  const [observations, setObservations] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [sealedResponse, setSealedResponse] = useState<SealRuptureResponse | null>(null)

  // Sincroniza estado interno com o ciclo do modal
  useEffect(() => {
    if (state.modalOpen) {
      setRuptureType('conica')
      setObservations('')
      setSubmitting(false)
      setLastError(null)
      setSealedResponse(null)
    } else {
      // Quando fecha, limpa qualquer resíduo pra não disparar timers órfãos
      setSealedResponse(null)
      setLastError(null)
      setSubmitting(false)
    }
  }, [state.modalOpen])

  // Auto-close após sucesso (8s) — só roda se modal aberto e sealedResponse vivo
  useEffect(() => {
    if (!state.modalOpen || !sealedResponse || !sp) return
    const sealedSpecimenId = sp.id
    const id = setTimeout(() => onSealed(sealedSpecimenId), 8000)
    return () => clearTimeout(id)
  }, [state.modalOpen, sealedResponse, onSealed, sp])

  if (!state.modalOpen || !sp) return null

  const peakKgf = state.press.peak_kgf
  const peakTon = peakKgf / 1000
  const fckCalculated = calcFckMpa(peakKgf, sp.specimen_diameter_mm)
  const fckCorrected = (sp.correction_factor ?? 1) * fckCalculated

  // Decide status segundo NBR (idade >= 28d -> compara fck)
  const status =
    sp.test_age_days >= 28 && sp.fck_spec_mpa
      ? fckCorrected >= sp.fck_spec_mpa
        ? 'RUPTURED_APPROVED'
        : 'RUPTURED_REPROVED'
      : 'RUPTURED_APPROVED' // sub-28d nao reprova por carga, vai como aprovado por padrao

  async function handleSubmit() {
    if (!sp || !op) return
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
        observations: observations.trim() || undefined,
        readings: state.readings,
        session_started_at: sessionStartedIso,
        status_override: status
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

  if (sealedResponse) {
    const sealedAt = new Date(sealedResponse.sealed_at)
    const hashShort = sealedResponse.hash_sha256.slice(0, 16)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="panel w-[560px] max-w-[92vw] shadow-2xl border-emerald-500/40">
          <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mb-4">
              <svg className="w-9 h-9 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-emerald-400 text-sm font-medium tracking-wide uppercase">
              Ensaio enviado pro BStech
            </div>
            <div className="text-bs-text text-2xl font-medium mt-1">{sp.specimen_code}</div>
            <div className="text-bs-text-mute text-xs mt-1">
              Selado em {sealedAt.toLocaleString('pt-BR')}
            </div>
          </div>

          <div className="px-6 pb-5 grid grid-cols-3 gap-4 border-y border-bs-border">
            <Stat
              label="Carga maxima"
              value={`${formatTon(sealedResponse.peak_load_kgf, 2)} ton`}
            />
            <Stat
              label="fck calculado"
              value={`${formatMpa(sealedResponse.calculated_fck_mpa)} MPa`}
            />
            <Stat label="Leituras" value={`${sealedResponse.reading_count}`} />
          </div>

          <div className="px-6 py-4 space-y-1">
            <div className="label-mute">Hash SHA-256 (selo de imutabilidade)</div>
            <div className="font-mono text-[11px] text-bs-text-mute break-all leading-snug">
              {sealedResponse.hash_sha256}
            </div>
            <div className="text-xs text-bs-text-mute pt-1">
              ID: <span className="font-mono">{hashShort}…</span> · status:{' '}
              <span className="text-emerald-400">{sealedResponse.status}</span>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-bs-border bg-bs-surface/40">
            <button
              onClick={() => onSealed(sp.id)}
              className="w-full py-2.5 rounded-md font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition border border-emerald-500/40"
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="panel w-[640px] max-w-[92vw] shadow-2xl">
        <div className="px-6 py-4 border-b border-bs-border flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="label-mute">Ensaio finalizado</div>
            <div className="text-bs-text font-medium text-lg mt-0.5">{sp.specimen_code}</div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              status === 'RUPTURED_APPROVED'
                ? 'bg-bs-success/15 text-bs-success'
                : 'bg-bs-danger/15 text-bs-danger'
            }`}
          >
            {status === 'RUPTURED_APPROVED' ? 'APROVADO' : 'REPROVADO'}
          </span>
          <button
            onClick={() => dispatch({ type: 'close_modal' })}
            disabled={submitting}
            title="Fechar (descarta o ensaio)"
            className="text-bs-text-mute hover:text-bs-text disabled:opacity-30 disabled:cursor-not-allowed text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-bs-border/40"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-3 gap-4 border-b border-bs-border">
          <Stat label="Carga maxima" value={`${formatTon(peakKgf, 2)} ton`} />
          <Stat label="fck calculado" value={`${formatMpa(fckCalculated)} MPa`} />
          <Stat label="fck corrigido" value={`${formatMpa(fckCorrected)} MPa`} />
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="label-mute block mb-1.5">Tipo de ruptura (ABNT NBR 5739)</label>
            <select
              value={ruptureType}
              onChange={(e) => setRuptureType(e.target.value as RuptureType)}
              className="w-full bg-bs-panel border border-bs-border rounded px-3 py-2 text-bs-text"
            >
              {Object.entries(RUPTURE_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-mute block mb-1.5">Observacoes (opcional)</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={2}
              className="w-full bg-bs-panel border border-bs-border rounded px-3 py-2 text-bs-text resize-none"
              placeholder="ex: ruptura prematura por defeito de moldagem"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-bs-border bg-bs-surface/40 flex flex-col gap-3">
          {lastError && (
            <div className="text-xs bg-bs-danger/10 border border-bs-danger/40 rounded px-3 py-2 text-bs-danger break-words">
              <div className="font-medium mb-0.5">Falha ao enviar pro BStech</div>
              <div className="font-mono text-[11px] leading-snug">{lastError}</div>
            </div>
          )}
          <p className="text-xs text-bs-text-mute">
            Resultado imutavel apos confirmacao. Ensaio nao pode ser refeito.
          </p>
          <button
            disabled={submitting}
            onClick={handleSubmit}
            className={`w-full py-2.5 rounded-md font-medium transition ${
              submitting
                ? 'bg-bs-border text-bs-text-mute cursor-wait'
                : 'bg-bs-accent text-white hover:brightness-110'
            }`}
          >
            {submitting
              ? 'Enviando pro BStech...'
              : lastError
                ? 'Tentar novamente'
                : 'Aprovar e enviar pro BStech'}
          </button>
        </div>
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
