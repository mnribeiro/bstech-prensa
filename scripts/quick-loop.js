const ModbusRTU = require('modbus-serial');
const client = new ModbusRTU();

const PORT = process.argv[2] || 'COM3';
const ADDR = parseInt(process.argv[3] || 1, 10);
const DURATION_MS = parseInt(process.argv[4] || 5000, 10);

(async () => {
  console.log(`Lendo ${PORT} address ${ADDR} por ${DURATION_MS}ms...`);
  try {
    await client.connectRTUBuffered(PORT, { baudRate: 9600 });
    client.setID(ADDR);
    client.setTimeout(500);

    const start = Date.now();
    let count = 0;
    let errors = 0;
    let last = 0;

    while (Date.now() - start < DURATION_MS) {
      try {
        const data = await client.readHoldingRegisters(0, 1);
        const v = data.data[0];
        last = v > 32767 ? v - 65536 : v;
        count++;
      } catch (e) {
        errors++;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Leituras OK: ${count} | Erros: ${errors} | Ultimo valor: ${last}`);
  } catch (e) {
    console.log(`ERRO: ${e.message}`);
  } finally {
    client.close(() => process.exit(0));
  }
})();
