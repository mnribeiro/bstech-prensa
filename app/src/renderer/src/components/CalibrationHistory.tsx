import { useEffect, useState } from 'react'
import { listCalibrations } from '../lib/calibration-api'
import type { Calibration } from '@shared/types'

interface Props {
  onNew: () => void
}

export function CalibrationHistory({ onNew }: Props) {
  const [list, setList] = useState<Calibration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listCalibrations()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 p-6 overflow-auto bg-bs-bg text-bs-text">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold">Calibrações</h2>
          <p className="text-bs-text-mute text-sm">Histórico de aferições da prensa</p>
        </div>
        <button onClick={onNew} className="px-4 py-2 bg-bs-accent text-white rounded">
          + Nova calibração
        </button>
      </div>

      {error && <div className="bg-bs-danger/15 text-bs-danger p-3 rounded mb-4">{error}</div>}

      {loading ? (
        <p className="text-bs-text-mute">Carregando...</p>
      ) : list.length === 0 ? (
        <div className="border border-bs-border rounded p-8 text-center text-bs-text-mute">
          Nenhuma calibração ainda. Clique em <b>+ Nova calibração</b> pra começar.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-bs-surface">
            <tr>
              <th className="border border-bs-border p-2 text-left">Número</th>
              <th className="border border-bs-border p-2 text-left">Equipamento</th>
              <th className="border border-bs-border p-2">Validade</th>
              <th className="border border-bs-border p-2">Calibrado em</th>
              <th className="border border-bs-border p-2">PDF</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="border border-bs-border p-2 font-bold">{c.numero}</td>
                <td className="border border-bs-border p-2">{c.equipamento_nome}</td>
                <td className="border border-bs-border p-2 text-center">{c.validade}</td>
                <td className="border border-bs-border p-2 text-center">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="border border-bs-border p-2 text-center">
                  {c.pdf_path ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
