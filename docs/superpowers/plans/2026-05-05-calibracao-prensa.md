# Calibração da Prensa - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar módulo completo de calibração da prensa de concreto no app Electron, replicando o processo manual da Brasil Solos (FRE-987): captura de leituras Modbus em N pontos de carga padrão, cálculo automático de erro de exatidão e repetitividade, persistência no Supabase e geração de relatório PDF compatível com o modelo Fastel.

**Architecture:**
- **Backend (main process)**: nova função `captureSnapshot(durationMs)` no `PressDriver` que coleta leituras durante uma janela e retorna `{ media, leituras[] }`. Novo conjunto de IPC `calibration:*` que NÃO depende de `startSession()` (sessão de ruptura é fluxo separado).
- **Storage**: novo schema `calibration` no Supabase BS&T BACKUP com tabelas `calibrations` (header) e `calibration_points` (7 pontos × 3 leituras + métricas calculadas). Isolamento por `client_id` via RLS.
- **Renderer**: nova rota "Calibração" via toggle no Sidebar (sem router pesado). Wizard ponto-a-ponto, biblioteca pura `lib/calibration-math.ts` testável com Vitest.
- **PDF**: gerado via `pdfkit` no main process (acesso a fs), retornado como Buffer e salvo em `userData/calibracoes/`.

**Tech Stack:** Electron + TypeScript + React + Tailwind + modbus-serial + Supabase JS + pdfkit + Vitest.

---

## File Structure

**Novos arquivos (main):**
- `app/src/main/calibration-pdf.ts` — geração do PDF FRE-XXX
- `app/src/main/calibration-ipc.ts` — handlers IPC `calibration:*`

**Novos arquivos (renderer):**
- `app/src/renderer/src/lib/calibration-math.ts` — funções puras (média, desvio, erros)
- `app/src/renderer/src/lib/calibration-math.test.ts` — testes Vitest
- `app/src/renderer/src/lib/calibration-api.ts` — wrappers Supabase
- `app/src/renderer/src/components/CalibrationWizard.tsx` — tela do wizard
- `app/src/renderer/src/components/CalibrationHistory.tsx` — histórico
- `app/src/renderer/src/components/CalibrationView.tsx` — root da rota

**Arquivos modificados:**
- `app/src/shared/types.ts` — tipos `CalibrationSnapshot`, `Calibration`, `CalibrationPoint`
- `app/src/shared/ipc.ts` — canais `CALIBRATION_*` + extensão da `ElectronAPI`
- `app/src/main/press-driver.ts` — método `captureSnapshot(ms): Promise<Snapshot>`
- `app/src/main/index.ts` — registra handlers de calibração
- `app/src/preload/index.ts` — expõe `bstech.calibration.*`
- `app/src/renderer/src/App.tsx` — toggle entre modo "ruptura" e "calibração"
- `app/src/renderer/src/components/Sidebar.tsx` — botão de modo
- `app/package.json` — deps `pdfkit`, `vitest`

**Migrations Supabase:**
- `docs/superpowers/plans/migrations/01-create-calibration-schema.sql`

---

## Schema Supabase (`calibration`)

```sql
CREATE SCHEMA IF NOT EXISTS calibration;

-- Header da calibração
CREATE TABLE calibration.calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  equipment_id uuid REFERENCES public.lab_equipment(id),
  numero text NOT NULL,                          -- ex "FRE-988"
  identificacao text,                            -- ex "FASTEL ENGENHARIA"
  equipamento_nome text NOT NULL,                -- "Prensa de Concreto 90 Ton."
  carga_digital_ton numeric(10,2),               -- 90
  transdutor_marca text,                         -- "Xidibei"
  escala_min_kgf integer DEFAULT 0,
  escala_max_kgf integer NOT NULL,               -- 90000
  validade date NOT NULL,
  temperatura_celsius numeric(5,2),
  calibrado_por text,                            -- "Brasil Solos Ltda"
  observacoes text,
  pdf_path text,                                 -- caminho local do PDF gerado
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE calibration.calibration_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_id uuid NOT NULL REFERENCES calibration.calibrations(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  carga_real_kgf integer NOT NULL,               -- 10000, 20000...
  leitura_1_kgf numeric(10,2) NOT NULL,
  leitura_2_kgf numeric(10,2) NOT NULL,
  leitura_3_kgf numeric(10,2) NOT NULL,
  media_kgf numeric(10,2) NOT NULL,
  desvio_padrao numeric(10,2) NOT NULL,
  erro_exatidao_pct numeric(6,2) NOT NULL,       -- (media - real) / real * 100
  repetitividade_pct numeric(6,2) NOT NULL,      -- (max - min) / real * 100
  UNIQUE (calibration_id, ordem)
);

CREATE INDEX idx_calibrations_client ON calibration.calibrations(client_id, created_at DESC);
CREATE INDEX idx_calibration_points_cal ON calibration.calibration_points(calibration_id, ordem);

ALTER TABLE calibration.calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration.calibration_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_iso_read" ON calibration.calibrations
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
  );
CREATE POLICY "client_iso_write" ON calibration.calibrations
  FOR ALL USING (
    client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "points_iso_read" ON calibration.calibration_points
  FOR SELECT USING (
    calibration_id IN (
      SELECT id FROM calibration.calibrations
      WHERE client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "points_iso_write" ON calibration.calibration_points
  FOR ALL USING (
    calibration_id IN (
      SELECT id FROM calibration.calibrations
      WHERE client_id IN (SELECT client_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

GRANT USAGE ON SCHEMA calibration TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA calibration TO authenticated, service_role;
```

---

## Tarefas

### Task 1: Migration do schema `calibration` no Supabase

**Files:**
- Create: `docs/superpowers/plans/migrations/01-create-calibration-schema.sql`

- [ ] **Step 1: Salvar a migration no arquivo SQL** (conteúdo na seção "Schema" acima)
- [ ] **Step 2: Aplicar via MCP** com `mcp__claude_ai_Supabase__apply_migration` (project_id `xbybwkfmbsknwlwuohbj`, name `create_calibration_schema`)
- [ ] **Step 3: Verificar tabelas** com `list_tables(schemas=['calibration'])`
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/migrations/01-create-calibration-schema.sql
git commit -m "feat(supabase): cria schema calibration com tabelas calibrations e calibration_points"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Modify: `app/src/shared/types.ts`

- [ ] **Step 1: Adicionar tipos no fim do arquivo**

```typescript
// Snapshot de leitura pra calibração (lê janela fixa, retorna média + amostras)
export interface CalibrationSnapshot {
  /** Média estabilizada das leituras */
  media_kgf: number
  /** Amostras coletadas durante a janela */
  samples: number[]
  /** Tempo total da captura em ms */
  duration_ms: number
}

export interface CalibrationPoint {
  ordem: number
  carga_real_kgf: number
  leitura_1_kgf: number | null
  leitura_2_kgf: number | null
  leitura_3_kgf: number | null
  media_kgf: number | null
  desvio_padrao: number | null
  erro_exatidao_pct: number | null
  repetitividade_pct: number | null
}

export interface Calibration {
  id?: string
  client_id?: string
  equipment_id: string | null
  numero: string
  identificacao: string | null
  equipamento_nome: string
  carga_digital_ton: number | null
  transdutor_marca: string | null
  escala_min_kgf: number
  escala_max_kgf: number
  validade: string // YYYY-MM-DD
  temperatura_celsius: number | null
  calibrado_por: string | null
  observacoes: string | null
  pdf_path: string | null
  points: CalibrationPoint[]
  created_at?: string
}

/** Pontos default do FRE-987 */
export const DEFAULT_CALIBRATION_POINTS_KGF = [10000, 20000, 30000, 50000, 70000, 80000, 90000]
```

- [ ] **Step 2: Commit**

```bash
git add app/src/shared/types.ts
git commit -m "feat(types): adiciona tipos CalibrationSnapshot, Calibration, CalibrationPoint"
```

---

### Task 3: Lib pura de cálculos com testes (TDD)

**Files:**
- Create: `app/src/renderer/src/lib/calibration-math.ts`
- Test: `app/src/renderer/src/lib/calibration-math.test.ts`

- [ ] **Step 1: Instalar Vitest se ainda não estiver**

Run: `cd app && npm install -D vitest`
Adicionar script em `app/package.json`: `"test": "vitest"`

- [ ] **Step 2: Escrever os testes (FAILING)**

```typescript
// app/src/renderer/src/lib/calibration-math.test.ts
import { describe, it, expect } from 'vitest'
import {
  mean,
  stddev,
  exatidaoPct,
  repetitividadePct,
  computePoint
} from './calibration-math'

describe('mean', () => {
  it('média simples', () => {
    expect(mean([10, 20, 30])).toBe(20)
  })
})

describe('stddev', () => {
  it('desvio padrão amostral (n-1)', () => {
    // valores do FRE-987 ponto 10000: 9950, 9880, 9850 -> sd ~= 51.32
    const sd = stddev([9950, 9880, 9850])
    expect(sd).toBeCloseTo(51.32, 1)
  })
})

describe('exatidaoPct', () => {
  it('erro de exatidão = (média - real) / real * 100', () => {
    // ponto 10000: média 9893.33 -> -1.07%
    expect(exatidaoPct(9893.33, 10000)).toBeCloseTo(-1.07, 1)
  })
})

describe('repetitividadePct', () => {
  it('(max - min) / real * 100', () => {
    // ponto 10000: max 9950, min 9850 -> 1.00%, mas FRE mostra 0.00 → arredonda?
    // Vamos validar com ponto 20000: 19870, 19700, 19900 -> (19900-19700)/20000*100 = 1.00
    // FRE mostra -2.65 (assinatura diferente, possivelmente usa fórmula com sinal)
    // Mantemos definição padrão NBR: (max-min)/real*100 sem sinal
    expect(repetitividadePct([19870, 19700, 19900], 20000)).toBeCloseTo(1.0, 2)
  })
})

describe('computePoint', () => {
  it('calcula tudo a partir de 3 leituras + carga real', () => {
    const r = computePoint([9950, 9880, 9850], 10000)
    expect(r.media_kgf).toBeCloseTo(9893.33, 1)
    expect(r.desvio_padrao).toBeCloseTo(51.32, 1)
    expect(r.erro_exatidao_pct).toBeCloseTo(-1.07, 1)
  })
})
```

- [ ] **Step 3: Rodar testes (FAIL esperado)**

Run: `cd app && npx vitest run src/renderer/src/lib/calibration-math.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 4: Implementar `calibration-math.ts`**

```typescript
export function mean(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

export function exatidaoPct(media: number, real: number): number {
  if (real === 0) return 0
  return ((media - real) / real) * 100
}

export function repetitividadePct(xs: number[], real: number): number {
  if (!xs.length || real === 0) return 0
  const max = Math.max(...xs)
  const min = Math.min(...xs)
  return ((max - min) / real) * 100
}

export interface PointResult {
  media_kgf: number
  desvio_padrao: number
  erro_exatidao_pct: number
  repetitividade_pct: number
}

export function computePoint(leituras: number[], cargaReal: number): PointResult {
  const m = mean(leituras)
  return {
    media_kgf: round2(m),
    desvio_padrao: round2(stddev(leituras)),
    erro_exatidao_pct: round2(exatidaoPct(m, cargaReal)),
    repetitividade_pct: round2(repetitividadePct(leituras, cargaReal))
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

- [ ] **Step 5: Rodar testes (PASS)**

Run: `cd app && npx vitest run src/renderer/src/lib/calibration-math.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/src/lib/calibration-math.ts app/src/renderer/src/lib/calibration-math.test.ts app/package.json app/package-lock.json
git commit -m "feat(math): lib pura de cálculos de calibração com testes"
```

---

### Task 4: Snapshot no PressDriver

**Files:**
- Modify: `app/src/main/press-driver.ts`

- [ ] **Step 1: Adicionar método `captureSnapshot`**

```typescript
/**
 * Captura uma janela de leituras sem entrar em sessão de ruptura.
 * Usado pra calibração: estabiliza com média de N amostras.
 */
async captureSnapshot(durationMs: number = 2000): Promise<{ media_kgf: number; samples: number[]; duration_ms: number }> {
  if (!this.connected) throw new Error('Prensa não conectada')
  const samples: number[] = []
  const start = Date.now()
  const interval = this.config.poll_interval_ms

  while (Date.now() - start < durationMs) {
    try {
      const v = this.mode === 'mock' ? this.readMockSnapshot() : await this.readModbus()
      if (v !== null) samples.push(v)
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
    await new Promise((r) => setTimeout(r, interval))
  }

  const media = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0
  return { media_kgf: Math.round(media * 100) / 100, samples, duration_ms: Date.now() - start }
}

private readMockSnapshot(): number {
  // Mock: simula uma carga arbitrária com ruído ±0.5%
  const base = 50000
  return base + (Math.random() - 0.5) * 500
}
```

- [ ] **Step 2: Build e rodar app em mock**

Run: `cd app && npm run dev`
Expected: build limpo, sem erro TS

- [ ] **Step 3: Commit**

```bash
git add app/src/main/press-driver.ts
git commit -m "feat(driver): adiciona captureSnapshot para calibração"
```

---

### Task 5: IPC de calibração + preload

**Files:**
- Modify: `app/src/shared/ipc.ts`
- Create: `app/src/main/calibration-ipc.ts`
- Modify: `app/src/main/index.ts`
- Modify: `app/src/preload/index.ts`

- [ ] **Step 1: Adicionar canais em `ipc.ts`**

```typescript
// Acrescentar dentro do objeto IPC:
CALIBRATION_CAPTURE: 'calibration:capture',
CALIBRATION_GENERATE_PDF: 'calibration:generate-pdf',
```

E na interface ElectronAPI:

```typescript
calibration: {
  capture: (durationMs?: number) => Promise<{ media_kgf: number; samples: number[]; duration_ms: number }>
  generatePdf: (calibration: import('./types').Calibration) => Promise<{ ok: boolean; path?: string; error?: string }>
}
```

- [ ] **Step 2: Criar `calibration-ipc.ts`**

```typescript
import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { PressDriver } from './press-driver'
import { generateCalibrationPdf } from './calibration-pdf'
import type { Calibration } from '../shared/types'

export function registerCalibrationIpc(driver: PressDriver) {
  ipcMain.handle(IPC.CALIBRATION_CAPTURE, async (_e, durationMs?: number) => {
    return await driver.captureSnapshot(durationMs ?? 2000)
  })

  ipcMain.handle(IPC.CALIBRATION_GENERATE_PDF, async (_e, calibration: Calibration) => {
    try {
      const path = await generateCalibrationPdf(calibration)
      return { ok: true, path }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
```

- [ ] **Step 3: Registrar em `main/index.ts`**

Encontrar onde os handlers atuais são registrados, adicionar:
```typescript
import { registerCalibrationIpc } from './calibration-ipc'
// ... depois da criação do driver
registerCalibrationIpc(driver)
```

- [ ] **Step 4: Expor em `preload/index.ts`**

```typescript
calibration: {
  capture: (durationMs?: number) => ipcRenderer.invoke(IPC.CALIBRATION_CAPTURE, durationMs),
  generatePdf: (calibration) => ipcRenderer.invoke(IPC.CALIBRATION_GENERATE_PDF, calibration)
}
```

- [ ] **Step 5: Build limpo**

Run: `cd app && npm run typecheck` (se existir) ou apenas `npm run dev` e ver se compila

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/ipc.ts app/src/main/calibration-ipc.ts app/src/main/index.ts app/src/preload/index.ts
git commit -m "feat(ipc): canais calibration:capture e calibration:generate-pdf"
```

---

### Task 6: Geração de PDF (FRE-XXX)

**Files:**
- Create: `app/src/main/calibration-pdf.ts`
- Modify: `app/package.json` (dep `pdfkit`)

- [ ] **Step 1: Instalar pdfkit**

Run: `cd app && npm install pdfkit && npm install -D @types/pdfkit`

- [ ] **Step 2: Implementar `calibration-pdf.ts` replicando o layout do FRE-987**

Estrutura: cabeçalho (Número, equipamento, validade, marca transdutor) → tabela de pontos (Carga Real | 1ª/2ª/3ª Leitura | Média | Desvio | Exatidão % | Repetitividade %) → rodapé com bloco de observações fixo (texto da célula padrão Alfa, certificado CETEC) → assinatura.

```typescript
import PDFDocument from 'pdfkit'
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Calibration } from '../shared/types'

const FOOTER_NOTES = `Repetitividade:
Variação das medidas obtidas por um único operador, utilizando o mesmo equipamento de medição e método, ao medir repetidas vezes uma mesma grandeza de uma única peça (corpo de prova).

Célula de Carga da marca Alfa Instrumentos, número 1141609, modelo C 200T, ano de fabricação 2011, que atende aos requisitos específicos, sendo realizada a calibração pelo Laboratório Isaac Newton, Laboratório de Calibração Acreditado pela CGCRE / INMETRO de acordo com NBR ISO/IEC 17025, sob o número CAL 0045, integrante da Rede Brasileira de Calibração (RBC), calibração a compressão segundo NBR ISO 376:2012 e Procedimento Tecnico CETEC SENAI PT 1102 (V.1.0) PR-003. (Indicador Digital marca Alfa Instrumentos, nº 1092F5, modelo 3101C - Ano 2011).
Certificado de Calibração Nº 1240346 - CETEC / SENAI / FIEMG.`

export async function generateCalibrationPdf(cal: Calibration): Promise<string> {
  const dir = path.join(app.getPath('userData'), 'calibracoes')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${cal.numero}.pdf`)

  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  const stream = (await import('node:fs')).createWriteStream(filePath)
  doc.pipe(stream)

  // Cabeçalho
  doc.fontSize(16).font('Helvetica-Bold').text('CALIBRAÇÃO COMPRESSÃO LEITOR DIGITAL', { align: 'center' })
  doc.moveDown()

  doc.fontSize(10).font('Helvetica')
  const header = [
    ['Número:', cal.numero],
    ['Identificação:', cal.identificacao ?? ''],
    ['Equipamento:', cal.equipamento_nome],
    ['Carga Digital:', `${cal.carga_digital_ton ?? ''} Toneladas`],
    ['Transdutor de pressão:', `Marca: ${cal.transdutor_marca ?? ''}`],
    ['Escala:', `${cal.escala_min_kgf} a ${cal.escala_max_kgf} Kgf`],
    ['Validade:', cal.validade],
    ['Temperatura Ambiente:', cal.temperatura_celsius != null ? `${cal.temperatura_celsius} °C` : ''],
    ['Calibrado por:', cal.calibrado_por ?? '']
  ]
  for (const [k, v] of header) {
    doc.font('Helvetica-Bold').text(k, { continued: true }).font('Helvetica').text(' ' + v)
  }

  doc.moveDown()

  // Tabela
  const startX = 40
  let y = doc.y
  const cols = [
    { label: 'CARGA\nReal (Kgf)', w: 65 },
    { label: '1ª Leitura', w: 60 },
    { label: '2ª Leitura', w: 60 },
    { label: '3ª Leitura', w: 60 },
    { label: 'Média', w: 60 },
    { label: 'Desvio\nPadrão', w: 55 },
    { label: 'Erro\nExatidão (%)', w: 65 },
    { label: 'Repetit.\n(%)', w: 60 }
  ]
  doc.font('Helvetica-Bold').fontSize(8)
  let x = startX
  for (const c of cols) {
    doc.rect(x, y, c.w, 30).stroke()
    doc.text(c.label, x + 2, y + 4, { width: c.w - 4, align: 'center' })
    x += c.w
  }
  y += 30

  doc.font('Helvetica').fontSize(9)
  for (const p of cal.points) {
    x = startX
    const cells = [
      String(p.carga_real_kgf),
      fmt(p.leitura_1_kgf),
      fmt(p.leitura_2_kgf),
      fmt(p.leitura_3_kgf),
      fmt(p.media_kgf),
      fmt(p.desvio_padrao),
      fmt(p.erro_exatidao_pct),
      fmt(p.repetitividade_pct)
    ]
    for (let i = 0; i < cols.length; i++) {
      doc.rect(x, y, cols[i].w, 20).stroke()
      doc.text(cells[i], x + 2, y + 6, { width: cols[i].w - 4, align: 'center' })
      x += cols[i].w
    }
    y += 20
  }

  doc.moveDown(2)
  doc.fontSize(8).font('Helvetica').text(FOOTER_NOTES, { align: 'justify' })

  doc.moveDown(3)
  doc.fontSize(10).text('_______________________________', { align: 'center' })
  doc.text(cal.calibrado_por ?? '', { align: 'center' })

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', reject)
  })
  return filePath
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
```

- [ ] **Step 3: Build limpo**

Run: `cd app && npm run dev`

- [ ] **Step 4: Commit**

```bash
git add app/src/main/calibration-pdf.ts app/package.json app/package-lock.json
git commit -m "feat(pdf): geração de relatório FRE-XXX com pdfkit"
```

---

### Task 7: API Supabase de calibração

**Files:**
- Create: `app/src/renderer/src/lib/calibration-api.ts`

- [ ] **Step 1: Implementar wrapper**

```typescript
import { getClient, getClientId } from './supabase'
import type { Calibration } from '@shared/types'

export async function saveCalibration(cal: Calibration): Promise<string> {
  const sb = await getClient()
  const clientId = await getClientId()

  const { data: header, error: e1 } = await sb
    .schema('calibration')
    .from('calibrations')
    .insert({
      client_id: clientId,
      equipment_id: cal.equipment_id,
      numero: cal.numero,
      identificacao: cal.identificacao,
      equipamento_nome: cal.equipamento_nome,
      carga_digital_ton: cal.carga_digital_ton,
      transdutor_marca: cal.transdutor_marca,
      escala_min_kgf: cal.escala_min_kgf,
      escala_max_kgf: cal.escala_max_kgf,
      validade: cal.validade,
      temperatura_celsius: cal.temperatura_celsius,
      calibrado_por: cal.calibrado_por,
      observacoes: cal.observacoes,
      pdf_path: cal.pdf_path
    })
    .select('id')
    .single()
  if (e1) throw e1

  const calibrationId = header.id

  const points = cal.points.map((p) => ({
    calibration_id: calibrationId,
    ordem: p.ordem,
    carga_real_kgf: p.carga_real_kgf,
    leitura_1_kgf: p.leitura_1_kgf,
    leitura_2_kgf: p.leitura_2_kgf,
    leitura_3_kgf: p.leitura_3_kgf,
    media_kgf: p.media_kgf,
    desvio_padrao: p.desvio_padrao,
    erro_exatidao_pct: p.erro_exatidao_pct,
    repetitividade_pct: p.repetitividade_pct
  }))

  const { error: e2 } = await sb.schema('calibration').from('calibration_points').insert(points)
  if (e2) throw e2

  return calibrationId
}

export async function listCalibrations(): Promise<Calibration[]> {
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .schema('calibration')
    .from('calibrations')
    .select('*, calibration_points(*)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row,
    points: (row.calibration_points ?? []).sort((a: any, b: any) => a.ordem - b.ordem)
  }))
}

export async function nextCalibrationNumber(): Promise<string> {
  const sb = await getClient()
  const clientId = await getClientId()
  const { data, error } = await sb
    .schema('calibration')
    .from('calibrations')
    .select('numero')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data?.length) return 'FRE-988'
  const m = /FRE-(\d+)/.exec(data[0].numero)
  if (!m) return 'FRE-988'
  return `FRE-${parseInt(m[1], 10) + 1}`
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/renderer/src/lib/calibration-api.ts
git commit -m "feat(api): wrappers Supabase para calibração (save/list/next-number)"
```

---

### Task 8: Componente CalibrationWizard

**Files:**
- Create: `app/src/renderer/src/components/CalibrationWizard.tsx`

- [ ] **Step 1: Implementar wizard com estado local**

```tsx
import { useState, useEffect } from 'react'
import { computePoint } from '../lib/calibration-math'
import { saveCalibration, nextCalibrationNumber } from '../lib/calibration-api'
import type { Calibration, CalibrationPoint } from '@shared/types'
import { DEFAULT_CALIBRATION_POINTS_KGF } from '@shared/types'

interface Props {
  onDone: () => void
}

export function CalibrationWizard({ onDone }: Props) {
  const [header, setHeader] = useState<Partial<Calibration>>({
    numero: '',
    identificacao: 'FASTEL ENGENHARIA',
    equipamento_nome: 'Prensa de Concreto 90 Ton.',
    carga_digital_ton: 90,
    transdutor_marca: 'Xidibei',
    escala_min_kgf: 0,
    escala_max_kgf: 90000,
    validade: '',
    temperatura_celsius: null,
    calibrado_por: 'Brasil Solos Ltda'
  })

  const [points, setPoints] = useState<CalibrationPoint[]>(
    DEFAULT_CALIBRATION_POINTS_KGF.map((kgf, i) => ({
      ordem: i + 1,
      carga_real_kgf: kgf,
      leitura_1_kgf: null,
      leitura_2_kgf: null,
      leitura_3_kgf: null,
      media_kgf: null,
      desvio_padrao: null,
      erro_exatidao_pct: null,
      repetitividade_pct: null
    }))
  )

  const [capturing, setCapturing] = useState<{ pointIdx: number; readingIdx: 1 | 2 | 3 } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    nextCalibrationNumber().then((n) => setHeader((h) => ({ ...h, numero: n }))).catch(() => {})
    // Validade default: 1 ano
    const v = new Date()
    v.setFullYear(v.getFullYear() + 1)
    setHeader((h) => ({ ...h, validade: v.toISOString().slice(0, 10) }))
  }, [])

  async function captureReading(pointIdx: number, readingIdx: 1 | 2 | 3) {
    setCapturing({ pointIdx, readingIdx })
    try {
      const snap = await window.bstech.calibration.capture(2000)
      setPoints((prev) => {
        const copy = [...prev]
        const p = { ...copy[pointIdx] }
        if (readingIdx === 1) p.leitura_1_kgf = snap.media_kgf
        if (readingIdx === 2) p.leitura_2_kgf = snap.media_kgf
        if (readingIdx === 3) p.leitura_3_kgf = snap.media_kgf
        // Recalcula se temos as 3
        if (p.leitura_1_kgf != null && p.leitura_2_kgf != null && p.leitura_3_kgf != null) {
          const r = computePoint(
            [p.leitura_1_kgf, p.leitura_2_kgf, p.leitura_3_kgf],
            p.carga_real_kgf
          )
          p.media_kgf = r.media_kgf
          p.desvio_padrao = r.desvio_padrao
          p.erro_exatidao_pct = r.erro_exatidao_pct
          p.repetitividade_pct = r.repetitividade_pct
        }
        copy[pointIdx] = p
        return copy
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCapturing(null)
    }
  }

  const allPointsComplete = points.every(
    (p) => p.leitura_1_kgf != null && p.leitura_2_kgf != null && p.leitura_3_kgf != null
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const cal: Calibration = {
        ...(header as Calibration),
        equipment_id: null,
        observacoes: null,
        pdf_path: null,
        points
      }
      // Gera PDF primeiro
      const pdfRes = await window.bstech.calibration.generatePdf(cal)
      if (!pdfRes.ok) throw new Error(pdfRes.error ?? 'Falha ao gerar PDF')
      cal.pdf_path = pdfRes.path ?? null
      // Salva no Supabase
      await saveCalibration(cal)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <h2 className="text-2xl font-bold">Nova Calibração — {header.numero}</h2>

      {/* Header inputs */}
      <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded">
        <Field label="Identificação" value={header.identificacao ?? ''} onChange={(v) => setHeader({ ...header, identificacao: v })} />
        <Field label="Equipamento" value={header.equipamento_nome ?? ''} onChange={(v) => setHeader({ ...header, equipamento_nome: v })} />
        <Field label="Carga Digital (ton)" type="number" value={String(header.carga_digital_ton ?? '')} onChange={(v) => setHeader({ ...header, carga_digital_ton: Number(v) })} />
        <Field label="Transdutor (marca)" value={header.transdutor_marca ?? ''} onChange={(v) => setHeader({ ...header, transdutor_marca: v })} />
        <Field label="Validade" type="date" value={header.validade ?? ''} onChange={(v) => setHeader({ ...header, validade: v })} />
        <Field label="Temperatura (°C)" type="number" value={String(header.temperatura_celsius ?? '')} onChange={(v) => setHeader({ ...header, temperatura_celsius: v ? Number(v) : null })} />
        <Field label="Calibrado por" value={header.calibrado_por ?? ''} onChange={(v) => setHeader({ ...header, calibrado_por: v })} />
      </div>

      {/* Tabela de pontos */}
      <table className="w-full border-collapse text-sm">
        <thead className="bg-blue-100">
          <tr>
            <th className="border p-2">Carga Real</th>
            <th className="border p-2">1ª Leitura</th>
            <th className="border p-2">2ª Leitura</th>
            <th className="border p-2">3ª Leitura</th>
            <th className="border p-2">Média</th>
            <th className="border p-2">Desvio</th>
            <th className="border p-2">Exatidão %</th>
            <th className="border p-2">Repet. %</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, idx) => (
            <tr key={p.ordem}>
              <td className="border p-2 text-center font-bold">{p.carga_real_kgf.toLocaleString('pt-BR')}</td>
              {[1, 2, 3].map((ri) => {
                const val = ri === 1 ? p.leitura_1_kgf : ri === 2 ? p.leitura_2_kgf : p.leitura_3_kgf
                const isCapturing = capturing?.pointIdx === idx && capturing?.readingIdx === ri
                return (
                  <td key={ri} className="border p-2 text-center">
                    {val != null ? (
                      <span>{val.toLocaleString('pt-BR')}</span>
                    ) : (
                      <button
                        disabled={!!capturing}
                        onClick={() => captureReading(idx, ri as 1 | 2 | 3)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
                      >
                        {isCapturing ? 'Lendo...' : `Capturar ${ri}ª`}
                      </button>
                    )}
                  </td>
                )
              })}
              <td className="border p-2 text-center">{p.media_kgf?.toLocaleString('pt-BR') ?? '—'}</td>
              <td className="border p-2 text-center">{p.desvio_padrao?.toFixed(2) ?? '—'}</td>
              <td className="border p-2 text-center">{p.erro_exatidao_pct?.toFixed(2) ?? '—'}</td>
              <td className="border p-2 text-center">{p.repetitividade_pct?.toFixed(2) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <div className="bg-red-100 text-red-800 p-3 rounded">{error}</div>}

      <div className="flex gap-3">
        <button
          disabled={!allPointsComplete || saving}
          onClick={handleSave}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar e gerar PDF'}
        </button>
        <button onClick={onDone} className="px-4 py-2 bg-gray-300 rounded">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="flex flex-col text-xs">
      <span className="font-bold mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
    </label>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/renderer/src/components/CalibrationWizard.tsx
git commit -m "feat(ui): wizard de calibração ponto-a-ponto com cálculo ao vivo"
```

---

### Task 9: Histórico + integração na rota

**Files:**
- Create: `app/src/renderer/src/components/CalibrationHistory.tsx`
- Create: `app/src/renderer/src/components/CalibrationView.tsx`
- Modify: `app/src/renderer/src/components/Sidebar.tsx`
- Modify: `app/src/renderer/src/App.tsx`

- [ ] **Step 1: Implementar `CalibrationHistory.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { listCalibrations } from '../lib/calibration-api'
import type { Calibration } from '@shared/types'

interface Props {
  onNew: () => void
}

export function CalibrationHistory({ onNew }: Props) {
  const [list, setList] = useState<Calibration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listCalibrations()
      .then(setList)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex justify-between mb-4">
        <h2 className="text-2xl font-bold">Calibrações</h2>
        <button onClick={onNew} className="px-4 py-2 bg-blue-600 text-white rounded">
          + Nova calibração
        </button>
      </div>
      {loading ? (
        <p>Carregando...</p>
      ) : list.length === 0 ? (
        <p className="text-gray-500">Nenhuma calibração ainda.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Número</th>
              <th className="border p-2">Equipamento</th>
              <th className="border p-2">Validade</th>
              <th className="border p-2">Calibrado em</th>
              <th className="border p-2">PDF</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="border p-2 font-bold">{c.numero}</td>
                <td className="border p-2">{c.equipamento_nome}</td>
                <td className="border p-2">{c.validade}</td>
                <td className="border p-2">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="border p-2">{c.pdf_path ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implementar `CalibrationView.tsx`**

```tsx
import { useState } from 'react'
import { CalibrationWizard } from './CalibrationWizard'
import { CalibrationHistory } from './CalibrationHistory'

export function CalibrationView() {
  const [mode, setMode] = useState<'history' | 'new'>('history')
  if (mode === 'new') return <CalibrationWizard onDone={() => setMode('history')} />
  return <CalibrationHistory onNew={() => setMode('new')} />
}
```

- [ ] **Step 3: Adicionar toggle no `App.tsx`**

Adicionar estado `appMode: 'rupture' | 'calibration'` no SessionProvider OU como state local no App. Renderizar `CalibrationView` quando `appMode === 'calibration'`, senão o fluxo atual.

```tsx
// No App.tsx
const [appMode, setAppMode] = useState<'rupture' | 'calibration'>('rupture')

// Passar pra Sidebar e renderizar:
{appMode === 'calibration' ? (
  <CalibrationView />
) : (
  <>
    <CPStage />
    <InfoPanel ... />
  </>
)}
```

- [ ] **Step 4: Botão no Sidebar**

```tsx
<button
  onClick={() => onModeChange(appMode === 'calibration' ? 'rupture' : 'calibration')}
  className="..."
>
  {appMode === 'calibration' ? 'Voltar para Ruptura' : 'Calibração'}
</button>
```

- [ ] **Step 5: Build limpo + smoke test**

Run: `cd app && npm run dev`
Expected: app abre, botão "Calibração" no Sidebar, clica → vai pra histórico, "+ Nova" → wizard.

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/src/components/CalibrationHistory.tsx app/src/renderer/src/components/CalibrationView.tsx app/src/renderer/src/components/Sidebar.tsx app/src/renderer/src/App.tsx
git commit -m "feat(ui): integra rota de calibração com histórico e toggle no Sidebar"
```

---

### Task 10: Smoke test E2E em mock + validação final

- [ ] **Step 1: Rodar app em mock**

Run: `cd app && npm run dev`

- [ ] **Step 2: Validar fluxo manual**
  - Conecta prensa (mock)
  - Abre Calibração → Nova
  - Captura 3 leituras × 7 pontos (cada captura ~2s no mock)
  - Confere métricas calculadas ao vivo
  - Salva → confere se PDF foi gerado em `userData/calibracoes/FRE-XXX.pdf`
  - Volta ao histórico → calibração aparece na lista

- [ ] **Step 3: Validar com hardware real**

Setar `BSTECH_PRESS_MODE=modbus` no `.env` ou shell, conectar adapter RS485, repetir fluxo amanhã com a prensa pronta.

- [ ] **Step 4: Commit final + tag**

```bash
git tag v0.1.0-calibracao
git push --tags
```

---

## Notas

- **Validade FRE-987 do PDF**: usei NBR ISO 376:2012 (repetitividade = (max−min)/real, sinal removido). O FRE original tem alguns valores negativos na coluna que podem ser de uma fórmula com sinal — mantemos o padrão NBR positivo. Se Marcelo confirmar que precisa do sinal, troca `repetitividadePct` em 1 linha.
- **Numeração FRE**: `nextCalibrationNumber` busca a última do cliente e incrementa. Começa em FRE-988 (próximo do FRE-987 do Marcelo). Pode ser ajustada via input manual no header.
- **Texto do rodapé do PDF**: copiado literal do FRE-987. Se a Brasil Solos quiser variar (ex: outra célula padrão de referência), promove a campo configurável depois.
- **RLS**: políticas baseadas em `user_profiles.client_id`. Pra dev local com `DEMO_MODE=true`, o save Supabase será pulado se quiser (ajustar em `calibration-api.ts`). Recomendo testar contra Supabase real direto.
