import { useEffect, useState } from 'react'

/**
 * Versão atual do app, lida do main via IPC update.getState().
 * Em dev/disabled retorna a versão do package.json mesmo assim
 * (o main popula `current_version` antes de emitir o estado).
 */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void window.bstech.update.getState().then((s) => {
      if (mounted) setVersion(s.current_version)
    })
    return () => {
      mounted = false
    }
  }, [])

  return version
}
