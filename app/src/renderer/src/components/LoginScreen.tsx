import { useEffect, useState } from 'react'
import { Check, Lock, Moon, Sun } from 'lucide-react'
import { getClient } from '../lib/supabase'
import { errorMessage } from '../lib/error-message'
import { useTheme, logoEscura } from '../lib/theme'
import { UpdateBanner } from './UpdateBanner'
import { useAppVersion } from '../hooks/useAppVersion'
import prensaImg from '../assets/prensa-login.jpg'
import type { LabEquipment } from '@shared/types'

const REMEMBER_KEY = 'bstech-prensa-email'

interface Props {
  /** Resolve o operador do login; devolve false quando o acesso nao tem operador ligado */
  onLogged: () => Promise<boolean>
  equipment: LabEquipment | null
  pressConnected: boolean
  liveKgf: number
}

function brDate(iso: string | null): string {
  if (!iso) return 'n/d'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function LoginScreen({ onLogged, equipment, pressConnected, liveKgf }: Props) {
  const { theme, toggle, logo } = useTheme()
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [remember, setRemember] = useState(true)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noOperator, setNoOperator] = useState(false)
  const version = useAppVersion()

  useEffect(() => {
    try {
      if (remember && email) localStorage.setItem(REMEMBER_KEY, email)
      if (!remember) localStorage.removeItem(REMEMBER_KEY)
    } catch {
      // sem storage so nao lembra o e-mail
    }
  }, [remember, email])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNoOperator(false)
    try {
      const sb = await getClient()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
      const ok = await onLogged()
      if (!ok) {
        setNoOperator(true)
        await sb.auth.signOut()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full grid grid-cols-[1.45fr_1fr] bg-bs-bg">
      {/* Lado da imagem: fica escuro nos dois temas */}
      <div className="relative overflow-hidden bg-[#0a0a0a] text-[#ececec]">
        <div className="absolute inset-x-0 top-0 aspect-[1619/972] bg-cover bg-center" style={{ backgroundImage: `url(${prensaImg})` }} />
        <div className="absolute inset-x-0 top-0 aspect-[1619/972] bg-gradient-to-b from-transparent from-[62%] to-[#0a0a0a]" />
        <div className="relative z-10 h-full flex flex-col px-14 pt-10 pb-9">
          <h1 className="mt-auto mb-3 text-[38px] leading-[1.08] tracking-[-0.02em] font-bold max-w-[620px]">Da prensa direto pro laudo.</h1>
          <p className="text-[#c9c9c9] text-base max-w-[560px] mb-[22px]">
            A carga sai do indicador, a curva do ensaio fica gravada e o resultado é selado na BSTECH. Ninguém digita número,
            ninguém procura CP.
          </p>
          <div className="flex gap-[22px] mb-6 text-[#d6d6d6] text-[13.5px] flex-wrap">
            <span className="inline-flex items-center gap-[7px]">
              <Check size={16} className="text-[#58b98a]" />
              Fila do dia por obra e lote
            </span>
            <span className="inline-flex items-center gap-[7px]">
              <Check size={16} className="text-[#58b98a]" />
              Curva completa de cada CP
            </span>
            <span className="inline-flex items-center gap-[7px]">
              <Lock size={16} className="text-[#58b98a]" />
              Resultado selado, sem edição
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr_auto] gap-3.5 items-center max-w-[520px] rounded-xl px-[18px] py-3.5 bg-[rgba(18,18,18,0.82)] backdrop-blur">
            <span className={`w-2 h-2 rounded-full ${pressConnected ? 'bg-[#58b98a] shadow-[0_0_0_3px_rgba(88,185,138,0.15)]' : 'bg-[#6a6a6a]'}`} />
            <div className="text-sm font-semibold">
              {equipment?.name ?? 'Prensa deste computador'}
              <small className="block text-[#6a6a6a] font-normal text-[12.5px]">
                {pressConnected ? 'Conectada neste computador' : 'Prensa desconectada'}
                {equipment?.calibration_due_date ? ` · calibrada até ${brDate(equipment.calibration_due_date)}` : ''}
              </small>
            </div>
            <div className="font-mono text-xl tabular-nums">{(liveKgf / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tf</div>
          </div>
          <div className="text-[#6a6a6a] text-xs mt-3.5">Versão {version ?? '...'}</div>
        </div>
      </div>

      <div className="relative grid place-items-center p-10">
        <button className="icon-btn absolute top-5 right-5" title={theme === 'light' ? 'Tema escuro' : 'Tema claro'} onClick={toggle}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <form onSubmit={handleSubmit} className="w-[400px] max-w-full grid gap-[18px]">
          <UpdateBanner variant="login" />
          <img src={theme === 'light' ? logo : logoEscura} alt="BSTECH" className="h-[30px] w-auto justify-self-start mb-3.5" />
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.01em] m-0 mb-1">Entrar</h2>
            <div className="text-bs-text-dim">Cada operador entra com o próprio acesso da BSTECH.</div>
          </div>
          <label className="grid gap-[7px]">
            <span className="text-[13px] text-bs-text-dim">E-mail</span>
            <input
              type="email"
              required
              autoFocus={!email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu e-mail da BSTECH"
              className="h-[50px] rounded-[10px] border border-bs-line2 bg-bs-panel px-3.5 text-[15px] outline-none focus:border-bs-accent placeholder:text-bs-text-mute"
            />
          </label>
          <label className="grid gap-[7px]">
            <span className="text-[13px] text-bs-text-dim">Senha</span>
            <input
              type="password"
              required
              autoFocus={!!email}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[50px] rounded-[10px] border border-bs-line2 bg-bs-panel px-3.5 text-[15px] outline-none focus:border-bs-accent"
            />
          </label>
          <button type="button" onClick={() => setRemember((r) => !r)} className="flex gap-2.5 items-center text-bs-text-dim text-[13.5px] text-left">
            <i className={`w-[18px] h-[18px] rounded-[5px] grid place-items-center ${remember ? 'bg-bs-accent' : 'border border-bs-line2'}`}>
              {remember && <Check size={12} className="text-white" />}
            </i>
            Lembrar o e-mail neste computador
          </button>

          {noOperator && (
            <div className="rounded-[10px] px-[15px] py-[13px] text-[13.5px] leading-normal bg-bs-warning/15 text-bs-warning-text">
              <b className="block mb-0.5">Seu acesso ainda não está ligado a um operador de ruptura.</b>
              Peça pro responsável do laboratório ligar seu usuário no cadastro de operadores da BSTECH. Sem isso a ruptura sairia sem o
              nome de quem rompeu.
            </div>
          )}
          {error && <div className="rounded-[10px] px-[15px] py-3 text-[13px] bg-bs-danger/15 text-bs-danger">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="h-[52px] rounded-[10px] w-full font-[650] text-[15px] bg-bs-accent text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          <div className="text-bs-text-mute text-[12.5px] text-center">Esqueceu a senha? Troca pela BSTECH web.</div>
        </form>
      </div>
    </div>
  )
}
