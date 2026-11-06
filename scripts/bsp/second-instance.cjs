const { app } = require('electron');
app.setPath('userData', process.env.BSP_TEST_DATA_DIR);
app.setPath('appData', app.getPath('userData'));
require('../../electron/main.cjs');
setTimeout(() => { console.error('Second portal instance did not exit'); app.exit(1); }, 5000);
