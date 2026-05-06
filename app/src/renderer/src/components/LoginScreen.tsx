import { useState } from 'react'
import { getClient } from '../lib/supabase'
import { errorMessage } from '../lib/error-message'
import logoBStech from '../assets/bstech-logo-white.png'

interface Props {
  onLogged: () => void
}

export function LoginScreen({ onLogged }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const sb = await getClient()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
      onLogged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-bs-bg">
      <form
        onSubmit={handleSubmit}
        className="bg-bs-surface border border-bs-border rounded-lg p-8 w-[380px] space-y-5"
      >
        <div className="flex flex-col items-center gap-2">
          <img src={logoBStech} alt="BStech" className="h-14 w-auto" />
          <div className="flex items-baseline gap-2 leading-none">
            <span className="text-bs-text font-semibold text-sm">Prensa</span>
            <span className="text-bs-text-mute text-[10px]">v0.1</span>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-bs-text-mute uppercase tracking-wider">E-mail</span>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-bs-bg border border-bs-border rounded px-3 py-2 text-sm text-bs-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-bs-text-mute uppercase tracking-wider">Senha</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-bs-bg border border-bs-border rounded px-3 py-2 text-sm text-bs-text"
            />
          </label>
        </div>

        {error && (
          <div className="bg-bs-danger/15 text-bs-danger text-xs p-2 rounded">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-bs-accent text-white rounded font-medium disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="text-[11px] text-bs-text-mute text-center">
          Use as mesmas credenciais do BStech web.
        </p>
      </form>
    </div>
  )
}
