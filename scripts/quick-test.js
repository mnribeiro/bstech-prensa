const ModbusRTU = require('modbus-serial');
const client = new ModbusRTU();

const PORT = process.argv[2] || 'COM3';
const ADDR = parseInt(process.argv[3] || 1, 10);

(async () => {
  console.log(`Conectando em ${PORT} address ${ADDR}...`);
  try {
    await client.connectRTUBuffered(PORT, { baudRate: 9600 });
    client.setID(ADDR);
    client.setTimeout(2000);
    console.log('Porta aberta. Lendo registrador 0...');
    const data = await client.readHoldingRegisters(0, 1);
    const v = data.data[0];
    const signed = v > 32767 ? v - 65536 : v;
    console.log(`SUCESSO. Valor lido: ${signed} (raw ${v})`);
  } catch (e) {
    console.log(`ERRO: ${e.message}`);
  } finally {
    client.close(() => process.exit(0));
  }
})();
