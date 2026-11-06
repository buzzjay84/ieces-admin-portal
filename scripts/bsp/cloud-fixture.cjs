const fs = require('node:fs');
const path = require('node:path');
module.exports = function cloudFixture(folder) {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'supabase-session.json'), JSON.stringify({ access_token: 'test-only', email: 'test@example.invalid', expires_at: Date.now() / 1000 + 3600 }));
  let row = { revision: 1, document: { units: [], adults: [], settings: { nextReceipt: 1, schoolYear: '2026', rates: { scout: 50, teacher: 60, lay: 100, camp: 0 } }, archives: {}, campIntents: {} } };
  global.fetch = async (url, options = {}) => {
    let data = [];
    if (url.includes('/bsp_workspace?')) data = [row];
    else if (url.endsWith('/rpc/bsp_save_workspace')) {
      const body = JSON.parse(options.body);
      if (body.p_expected_revision !== row.revision) return { ok: false, status: 409, json: async () => ({ message: 'Newer records exist', code: '40001' }) };
      row = { revision: row.revision + 1, document: body.p_document }; data = [row];
    }
    return { ok: true, status: 200, json: async () => data };
  };
};
