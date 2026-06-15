import { useEffect, useState } from 'react'
import { useSession } from '../store/session'
import { formatTon } from '../lib/format'
import cpIntactoPng from '../../../../resources/cp-intacto.png'
import cpRompidoPng from '../../../../resources/cp-rompido.png'

export function CPStage() {
  const { state } = useSession()
  const phase = state.phase
  const isLoading = phase === 'loading'
  const isRuptured = phase === 'ruptured' || phase === 'sealed'

  const [shouldShake, setShouldShake] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setShouldShake(isLoading && state.press.current_kgf > 1500)
  }, [isLoading, state.press.current_kgf])

  // Tick 1Hz pra cronômetro
  useEffect(() => {
    if (!isLoading) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [isLoading])

  const elapsedMs =
    isLoading && state.press.session_started_at
      ? now - state.press.session_started_at
      : 0
  const elapsedLabel = formatElapsed(elapsedMs)

  if (!state.selectedSpecimenId) {
    return (
      <section className="flex-1 flex items-center justify-center text-center p-12">
        <div className="max-w-md">
          <div className="label-mute mb-3">Aguardando selecao</div>
          <h2 className="text-bs-text text-lg mb-2">Escolhe um CP da fila</h2>
          <p className="text-bs-text-mute text-sm">
            Os CPs pendentes com vencimento próximo aparecem na lateral. Clique pra
            posicionar no palco.
          </p>
        </div>
      </section>
    )
  }

  const sp = state.specimens.find((s) => s.id === state.selectedSpecimenId)

  // Carga em MPa pra avaliar atingimento do fck (live)
  const liveMpa = sp
    ? (state.press.current_kgf * 9.80665) /
      (Math.PI * Math.pow(sp.specimen_diameter_mm / 2, 2))
    : 0
  const is28d = sp?.test_age_days === 28
  const reachedFck = is28d && sp?.fck_spec_mpa ? liveMpa >= sp.fck_spec_mpa : false
  // Cor da carga: 28d → verde se atingiu, vermelho se não. Outras idades → azul.
  const cargaColor = is28d
    ? reachedFck
      ? 'text-bs-success'
      : 'text-bs-danger'
    : 'text-bs-accent'
  const cargaGlow = isLoading
    ? is28d
      ? reachedFck
        ? 'border-bs-success/50 shadow-[0_0_20px_rgba(34,197,94,0.18)]'
        : 'border-bs-danger/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
      : 'border-bs-accent/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
    : 'border-bs-border'

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-12 relative overflow-hidden bg-gradient-to-b from-bs-bg to-[#0c1218]">
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          background:
            'radial-gradient(circle at 50% 60%, rgba(88,166,255,0.10) 0%, transparent 60%)',
          opacity: isLoading ? 1 : 0.3
        }}
      />

      {/* Stage com cross-fade */}
      <div className="grid place-items-center" style={{ gridTemplateAreas: '"a"' }}>
        <img
          src={cpIntactoPng}
          alt="CP intacto"
          className={`block ${shouldShake ? 'animate-shake' : 'animate-float'}`}
          style={{
            gridArea: 'a',
            maxHeight: 460,
            transition: 'opacity 0.6s ease-in-out',
            opacity: isRuptured ? 0 : 1,
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))'
          }}
        />
        <img
          src={cpRompidoPng}
          alt="CP rompido"
          className="block animate-float"
          style={{
            gridArea: 'a',
            maxHeight: 460,
            transition: 'opacity 0.6s ease-in-out',
            opacity: isRuptured ? 1 : 0,
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))'
          }}
        />
      </div>

      {/* Codigo do CP */}
      <div className="mt-6 text-center">
        <div className="text-bs-text font-medium text-lg tracking-tight">
          {sp?.specimen_code}
        </div>
        <div className="text-bs-text-mute text-sm">
          {sp?.project_name}
          {sp?.structure_name ? ` · ${sp.structure_name}` : ''} · Lote {sp?.batch_code} ·{' '}
          {sp?.test_age_days}d
        </div>
      </div>

      {/* Live readings: card unificado, Carga destacada inline */}
      <div
        className={`mt-6 rounded-xl border bg-bs-panel/70 backdrop-blur-sm transition flex items-stretch divide-x divide-bs-border overflow-hidden ${cargaGlow}`}
      >
        <div className="px-5 py-3 flex flex-col justify-center min-w-[180px]">
          <div className="flex items-center gap-2 leading-none mb-1">
            <span className="label-mute">Carga</span>
            {isLoading && (
              <span className="text-[9px] font-semibold text-bs-text-dim uppercase tracking-wider flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-bs-danger animate-pulse" />
                ao vivo
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-sans tabular-nums tracking-tight text-3xl font-bold leading-none ${cargaColor}`}
            >
              {formatTon(state.press.current_kgf, 2)}
            </span>
            <span className="text-bs-text-dim text-xs font-medium">ton</span>
            {is28d && sp?.fck_spec_mpa && (
              <span
                className={`ml-1 text-[10px] font-medium ${
                  reachedFck ? 'text-bs-success' : 'text-bs-text-mute'
                }`}
              >
                {liveMpa.toFixed(1)}/{sp.fck_spec_mpa} MPa
              </span>
            )}
          </div>
        </div>

        <ReadingMetric label="Pico" value={formatTon(state.press.peak_kgf, 2)} unit="ton" />
        <ReadingMetric label="Tempo" value={elapsedLabel} unit="" />
      </div>
    </section>
  )
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function ReadingMetric({
  label,
  value,
  unit
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="px-5 py-3 min-w-[110px] flex flex-col justify-center">
      <span className="label-mute leading-none mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-sans tabular-nums tracking-tight text-xl font-semibold leading-none text-bs-text">
          {value}
        </span>
        {unit && (
          <span className="text-bs-text-mute text-[11px] font-medium leading-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}
