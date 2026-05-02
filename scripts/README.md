# Scripts de validacao — Fase 0

Validar comunicacao Modbus RTU entre o PC e o indicador Novus N1500-LC da prensa.

## Setup (so na primeira vez)

```bash
cd bstech-prensa/scripts
npm install
```

Vai baixar `modbus-serial` e `serialport`. Demora ~30s. Se a maquina tiver Windows e bloquear native modules, instala buildtools antes:

```bash
npm install --global windows-build-tools
```

## Roteiro de quinta-feira

### 1) Conectar o hardware
1. Plugar o adaptador USB-RS485 no PC
2. Conectar saida RS-485 do adaptador no indicador Novus (terminais A e B)
3. Ligar o indicador

### 2) Confirmar a configuracao do indicador

No painel do N1500-LC (botao de menu):

| Parametro | Valor |
|-----------|-------|
| Addr | 1 |
| Baud | 9600 |
| Prty | nonE (sem paridade) |
| Stop | 1 |
| Prt | rtu |
| InPt | LC4 |

### 3) Descobrir a porta COM

```bash
npm run ports
```

Procura uma porta com fabricante `FTDI` ou `CH340` ou `Prolific` ou `Silicon Labs`. Anota o nome (ex `COM3`).

### 4) Validar conexao automaticamente

```bash
npm run validar COM3
```

Roda 4 etapas e imprime OK/FALHA em cada uma:
1. Listar portas COM
2. Conectar via Modbus RTU
3. Ler registrador 0 (carga atual)
4. Detectar variacao quando voce mexe no volante

Se tudo der OK -> **Fase 0 concluida**.

### 5) Monitorar ao vivo (opcional)

Pra ver as leituras em tempo real com barra visual e detector de ruptura:

```bash
npm run monitor COM3
```

Aplica carga via volante, ve o pico subindo, faz a prensa romper, ve "RUPTURA DETECTADA" piscando.

Ctrl+C pra fechar e ver resumo da sessao.

## Troubleshooting

### "Cannot open COM3 — Access denied"
Outro programa ta usando a porta. Fecha PuTTY, Arduino IDE, qualquer terminal serial aberto.

### "Modbus timeout / no response"
1. Cabo A/B invertido — troca os fios A e B no adaptador (50% das vezes)
2. Address do indicador diferente de 1 — ver menu Addr
3. Baud rate diferente de 9600 — ver menu BAUD
4. Protocolo do indicador nao esta em rtu — ver menu PRT

### "Variacao nao detectada"
1. Volante nao foi mexido durante o teste de 5s
2. Celula de carga desconectada do indicador
3. Indicador esta em modo zerado/tara — ver display

### Driver USB nao reconhece adaptador
Adaptadores baratos vem sem driver assinado.
- FTDI: https://ftdichip.com/drivers/
- CH340: https://www.wch-ic.com/downloads/CH341SER_EXE.html

## Resultados esperados

Com prensa **sem carga**:
- Carga lida deve ficar em 0 ± 5 kgf

Com volante **levemente girado**:
- Carga sobe gradualmente, alguns kgf por giro

Com prensa **rompendo um CP**:
- Carga sobe ate ~15.000-30.000 kgf (depende do CP)
- Apos pico, queda > 800 kgf -> "RUPTURA DETECTADA"

## Proximos passos (depois da quinta)

Validada a conexao, o app Electron (`bstech-prensa/app`) e quem usa esse mesmo protocolo Modbus pra capturar a leitura e mandar pro Supabase BStech automaticamente.
