// list-ports.js
// Lista todas as portas COM disponiveis no PC
// Uso: node list-ports.js

const { SerialPort } = require('serialport');

(async () => {
  console.log('\n=== Portas COM detectadas ===\n');

  const ports = await SerialPort.list();

  if (ports.length === 0) {
    console.log('Nenhuma porta COM encontrada.');
    console.log('Conecta o adaptador USB-RS485 e roda de novo.\n');
    return;
  }

  ports.forEach((p, i) => {
    console.log(`[${i + 1}] ${p.path}`);
    console.log(`    Fabricante: ${p.manufacturer || 'desconhecido'}`);
    console.log(`    PnP ID: ${p.pnpId || '-'}`);
    console.log('');
  });

  console.log('Procura uma porta com fabricante "FTDI", "CH340" ou similar.');
  console.log('Anota o nome (ex: COM3) — vai usar no test-modbus.js\n');
})();
