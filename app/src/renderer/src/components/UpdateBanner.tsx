import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'

/**
 * Banner azul de auto-update. Mostra:
 *  - Nada quando idle/disabled.
 *  - "Verificando atualização..." quando checking.
 *  - "Baixando atualização vX.Y.Z (NN%)" durante download.
 *  - "Atualização disponível: vX.Y.Z [Atualizar agora]" quando ready.
 *  - Mensagem de erro discreta quando error.
 *
 * Variant 'login' é grande, pra tela de login. 'compact' é pra topbar.
 */
export function UpdateBanner({ variant = 'login' }: { variant?: 'login' | 'compact' }) {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    let mounted = true
    void window.bstech.update.getState().then((s) => {
      if (mounted) setState(s)
    })
    const off = window.bstech.update.onState((s) => {
      if (mounted) setState(s)
    })
    return () => {
      mounted = false
      off()
    }
  }, [])

  if (!state) return null
  if (state.phase === 'idle' || state.phase === 'disabled') return null

  const isLogin = variant === 'login'
  const base = isLogin
    ? 'rounded-lg border px-4 py-3 text-sm flex items-center gap-3'
    : 'rounded-md border px-3 py-1.5 text-xs flex items-center gap-2'

  if (state.phase === 'error') {
    return (
      <div className={`${base} bg-bs-danger/10 border-bs-danger/40 text-bs-danger`}>
        <span className="font-medium">Erro ao buscar atualização</span>
        <span className="text-bs-danger/80 truncate">{state.error}</span>
      </div>
    )
  }

  if (state.phase === 'checking') {
    return (
      <div className={`${base} bg-blue-500/10 border-blue-500/40 text-blue-300`}>
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        <span>Verificando atualização…</span>
      </div>
    )
  }

  if (state.phase === 'available') {
    const pct =
      state.total_bytes && state.downloaded_bytes
        ? Math.round((state.downloaded_bytes / state.total_bytes) * 100)
        : null
    return (
      <div className={`${base} bg-blue-500/10 border-blue-500/40 text-blue-300`}>
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        <span>
          Baixando atualização v{state.remote_version}
          {pct !== null ? ` · ${pct}%` : '…'}
        </span>
      </div>
    )
  }

  // phase === 'ready': banner azul forte com botão Atualizar
  return (
    <div
      className={`${base} bg-blue-500/15 border-blue-500/50 text-blue-100 ${
        isLogin ? 'shadow-[0_0_20px_rgba(59,130,246,0.15)]' : ''
      }`}
    >
      <svg
        className={isLogin ? 'w-5 h-5 text-blue-300 flex-shrink-0' : 'w-4 h-4 text-blue-300'}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="font-medium">Nova versão disponível: v{state.remote_version}</div>
        {isLogin && (
          <div className="text-xs text-blue-200/70 mt-0.5">
            Atual: v{state.current_version} · Atualize agora pra pegar as melhorias mais recentes.
          </div>
        )}
      </div>
      <button
        onClick={() => window.bstech.update.install()}
        className={`bg-blue-500 hover:bg-blue-400 text-white font-medium rounded transition flex-shrink-0 ${
          isLogin ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'
        }`}
      >
        Atualizar agora
      </button>
    </div>
  )
}
