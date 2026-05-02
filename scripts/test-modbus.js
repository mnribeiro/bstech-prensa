// test-modbus.js
// Le a carga da prensa Novus N1500-LC ao vivo com barra visual e detector de ruptura.
// Uso: node test-modbus.js [porta] [endereco]
// Exemplo: node test-modbus.js COM3 1

const ModbusRTU = require('modbus-serial');

// === CONFIG ===
const DEFAULT_PORT = 'COM3';
const DEFAULT_ADDRESS = 1;
const BAUD_RATE = 9600;
const REGISTER = 0;
const READ_INTERVAL_MS = 100;       // 10x/s
const RUPTURE_DROP_KGF = 800;       // queda > 800 kgf apos pico = ruptura
const RUPTURE_MIN_PEAK_KGF = 1000;  // so detecta apos atingir 1000 kgf

const port = process.argv[2] || DEFAULT_PORT;
const address = parseInt(process.argv[3] || DEFAULT_ADDRESS, 10);

// === CORES ANSI ===
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  blink: '\x1b[5m'
};

// === EXECUCAO ===
const client = new ModbusRTU();

let leituraCount = 0;
let cargaAtual = 0;
let picoCarga = 0;
let picoEm = null;
let rupturaDetectada = false;
let rupturaEm = null;
let inicioMs = null;
let ultimas3 = [];

function barra(carga, picoVisual) {
  const max = Math.max(picoVisual, 5000);
  const len = 40;
  const filled = Math.max(0, Math.min(len, Math.round((carga / max) * len)));
  const peakPos = Math.max(0, Math.min(len, Math.round((picoVisual / max) * len)));
  let s = '';
  for (let i = 0; i < len; i++) {
    if (i < filled) s += '#';
    else if (i === peakPos) s += '|';
    else s += '-';
  }
  return s;
}

function ton(kgf) {
  return (kgf / 1000).toFixed(2);
}

async function main() {
  console.clear();
  console.log(`${c.bold}${c.cyan}=== Teste Modbus Novus N1500-LC ===${c.reset}`);
  console.log(`${c.dim}Porta ${port} | Address ${address} | ${BAUD_RATE} baud | Registrador ${REGISTER}${c.reset}\n`);

  try {
    await client.connectRTUBuffered(port, { baudRate: BAUD_RATE });
    client.setID(address);
    client.setTimeout(1000);
    console.log(`${c.green}Conectado.${c.reset} Aplica carga na prensa pra ver os numeros subirem.`);
    console.log(`${c.dim}Ctrl+C pra parar.${c.reset}\n`);
    inicioMs = Date.now();
  } catch (err) {
    console.log(`${c.red}ERRO: ${err.message}${c.reset}\n`);
    console.log('Possiveis causas:');
    console.log('  1. Porta COM errada — roda `node list-ports.js` pra ver as disponiveis');
    console.log('  2. Driver USB nao instalado (FTDI ou CH340)');
    console.log('  3. N1500-LC desligado ou cabo desconectado');
    console.log('  4. Cabo RS-485 invertido (trocar A com B no adaptador)');
    console.log('  5. Address Modbus diferente de 1');
    console.log('  6. Baud rate diferente de 9600');
    console.log('\nDica: roda `node validar-conexao.js` pra um diagnostico completo.\n');
    process.exit(1);
  }

  const interval = setInterval(async () => {
    try {
      const data = await client.readHoldingRegisters(REGISTER, 1);
      const v = data.data[0];
      cargaAtual = v > 32767 ? v - 65536 : v;
      leituraCount++;

      if (cargaAtual > picoCarga) {
        picoCarga = cargaAtual;
        picoEm = Date.now() - inicioMs;
      }

      ultimas3.push(cargaAtual);
      if (ultimas3.length > 3) ultimas3.shift();

      // Detector de ruptura: queda > threshold apos pico significativo
      if (!rupturaDetectada && picoCarga > RUPTURE_MIN_PEAK_KGF) {
        const drop = picoCarga - cargaAtual;
        if (drop > RUPTURE_DROP_KGF) {
          rupturaDetectada = true;
          rupturaEm = Date.now() - inicioMs;
        }
      }

      // === RENDER ===
      const tempo = ((Date.now() - inicioMs) / 1000).toFixed(1);
      const corCarga = cargaAtual > picoCarga * 0.9 ? c.yellow : c.cyan;
      const linha1 = `${c.bold}Carga atual:${c.reset} ${corCarga}${String(cargaAtual).padStart(8)} kgf${c.reset}  (${ton(cargaAtual)} ton)`;
      const linha2 = `${c.bold}Pico:        ${c.reset} ${c.green}${String(picoCarga).padStart(8)} kgf${c.reset}  (${ton(picoCarga)} ton)`;
      const linha3 = `${c.bold}Barra:       ${c.reset} [${barra(cargaAtual, picoCarga)}]`;
      const linha4 = `${c.dim}Leituras: ${leituraCount}  |  Tempo: ${tempo}s${c.reset}`;
      const linha5 = rupturaDetectada
        ? `${c.red}${c.bold}>>> RUPTURA DETECTADA aos ${(rupturaEm / 1000).toFixed(2)}s — carga caiu ${picoCarga - cargaAtual} kgf <<<${c.reset}`
        : `${c.dim}(monitorando ruptura — drop > ${RUPTURE_DROP_KGF} kgf apos pico > ${RUPTURE_MIN_PEAK_KGF})${c.reset}`;

      process.stdout.write('\x1b[H\x1b[J');
      console.log(`${c.bold}${c.cyan}=== Teste Modbus Novus N1500-LC ===${c.reset}`);
      console.log(`${c.dim}Porta ${port} | Address ${address} | ${BAUD_RATE} baud${c.reset}\n`);
      console.log(linha1);
      console.log(linha2);
      console.log(linha3);
      console.log(linha4);
      console.log('');
      console.log(linha5);
      console.log(`\n${c.dim}Ctrl+C pra parar e ver o resumo.${c.reset}`);
    } catch (err) {
      console.log(`\n${c.red}Erro na leitura: ${err.message}${c.reset}`);
    }
  }, READ_INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(interval);
    client.close(() => {
      console.log(`\n\n${c.bold}=== Resumo da sessao ===${c.reset}`);
      console.log(`Total de leituras:   ${leituraCount}`);
      console.log(`Duracao:             ${((Date.now() - inicioMs) / 1000).toFixed(1)}s`);
      console.log(`Pico capturado:      ${picoCarga} kgf  (${ton(picoCarga)} ton)`);
      if (picoEm !== null) console.log(`Pico em:             ${(picoEm / 1000).toFixed(2)}s`);
      if (rupturaDetectada) {
        console.log(`${c.red}Ruptura detectada:   sim, em ${(rupturaEm / 1000).toFixed(2)}s${c.reset}`);
      } else {
        console.log(`Ruptura detectada:   nao`);
      }
      console.log('\nConexao fechada. Tchau!\n');
      process.exit(0);
    });
  });
}

main();
