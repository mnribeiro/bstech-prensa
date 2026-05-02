import { useEffect, useState } from 'react'
import { useSession } from '../store/session'
import { sealRupture } from '../lib/supabase'
import { formatTon, calcFckMpa, formatMpa } from '../lib/format'
import { RUPTURE_TYPE_LABELS, type RuptureType, type SealRupturePayload } from '@shared/types'

interface Props {
  onSealed: (specimenId: string) => void
  onError: (msg: string) => void
}

export function RuptureModal({ onSealed, onError }: Props) {
  const { state } = useSession()
  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId)
  const op = state.operators.find((o) => o.id === state.currentOperatorId)
  const eq = state.equipments.find((e) => e.id === state.currentEquipmentId)

  const [ruptureType, setRuptureType] = useState<RuptureType>('conica')
  const [observations, setObservations] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset quando abre
  useEffect(() => {
    if (state.modalOpen) {
      setRuptureType('conica')
      setObservations('')
      setSubmitting(false)
    }
  }, [state.modalOpen])

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
      await sealRupture(payload)
      onSealed(sp.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onError(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="panel w-[640px] max-w-[92vw] shadow-2xl">
        <div className="px-6 py-4 border-b border-bs-border flex items-center justify-between">
          <div>
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
            {submitting ? 'Enviando pro BStech...' : 'Aprovar e enviar pro BStech'}
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
