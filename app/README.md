# BStech Prensa — App Desktop

App Electron + React + TS pra integracao da prensa de ruptura BStech via Modbus RTU (indicador Novus N1500-LC + USB-RS485).

## Stack

- Electron 31 (main + preload + renderer)
- electron-vite (dev/build)
- React 18 + TypeScript + Tailwind CSS
- modbus-serial (driver Modbus RTU)
- @supabase/supabase-js (cliente BStech)

## Estrutura

```
src/
├── main/           # Processo principal (Node, hardware)
│   ├── index.ts
│   ├── press-driver.ts   # Driver Modbus + mock
│   └── config-store.ts   # Persistencia JSON em userData
├── preload/
│   └── index.ts          # Bridge contextIsolation
├── renderer/             # React app
│   └── src/
│       ├── App.tsx
│       ├── components/
│       ├── store/        # useReducer + Context
│       └── lib/          # supabase, format
└── shared/               # Tipos/canais IPC compartilhados
```

## Modos do driver

Selecionado via env `BSTECH_PRESS_MODE`:

- `mock` (default): simula leituras crescentes ate atingir pico aleatorio (18-32 ton) e dispara ruptura. Usado pra testar UI sem hardware.
- `modbus`: le do indicador Novus via porta serial real.

```bash
# Mock (padrao)
npm run dev

# Modbus real
BSTECH_PRESS_MODE=modbus npm run dev
```

## Configuracao

Primeira execucao cria `bstech-prensa-config.json` em `%APPDATA%/bstech-prensa/`:

```json
{
  "press": {
    "port": "COM3",
    "baud_rate": 9600,
    "modbus_address": 1,
    "register": 0,
    "poll_interval_ms": 100,
    "rupture_drop_threshold_kgf": 800,
    "value_scale": 1.0
  },
  "app": {
    "supabase_url": "https://xbybwkfmbsknwlwuohbj.supabase.co",
    "supabase_anon_key": "",
    "client_id": "d8f8e8e5-974f-4bd1-b658-2621e50b2021"
  }
}
```

> Edite `supabase_anon_key` antes de rodar pela primeira vez.

## Comandos

```bash
npm install
npm run dev            # Dev com hot reload
npm run build          # Build producao
npm run build:win      # Build + instalador NSIS Windows
npm run typecheck
```

## Fluxo de uso

1. Operador abre o app
2. Seleciona equipamento + operador no topo (uma vez por turno)
3. Clica num CP da fila lateral
4. Posiciona CP fisicamente na prensa, aproxima prato
5. Clica "Iniciar ensaio"
6. Aplica carga via volante — gauge sobe ao vivo
7. Quando rompe (drop > threshold), driver dispara evento, CP troca pra imagem rompida com cross-fade
8. Modal abre 1.6s depois com:
   - Pico, fck calculado e fck corrigido (calculado automaticamente)
   - Status APROVADO/REPROVADO (regra NBR 12655 + idade >= 28d)
   - Dropdown tipo de ruptura (NBR 5739)
   - Observacoes opcionais
9. Confirma → RPC `seal_rupture` no Supabase: insere readings com hash SHA-256 + atualiza specimen
10. Triggers do BStech criam relatorio automatico (28D)

## RPC backend

- Tabela: `public.rupture_readings` (Supabase BStech)
- RPC: `public.seal_rupture(...)` — atomica, valida, calcula fck, sela com hash SHA-256
- Triggers existentes do BStech cuidam de `correction_factor`, `corrected_fck_mpa` e relatorio
