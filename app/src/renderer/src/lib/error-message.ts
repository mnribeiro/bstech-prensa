/**
 * Extrai mensagem legível de qualquer erro:
 * - Error.message
 * - Erros do Supabase (PostgrestError) que tem .message + .details + .hint
 * - Strings cruas
 * - Objetos arbitrários (JSON stringify)
 */
export function errorMessage(err: unknown): string {
  return semHtml(rawMessage(err))
}

// Servidor fora do ar devolve a pagina HTML do Cloudflare (ex.: erro 520) e ela
// aparecia inteira na tela. Vira uma frase com o codigo.
function semHtml(msg: string): string {
  if (!/<!doctype html|<html/i.test(msg)) return msg
  const code = msg.match(/Error code (\d{3})/i)?.[1] ?? msg.match(/\b(5\d\d)\b/)?.[1]
  return `A BSTECH não respondeu${code ? ` (erro ${code} do servidor)` : ''}. O resultado continua guardado neste computador, tente de novo em instantes.`
}

function rawMessage(err: unknown): string {
  if (!err) return 'Erro desconhecido'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (typeof e.message === 'string') parts.push(e.message)
    if (typeof e.details === 'string' && e.details) parts.push(`(${e.details})`)
    if (typeof e.hint === 'string' && e.hint) parts.push(`hint: ${e.hint}`)
    if (typeof e.code === 'string' && e.code) parts.push(`[${e.code}]`)
    if (parts.length) return parts.join(' ')
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}
