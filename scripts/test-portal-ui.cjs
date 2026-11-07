const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

async function main() {
  if (!process.versions.electron) {
    const weatherSource = fs.readFileSync(path.join(__dirname, '../src/lib/loginWeather.js'));
    const { calculateHeatIndex } = await import('data:text/javascript;base64,' + weatherSource.toString('base64'));
    assert.equal(calculateHeatIndex((90 - 32) * 5 / 9, 70), 41);
    assert.equal(calculateHeatIndex(20, 50), 20);
    assert.equal(calculateHeatIndex(30, null), null);
    assert.equal(calculateHeatIndex(30, 101), null);
    const { createServer } = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;
    const server = await createServer({ configFile: false, plugins: [react(), {
      name: 'ui-check-page',
      configureServer(server) {
        server.middlewares.use('/__ui-check__', async (req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(await server.transformIndexHtml("/__ui-check__", `<div id="root"></div><script type="module">
            import React from 'react';
            import { createRoot } from 'react-dom/client';
            import Login from '/src/pages/LoginPage.jsx';
            import Dashboard from '/src/pages/Dashboard.jsx';
            import Mooe from '/src/pages/MooePage.jsx';
            import { supabase as sharedClient } from '/src/lib/supabase.js';
            import { supabase as mooeClient } from '/src/supabaseClient.js';
            window.sameAuthClient = sharedClient === mooeClient;
            import '/src/styles/global.css';
            const originalFetch = window.fetch;
            window.fetch = (url, options) => decodeURIComponent(String(url)).includes('/rest/v1/MOOE liquidation report')
              ? (options?.method === 'DELETE' ? Promise.resolve(new Response(JSON.stringify({message: 'Simulated database failure'}), {status: 500})) : Promise.resolve(new Response(JSON.stringify([{id: 'sample', cy: 'CY 2026', month: 'January', allocation: 10000, total: 7500, balance: 2500, liquidated_by: 'School Administrator', date_liquidated: '2026-02-04', items: [{objectCode: '5020401000', amount: 7500}], receipts: [{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',path:'saved-receipt.png'}]}]), {headers: {'Content-Type': 'application/json'}})))
              : String(url).includes('/storage/v1/') ? (window.storageDeleted = true, Promise.resolve(new Response('{}'))) : String(url).includes('api.open-meteo.com')
              ? (window.weatherOffline ? Promise.reject(new Error('Offline')) : Promise.resolve(new Response(JSON.stringify({
                  current: { weather_code: 95, temperature_2m: 32.2, relative_humidity_2m: 70, time: '2026-11-07T13:00' },
                  hourly: { time: ['2026-11-07T08:00','2026-11-07T12:00','2026-11-07T15:00'], weather_code: [0,3,95], temperature_2m: [28,32,30] }
                })))) : originalFetch(url, options);
            let renderKey = 0;
            window.renderCheck = (page) => root.render(React.createElement(page === 'login' ? Login : page === 'mooe' ? Mooe : Dashboard, {
              key: ++renderKey, user: { name: 'School Administrator' }, onNavigate: id => window.lastNavigation = id,
              onBack: () => window.didGoBack = true, onLogout: () => window.didLogout = true
            }));
            const root = createRoot(document.getElementById('root'));
            window.renderCheck('login');
          </script>`));
        });
      }
    }], server: { port: 0 } });
    await server.listen();
    const env = { ...process.env, UI_CHECK_URL: server.resolvedUrls.local[0] + '__ui-check__' };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
    const code = await new Promise(resolve => child.on('exit', resolve));
    await server.close();
    process.exitCode = code;
    return;
  }
  const { app, BrowserWindow } = require('electron');
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  const run = script => win.webContents.executeJavaScript(script);
  const settle = () => new Promise(resolve => setTimeout(resolve, 120));
  try {
    await win.loadURL(process.env.UI_CHECK_URL);
    for (let i = 0; i < 100 && !await run('!!document.querySelector(".login-card")'); i++) await settle();
    await settle();
    assert.equal(await run('document.querySelectorAll(".login-forecast li").length'), 3, errors.join("\n"));
    assert.equal(await run('!!document.querySelector(".sky--storm .sky-rain")'), true);
    assert.equal(await run('document.querySelector(".login-heat-index strong").textContent'), '41'+String.fromCharCode(176)+'C');
    assert.equal(await run('document.querySelectorAll(".login-slide").length'), 3);
    assert.equal(await run('document.querySelector("label[for=login-username]").control.id'), 'login-username');
    await run('document.querySelector(".lf-password-toggle").click()'); await settle();
    assert.equal(await run('document.querySelector("#login-password").type'), 'text');
    await run('document.querySelector(".lf-password-toggle").click()'); await settle();
    assert.equal(await run('document.querySelector("#login-password").type'), 'password');
    await run('document.querySelectorAll(".login-slide-dot")[2].click(); document.querySelector(".login-slide-pause").click()'); await settle();
    assert.equal(await run('document.querySelectorAll(".login-slide")[2].classList.contains("active")'), true);
    assert.equal(await run('document.querySelector(".login-slide-pause").getAttribute("aria-pressed")'), 'true');
    await run('Promise.all(Array.from(document.images, image => image.decode()))');
    await new Promise(resolve => setTimeout(resolve, 1000));
    const output = path.join(os.tmpdir(), 'ieces-ui-check'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'login.png'), (await win.webContents.capturePage()).toPNG());
    for (const [width, height] of [[1088, 688], [1360, 860], [1024, 600]]) {
      win.setContentSize(width, height); await settle();
      assert.equal(await run(`(() => {
        const clock = document.querySelector('.login-clock').getBoundingClientRect();
        const forecast = document.querySelector('.login-forecast').getBoundingClientRect();
        const heat = document.querySelector('.login-heat-index').getBoundingClientRect();
        const seal = document.querySelector('.login-seal').getBoundingClientRect();
        return Math.max(clock.bottom, forecast.bottom, heat.bottom) <= seal.top && clock.left >= 0 && heat.right <= innerWidth / 2 && seal.bottom < innerHeight;
      })()`), true, 'Weather overlaps school branding at ' + width + 'x' + height);
    }
    win.setContentSize(1088, 688); await new Promise(resolve => setTimeout(resolve, 500));
    fs.writeFileSync(path.join(output, 'login-compact.png'), (await win.webContents.capturePage()).toPNG());

    await run('document.querySelector(".lc-footer-btn").click()'); await settle();
    assert.equal(await run('document.querySelectorAll(".login-card input").length'), 7);
    win.setContentSize(320, 640); await settle();
    assert.equal(await run('document.querySelector(".login-form-scroll").scrollWidth <= 320'), true);
    assert.equal(await run('document.querySelector(".login-form-scroll").scrollHeight > 640'), true);
    await run('document.querySelector(".login-form-scroll").scrollTop = 9999'); await settle();
    assert.equal(await run('document.querySelector(".lf-btn").getBoundingClientRect().bottom < innerHeight'), true);
    await run('window.renderCheck("dashboard")'); await settle();
    assert.equal(await run('document.querySelectorAll(".module-card").length'), 8);
    assert.equal(await run('document.querySelector(".dash-body").scrollWidth <= 320'), true);
    for (const id of ['bsp','enrollment','mooe','orgchart','media-manager','school-bulletin','form137','teaching-load']) {
      await run(`document.querySelector('[aria-labelledby="${id}-title"]').click()`); await settle();
      assert.equal(await run('window.lastNavigation'), id);
    }
    assert.equal(await run('Array.from(document.querySelectorAll(".module-card")).every(button => button.tagName === "BUTTON" && button.type === "button")'), true);
    await run('document.querySelector(".tb-logout").click()');
    assert.equal(await run('window.didLogout'), true);
    win.setContentSize(1440, 1000); await settle();
    fs.writeFileSync(path.join(output, 'dashboard.png'), (await win.webContents.capturePage()).toPNG());
    await run('window.weatherOffline = true; window.renderCheck("login")'); await settle();
    assert.equal(await run('!!document.querySelector(".login-card")'), true);
    assert.equal(await run('document.querySelector(".login-forecast")'), null);
    assert.equal(await run('document.querySelector(".login-heat-index")'), null);
    await run('window.renderCheck("mooe")');
    for (let i = 0; i < 50 && !await run('!!document.querySelector(".record-heading")'); i++) await settle();
    assert.equal(await run('document.querySelector(".record-heading h2").textContent'), 'January liquidation');
    assert.equal(await run('document.querySelector(".items-breakdown-table .td-money").textContent.includes("7,500.00")'), true);
    await new Promise(resolve => setTimeout(resolve, 600));
    fs.writeFileSync(path.join(output, 'mooe.png'), (await win.webContents.capturePage()).toPNG());
    win.setContentSize(320, 640); await settle();
    assert.equal(await run('document.querySelector(".mooe-body").scrollWidth <= 320'), true);
    assert.equal(await run('window.sameAuthClient'), true);
    assert.equal(await run('document.querySelector(".topbar").scrollWidth <= innerWidth'), true);
    await run('document.querySelector(".btn-del").click()'); await settle();
    await run('document.querySelector(".confirm-box .btn-danger").click()'); await settle();
    assert.equal(await run('!!window.storageDeleted'), false, 'Failed database delete must preserve saved receipt images');
    assert.equal(await run('!!document.querySelector(".record-heading")'), true);
    // The simulated database failure is expected to be logged by the page.
    errors.splice(0, errors.length, ...errors.filter(message => !message.includes('Supabase delete error') && !message.includes('500 (Internal Server Error)')));
    await run('document.querySelector(".tb-back").click()');
    assert.equal(await run('window.didGoBack'), true);
    assert.deepEqual(errors, []);
    console.log('PASS: weather, forecast, heat index, storm scene, offline fallback, login controls, registration scrolling at 320px, all eight module links, sign-out, MOOE record rendering, shared auth client, mobile header, receipt preservation on failed deletion, and no unexpected browser errors. Screenshots: ' + output);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}
main().catch(error => { console.error(error); process.exit(1); });
