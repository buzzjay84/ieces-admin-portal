const path = require('node:path');
const { randomUUID } = require('node:crypto');

// shortcut: one school snapshot up to 5 MB, normalize records when the dataset outgrows this limit.
function createCloudWorkspace({ file, request, notify, storage }) {
  let cfg, revision = null, ready = false, stopped = true, timer, generation = 0, failed = false;
  let queue = Promise.resolve();
  const serial = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  const emit = (status, message, settings) => notify({ status, message, revision, settings });
  function backup(text) {
    const name = path.join(path.dirname(file), `bsp-recovery-${Date.now()}-${randomUUID()}.json`);
    storage.write(name, text);
    return name;
  }
  function cache(document) {
    const text = JSON.stringify(document);
    storage.write(file, text);
  }
  async function fetchLatest(version, initial = false) {
    const result = await request(cfg, 'GET', 'bsp_workspace?id=eq.true&select=revision,document');
    if (stopped || version !== generation) return;
    if (result.error) throw Error(result.error);
    const row = result.data?.[0];
    if (!row) { ready = false; revision = null; emit('uninitialized', 'Upload the existing BSP records once to initialize Supabase.'); return; }
    if (row.revision !== revision || initial || (!ready && failed)) {
      const previous = storage.read(file);
      if (initial && previous && previous !== JSON.stringify(row.document)) backup(previous);
      cache(row.document); revision = row.revision; ready = false; failed = false;
      emit('changed', 'Supabase has the latest records. Load them before editing.');
    }
  }
  function stop() { stopped = true; ready = false; generation++; clearInterval(timer); emit('offline', 'Sign in on the Online tab. Cached BSP records are read-only.'); }
  return {
    stop,
    read() {
      const text = storage.read(file);
      if (!stopped && !failed && revision !== null && !ready) { ready = true; emit('ready', 'Saved in Supabase.'); }
      return text;
    },
    start(config) {
      stop(); cfg = config; stopped = false; revision = null;
      const version = generation;
      return serial(async () => {
        try { await fetchLatest(version, true); }
        catch (err) { if (version === generation) emit('error', `Supabase unavailable: ${err.message}. Cached records are read-only.`); }
        if (version === generation && !stopped) timer = setInterval(() => {
          void serial(() => fetchLatest(version)).catch(err => { if (version !== generation || stopped) return; ready = false; failed = true; emit('error', `Supabase unavailable: ${err.message}. Changes are blocked until reconnected.`); });
        }, 5000);
      });
    },
    initialize(text) {
      return serial(async () => {
        if (stopped || revision !== null) throw Error('Connect to an uninitialized Supabase workspace first.');
        const version = generation;
        const result = await request(cfg, 'POST', 'rpc/bsp_save_workspace', { p_expected_revision: 0, p_document: JSON.parse(text) });
        if (result.error) throw Error(result.error);
        if (stopped || version !== generation) throw Error('The sign-in session changed during upload. Reconnect to confirm its status.');
        const row = result.data?.[0];
        if (!row) throw Error('Supabase did not confirm the upload.');
        cache(row.document); revision = row.revision; ready = false; failed = false;
        emit('changed', 'Existing records uploaded to Supabase. Load the shared records.');
      });
    },
    save(text) {
      return serial(async () => {
        if (stopped || !ready || revision === null) {
          const recovery = backup(text);
          emit('error', `Load the shared Supabase records before editing. Your attempted changes are preserved in ${recovery}.`);
          return false;
        }
        const version = generation;
        emit('saving', 'Saving to Supabase...');
        let result;
        try {
          result = await request(cfg, 'POST', 'rpc/bsp_save_workspace', { p_expected_revision: revision, p_document: JSON.parse(text) });
          if (result.error) throw Error(result.error);
          if (stopped || version !== generation) throw Error('The sign-in session changed during the save. Reconnect to confirm its status.');
          const row = result.data?.[0];
          if (!row) throw Error('Supabase did not confirm the save. Reconnect before retrying.');
          cache(row.document); revision = row.revision;
          emit('ready', 'Saved in Supabase.', row.document.settings);
          return true;
        } catch (err) {
          ready = false; failed = true;
          const recovery = backup(text);
          emit('error', `${err.message} Your attempted changes are preserved in ${recovery}. Reload the shared records before retrying.`);
          return false;
        }
      });
    },
    async confirmPrint() {
      await serial(() => fetchLatest(generation));
      if (stopped || !ready || failed || revision === null) throw Error('Load the latest Supabase records before printing.');
    },
    canPrint() { return !stopped && ready && revision !== null; },
  };
}
module.exports = { createCloudWorkspace };
