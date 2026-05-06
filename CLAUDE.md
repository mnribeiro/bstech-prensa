# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Desktop app (Electron + React + TS) que captura **ruptura de corpos de prova (CPs) de concreto** direto da prensa via Modbus RTU, sela o resultado no Supabase do BStech e dispara os relatórios automáticos. Hardware-alvo: indicador **Novus N1500-LC** + USB-RS485. Existe também um módulo de **calibração da prensa** (wizard + PDF de certificado).

Co-branded **Brasil Solos × BStech** — Brasil Solos fabrica a prensa (hardware), BStech é a camada de software. Sócio na frente: Marcelo Moreira (não confundir com "Bertelli" que aparece em `demo-data.ts` como stub).

Backend Supabase compartilhado com a plataforma BStech principal (`xbybwkfmbsknwlwuohbj`). A app NÃO é dona do schema — usa tabelas/RPC/triggers que já existem no BStech (especialmente `rupture_readings` e a RPC `seal_rupture`).

## Comandos (rodar em `app/`)

```bash
npm run dev            # Electron dev, modo mock (curva simulada, sem hardware)
npm run dev:real       # Electron dev, BSTECH_PRESS_MODE=modbus (hardware real)
npm run start:real     # preview build com modbus real
npm run build          # build (main + preload + renderer)
npm run build:win      # build + instalador NSIS Windows (dist/)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .ts/.tsx
npm test               # vitest run (testa lib/calibration-math)
npm run test:watch
npm run icon           # gera resources/icon.ico a partir do favicon.svg (sharp + to-ico)
```

Scripts de hardware (rodar em `scripts/` na raiz, é projeto npm separado):

```bash
node test-modbus.js       # ping no Novus, valida fiação RS-485
node validar-conexao.js
node list-ports.js
node quick-loop.js / quick-test.js
```

## Modos do driver

`BSTECH_PRESS_MODE` controla o `PressDriver` (`app/src/main/press-driver.ts`):

- `mock` (default em dev): gera curva crescente até pico aleatório (18–32 ton) e dispara ruptura. Usado pra iterar UI sem hardware.
- `modbus`: lê do Novus via porta serial (config em `bstech-prensa-config.json`).

Em build empacotado, o `defaultMode` é forçado pra `modbus` no `index.ts` (env var ainda tem prioridade). Detector de ruptura: drop entre amostras consecutivas filtradas (rolling avg 3) acima do `rupture_drop_threshold_kgf`.

## Arquitetura

Três processos Electron (`app/src/`):

- **`main/`** — Node, dono do hardware e do disco.
  - `press-driver.ts`: EventEmitter (`reading`, `state`, `rupture`, `error`). Mock e modbus convivem na mesma classe.
  - `config-store.ts`: persiste `bstech-prensa-config.json` em `%APPDATA%/bstech-prensa/` (porta, baud, threshold, supabase url/anon, client_id).
  - `calibration-pdf.ts`: gera certificado PDF (pdfkit). Salva em `userData` quando empacotado, em `out/` em dev.
  - `index.ts`: registra todos os handlers IPC, cria a janela, instancia driver.
- **`preload/index.ts`** — `contextBridge`. Expõe `window.api` tipado por `ElectronAPI` em `shared/ipc.ts`. Toda chamada renderer→main passa por aqui.
- **`renderer/`** — React 18 + Tailwind. Usa `useReducer + Context` (`store/`). Componentes-chave: `CalibrationWizard`, `CalibrationHistory`, `CalibrationView`, `CPStage`, `RuptureModal`, `Sidebar`, `OperatorBar`, `PressStatusBar`, `LoginScreen`.
- **`shared/`** — `ipc.ts` (canais + tipo `ElectronAPI`) e `types.ts` (`PressConfig`, `PressReading`, `PressLiveState`, `Calibration`). É a fonte da verdade do contrato; **mexer aqui exige atualizar preload + handler no main + uso no renderer**.

### Fluxo de ruptura (golden path)

1. Login Supabase (`LoginScreen` + `AuthGate` no `App.tsx`).
2. Sidebar lista CPs moldados pendentes do cliente (query atravessa `specimens → batches → batch_structure_allocations → structures → global_concrete_specs` pra extrair `fck_mpa`; ver `lib/supabase.ts` / `lib/calibration-api.ts`). É M:N — sempre traversar a join table.
3. Operador seleciona CP, clica "Iniciar ensaio" → `press:start-session`.
4. Main faz polling Modbus, broadcast `press:reading`/`press:state`. Renderer atualiza gauge ao vivo.
5. Drop > threshold → main emite `press:rupture`. UI faz cross-fade pra imagem rompida e abre `RuptureModal` 1.6 s depois com pico, fck calculado, status NBR 12655 (idade ≥ 28d), tipo de ruptura NBR 5739.
6. Confirma → RPC `seal_rupture` no Supabase: insere readings com hash SHA-256 e atualiza specimen. Triggers do BStech cuidam de `correction_factor`, `corrected_fck_mpa` e relatório 28D.

### Fluxo de calibração

Wizard captura média de leitura por carga aplicada (`calibration:capture` no main agrega janela de amostras), cálculo em `lib/calibration-math.ts` (testado em `calibration-math.test.ts`), persiste em tabelas `public.calibration_*` (Supabase), gera PDF via `calibration:generate-pdf` e abre via `calibration:open-pdf`. As tabelas estão no schema `public` (PostgREST) com RLS permissiva pra anon — validação interna; revisar antes de produção externa.

## Convenções importantes

- **Erros do Supabase**: usar `lib/error-message.ts` (`errorMessage()`) — entende `PostgrestError`, `Error` e string. Não fazer `String(err)` solto.
- **Não escrever `String(err)` ou usar dados do `demo-data.ts` como referência real** — é stub fictício (inclusive nomes de pessoas).
- **Nunca presumir schema do BStech**: antes de mexer em queries, conferir relacionamentos reais (16 FK constraints). O specimen→fck atravessa join table; queries diretas batch→structures não existem.
- **Tema**: logo escura precisa filtro de inversão no dark mode (já aplicado em `App.tsx`).
- **IPC**: sempre usar a constante `IPC.*` de `shared/ipc.ts`, nunca string crua.

## Roadmap ativo

**Próximo marco:** primeira calibração + primeira ruptura real em hardware. Plano detalhado, etapas, riscos e linha do tempo em [`docs/roadmap-primeiro-teste.md`](docs/roadmap-primeiro-teste.md). Ler antes de propor mudanças que afetem o ciclo de teste.

**Deadline maior:** IBRACON / FEIBRACON Natal, 30/set–03/out/2026.

## Onde está o que (não óbvio)

- Migrations SQL: `docs/migrations/` (calibração + RLS). Schema principal mora no projeto Supabase BStech, não aqui.
- Docs de hardware/troubleshooting Novus + calibração: `docs/Calibração/` e `docs/fase-0-passo-a-passo.md`.
- Plano Notion: https://www.notion.so/3434366c30d6819e9e53fd126f92372d
- `app/scripts/build-icon.mjs`: pipeline sharp → to-ico pra gerar o `.ico` Windows multi-tamanho.
