// Curva carga x tempo do ensaio. Durante o ensaio a curva cresce ao vivo; na
// ruptura ela segue ate o fim da queda e o pico ganha o valor em MPa. O outro
// exemplar do lote, se ja rompido, aparece tracejado por baixo.
import { useEffect, useRef, useState } from 'react'
import type { PressReading, Specimen } from '@shared/types'
import { diameterOf, correctedMpa, fmt, peakPoint } from '../lib/rupture'

// Fracao do fck esperada por idade, so pra dimensionar o eixo antes do ensaio
const AGE_FACTOR: Record<number, number> = { 3: 0.55, 7: 0.74, 14: 0.9, 28: 1.1, 63: 1.2 }

interface Props {
  sp: Specimen
  readings: PressReading[]
  ruptured: boolean
  ghost: PressReading[] | null
}

function useSize<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ w: 600, h: 300 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize({ w: Math.max(200, width), h: Math.max(80, height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

export function PressChart({ sp, readings, ruptured, ghost }: Props) {
  const { ref, w: W, h: H } = useSize<SVGSVGElement>()
  const d = diameterOf(sp)
  const area = Math.PI * (d / 2) ** 2
  const mpaToTf = (m: number) => (m * area) / 9806.65
  const tf = (kgf: number) => kgf / 1000
  const fck = sp.fck_spec_mpa ?? 25
  const fckTf = mpaToTf(fck)
  const expected = fck * (AGE_FACTOR[sp.test_age_days] ?? 1)

  const pk = peakPoint(readings)
  const ghostPk = ghost ? peakPoint(ghost) : null
  const lastT = readings.length ? readings[readings.length - 1].t / 1000 : 0
  const ghostLastT = ghost?.length ? ghost[ghost.length - 1].t / 1000 : 0

  const yMax =
    Math.max(mpaToTf(expected), fckTf, pk ? tf(pk.kgf) : 0, ghostPk ? tf(ghostPk.kgf) : 0) * 1.22
  const xMax = Math.max(expected / 0.45 + 8, lastT + 6, ghostLastT + 6)
  const L = 54
  const R = 20
  const T = 16
  const B = 24
  const X = (s: number) => L + (s / xMax) * (W - L - R)
  const Y = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const path = (pts: PressReading[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t / 1000).toFixed(1)} ${Y(tf(p.kgf)).toFixed(1)}`).join(' ')

  const stepY = yMax > 40 ? 10 : 5
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += stepY) yTicks.push(v)
  const stepX = xMax > 90 ? 20 : 10
  const xTicks: number[] = []
  for (let s = 0; s <= xMax; s += stepX) xTicks.push(s)

  const last = readings[readings.length - 1]
  const peak = ruptured ? pk : null

  return (
    <svg ref={ref} className="w-full h-full block" viewBox={`0 0 ${W} ${H}`}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="stroke-bs-text/[0.06]" />
          <text x={L - 10} y={Y(v) + 4} textAnchor="end" fontSize={11} className="fill-bs-text-mute">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((s) => (
        <text key={`x${s}`} x={X(s)} y={H - 6} textAnchor="middle" fontSize={11} className="fill-bs-text-mute">
          {s}s
        </text>
      ))}
      <text x={L - 10} y={T - 4} textAnchor="end" fontSize={10} className="fill-bs-text-mute">
        tf
      </text>
      <line
        x1={L}
        x2={W - R}
        y1={Y(fckTf)}
        y2={Y(fckTf)}
        strokeDasharray="5 5"
        strokeWidth={1.3}
        className="stroke-bs-warning"
      />
      {ghost && ghost.length > 1 && (
        <path
          d={path(ghost)}
          fill="none"
          strokeWidth={1.8}
          strokeDasharray="6 5"
          strokeLinejoin="round"
          className="stroke-bs-text-mute"
        />
      )}
      {readings.length > 1 && (
        <>
          <path
            d={`${path(readings)} L${X(lastT)} ${Y(0)} L${X(readings[0].t / 1000)} ${Y(0)} Z`}
            className="fill-bs-accent/10"
          />
          <path d={path(readings)} fill="none" strokeWidth={2.6} strokeLinejoin="round" className="stroke-bs-accent" />
        </>
      )}
      {!ruptured && last && readings.length > 1 && (
        <circle cx={X(last.t / 1000)} cy={Y(tf(last.kgf))} r={4.5} className="fill-bs-accent" />
      )}
      {peak && (
        <PeakMark
          px={X(peak.t / 1000)}
          py={Y(tf(peak.kgf))}
          L={L}
          tfValue={tf(peak.kgf)}
          mpa={correctedMpa(peak.kgf, sp)}
        />
      )}
    </svg>
  )
}

function PeakMark({ px, py, L, tfValue, mpa }: { px: number; py: number; L: number; tfValue: number; mpa: number }) {
  return (
    <g>
      <line x1={L} x2={px} y1={py} y2={py} strokeDasharray="3 4" className="stroke-bs-accent/60" />
      <rect x={L - 50} y={py - 11} width={46} height={22} rx={5} className="fill-bs-accent" />
      <text x={L - 27} y={py + 4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#fff">
        {fmt(tfValue, 1)}
      </text>
      <circle cx={px} cy={py} r={12} className="fill-bs-accent/20" />
      <circle cx={px} cy={py} r={5.5} strokeWidth={2} stroke="#fff" className="fill-bs-accent" />
      <text x={px} y={py - 22} textAnchor="middle" fontSize={16} fontWeight={700} className="fill-bs-text">
        {fmt(mpa)} MPa
      </text>
    </g>
  )
}

