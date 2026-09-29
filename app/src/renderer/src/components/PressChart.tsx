// Curva carga x tempo do ensaio. Durante o ensaio a curva cresce ao vivo; na
// ruptura ela segue ate o fim da queda e o pico ganha o valor em MPa. O outro
// exemplar do lote, se ja rompido, aparece tracejado por baixo.
import { useEffect, useRef, useState } from 'react'
import type { PressReading, Specimen } from '@shared/types'
import { diameterOf, correctedMpa, fmt, mmss, peakPoint, verdictOf, type Verdict } from '../lib/rupture'

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
  const xMax = Math.max(expected / 0.52 + 8, lastT + 6, ghostLastT + 6)
  const L = 54
  const R = 20
  const T = 16
  const B = 24
  const X = (s: number) => L + (s / xMax) * (W - L - R)
  const Y = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const path = (raw: PressReading[]) =>
    semDegrau(raw)
      .map((p, i) => `${i ? 'L' : 'M'}${X(p.t / 1000).toFixed(1)} ${Y(tf(p.kgf)).toFixed(1)}`)
      .join(' ')

  const stepY = yMax > 40 ? 10 : 5
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += stepY) yTicks.push(v)
  const stepX = xMax > 90 ? 20 : 10
  const xTicks: number[] = []
  for (let s = 0; s <= xMax; s += stepX) xTicks.push(s)

  const last = readings[readings.length - 1]
  const peak = ruptured ? pk : null
  // Rompido: a curva termina no pico, a queda depois da ruptura nao entra
  const drawn = peak ? readings.filter((r) => r.t <= peak.t) : readings
  const drawnLastT = drawn.length ? drawn[drawn.length - 1].t / 1000 : 0
  // Marca do pico nos eixos esconde o numero da escala que ficaria por baixo dela
  const peakY = peak ? Y(tf(peak.kgf)) : null
  const peakX = peak ? X(peak.t / 1000) : null

  return (
    <svg ref={ref} className="w-full h-full block" viewBox={`0 0 ${W} ${H}`}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="stroke-bs-text/[0.06]" />
          {(peakY == null || Math.abs(Y(v) - peakY) > 14) && (
            <text x={L - 10} y={Y(v) + 4} textAnchor="end" fontSize={11} className="fill-bs-text-mute">
              {v}
            </text>
          )}
        </g>
      ))}
      {xTicks.map((s) =>
        peakX != null && Math.abs(X(s) - peakX) < 34 ? null : (
          <text key={`x${s}`} x={X(s)} y={H - 6} textAnchor="middle" fontSize={11} className="fill-bs-text-mute">
            {s}s
          </text>
        )
      )}
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
      {drawn.length > 1 && (
        <>
          <path
            d={`${path(drawn)} L${X(drawnLastT)} ${Y(0)} L${X(drawn[0].t / 1000)} ${Y(0)} Z`}
            className="fill-bs-accent/10"
          />
          <path d={path(drawn)} fill="none" strokeWidth={2.6} strokeLinejoin="round" className="stroke-bs-accent" />
        </>
      )}
      {!ruptured && last && readings.length > 1 && (
        <circle cx={X(last.t / 1000)} cy={Y(tf(last.kgf))} r={4.5} className="fill-bs-accent" />
      )}
      {peak && (
        <PeakMark
          px={peakX!}
          py={peakY!}
          L={L}
          T={T}
          H={H}
          bottom={H - B}
          tfValue={tf(peak.kgf)}
          time={mmss(peak.t)}
          verdict={verdictOf(correctedMpa(peak.kgf, sp), sp)}
        />
      )}
    </svg>
  )
}

// O indicador atualiza ~3x por segundo e o app le 10x: o mesmo valor repetido
// desenhava a curva em escada. Fica o primeiro ponto de cada valor; platô longo
// (carga parada de verdade) mantem o ponto final pra continuar plano.
export function semDegrau(pts: PressReading[], platoMs = 600): PressReading[] {
  const out: PressReading[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    if (!prev || !next || p.kgf !== prev.kgf) {
      out.push(p)
      continue
    }
    if (next.kgf !== p.kgf) {
      const inicio = out[out.length - 1]
      if (p.t - inicio.t >= platoMs) out.push(p)
    }
  }
  return out
}

// Pico da ruptura marcado nos eixos: linha de chamada ate o eixo Y com a carga
// e regua ate o eixo X com o tempo. MPa e o resto ficam nos numeros embaixo do
// grafico. Verde atende o fck, vermelho fica abaixo, azul antes dos 28 dias.
const TONE = {
  pass: { fill: 'fill-bs-success', stroke: 'stroke-bs-success' },
  fail: { fill: 'fill-bs-danger', stroke: 'stroke-bs-danger' },
  neutral: { fill: 'fill-bs-accent', stroke: 'stroke-bs-accent' }
} as const

function PeakMark({
  px,
  py,
  L,
  T,
  H,
  bottom,
  tfValue,
  time,
  verdict
}: {
  px: number
  py: number
  L: number
  T: number
  H: number
  bottom: number
  tfValue: number
  time: string
  verdict: Verdict
}) {
  const tone = TONE[verdict]
  return (
    <g>
      <line x1={px} x2={px} y1={T} y2={bottom} strokeDasharray="2 4" strokeWidth={1} className="stroke-bs-text-mute" />
      <line x1={L} x2={px - 7} y1={py} y2={py} strokeDasharray="2 4" strokeWidth={1} className={tone.stroke} />
      <rect x={L - 47} y={py - 10} width={42} height={20} rx={5} className={tone.fill} />
      <text x={L - 26} y={py + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
        {fmt(tfValue, 1)}
      </text>
      <text x={px} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={700} className={tone.fill}>
        {time}
      </text>
      <circle cx={px} cy={py} r={5} strokeWidth={2} stroke="#fff" className={tone.fill} />
    </g>
  )
}

