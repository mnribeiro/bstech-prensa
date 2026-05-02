# BStech Prensa

App desktop que captura ruptura de CPs direto da prensa via Modbus RTU.

**Hardware:** Novus N1500-LC + USB-RS485
**Stack:** Electron + React + TypeScript
**Backend:** Supabase BStech (`xbybwkfmbsknwlwuohbj`)

## Estrutura

| Pasta | O que tem |
|-------|-----------|
| `app/` | Electron app (UI, serial, sync) |
| `scripts/` | Scripts de teste e utilitarios |
| `migrations/` | SQL pro Supabase (rupture_readings, RPC, audit log) |
| `docs/` | Documentacao tecnica (config N1500-LC, calibracao, troubleshooting) |

## Fases

- **Fase 0** — Hardware funciona? (validar Modbus com `scripts/test-modbus.js`)
- **Fase 1** — App le a prensa
- **Fase 2** — Resultado chega no BStech
- **Fase 3** — Producao

Ver Notion: [Integracao Prensa BStech](https://www.notion.so/3434366c30d6819e9e53fd126f92372d)

## Setup rapido (Fase 0)

```bash
cd bstech-prensa/scripts
npm install
node test-modbus.js
```
