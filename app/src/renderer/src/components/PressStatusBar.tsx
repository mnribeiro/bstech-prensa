import { useState } from 'react'
import { useSession } from '../store/session'
import { errorMessage } from '../lib/error-message'

/**
 * Banner de status da comunicação Modbus.
 * Mostra conexão, porta e leitura ao vivo.
 * Botão "Testar comunicação" dispara captureSnapshot de 2s e mostra resultado.
 */
export function PressStatusBar() {
  const { state } = useSession()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    | { ok: true; media_kgf: number; samples: number }
    | { ok: false; message: string }
    | null
  >(null)

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const snap = await window.bstech.calibration.capture(2000)
      setTestResult({ ok: true, media_kgf: snap.media_kgf, samples: snap.samples.length })
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const connected = state.press.connected
  const port = state.press.port

  return (
    <div
      className={`rounded border p-3 flex items-center justify-between gap-4 ${
        connected
          ? 'bg-emerald-500/10 border-emerald-500/40'
          : 'bg-bs-danger/10 border-bs-danger/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connected ? 'bg-emerald-400 animate-pulse' : 'bg-bs-danger'
          }`}
        />
        <div>
          <div className="text-sm font-medium text-bs-text">
            {connected ? `Prensa conectada · ${port ?? 'n/d'}` : 'Prensa desconectada'}
          </div>
          {connected && (
            <div className="text-xs text-bs-text-mute">
              Leitura ao vivo: <b>{state.press.current_kgf.toLocaleString('pt-BR')} kgf</b>
            </div>
          )}
          {!connected && (
            <div className="text-xs text-bs-text-mute">
              Verifica cabo USB-RS485 e se a prensa tá ligada
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {testResult && testResult.ok && (
          <span className="text-xs text-emerald-400">
            ✓ {testResult.samples} amostras · média {testResult.media_kgf.toLocaleString('pt-BR')}{' '}
            kgf
          </span>
        )}
        {testResult && !testResult.ok && (
          <span className="text-xs text-bs-danger">✗ {testResult.message}</span>
        )}
        <button
          onClick={handleTest}
          disabled={!connected || testing}
          className="px-3 py-1.5 text-xs bg-bs-accent text-white rounded disabled:opacity-50"
        >
          {testing ? 'Lendo 2s...' : 'Testar comunicação'}
        </button>
      </div>
    </div>
  )
}
