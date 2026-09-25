// Tema claro/escuro. Fica guardado neste computador e vale pra entrada e bancada.
import { useCallback, useEffect, useState } from 'react'
import logoEscura from '../assets/logo-escura.png'
import logoClara from '../assets/logo-clara.png'

export type Theme = 'dark' | 'light'
const KEY = 'bstech-prensa-tema'

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
}

// Aplica antes do primeiro render pra nao piscar escuro no tema claro
let current: Theme = readTheme()
applyTheme(current)

const listeners = new Set<(t: Theme) => void>()

export function useTheme(): { theme: Theme; toggle: () => void; logo: string } {
  const [theme, setTheme] = useState<Theme>(current)
  useEffect(() => {
    listeners.add(setTheme)
    return () => {
      listeners.delete(setTheme)
    }
  }, [])
  const toggle = useCallback(() => {
    const next: Theme = current === 'light' ? 'dark' : 'light'
    current = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // sem storage o tema so vale ate fechar o app
    }
    applyTheme(next)
    listeners.forEach((l) => l(next))
  }, [])
  // logo-escura e a versao pra fundo escuro, logo-clara pra fundo claro
  return { theme, toggle, logo: theme === 'light' ? logoClara : logoEscura }
}

export { logoEscura }
