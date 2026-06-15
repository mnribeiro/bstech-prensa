import { useState, useEffect } from 'react'
import { computePoint } from '../lib/calibration-math'
import { saveCalibration, nextCalibrationNumber } from '../lib/calibration-api'
import { errorMessage } from '../lib/error-message'
import type { Calibration, CalibrationPoint } from '@shared/types'
import { DEFAULT_CALIBRATION_POINTS_KGF } from '@shared/types'

interface Props {
  onDone: () => void
}

type ReadingIdx = 1 | 2 | 3

export function CalibrationWizard({ onDone }: Props) {
  const [header, setHeader] = useState<Partial<Calibration>>({
    numero: '',
    identificacao: null,
    equipamento_nome: '',
    carga_digital_ton: null,
    transdutor_marca: null,
    escala_min_kgf: 0,
    escala_max_kgf: 0,
    validade: '',
    temperatura_celsius: null,
    calibrado_por: null
  })

  const [points, setPoints] = useState<CalibrationPoint[]>(
    DEFAULT_CALIBRATION_POINTS_KGF.map((kgf, i) => ({
      ordem: i + 1,
      carga_real_kgf: kgf,
      leitura_1_kgf: null,
      leitura_2_kgf: null,
      leitura_3_kgf: null,
      media_kgf: null,
      desvio_padrao: null,
      erro_exatidao_pct: null,
      repetitividade_pct: null
    }))
  )

  const [capturing, setCapturing] = useState<{ pointIdx: number; readingIdx: ReadingIdx } | null>(
    null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    nextCalibrationNumber()
      .then((n) => setHeader((h) => ({ ...h, numero: n })))
      .catch(() => {})
    const v = new Date()
    v.setFullYear(v.getFullYear() + 1)
    setHeader((h) => ({ ...h, validade: v.toISOString().slice(0, 10) }))
  }, [])

  async function captureReading(pointIdx: number, readingIdx: ReadingIdx) {
    setCapturing({ pointIdx, readingIdx })
    setError(null)
    try {
      const snap = await window.bstech.calibration.capture(2000)
      setPoints((prev) => {
        const copy = [...prev]
        const p = { ...copy[pointIdx] }
        if (readingIdx === 1) p.leitura_1_kgf = snap.media_kgf
        if (readingIdx === 2) p.leitura_2_kgf = snap.media_kgf
        if (readingIdx === 3) p.leitura_3_kgf = snap.media_kgf
        if (p.leitura_1_kgf != null && p.leitura_2_kgf != null && p.leitura_3_kgf != null) {
          const r = computePoint(
            [p.leitura_1_kgf, p.leitura_2_kgf, p.leitura_3_kgf],
            p.carga_real_kgf
          )
          p.media_kgf = r.media_kgf
          p.desvio_padrao = r.desvio_padrao
          p.erro_exatidao_pct = r.erro_exatidao_pct
          p.repetitividade_pct = r.repetitividade_pct
        }
        copy[pointIdx] = p
        return copy
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCapturing(null)
    }
  }

  function clearReading(pointIdx: number, readingIdx: ReadingIdx) {
    setPoints((prev) => {
      const copy = [...prev]
      const p = { ...copy[pointIdx] }
      if (readingIdx === 1) p.leitura_1_kgf = null
      if (readingIdx === 2) p.leitura_2_kgf = null
      if (readingIdx === 3) p.leitura_3_kgf = null
      // Limpa cálculos
      p.media_kgf = null
      p.desvio_padrao = null
      p.erro_exatidao_pct = null
      p.repetitividade_pct = null
      copy[pointIdx] = p
      return copy
    })
  }

  const allPointsComplete = points.every(
    (p) => p.leitura_1_kgf != null && p.leitura_2_kgf != null && p.leitura_3_kgf != null
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const cal: Calibration = {
        ...(header as Calibration),
        equipment_id: null,
        observacoes: null,
        pdf_path: null,
        points
      }
      const pdfRes = await window.bstech.calibration.generatePdf(cal)
      if (!pdfRes.ok) throw new Error(pdfRes.error ?? 'Falha ao gerar PDF')
      cal.pdf_path = pdfRes.path ?? null
      await saveCalibration(cal)
      setSuccess(`Calibração salva. PDF: ${cal.pdf_path}`)
      setTimeout(() => onDone(), 2000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto bg-bs-bg text-bs-text">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Nova Calibração: {header.numero || '...'}</h2>
        <button
          onClick={onDone}
          className="text-sm text-bs-text-mute hover:text-bs-text px-3 py-1.5 border border-bs-border rounded"
        >
          ← Voltar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-bs-surface p-4 rounded border border-bs-border">
        <Field
          label="Número"
          value={header.numero ?? ''}
          onChange={(v) => setHeader({ ...header, numero: v })}
        />
        <Field
          label="Identificação"
          value={header.identificacao ?? ''}
          onChange={(v) => setHeader({ ...header, identificacao: v })}
        />
        <Field
          label="Equipamento"
          value={header.equipamento_nome ?? ''}
          onChange={(v) => setHeader({ ...header, equipamento_nome: v })}
        />
        <Field
          label="Carga Digital (ton)"
          type="number"
          value={String(header.carga_digital_ton ?? '')}
          onChange={(v) =>
            setHeader({ ...header, carga_digital_ton: v ? Number(v) : null })
          }
        />
        <Field
          label="Transdutor (marca)"
          value={header.transdutor_marca ?? ''}
          onChange={(v) => setHeader({ ...header, transdutor_marca: v })}
        />
        <Field
          label="Escala máx (kgf)"
          type="number"
          value={String(header.escala_max_kgf ?? '')}
          onChange={(v) => setHeader({ ...header, escala_max_kgf: Number(v) })}
        />
        <Field
          label="Validade"
          type="date"
          value={header.validade ?? ''}
          onChange={(v) => setHeader({ ...header, validade: v })}
        />
        <Field
          label="Temperatura (°C)"
          type="number"
          value={String(header.temperatura_celsius ?? '')}
          onChange={(v) =>
            setHeader({ ...header, temperatura_celsius: v ? Number(v) : null })
          }
        />
        <Field
          label="Calibrado por"
          value={header.calibrado_por ?? ''}
          onChange={(v) => setHeader({ ...header, calibrado_por: v })}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-bs-surface">
            <tr>
              <th className="border border-bs-border p-2">Carga Real (kgf)</th>
              <th className="border border-bs-border p-2">1ª Leitura</th>
              <th className="border border-bs-border p-2">2ª Leitura</th>
              <th className="border border-bs-border p-2">3ª Leitura</th>
              <th className="border border-bs-border p-2">Média</th>
              <th className="border border-bs-border p-2">Desvio</th>
              <th className="border border-bs-border p-2">Exatidão %</th>
              <th className="border border-bs-border p-2">Repetit. %</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, idx) => (
              <tr key={p.ordem}>
                <td className="border border-bs-border p-2 text-center font-bold">
                  {p.carga_real_kgf.toLocaleString('pt-BR')}
                </td>
                {([1, 2, 3] as ReadingIdx[]).map((ri) => {
                  const val =
                    ri === 1 ? p.leitura_1_kgf : ri === 2 ? p.leitura_2_kgf : p.leitura_3_kgf
                  const isCapturing =
                    capturing?.pointIdx === idx && capturing?.readingIdx === ri
                  return (
                    <td key={ri} className="border border-bs-border p-2 text-center">
                      {val != null ? (
                        <button
                          onClick={() => clearReading(idx, ri)}
                          title="Click pra limpar e recapturar"
                          className="text-bs-text hover:text-bs-warning underline decoration-dotted"
                        >
                          {val.toLocaleString('pt-BR')}
                        </button>
                      ) : (
                        <button
                          disabled={!!capturing}
                          onClick={() => captureReading(idx, ri)}
                          className="px-3 py-1 bg-bs-accent text-white rounded text-xs disabled:opacity-50"
                        >
                          {isCapturing ? 'Lendo...' : `Capturar ${ri}ª`}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="border border-bs-border p-2 text-center">
                  {p.media_kgf?.toLocaleString('pt-BR') ?? 'n/d'}
                </td>
                <td className="border border-bs-border p-2 text-center">
                  {p.desvio_padrao?.toFixed(2) ?? 'n/d'}
                </td>
                <td
                  className={`border border-bs-border p-2 text-center ${
                    p.erro_exatidao_pct != null && Math.abs(p.erro_exatidao_pct) > 1
                      ? 'text-bs-warning'
                      : ''
                  }`}
                >
                  {p.erro_exatidao_pct?.toFixed(2) ?? 'n/d'}
                </td>
                <td className="border border-bs-border p-2 text-center">
                  {p.repetitividade_pct?.toFixed(2) ?? 'n/d'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="bg-bs-danger/15 text-bs-danger p-3 rounded">{error}</div>}
      {success && <div className="bg-emerald-500/15 text-emerald-400 p-3 rounded">{success}</div>}

      <div className="flex gap-3">
        <button
          disabled={!allPointsComplete || saving}
          onClick={handleSave}
          className="px-4 py-2 bg-bs-accent text-white rounded disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar e gerar PDF'}
        </button>
        <button
          onClick={onDone}
          className="px-4 py-2 border border-bs-border rounded text-bs-text-mute"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="flex flex-col text-xs">
      <span className="font-bold mb-1 text-bs-text-mute uppercase tracking-wider">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bs-bg border border-bs-border rounded px-2 py-1.5 text-sm text-bs-text"
      />
    </label>
  )
}
