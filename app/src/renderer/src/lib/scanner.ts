// Leitor 2D USB (QR da etiqueta BSTECH). O leitor funciona como teclado: "digita"
// o link inteiro (https://.../e/AB12CD34EF) em poucos milissegundos e aperta Enter.
// Aqui a gente separa isso da digitacao de gente pelo intervalo entre teclas.
//
// O token sai do FIM do texto (10 caracteres hexadecimais), nao do "/e/": com
// leitor configurado em teclado americano num PC ABNT2, a barra chega como
// outro caractere e o resto do link vem certo.

export const TOKEN_NO_FIM = /([0-9A-F]{10})$/i

export function tokenDoTexto(texto: string): string | null {
  const t = texto.trim()
  const m = t.match(TOKEN_NO_FIM)
  if (!m) return null
  // So o token, ou um link: evita confundir com qualquer palavra de 10 letras A-F.
  if (t.length !== 10 && !/e.$/i.test(t.slice(0, -10))) return null
  return m[1].toUpperCase()
}

export interface ScanDetectorOptions {
  onScan: (token: string) => void
  // Leitor manda tecla a cada 5 a 30 ms; gente, acima de 60 ms.
  maxGapMs?: number
  now?: () => number
}

export function createScanDetector({ onScan, maxGapMs = 45, now = () => performance.now() }: ScanDetectorOptions) {
  let buffer = ''
  let last = 0

  return (e: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => {
    const t = now()
    const rapido = t - last <= maxGapMs
    last = t

    if (e.key === 'Enter') {
      const token = buffer.length >= 10 ? tokenDoTexto(buffer) : null
      buffer = ''
      if (token && rapido) {
        e.preventDefault()
        onScan(token)
      }
      return
    }
    if (e.key.length !== 1) return // Shift, Alt etc. vem no meio do link
    buffer = rapido ? buffer + e.key : e.key
    if (buffer.length > 200) buffer = buffer.slice(-200)
  }
}
