const electron = require('electron');
if (typeof electron === 'string') {
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const result = require('node:child_process').spawnSync(electron, [__filename], { env, stdio: 'inherit', timeout: 45000 });
 process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = electron;
app.setPath('userData', process.env.BSP_TEST_DATA_DIR);
app.setPath('appData', app.getPath('userData'));
require('./cloud-fixture.cjs')(app.getPath('userData'));
const bsp = require('../../electron/bsp/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
 let failed = false;
 try {
  await bsp.open();
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.getPrintersAsync = async () => [{name:'Regression printer',isDefault:true}];
  const js = code => win.webContents.executeJavaScript(code);
    for (let i = 0; i < 100 && !await js('document.querySelector(\"#cloudStatus\")?.textContent.includes(\"Saved in Supabase\")'); i++) await new Promise(resolve => setTimeout(resolve, 25));
  await js(`doPrint('<div class="pg"><h1>Test registration</h1></div><div class="pg"><h1>Second page</h1></div>')`);
  async function until(code) { for (let n=0; n<100; n++) { if (await js(code)) return; await delay(100); } throw Error('Timed out: '+code); }
  await until(`document.getElementById('ppPage')?.textContent === 'Page 1 of 2' && !document.getElementById('ppSave').disabled`);
  const hasInk = await js(`(() => {
    const canvas = document.getElementById('ppCanvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150 && pixels[i + 3] > 0) return true;
    return false;
  })()`);
  if (!hasInk) throw Error('Printed document is blank');
  await js(`document.getElementById('ppNext').click()`);
  await until(`document.getElementById('ppPage').textContent === 'Page 2 of 2'`);
  await js(`document.getElementById('ppOrientation').value='landscape';document.getElementById('ppOrientation').dispatchEvent(new Event('change'))`);
  await until(`!document.getElementById('ppSave').disabled && document.getElementById('ppCanvas').width > document.getElementById('ppCanvas').height`);
  await js(`document.getElementById('ppCancel').click(); doPrint('<div class="pg">Loading close test</div>');document.getElementById('ppCancel').click()`);
  await delay(500);
  if (!(await js(`!document.querySelector('dialog') && document.getElementById('print').innerHTML === ''`))) throw Error('Close during loading failed');
  let submitted = false, printSuccess = false;
  const originalPrinters = win.webContents.getPrintersAsync.bind(win.webContents);
  win.webContents.getPrintersAsync = async () => [{name:'Regression printer',isDefault:true}];
  const intercept = (_event, created) => {
    if (created === win) return;
    created.webContents.getPrintersAsync = async () => [{name:'Regression printer',isDefault:true}];
    created.webContents.print = (options, callback) => {
      if (!options.silent || options.deviceName !== '') throw Error('Must print silently to the system default');
      if (options.margins.top !== 24 || options.margins.left !== 34) throw Error('Incorrect print margins');
      if (options.pageSize.width !== 210000 || options.pageSize.height !== 297000) throw Error('Incorrect default A4 paper size');
      submitted = true; callback(printSuccess, printSuccess ? undefined : 'Simulated spooler failure');
    };
  };
  app.on('browser-window-created', intercept);
  await js(`db.units = [{ id:'print-unit', scouts:[{id:'print-learner',payment:{receiptNo:'AR-PRINT',amountPaid:50}}]}];
    const printLearner = db.units[0].scouts[0];
    window.printCallbackCount = 0; printReceipts([{recordId:printLearner.id,receiptNo:'AR-PRINT',date:todayISO(),from:'Test',items:[{qty:1,rate:50,desc:'Fee'}],paid:50}], {onPrinted: () => { window.printCallbackCount++; }});`);
  await until(`!document.getElementById('ppPrint')?.disabled`);
  await js(`document.getElementById('ppPrint').click()`);
  await until(`document.getElementById('ppMessage')?.textContent === 'Simulated spooler failure'`);
  if (await js(`!!printLearner.payment.receiptPrintedAt`)) throw Error('Failed print recorded a timestamp');
  if (!(await js(`document.querySelector('dialog').open && !document.getElementById('ppPrint').disabled && document.getElementById('print').innerHTML.includes('AR-PRINT')`))) throw Error('Failed print must retain the receipt and allow retry');
  const rejectPrint = (_event, created) => {
    if (created !== win) created.webContents.print = () => { throw Error('Simulated printer exception'); };
  };
  app.on('browser-window-created', rejectPrint);
  await js(`document.getElementById('ppPrint').click()`);
  await until(`document.getElementById('ppMessage')?.textContent === 'Simulated printer exception' && !document.getElementById('ppPrint').disabled`);
  if (await js(`!!printLearner.payment.receiptPrintedAt`)) throw Error('Printer exception recorded a timestamp');
  app.removeListener('browser-window-created', rejectPrint);
  printSuccess = true;
  await js(`document.getElementById('ppPrint').click()`);
  await until(`document.getElementById('ppMessage').textContent.includes('Check the printer queue')`);
  await js(`document.getElementById('ppPrint').click()`);
  await until(`document.getElementById('ppMessage').textContent.includes('Check the printer queue') && !document.getElementById('ppPrint').disabled`);
  if (await js(`window.printCallbackCount`) !== 1) throw Error('Retry ran completion callback twice');
  await js(`document.getElementById('ppClose').click()`);
  const firstStamp = await js(`printLearner.payment.receiptPrintedAt`);
  if (!firstStamp || Number.isNaN(Date.parse(firstStamp))) throw Error('Successful print did not record a timestamp');
  await js(`printReceipts([{recordId:printLearner.id,receiptNo:'AR-PRINT',date:todayISO(),from:'Test',items:[{qty:1,rate:50,desc:'Fee'}],paid:50}])`);
  await until(`!document.getElementById('ppPrint')?.disabled`);
  await js(`document.getElementById('ppPrint').click()`);
  await until(`document.getElementById('ppMessage').textContent.includes('Check the printer queue')`);
  await js(`document.getElementById('ppClose').click()`);
  if (await js(`printLearner.payment.receiptPrintedAt`) !== firstStamp) throw Error('Reprint changed first timestamp');
  app.removeListener('browser-window-created', intercept);
  win.webContents.getPrintersAsync = originalPrinters;
  if (!submitted) throw Error('No print job submitted');
  console.log('PASS: PDF content, navigation, orientation, loading cancellation, A4, print failure, successful print timestamp, and reprint preservation.');
 } catch(err) { failed = true; console.error(err); }
 finally { app.exit(failed ? 1 : 0); }
});
