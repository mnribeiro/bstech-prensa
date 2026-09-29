// Larguras da fila (esquerda) e da coluna do resultado (direita), arrastaveis.
// No notebook o grafico do meio ficava apertado; cada computador guarda o seu ajuste.
import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'bstech-prensa-colunas'
export const LIMITS = { left: { min: 240, max: 460 }, right: { min: 280, max: 460 } }
const MIN_CENTER = 420

interface Widths {
  left: number
  right: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function initial(): Widths {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Widths | null
    if (saved?.left && saved?.right) return saved
  } catch {
    // sem storage cai no padrao pela tela
  }
  const w = window.innerWidth
  return {
    left: clamp(Math.round(w * 0.22), LIMITS.left.min, 380),
    right: clamp(Math.round(w * 0.24), LIMITS.right.min, 400)
  }
}

export function useColumnWidths() {
  const [widths, setWidths] = useState<Widths>(initial)
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null)
  const start = useRef({ x: 0, w: 0, total: 0 })

  const begin = useCallback(
    (side: 'left' | 'right', e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault()
      const total = e.currentTarget.parentElement?.getBoundingClientRect().width ?? window.innerWidth
      start.current = { x: e.clientX, w: widths[side], total }
      setDragging(side)
    },
    [widths]
  )

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const { x, w, total } = start.current
      const dx = e.clientX - x
      setWidths((cur) => {
        const other = dragging === 'left' ? cur.right : cur.left
        const lim = LIMITS[dragging]
        const max = Math.min(lim.max, total - other - MIN_CENTER)
        const next = clamp(dragging === 'left' ? w + dx : w - dx, lim.min, Math.max(lim.min, max))
        return { ...cur, [dragging]: next }
      })
    }
    const up = () => setDragging(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

  useEffect(() => {
    if (dragging) return
    try {
      localStorage.setItem(KEY, JSON.stringify(widths))
    } catch {
      // sem storage so nao lembra
    }
  }, [widths, dragging])

  const reset = useCallback((side: 'left' | 'right') => {
    const d = (() => {
      try {
        localStorage.removeItem(KEY)
      } catch {
        // nada
      }
      return initial()
    })()
    setWidths((cur) => ({ ...cur, [side]: d[side] }))
  }, [])

  return { widths, dragging, begin, reset }
}
