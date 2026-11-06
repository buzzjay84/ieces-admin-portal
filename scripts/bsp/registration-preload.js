const { contextBridge } = require('electron');
let mode = 'success';
let rows = [];
const calls = [];
contextBridge.exposeInMainWorld('bsp', {
  load: () => null, save: () => true, appVersion: () => '0.0.0-test', dataPath: async () => 'test-data-path',
  sbSession: async () => ({ email: 'test@example.invalid' }),
  sbRest: async (_cfg, method, _query, body) => {
    if (method === 'GET') return { data: rows };
    calls.push(body);
    await new Promise(resolve => setTimeout(resolve, 50));
    return mode === 'error' ? { error: 'Test connection failure' } : { data: [body] };
  },
});
contextBridge.exposeInMainWorld('registrationTest', {
  calls: () => calls, setMode: value => { mode = value; },
  setRows: value => { rows = value; },
});
