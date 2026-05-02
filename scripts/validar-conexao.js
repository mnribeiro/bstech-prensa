// validar-conexao.js
// Checklist automatico pra validar a comunicacao com a prensa Novus N1500-LC.
// Roda 4 etapas em sequencia e da OK/FALHA visual em cada uma.
// Uso: node validar-conexao.js [porta]
// Exemplo: node validar-conexao.js COM3

const ModbusRTU = require('modbus-serial');
const { SerialPort } = require('serialport');

// === CONFIG ===
const DEFAULT_PORT = 'COM3';
const ADDRESS = 1;
const BAUD_RATE = 9600;
const REGISTER = 0;

const port = process.argv[2] || DEFAULT_PORT;

// === CORES ANSI ===
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

const ok = (msg) => console.log(`  ${c.green}OK${c.reset}    ${msg}`);
const fail = (msg) => console.log(`  ${c.red}FALHA${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.dim}...${c.reset}   ${msg}`);
const titulo = (msg) => console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let resultados = {
  porta_existe: false,
  conexao_ok: false,
  leitura_ok: false,
  variacao_detectada: false
};

async function etapa1ListarPortas() {
  titulo('1/4 — Listar portas COM');
  const ports = await SerialPort.list();
  if (ports.length === 0) {
    fail('Nenhuma porta COM detectada.');
    info('Conecta o adaptador USB-RS485 e tenta de novo.');
    return false;
  }
  ok(`${ports.length} porta(s) detectada(s):`);
  ports.forEach((p) => {
    const marca = p.path === port ? c.green + ' <- selecionada' + c.reset : '';
    console.log(`        ${p.path} (${p.manufacturer || 'fabricante desconhecido'})${marca}`);
  });
  const found = ports.some((p) => p.path === port);
  if (!found) {
    fail(`Porta ${port} nao esta na lista.`);
    info('Reroda passando a porta certa: node validar-conexao.js COM4');
    return false;
  }
  resultados.porta_existe = true;
  return true;
}

async function etapa2Conectar(client) {
  titulo('2/4 — Conectar via Modbus RTU');
  info(`Abrindo ${port} a ${BAUD_RATE} baud, address ${ADDRESS}...`);
  try {
    await client.connectRTUBuffered(port, { baudRate: BAUD_RATE });
    client.setID(ADDRESS);
    client.setTimeout(1000);
    ok('Porta serial aberta com sucesso.');
    resultados.conexao_ok = true;
    return true;
  } catch (err) {
    fail(`Nao foi possivel abrir ${port}: ${err.message}`);
    info('Causas comuns:');
    info('  - Porta sendo usada por outro programa (fecha PuTTY, Arduino IDE, etc)');
    info('  - Driver USB nao instalado (FTDI/CH340)');
    info('  - Cabo USB ruim');
    return false;
  }
}

async function etapa3Leitura(client) {
  titulo('3/4 — Leitura do registrador 0 (PV - carga atual)');
  try {
    const data = await client.readHoldingRegisters(REGISTER, 1);
    const valor = data.data[0];
    const carga = valor > 32767 ? valor - 65536 : valor;
    ok(`Resposta recebida do indicador.`);
    info(`Raw uint16: ${valor}`);
    info(`Decodificado (signed int16): ${carga} kgf`);
    resultados.leitura_ok = true;
    return true;
  } catch (err) {
    fail(`Sem resposta do N1500-LC: ${err.message}`);
    info('Causas comuns:');
    info('  - N1500-LC desligado');
    info('  - Cabo A/B do RS-485 invertido (troca A com B no adaptador)');
    info('  - Address Modbus do indicador diferente de 1 (ver menu Addr)');
    info('  - Baud rate do indicador diferente de 9600 (ver menu BAUD)');
    info('  - Protocolo do indicador nao esta em Modbus (ver menu PRT)');
    return false;
  }
}

async function etapa4Variacao(client) {
  titulo('4/4 — Detectar variacao (aplica e remove carga)');
  info('Vou ler 50 amostras em 5s. Mexe no volante da prensa pra carga variar.');
  await sleep(800);

  const amostras = [];
  for (let i = 0; i < 50; i++) {
    try {
      const data = await client.readHoldingRegisters(REGISTER, 1);
      const v = data.data[0];
      const carga = v > 32767 ? v - 65536 : v;
      amostras.push(carga);
      const barra = '#'.repeat(Math.min(40, Math.abs(carga) / 200));
      process.stdout.write(`\r        [${i + 1}/50] carga = ${String(carga).padStart(8)} ${c.dim}${barra}${c.reset}                    `);
    } catch (err) {
      process.stdout.write(`\r        [${i + 1}/50] ${c.red}erro: ${err.message}${c.reset}`);
    }
    await sleep(100);
  }
  console.log('');

  const min = Math.min(...amostras);
  const max = Math.max(...amostras);
  const range = max - min;
  info(`Min: ${min} | Max: ${max} | Range: ${range}`);

  if (range > 50) {
    ok(`Variacao de ${range} kgf detectada — sensor responde a carga.`);
    resultados.variacao_detectada = true;
    return true;
  } else {
    fail('Sem variacao significativa (range < 50 kgf).');
    info('Pode ser que voce nao tenha mexido na prensa, ou a celula de carga nao esta respondendo.');
    return false;
  }
}

function imprimirResumo() {
  console.log('\n' + '='.repeat(50));
  console.log(`${c.bold}RESUMO${c.reset}`);
  console.log('='.repeat(50));
  const linha = (label, ok) =>
    console.log(`  ${ok ? c.green + 'OK' : c.red + 'FALHA'}${c.reset}   ${label}`);
  linha('Porta COM detectada', resultados.porta_existe);
  linha('Conexao serial estabelecida', resultados.conexao_ok);
  linha('Leitura Modbus respondeu', resultados.leitura_ok);
  linha('Variacao de carga detectada', resultados.variacao_detectada);
  console.log('');
  const todas = Object.values(resultados).every(Boolean);
  if (todas) {
    console.log(`${c.green}${c.bold}>>> FASE 0 VALIDADA. Prensa fala com o computador. <<<${c.reset}\n`);
  } else {
    console.log(`${c.yellow}>>> Fase 0 ainda nao concluida. Resolve as falhas acima.${c.reset}\n`);
  }
}

async function main() {
  console.log(`\n${c.bold}=== VALIDADOR DE CONEXAO BSTECH PRENSA ===${c.reset}`);
  console.log(`${c.dim}Indicador Novus N1500-LC | Modbus RTU | ${BAUD_RATE} baud | addr ${ADDRESS}${c.reset}\n`);

  const client = new ModbusRTU();
  let prosseguir = true;

  prosseguir = await etapa1ListarPortas();
  if (prosseguir) prosseguir = await etapa2Conectar(client);
  if (prosseguir) prosseguir = await etapa3Leitura(client);
  if (prosseguir) prosseguir = await etapa4Variacao(client);

  imprimirResumo();

  try {
    if (client.isOpen) {
      await new Promise((r) => client.close(() => r()));
    }
  } catch {}
  process.exit(Object.values(resultados).every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nErro inesperado: ${err.message}\n`);
  process.exit(1);
});
