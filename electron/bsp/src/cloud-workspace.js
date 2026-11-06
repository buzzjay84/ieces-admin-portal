/* Supabase owns shared records. The JSON file is a read-only cache until connected. */
if (window.bsp.onCloudChange) {
  let cloudStatus = 'offline', dirtyForm = false;
  const banner = document.createElement('div');
  banner.id = 'cloudStatus'; banner.className = 'card'; banner.style.margin = '12px 24px'; banner.setAttribute('role', 'status');
  document.querySelector('#app header').after(banner);
  const allowed = new Set(['nav', 'openUnit', 'openAdult', 'newUnit', 'newAdult', 'editScout', 'editOnlineScout', 'cancelScout', 'onlineKind', 'onlinePaymentStatus', 'onlineRefresh', 'onlineSignOut', 'printAUR', 'printAAR', 'printSummary', 'printList', 'xlsxList', 'csvSummary', 'csvMaster', 'exportJSON', 'receiptsUnit', 'receiptScout', 'receiptAdult', 'reprintScout', 'campReceipt', 'toggleUnpaidCampers']);
  const pendingRegistration = form => form?.id === 'websiteRegistration' && form.elements.paymentStatus?.value === 'pending';
  function controls() {
    for (const el of document.querySelectorAll('#main button')) {
      const form = el.closest('form');
      const mutable = form ? !pendingRegistration(form) && !['onlineSignIn', 'onlineSettingsForm'].includes(form.id) && (el.type === 'submit' || (el.dataset.act && !allowed.has(el.dataset.act)))
        : el.dataset.act && !allowed.has(el.dataset.act);
      if (cloudStatus !== 'ready' && mutable && !el.disabled) { el.disabled = true; el.dataset.cloudDisabled = 'true'; }
      else if ((cloudStatus === 'ready' || !mutable) && el.dataset.cloudDisabled) { el.disabled = false; delete el.dataset.cloudDisabled; }
    }
  }
  document.addEventListener('submit', event => {
    if (cloudStatus !== 'ready' && !pendingRegistration(event.target) && !['onlineSignIn', 'onlineSettingsForm'].includes(event.target.id)) {
      event.preventDefault(); event.stopImmediatePropagation();
      show('Your draft is not submitted. Sign in and load the shared Supabase records before saving.');
    }
  }, true);
  async function reconnect() {
    dirtyForm = false;
    await window.bsp.cloudStart(sbCfg());
  }
  function show(message) {
    banner.replaceChildren(document.createTextNode(message + ' '));
    const reload = document.createElement('button'); reload.className = 'btn'; reload.textContent = 'Load latest from Supabase';
    reload.onclick = async () => {
      if (dirtyForm && !confirm('Discard the unsaved form and load the shared records?')) return;
      try { await reconnect(); } catch (err) { show(err.message); }
    };
    banner.append(reload);
    if (!online.email) {
      const signIn = document.createElement('button'); signIn.className = 'btn primary'; signIn.textContent = 'Sign in to Supabase';
      signIn.onclick = () => { if (!dirtyForm || confirm('Leave this unsaved draft and open sign-in?')) go('online'); };
      banner.append(signIn);
    }
    for (const form of document.querySelectorAll('#main form:not(#onlineSignIn):not(#onlineSettingsForm)')) {
      let hint = form.querySelector('[data-cloud-hint]');
      if (!hint) { hint = document.createElement('p'); hint.dataset.cloudHint = 'true'; hint.className = 'hint'; hint.setAttribute('role', 'status'); form.prepend(hint); }
      hint.hidden = cloudStatus === 'ready' || pendingRegistration(form);
      hint.textContent = 'You can fill in a draft. Sign in and load the shared Supabase records to enable Submit or Save.';
    }
    if (cloudStatus === 'uninitialized') {
      const upload = document.createElement('button'); upload.className = 'btn primary'; upload.textContent = 'Upload existing BSP records';
      upload.onclick = async () => {
        const scouts = db.units.reduce((n, u) => n + u.scouts.length, 0);
        if (!confirm(`Initialize Supabase with ${scouts} scouts, ${db.adults.length} adults, their payments, receipts, settings and archives from this app? Do this once from the app with the complete records.`)) return;
        upload.disabled = true;
        try { await window.bsp.cloudInitialize(JSON.stringify(db)); }
        catch (err) { show(`Upload failed: ${err.message}`); }
      };
      banner.append(upload);
    }
  }
  const previousRender = render;
  render = function(options) { dirtyForm = false; previousRender(options); controls(); show(banner.firstChild?.textContent || 'Connect to Supabase before saving.'); };
  document.addEventListener('change', () => { controls(); show(banner.firstChild?.textContent || 'Connect to Supabase before saving payments.'); });
  document.addEventListener('input', event => { if (event.target.closest('form')) dirtyForm = true; });
  window.bsp.onCloudChange(update => {
    cloudStatus = update.status;
    if (update.status === 'changed') {
      if (!dirtyForm && !document.querySelector('dialog[open]')) {
        db = load(); syncedLearnerReceipts.clear();
        if ((route.view === 'unit' && route.id && !getUnit(route.id)) || (route.view === 'adult' && route.id && !getAdult(route.id))) route = { view: 'summary', id: null };
        render({ preserveScroll: true });
      }
    } else if (update.status === 'error' && update.message?.includes('attempted changes are preserved')) {
      // Failed saves have a recovery file; return the UI to the last confirmed snapshot.
      db = load(); render({ preserveScroll: true });
    }
    if (update.status === 'ready' && update.settings) {
      db.settings.websiteFeesPending = update.settings.websiteFeesPending;
      db.settings.websiteFeesPublishedAt = update.settings.websiteFeesPublishedAt;
    }
    show(update.message || 'Sign in on the Online tab to connect. Cached records are read-only.');
    controls();
  });
  show('Sign in on the Online tab to load the shared Supabase records. Cached records are read-only.');
  controls();
  window.addEventListener('bsp-cloud-error', event => { cloudStatus = 'error'; show(event.detail); controls(); });
  if (online.email) void connectSharedWorkspace();
}
