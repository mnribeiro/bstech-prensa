# Roadmap — Primeira Calibração + Primeira Ruptura Real

> **Documento vivo.** Atualizar conforme avança. Ler junto com `CLAUDE.md` (raiz) e o índice em `~/.claude/projects/.../memory/MEMORY.md`.

**Última atualização:** 2026-05-06
**Marco-alvo:** primeira ruptura real selada no Supabase do BStech, com calibração válida e PDF de certificado emitido.
**Janela realista:** 7–14 dias úteis a partir do momento em que prensa + Novus + USB-RS485 estiverem disponíveis na bancada.
**Deadline duro:** IBRACON Natal, 30/set–03/out/2026 — qualquer atraso aqui empurra preparação de feira.

---

## 1. Onde estamos (06/05/2026 — tarde)

**🎉 Primeiro ciclo ponta-a-ponta CONCLUÍDO em hardware real.** 5 CPs rompidos, selados no BStech com hash SHA-256 e triggers correctos rodando.

**Funcionando em hardware real (validado 06/05):**
- App Electron empacotado conecta no Novus N1500-LC via USB-RS485 (CP210x Silicon Labs, COM3, 9600 baud, addr 1).
- Idle polling lê leitura ao vivo sem precisar iniciar sessão (5 Hz).
- `value_scale = 10` confirmado pro Novus com DECP=2 (cada unidade raw = 10 kgf).
- Detecção de ruptura disparou corretamente em 5 CPs sem falsos positivos.
- Modal de sucesso mostra hash SHA-256, carga, fck calculado e fck corrigido.
- Triggers do BStech rodando: `correction_factor` aplicado em 4/5 (o 5º não tinha factor cadastrado).
- Fila de specimens recarrega automaticamente após selo.

**Bugs descobertos e corrigidos hoje:**
- Race condition no `connect()` do PressDriver com React StrictMode (lock `connectInFlight`).
- `captureSnapshot` competia com idle polling pela porta serial (pausa idle durante capture).
- `value_scale` default era `1.0` (Novus retornava 10× menor que display real).
- Modal travava após erro (sem botão fechar, sem mensagem inline).
- Erro `[object Object]` no toast de erro (uso de `String(err)` em PostgrestError, trocado por `errorMessage()`).
- **Bug crítico no Supabase BStech:** RPC `seal_rupture` falhava com `function digest(text, unknown) does not exist` porque `pgcrypto` está em `extensions` schema e o `search_path` da função era só `public`. Migration `20260506_fix_seal_rupture_search_path.sql` aplicada.
- `rupture_type` enviado em PT (`conica`) violava check constraint do BStech (esperava `cone`, etc). Mapeamento PT→EN no envio.
- Auto-close timer do modal de sucesso disparava após o modal fechar manualmente, "selando" o próximo CP escolhido sem ensaio (bug fix com guard de modalOpen).

**Funcionando antes do teste de hoje:**
- Login Supabase (`LoginScreen` + `AuthGate`).
- Fila de specimens (relacionamento M:N batch ↔ structures).
- Wizard de calibração + PDF (não testado com cargas físicas reais ainda — pendente).
- Build Windows funcional: `BStech Prensa Setup 0.1.0.exe` (NSIS, branding Brasil Solos × BStech).

---

## 2. Onde queremos chegar nesse ciclo

**Definição de "pronto" pro primeiro teste:**

1. App em modo `modbus` se conecta no Novus na primeira tentativa, sem erro de porta/baud/endereço.
2. Wizard de calibração roda com **3+ pontos de carga conhecida** (massas certificadas ou prensa-padrão de referência) e gera PDF coerente.
3. Uma ruptura real de CP de concreto é detectada automaticamente (sem clicar em "salvar manual"), pico capturado, modal abre.
4. Operador confirma → registro em `rupture_readings` com hash, specimen atualizado.
5. Trigger do BStech web cria relatório 28D automaticamente, visível no portal.
6. PDF de certificado e log de readings são reproduzíveis para auditoria.

**Não é objetivo desse ciclo:** plug-and-play wizard, builder por cliente, telemetria remota, multi-cliente. Esses entram depois — primeiro provar que o ciclo fecha **uma vez**.

---

## 3. Etapas (ordem importa)

### Marco 0 — Pré-requisitos físicos (antes de tudo)
- [ ] Prensa Brasil Solos montada e operacional na bancada (Brasil Solos / Marcelo).
- [ ] Indicador Novus N1500-LC alimentado e calibrado de fábrica pra leitura de carga.
- [ ] Cabo USB-RS485 com pinagem A/B/GND correta. Driver Windows instalado (CH340/FTDI conforme o cabo).
- [ ] Massas certificadas ou prensa-padrão pra calibração (3+ pontos cobrindo a faixa de uso).
- [ ] CP de concreto de teste com `fck` conhecido cadastrado no BStech (pode ser um lote SANDBOX).
- [ ] Notebook com Windows, internet estável e o instalador `BStech Prensa Setup 0.1.0.exe`.

### Marco 1 — Validar Modbus puro, sem app ✅ CONCLUÍDO (06/05)
- [x] `scripts/list-ports.js` detectou COM3 (Silicon Labs CP210x).
- [x] `scripts/test-modbus.js` leu registrador 0 do Novus (addr 1, 9600 baud).
- [x] Identificado: Novus retorna valor raw, escala depende de DECP. Com DECP=2, `value_scale = 10`.

### Marco 2 — App em modo modbus na bancada ✅ CONCLUÍDO (06/05)
- [x] `npm run dev:real` conectou no Novus, leitura ao vivo via idle polling (5Hz).
- [x] `PressStatusBar` indica conectado + leitura ao vivo + botão "Testar comunicação".
- [x] Carga manual sobe coerente com display.
- [x] Detector de ruptura dispara corretamente, sem falsos positivos durante carga gradual em 5 ensaios.
- [x] Build empacotado roda em modo `modbus` por default.

### Marco 3 — Primeira calibração formal ⚠️ PENDENTE
Bloqueador: massas certificadas / prensa-padrão de referência ainda não disponíveis na bancada.

### Marco 4 — Primeira ruptura real ✅ CONCLUÍDO (06/05)
- [x] Login no app via Supabase auth.
- [x] Fila de CPs carregou.
- [x] **5 rupturas reais** seladas no BStech:
  - L-005-3-28D · 69.78 ton · fck 87.13 MPa · 3174 leituras
  - 0059 · 26.25 ton · fck 32.78 MPa · 388 leituras
  - L-005-4-28D · 26.26 ton · fck 32.79 MPa · 342 leituras
  - L-004-2-7D · 14.47 ton · fck 18.07 MPa · 301 leituras
  - L-004-4-28D · 27.04 ton · fck 33.76 MPa · 261 leituras
- [x] Detector disparou no instante certo. Pico bate com display do Novus.
- [x] Modal de sucesso mostra hash SHA-256.
- [x] `rupture_readings` populadas com hash, `specimens.status = RUPTURED_APPROVED`, `correction_factor` aplicado pelos triggers BStech.

### Marco 5 — Revisão e documentação (meio dia)
- [ ] Anotar todos os ajustes que precisaram ser feitos (config, threshold, escala, registrador).
- [ ] Atualizar `docs/Calibração/` e este roadmap com o que foi aprendido.
- [ ] Salvar memórias (claude-mem) sobre quirks do hardware real, decisões finais de config.
- [ ] Decidir o que vai pro próximo ciclo (provável: setup wizard plug-and-play, builder por cliente, telemetria).

---

## 4. Riscos e mitigações

Ordenado por probabilidade × impacto. Os mais prováveis estão no topo.

### 🔴 Alto

**R1 — Fiação RS-485 invertida ou sem GND.**
*Sintoma:* `test-modbus.js` dá timeout em todas as portas, ou retorna lixo.
*Mitigação:* Antes do dia 1, ter multímetro na bancada. Testar continuidade A/A, B/B, GND/GND. Conferir manual do Novus e do conversor (não confiar nos rótulos do cabo). Plano B: ter um segundo conversor USB-RS485 de marca diferente reserva.

**R2 — Driver USB-RS485 não instalado no Windows.**
*Sintoma:* porta COM nem aparece em `list-ports.js`.
*Mitigação:* identificar o chip do conversor (CH340, FTDI, CP2102) e pré-baixar o driver. Documentar em `docs/fase-0-passo-a-passo.md`.

**R3 — Threshold de ruptura calibrado pro mock não serve pra prensa real.**
*Sintoma:* falsos positivos durante carga gradual, ou ruptura real não detectada.
*Mitigação:* esperar pra ajustar `rupture_drop_threshold_kgf` empiricamente no Marco 2. Manter logs de readings em arquivo durante teste pra reanalizar offline. Considerar tornar o threshold adaptativo (% do pico recente) num ciclo futuro.

**R4 — `value_scale` ou registrador errado no Novus.**
*Sintoma:* leitura é múltiplo (10x, 100x) ou completamente alheia ao display.
*Mitigação:* manual do N1500-LC tem mapa de registradores. No Marco 1, varrer registradores 0–10 e identificar qual bate com o display. Configurar `value_scale` consultando configuração do indicador.

### 🟡 Médio

**R5 — RLS do Supabase rejeita insert do `seal_rupture` em produção.**
*Sintoma:* RPC retorna 401/403 ou trigger não dispara.
*Mitigação:* hoje RLS está permissiva pra anon (decisão de validação interna). Confirmar com Marcelo que isso continua antes do teste. Se não, rodar autenticado e revisar policy de `rupture_readings`.

**R6 — Antivírus bloqueando porta serial ou conexão Supabase.**
*Sintoma:* erros intermitentes que somem em modo admin.
*Mitigação:* testar primeiro num Windows limpo sem antivírus corporativo. Se reproduzir, identificar o produto e documentar exceção a pedir.

**R7 — Trigger 28D do BStech não dispara ou falha silenciosa.**
*Sintoma:* ruptura entra mas relatório não aparece.
*Mitigação:* antes do teste, listar quais triggers existem em `rupture_readings`/`specimens` (Supabase MCP `list_tables` + `get_logs`). Ter um SQL de verificação pronto pra rodar pós-ruptura.

**R8 — Polling 100ms é rápido demais e satura a serial, ou lento demais e perde o pico.**
*Sintoma:* leituras quebram ou pico real fica abaixo do registrado.
*Mitigação:* logar tempo entre amostras durante Marco 2. Ajustar `poll_interval_ms` antes do Marco 4.

### 🟢 Baixo

**R9 — Internet cai durante a ruptura.**
*Sintoma:* `seal_rupture` falha, dado não selado.
*Mitigação:* aceitar o risco nesse primeiro teste (é validação, não produção). Bancada com cabo > Wi-Fi. Plano de offline-first fica pra depois.

**R10 — CP de teste sem `fck` cadastrado no BStech.**
*Sintoma:* modal abre mas cálculo de status quebra.
*Mitigação:* preparar lote SANDBOX com `fck_mpa` definido antes do teste. Rodar query de verificação na fila de specimens.

---

## 5. Linha do tempo previsível

Assumindo que prensa + Novus + cabo estejam disponíveis na bancada:

| Dia | Marco | Atividade principal |
|-----|-------|---------------------|
| D1 | M1 | Validar Modbus puro (`test-modbus.js`) |
| D2 | M1 | Resolver fiação/driver/registrador se Marco 1 não fechou |
| D3 | M2 | App em modo modbus, ajustar threshold/poll |
| D4 | M2 | Empacotar e revalidar no instalador |
| D5 | M3 | Calibração com massas certificadas + PDF |
| D6 | M4 | Ruptura real ponta-a-ponta |
| D7 | M5 | Revisão, documentação, próximos passos |

**Buffer realista:** 50% (D8–D11) — surpresas de hardware sempre acontecem na primeira vez.

---

## 6. O que precisa estar pronto **antes** de marcar o teste

Bloqueadores que dependem de outras pessoas, não de código:

- [ ] Marcelo confirma data em que a prensa estará disponível pra teste.
- [ ] Manual do Novus N1500-LC em mãos (mapa de registradores, configuração de baud).
- [ ] Conjunto de massas certificadas ou prensa-padrão acessível.
- [ ] Pelo menos 1 CP de concreto pronto pra romper, idade ≥ 28d, lote cadastrado no BStech.
- [ ] Acesso a um Supabase env onde podemos sujar dados sem afetar cliente real (projeto BStech tem schema SANDBOX).

---

## 7. Próximo ciclo (depois de fechar este)

Não fazer agora, mas registrar pra não esquecer:

1. **Setup wizard plug-and-play** (login + auto-discovery COM + 2 testes obrigatórios).
2. **Builder por cliente** (instalador NSIS com `client_id` injetado).
3. **Telemetria mínima** (logar erros de conexão/seal num endpoint pra debug remoto).
4. **Acesso remoto pré-instalado** (RustDesk/AnyDesk identificado por `client_id`).
5. **Modo offline-first** (fila local de readings, sync quando voltar internet).
6. **Threshold adaptativo** (% do pico recente em vez de valor fixo).
