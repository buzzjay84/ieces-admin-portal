/* PDF preview follows SwiSS's printToPDF -> PDF.js canvas workflow. */
(() => {
  let dialog, pdf, page = 1, zoom = 1, generation = 0, rendering = Promise.resolve(), busy = false, printing = false, previousFocus;
  let pdfjsPromise, onPrinted;
  const $ = id => document.getElementById(id);
  const settings = () => ({ html: $('print').innerHTML, printer: $('ppPrinter').value, paper: $('ppPaper').value,
    orientation: $('ppOrientation').value, copies: Number($('ppCopies').value), color: $('ppColor').value });
  const readableError = err => /No handler registered|is not a function/.test(err.message)
    ? 'Fully close and reopen BSP Registration to load the updated print service. Reloading the window is not enough.'
    : err.message;
  const message = text => { $('ppMessage').textContent = text; };
  function enable() {
    $('ppPrint').disabled = busy || !pdf || $('ppPrinter').options.length === 0;
    $('ppSave').disabled = busy || !pdf;
    dialog.querySelectorAll('aside input, aside select').forEach(el => { el.disabled = busy; });
    $('ppPrevious').disabled = busy || !pdf || page <= 1;
    $('ppNext').disabled = busy || !pdf || page >= (pdf?.numPages || 0);
    $('ppZoomOut').disabled = busy || !pdf;
    $('ppZoomIn').disabled = busy || !pdf;
  }
  async function draw() {
    const requested = generation;
    rendering = rendering.catch(() => {}).then(async () => {
      if (!pdf || !dialog || requested !== generation) return;
      const current = pdf;
      const p = await current.getPage(page);
      if (!dialog || current !== pdf) return;
      const viewport = p.getViewport({ scale: zoom * 1.15 });
      const canvas = $('ppCanvas'), ratio = window.devicePixelRatio || 1;
      canvas.style.filter = $('ppColor').value === 'grayscale' ? 'grayscale(1)' : 'none';
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      await p.render({ intent: 'print', canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (!dialog || requested !== generation) return;
      $('ppPage').textContent = `Page ${page} of ${pdf.numPages}`;
      $('ppPrevious').disabled = page <= 1; $('ppNext').disabled = page >= pdf.numPages;
      $('ppZoomLabel').textContent = `${Math.round(zoom * 100)}%`;
    });
    try { await rendering; } catch (err) { if (dialog) message(err.message); }
  }
  async function generate() {
    const id = ++generation;
    busy = true; enable(); message('Preparing preview…');
    try {
      const result = await window.bsp.printPreview(settings());
      if (id !== generation || !dialog) return;
      if (!result.ok) throw new Error(result.reason);
      if (!pdfjsPromise) pdfjsPromise = import('./vendor/pdfjs/pdf.mjs').then(m => {
        m.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
        return m;
      });
      const lib = await pdfjsPromise;
      const data = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      await rendering.catch(() => {});
      if (id !== generation || !dialog) return;
      if (pdf) { await pdf._previewTask.destroy(); pdf = null; }
      const task = lib.getDocument({ data, isEvalSupported: false });
      const next = await task.promise;
      next._previewTask = task;
      if (id !== generation || !dialog) { await next._previewTask.destroy(); return; }
      pdf = next;
      page = Math.min(page, pdf.numPages); message(''); await draw();
    } catch (err) { if (id === generation && dialog) { pdf = null; message(`Preview failed: ${readableError(err)}`); } }
    finally { if (id === generation && dialog) { busy = false; enable(); } }
  }
  function close() {
    if (printing) return;
    busy = false;
    generation++; const old = pdf; pdf = null;
    rendering.finally(() => old?._previewTask.destroy()).catch(() => {});
    dialog.close(); dialog.remove(); dialog = null;
    $('print').innerHTML = ''; previousFocus?.focus();
  }
  async function run(kind) {
    if (busy || !pdf) return;
    const s = settings();
    if (kind === 'print' && (!Number.isInteger(s.copies) || s.copies < 1 || s.copies > 999)) return message('Enter 1–999 copies.');
    let printed = false;
    printing = true; busy = true; enable(); message(kind === 'print' ? 'Sending to printer…' : 'Saving PDF…');
    try {
      const result = await (kind === 'print' ? window.bsp.print(s) : window.bsp.printSavePDF(s));
      if (result?.ok !== true) throw new Error(result?.reason || 'Printing failed. Please retry.');
      printed = kind === 'print' && !result.canceled;
      if (printed && onPrinted) {
        await onPrinted();
        onPrinted = undefined;
      }
      message(result.canceled ? '' : kind === 'print' ? `Sent to ${s.printer || 'the Windows default printer'}. Check the printer queue if no paper comes out; you can retry here.` : 'PDF saved.');
    } catch (err) { printed = false; message(readableError(err)); }
    finally {
      printing = false; busy = false;
      if (dialog) enable();
    }
  }
  window.bspPreview = { async open(html, options = {}) {
    if (dialog) return;
    onPrinted = options.onPrinted;
    busy = true;
    previousFocus = document.activeElement;
    $('print').innerHTML = html;
    dialog = document.createElement('dialog'); dialog.className = 'print-preview';
    dialog.setAttribute('aria-labelledby', 'ppTitle');
    dialog.innerHTML = `<header><h2 id="ppTitle">Print preview</h2><button type="button" id="ppClose" aria-label="Close preview">×</button></header>
      <div class="pp-layout"><aside>
        <label>Printer<select id="ppPrinter"><option value="">Loading printers…</option></select></label>
        <label>Paper size<select id="ppPaper"><option selected>A4</option><option value="Folio">Long bond / Folio (8.5 × 13 in)</option><option>Letter</option><option>Legal</option></select></label>
        <label>Orientation<select id="ppOrientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        <label>Copies<input type="number" id="ppCopies" value="1" min="1" max="999"></label>
        <label>Colour mode<select id="ppColor"><option value="color">Colour</option><option value="grayscale">Black and white</option></select></label>
        <p class="hint">All pages will print. The preview shows the actual PDF layout.</p>
        <p id="ppPrinterError" role="status"></p>
      </aside><section class="pp-document" aria-label="Document preview">
        <div class="pp-tools"><button id="ppPrevious" aria-label="Previous page">‹</button><span id="ppPage">Page —</span><button id="ppNext" aria-label="Next page">›</button><button id="ppZoomOut" aria-label="Zoom out">−</button><span id="ppZoomLabel">100%</span><button id="ppZoomIn" aria-label="Zoom in">+</button></div>
        <div class="pp-stage"><canvas id="ppCanvas"></canvas></div>
      </section></div><footer><span id="ppMessage" role="status"></span><button class="btn" id="ppSave" disabled>Save PDF</button><button class="btn" id="ppCancel">Close</button><button class="btn primary" id="ppPrint" disabled>Print</button></footer>`;
    document.body.append(dialog); dialog.showModal();
    const openedDialog = dialog;
    enable();
    $('ppClose').onclick = close; $('ppCancel').onclick = close;
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    $('ppPrint').onclick = () => run('print'); $('ppSave').onclick = () => run('save');
    $('ppColor').onchange = generate;
    $('ppPaper').onchange = generate; $('ppOrientation').onchange = generate;
    $('ppPrinter').onchange = enable;
    $('ppPrevious').onclick = () => { if (pdf && page > 1) { page--; draw(); } };
    $('ppNext').onclick = () => { if (pdf && page < pdf.numPages) { page++; draw(); } };
    $('ppZoomOut').onclick = () => { zoom = Math.max(.4, zoom - .1); draw(); };
    $('ppZoomIn').onclick = () => { zoom = Math.min(2, zoom + .1); draw(); };
    page = 1; zoom = 1;
    try {
      const result = await window.bsp.printPrinters();
      if (dialog !== openedDialog) return;
      if (!result.ok) throw new Error(result.reason);
      const select = $('ppPrinter'); select.replaceChildren(new Option('Windows default printer', '', true, true));
      for (const printer of result.printers) select.add(new Option(printer.displayName || printer.name, printer.name, false, false));
      if (!result.printers.length) { select.replaceChildren(); $('ppPrinterError').textContent = 'You can still save a PDF.'; }
    } catch (err) {
      if (dialog !== openedDialog) return;
      $('ppPrinter').replaceChildren();
      $('ppPrinterError').textContent = readableError(err);
    }
    if (dialog === openedDialog) await generate();
  } };
})();

