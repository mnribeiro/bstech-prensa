# Fase 0 — Passo a Passo (Miguel)

> Guia mastigado pra rodar o teste Modbus na quinta. Cada passo e uma coisa pequena.

## O que voce precisa antes

- [ ] Prensa montada com o N1500-LC instalado
- [ ] Adaptador USB-RS485 plugado
- [ ] Computador do lab ligado
- [ ] Node.js instalado no computador (caso nao tenha: https://nodejs.org)

## Passo 1 — Verificar que o N1500-LC esta configurado

No painel do N1500-LC, segura o botao **P** por 3 segundos. Confere se ta assim:

| Parametro | Valor |
|-----------|-------|
| Addr | 01 |
| bAUd | 9600 |
| PArI | none |
| StOP | 1 |
| InPt | LC4 (celula 4 fios) |

Se algo estiver diferente, ajusta com as setas. Segura P 3s pra salvar e sair.

## Passo 2 — Descobrir a porta COM do adaptador USB

Abre o **PowerShell** e roda:

```powershell
cd "C:\Users\User\Desktop\TARS CODIGOS\bstech-prensa\scripts"
npm install
node list-ports.js
```

Vai aparecer algo tipo:

```
[1] COM3
    Fabricante: FTDI
[2] COM5
    Fabricante: Microsoft
```

Anota a porta com fabricante **FTDI** ou **CH340**. No exemplo acima e `COM3`.

> Se nao apareceu nenhuma porta com FTDI/CH340: instala o driver. Eu te mando o link na hora.

## Passo 3 — Rodar o teste Modbus

```powershell
node test-modbus.js COM3
```

(Troca `COM3` pelo que voce anotou no passo anterior)

Se conectar, vai aparecer:

```
=== Teste Modbus N1500-LC ===
Porta: COM3
Endereco: 1
Baud rate: 9600

Conectando...
Conectado!

Lendo carga (Ctrl+C pra parar):

Carga:        0 | Pico:        0 | Leituras: 12
```

## Passo 4 — Aplicar carga na prensa

Liga a prensa, aplica carga aos poucos. **O numero "Carga" tem que subir em tempo real.**

Se subir → Fase 0 concluida! Manda screenshot/video pra mim.

Se nao subir ou der erro → me chama no WhatsApp com o erro que apareceu na tela.

## Erros comuns

### "Porta COM nao encontrada"
- Adaptador USB nao tava plugado quando rodou `list-ports.js`
- Plugar e rodar de novo

### "Timeout ao conectar"
- Cabo RS-485 invertido — trocar A com B no adaptador
- N1500-LC desligado
- Endereco Modbus diferente de 1

### "Carga nao muda quando aplica forca"
- Celula de carga nao calibrada
- Fios da celula invertidos no N1500-LC

### Em ultimo caso
- Tira foto do erro, me manda. Eu resolvo remoto.
