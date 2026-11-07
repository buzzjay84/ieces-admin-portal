/* Website-compatible online submission form; existing import/payment flow is unchanged. */
function onlineTabs(active) {
  return `<nav class="seg" aria-label="Online registration tabs">
    <button class="${active === 'online' ? 'on' : ''}" data-act="nav" data-view="online" ${active === 'online' ? 'aria-current="page"' : ''}>Registrations</button>
    <button class="${active === 'registration' ? 'on' : ''}" data-act="nav" data-view="registration" ${active === 'registration' ? 'aria-current="page"' : ''}>New registration</button>
  </nav>`;
}

function printRegistrationConfirmation(entry, options = {}, camp = {}) {
  const labels = { sponsor: 'School', surname: 'Surname', given_name: 'Given name', middle_initial: 'M.I.', sex: 'Sex', birthdate: 'Birthdate', grade_section: 'Grade / section', reg_status: 'Registration status', guardian_name: 'Parent / guardian', role: 'To serve as', civil_status: 'Civil status', birthplace: 'Place of birth', religion: 'Religion', occupation: 'Occupation', position_title: 'Position / title', card_no: 'Membership card no.', card_expiration: 'Card expiration', highest_rank: 'Highest rank', years_in_scouting: 'Years in scouting', tenure: 'Tenure in scouting', contact_no: 'Contact no.', email: 'E-mail' };
  const fee = entry.reg_type === 'scout' ? R().scout : adultFee({ role: entry.role });
  const rows = Object.entries(labels).filter(([key]) => entry[key] !== null && entry[key] !== undefined && entry[key] !== '').map(([key, label]) => {
    const value = key === 'role' ? (ADULT_ROLES.find(role => role.key === entry.role)?.label || entry.role)
      : key === 'reg_status' ? (entry.reg_status === 'RR' ? 'Reregistering' : 'New')
      : key === 'sex' ? (entry.sex === 'M' ? 'Male' : 'Female') : entry[key];
    return `<tr><th style="width:32%;text-align:left">${h(label)}</th><td style="overflow-wrap:anywhere">${h(value)}</td></tr>`;
  }).join('');
  doPrint(`<div class="pg"><div class="p-title">BOY SCOUTS OF THE PHILIPPINES<br>Registration confirmation</div>
    <p>Reference no.: <b>${h(entry.id.slice(0, 8).toUpperCase())}</b></p>
    <p>${entry.reg_type === 'scout' ? 'Learner / Scout' : 'Adult leader'}</p>
    <table class="grid-t">${rows}<tr><th style="text-align:left">Registration fee to pay</th><td>${h(peso(fee))}</td></tr>
      ${camp.join ? `<tr><th style="text-align:left">${h(campName())}</th><td>${h(campDateLabel())}${campVenue() ? ` · ${h(campVenue())}` : ''}</td></tr>
      <tr><th style="text-align:left">Camping fee to pay</th><td>${h(peso(campFee()))}</td></tr>` : ''}</table>
    <h3>Payment and receipt</h3><p>Please pay ${h(peso(fee + (camp.join ? campFee() : 0)))} to the school's BSP Coordinator and present your name or reference number to receive your school payment receipt.</p>
    ${camp.join ? '<p>The camp date is tentative and may change.</p>' : ''}
    <p>This confirmation is not a payment receipt.</p><p>Data privacy consent: Agreed.</p></div>`, options);
}

async function printPaidRegistration(entry, options, camp = {}) {
  const snapshot = JSON.stringify(db);
  let rec = entry.localOnly
    ? db.units.flatMap(unit => unit.scouts.map(scout => ({ ...scout, _unit: unit }))).concat(db.adults).find(record => record.localRegistrationId === entry.id)
    : localByOnlineId(entry.id);
  let imported;
  try {
    imported = rec ? (rec._unit ? { unit: rec._unit, scout: rec._unit.scouts.find(scout => scout.id === rec.id) } : { adult: rec }) : importOnline(entry, guessUnit(entry));
    rec = imported.scout || imported.adult;
    const justPaid = !paidOf(rec);
    if (justPaid) {
      rec.payment = { ...rec.payment, amountPaid: imported.scout ? Number(R().scout) : adultFee(rec), datePaid: todayISO() };
      issueReceiptIfNeeded(rec);
    }
    if (imported.scout) applyCampChoice(rec, !!camp.join, justPaid && !!camp.pay);
    if (!window.bsp.save(JSON.stringify(db))) throw new Error(window.bsp.saveError?.() || 'Could not save the payment. Load the latest shared records and retry.');
  } catch (err) { db = JSON.parse(snapshot); throw err; }
  try {
    if (!entry.localOnly && !await setOnlineStatus(entry, 'imported')) toast('Payment saved locally; website sync pending.');
  }
  catch (err) { toast(`Payment saved locally; website sync pending: ${err.message}`); }
  if (imported.scout) printReceipts([scoutReceipt(imported.unit, imported.scout)], options);
  else receiptForAdult(imported.adult, options);
}

function viewRegistration() {
  const input = (label, name, max, required = false, type = 'text') => field(label, name, '', {
    span: 's6', req: required, type, extra: `maxlength="${max}"${type === 'date' ? ` max="${todayISO()}"` : ''}`,
  });
  const select = (label, name, options, required = false) => `<div class="f s6"><label>${label}</label><select name="${name}" ${required ? 'required' : ''}><option value=""></option>${options.map(o => `<option value="${h(o.key ?? o)}">${h(o.label ?? o)}</option>`).join('')}</select></div>`;
  return `${onlineTabs('registration')}<div class="page-head"><div><h1>New registration</h1><p class="sub">Submit the same information as the school website. Record payment and print an acknowledgment receipt, or submit an unpaid registration.</p></div></div>
  <form id="websiteRegistration" class="card">
${window.bsp.cloudStart ? '<p class="hint">Registrations are saved in Supabase and shared with the other apps.</p>' : `<p><label><input type="checkbox" name="localOnly" ${!online.email || !navigator.onLine ? 'checked' : ''}> Save on this computer only (works offline; does not submit to the website)</label></p>`}
    <div class="grid">${select('Register as', 'reg_type', [{ key: 'scout', label: 'Learner / Scout' }, { key: 'adult', label: 'Teacher / School Head / Coordinator' }], true)}</div>
    <h2>Personal information</h2><div class="grid">
      ${input('Surname', 'surname', 80, true)}${input('Given / first name', 'given_name', 80, true)}${input('M.I.', 'middle_initial', 3)}
      ${select('Sex', 'sex', [{ key: 'M', label: 'Male' }, { key: 'F', label: 'Female' }], true)}${input('Birthdate', 'birthdate', 10, true, 'date')}
    </div>
    <fieldset data-registration-kind="scout" hidden disabled><legend>Learner information</legend><div class="grid">
      ${select('Grade', 'grade', ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'SNED'], true)}${input('Section', 'section', 30)}
      ${select('Registration status', 'reg_status', [{ key: 'N', label: 'New' }, { key: 'RR', label: 'Reregistering (was a scout before)' }], true)}
      ${input('Parent / guardian name', 'guardian_name', 120, true)}
      <fieldset class="s12" data-reregister hidden disabled><legend>Previous membership</legend><div class="grid">${input('Membership card no.', 'scout_card_no', 40)}${select('Highest rank earned', 'highest_rank', RANKS)}${field('Years in scouting', 'years_in_scouting', '', { type: 'number', span: 's6', extra: 'min="0" max="30"' })}</div></fieldset>
    </div></fieldset>
    <div class="camp-box" data-camp-join hidden>
      <label class="switch"><input type="checkbox" name="joinCamp" role="switch" disabled><span class="slider"></span>
        <span><b>Also register for the ${h(campName())}</b> <span class="muted">(optional)</span></span></label>
      <div class="muted camp-meta">Date: ${h(campDateLabel())}${campVenue() ? ` · Venue: ${h(campVenue())}` : ''} · Camping fee: ${campFee() ? h(peso(campFee())) : 'not set yet (Settings)'}</div>
      <label class="switch" data-camp-pay hidden><input type="checkbox" name="campPaidNow" role="switch" disabled checked><span class="slider"></span>
        <span>Include the ${h(peso(campFee()))} camping fee in this payment (same receipt)<span class="muted" data-camp-pay-hint> — tick “Payment received” below</span></span></label>
    </div>
    <fieldset data-registration-kind="adult" hidden disabled><legend>Adult information</legend><div class="grid">
      ${select('To serve as', 'role', ADULT_ROLES, true)}${select('Civil status', 'civil_status', ['Single', 'Married', 'Widowed', 'Separated'])}
      ${input('Place of birth', 'birthplace', 120)}${input('Religion', 'religion', 60)}${input('Profession / occupation', 'occupation', 80)}${input('Position / title', 'position_title', 80)}
      ${input('Membership card no.', 'adult_card_no', 40)}${field('Card expiration date', 'card_expiration', '', { type: 'date', span: 's6' })}${input('Tenure in scouting', 'tenure', 40)}${input('E-mail', 'email', 120, false, 'email')}
    </div></fieldset>
    <h2>Contact</h2><div class="grid">${input('Contact no. (optional)', 'contact_no', 40, false, 'tel')}</div>
    <p><label><input type="checkbox" name="consent" required> I agree that the Boy Scouts of the Philippines and ${h(db.settings.defaultSponsor)} may collect and use this information for scouting registration, in accordance with RA 10173 (Data Privacy Act of 2012). For a learner, I am their parent/guardian or have their permission. For an adult, I commit to the BSP Safe From Harm Policy.</label></p>
    <div role="group" aria-labelledby="paymentStatusLabel"><h2 id="paymentStatusLabel">Payment status</h2>
      <p><label><input type="radio" name="paymentStatus" value="pending" checked> No payment yet - add to Pending payment</label></p>
      <p><label><input type="radio" name="paymentStatus" value="paid"> Payment received - record payment and print acknowledgment receipt</label></p>
    </div>
    <p id="registrationFee" class="hint"></p><p id="registrationResult" role="status"></p>
    <button class="btn primary" type="submit">Submit registration</button>
  </form>`;
}

document.addEventListener('change', e => {
  const form = e.target.closest('#websiteRegistration');
  if (!form) return;
  const kind = form.elements.reg_type.value;
  form.querySelectorAll('[data-registration-kind]').forEach(el => {
    el.hidden = el.dataset.registrationKind !== kind; el.disabled = el.hidden;
  });
  const previous = form.querySelector('[data-reregister]');
  previous.hidden = kind !== 'scout' || form.elements.reg_status.value !== 'RR';
  previous.disabled = previous.hidden;
  // SNED learners are not included in the camp
  const campOpen = kind === 'scout' && form.elements.grade.value !== 'SNED';
  form.querySelector('[data-camp-join]').hidden = !campOpen;
  form.elements.joinCamp.disabled = !campOpen;
  const camp = campOpen && form.elements.joinCamp.checked;
  // the "include camp fee" switch shows once the learner joins; it applies only when payment is received now
  const campPay = form.querySelector('[data-camp-pay]'), payingNow = form.elements.paymentStatus.value === 'paid';
  campPay.hidden = !(camp && campFee() > 0);
  form.elements.campPaidNow.disabled = campPay.hidden || !payingNow;
  form.querySelector('[data-camp-pay-hint]').hidden = payingNow;
  document.getElementById('registrationFee').textContent = kind ? `Fee: ${peso(kind === 'scout' ? R().scout : adultFee({ role: form.elements.role.value }))}${camp ? ` + ${peso(campFee())} camping fee` : ''} — pay to the BSP Coordinator for your school payment receipt.` : '';
});

document.addEventListener('input', e => {
  const el = e.target;
  if (!el.closest('#websiteRegistration')) return;
  el.setCustomValidity('');
  if (['surname', 'given_name', 'middle_initial', 'section', 'guardian_name', 'birthplace', 'religion', 'occupation', 'position_title'].includes(el.name)) {
    const start = el.selectionStart, end = el.selectionEnd;
    el.value = el.name === 'middle_initial' ? el.value.toUpperCase()
      : el.value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, separator, letter) => separator + letter.toUpperCase());
    el.setSelectionRange(start, end);
  }
});

document.addEventListener('submit', async e => {
  const form = e.target;
  if (form.id !== 'websiteRegistration') return;
  e.preventDefault();
  if (form.dataset.submitting) return;
  const result = document.getElementById('registrationResult'), button = form.querySelector('[type=submit]');
  const printSaved = () => (form.savedPaymentReceived ? printPaidRegistration : printRegistrationConfirmation)(form.savedRegistration, { onPrinted: () => {
    delete form.savedRegistration;
    delete form.savedPaymentReceived;
    delete form.savedCamp;
    form.querySelector('[data-camp-pay]').hidden = true;
    form.querySelector('[data-camp-join]').hidden = true;
    form.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = false; });
    form.reset(); form.querySelectorAll('fieldset').forEach(el => { el.hidden = true; el.disabled = true; });
    form.querySelector('#registrationFee').textContent = '';
    button.textContent = 'Submit registration';
  } }, form.savedCamp);
  if (form.savedRegistration) {
    form.dataset.submitting = 'true';
    button.disabled = true;
    try { await printSaved(); } catch (err) { result.textContent = err.message; }
    finally { delete form.dataset.submitting; button.disabled = false; }
    return;
  }
  const v = Object.fromEntries(new FormData(form));
  for (const name of ['surname', 'given_name', ...(v.reg_type === 'scout' ? ['guardian_name'] : [])]) {
    if (!v[name]?.trim()) {
      form.elements[name].setCustomValidity('Please enter a name, not just spaces.');
      form.elements[name].reportValidity();
      return;
    }
  }
  if (!form.reportValidity()) return;
  const localOnly = !window.bsp.cloudStart && (v.localOnly === 'on' || !navigator.onLine);
  if (!localOnly && !online.email) { result.textContent = 'Sign in on the Online tab before submitting a registration.'; return; }
  const id = crypto.randomUUID();
  const entry = { id, reg_type: v.reg_type, status: 'pending', sy: db.settings.schoolYear || null, sponsor: db.settings.defaultSponsor,
    surname: v.surname.trim(), given_name: v.given_name.trim(), middle_initial: mi(v.middle_initial), sex: v.sex,
    birthdate: v.birthdate, contact_no: v.contact_no.trim() || null, consent: true };
  if (v.reg_type === 'scout') Object.assign(entry, { grade_section: [v.grade, v.section.trim()].filter(Boolean).join(' – '),
    guardian_name: v.guardian_name.trim(), reg_status: v.reg_status,
    ...(v.reg_status === 'RR' ? { card_no: v.scout_card_no.trim() || null, highest_rank: v.highest_rank || null, years_in_scouting: v.years_in_scouting ? Number(v.years_in_scouting) : null } : {}) });
  else for (const key of ['role', 'civil_status', 'birthplace', 'religion', 'occupation', 'position_title', 'card_expiration', 'tenure', 'email']) entry[key] = v[key]?.trim() || null;
  if (v.reg_type === 'adult') entry.card_no = v.adult_card_no.trim() || null;
  if (v.reg_type === 'scout' && v.grade !== 'SNED' && v.joinCamp === 'on') entry.camp_requested = true;
  form.dataset.submitting = 'true';
  form.inert = true;
  button.disabled = true; result.textContent = 'Submitting…';
  try {
    if (localOnly) {
      const snapshot = JSON.stringify(db);
      try {
        entry.localOnly = true;
        const imported = importOnline(entry, guessUnit(entry));
        const record = imported.scout || imported.adult;
        delete record.onlineId;
        record.localRegistrationId = id;
        delete record.payment.orNo;
        if (imported.scout) applyCampChoice(record, v.grade !== 'SNED' && v.joinCamp === 'on', false);
        if (!window.bsp.save(JSON.stringify(db))) throw new Error('Could not save registration to disk. Please retry.');
      } catch (err) { db = JSON.parse(snapshot); throw err; }
    } else {
      const res = await window.bsp.sbRest(sbCfg(), 'POST', 'bsp_registrations', entry);
      if (res.error) throw new Error(res.error);
    }
    if (v.paymentStatus !== 'paid') {
      result.textContent = `Registration saved. Reference: ${id.slice(0, 8).toUpperCase()}. No payment was recorded. Find it in Pending payment.`;
      form.reset();
      form.querySelectorAll('[data-registration-kind], [data-reregister]').forEach(el => { el.hidden = true; el.disabled = true; });
      form.querySelector('[data-camp-pay]').hidden = true;
      form.querySelector('[data-camp-join]').hidden = true;
      form.querySelector('#registrationFee').textContent = '';
      online.paymentStatus = 'pending';
      online.kind = v.reg_type === 'scout' ? 'scout' : roleOf(v.role)?.group === 'B' ? 'coordinator' : 'teacher';
      if (!localOnly) void onlineRefresh();
      return;
    }
    form.savedRegistration = entry;
    form.savedPaymentReceived = v.paymentStatus === 'paid';
    form.savedCamp = { join: v.reg_type === 'scout' && v.grade !== 'SNED' && v.joinCamp === 'on', pay: v.campPaidNow === 'on' };
    // remembered until the learner is imported, so the Online list pre-ticks "+ Camping"
    if (!window.bsp.cloudStart && !localOnly && form.savedCamp.join && !form.savedPaymentReceived) { db.campIntents[id] = true; save(); }
    form.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
    button.textContent = form.savedPaymentReceived ? 'Retry printing receipt' : 'Retry printing confirmation';
    result.textContent = `Registration received. Reference: ${id.slice(0, 8).toUpperCase()}. If printing fails, retry printing here.${form.savedPaymentReceived ? ' Payment will be saved before the receipt opens.' : ' No payment was recorded. This registration is in Pending payment.'}`;
    if (localOnly) result.textContent = `Saved on this computer. Reference: ${id.slice(0, 8).toUpperCase()}. Find this registration in Units (Scouts) or Adults. Retry printing here if needed.`;
    else onlineRefresh();
    await printSaved();
  } catch (err) { result.textContent = `${form.savedRegistration ? 'Registration received; unable to print' : 'Unable to submit'}: ${err.message}`; }
  finally { delete form.dataset.submitting; form.inert = false; button.disabled = false; }
});
