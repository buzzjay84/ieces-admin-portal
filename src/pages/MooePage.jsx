import { useState, useEffect, useRef } from "react";
import Topbar from "../components/Topbar";
import { supabase, MOOE_TABLE } from "../supabaseClient";
import "./MooePage.css";

// Dynamic CY Options Generator (Calendar Years starting from CY 2026)
const getDynamicCYOptions = () => {
  const startYear = 2026;
  const endYear = startYear + 2; // Generates 2026, 2027, 2028
  const options = [];

  for (let y = startYear; y <= endYear; y++) {
    options.push(`CY ${y}`);
  }
  return options;
};

const CY_OPTIONS = getDynamicCYOptions();

// Standard Months Array (0 = January ... 11 = December)
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// COA / GAM / DepEd-aligned MOOE Object Codes (UACS)
const OBJECT_CODES = [
  // Travel & Training
  { code: "5020101000", label: "Traveling Expenses - Local" },
  { code: "5020201000", label: "Training Expenses" },

  // Supplies & Materials
  { code: "5020301000", label: "Office Supplies Expenses" },
  { code: "5020302000", label: "Accountable Forms Expenses" },
  { code: "5020303000", label: "Non-Accountable Forms Expenses" },
  { code: "5020304000", label: "Animal/Zoological Supplies Expenses" },
  { code: "5020305000", label: "Food Supplies Expenses" },
  { code: "5020307000", label: "Drugs and Medicines Expenses" },
  { code: "5020308000", label: "Medical, Dental & Lab Supplies" },
  { code: "5020309000", label: "Fuel, Oil and Lubricants Expenses" },
  { code: "5020311001", label: "Textbooks and Instructional Materials" },
  { code: "5020311002", label: "Teaching Supplies / Chalk Allowance" },

  // Semi-Expendable Property (< ₱50,000)
  { code: "5020321001", label: "Semi-Expendable - Machinery" },
  { code: "5020321002", label: "Semi-Expendable - Office Equipment" },
  { code: "5020321003", label: "Semi-Expendable - ICT Equipment" },
  { code: "5020321007", label: "Semi-Expendable - Communications Equipment" },
  { code: "5020321011", label: "Semi-Expendable - Printing Equipment" },
  { code: "5020322001", label: "Semi-Expendable - Furniture & Fixtures" },
  { code: "5020321099", label: "Semi-Expendable - Other Property" },
  { code: "5020399000", label: "Other Supplies and Materials Expenses" },

  // Utilities & Communication
  { code: "5020401000", label: "Water Expenses" },
  { code: "5020402000", label: "Electricity Expenses" },
  { code: "5020501000", label: "Postage and Courier Services" },
  { code: "5020502001", label: "Telephone Expenses - Mobile" },
  { code: "5020502002", label: "Telephone Expenses - Landline" },
  { code: "5020503000", label: "Internet Subscription Expenses" },

  // Awards & General Services
  { code: "5020601000", label: "Awards and Rewards Expenses" },
  { code: "5021202000", label: "Janitorial Services" },
  { code: "5021203000", label: "Security Services" },
  { code: "5021299000", label: "Other General Services" },

  // Professional & Financial Services
  { code: "5021199000", label: "Other Professional Services" },
  { code: "5021502000", label: "Fidelity Bond Premiums" },
  { code: "5021503000", label: "Insurance Expenses" },
  { code: "5030104000", label: "Bank Charges" },

  // Repairs & Maintenance (R&M)
  { code: "5021304001", label: "R&M - Buildings and Other Structures" },
  { code: "5021307000", label: "R&M - Furniture and Fixtures" },
  { code: "5021321002", label: "R&M - Office Equipment" },
  { code: "5021321003", label: "R&M - ICT Equipment" },

  // Other Operating Expenses
  { code: "5029901000", label: "Advertising Expenses" },
  { code: "5029902000", label: "Printing and Publication Expenses" },
  { code: "5029903000", label: "Representation Expenses" },
  { code: "5029904000", label: "Transportation and Delivery Expenses" },
  { code: "5029905000", label: "Rent/Lease Expenses" },
  { code: "5029999099", label: "Other Maintenance and Operating Expenses" },
];

const SUPABASE_BUCKET = "mooe-receipts"; // ← your Supabase Storage bucket name

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseNum = (val) => {
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]+/g, "");
  return parseFloat(clean) || 0;
};

const newRow = () => ({
  id: Date.now() + Math.random(),
  objectCode: "",
  amount: "",
  displayAmount: "",
});

// Auto-derive CY (Calendar Year) directly from transaction date
const deriveCYFromDate = (dateStr) => {
  const currentYr = new Date().getFullYear();
  if (!dateStr) return `CY ${currentYr}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return `CY ${currentYr}`;
  return `CY ${d.getFullYear()}`;
};

export default function MooePage({ onBack, onLogout, user }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [editEntry, setEditEntry] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState("");
  const [filterCY, setFilterCY] = useState("");

  // Form state
  const [month, setMonth] = useState("");
  const [rawAllocation, setRawAllocation] = useState("");
  const [displayAllocation, setDisplayAllocation] = useState("");
  const [rows, setRows] = useState([newRow(), newRow()]);
  const [liquidatedBy, setLiquidatedBy] = useState("");
  const [isLockedHead, setIsLockedHead] = useState(false);
  const [dateReceived, setDateReceived] = useState("");
  const [dateLiquidated, setDateLiquidated] = useState("");
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState("");

  // ── RECEIPT / IMAGE UPLOAD STATE ──
  const [receiptFiles, setReceiptFiles] = useState([]); // new files to upload (File objects)
  const [receiptPreviews, setReceiptPreviews] = useState([]); // local preview URLs
  const [existingReceipts, setExistingReceipts] = useState([]); // already-saved URLs from Supabase
  const [removedReceipts, setRemovedReceipts] = useState([]); // paths to delete on save
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fileInputRef = useRef(null);

  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const loadRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase.from(MOOE_TABLE).select("*");

    if (error) {
      console.error("Error fetching records:", error);
      showToast("❌ Failed to fetch records from Supabase");
      setLoading(false);
      return;
    }

    const formattedData = await Promise.all((data || []).map(async (r) => ({
      ...r,
      cy: r.cy || r.sy,
      liquidatedBy: r.liquidated_by,
      dateReceived: r.date_received,
      dateLiquidated: r.date_liquidated,
      receipts: await Promise.all((r.receipts || []).map(async (receipt) => {
        if (!receipt.path) return receipt;
        const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(receipt.path, 3600);
        if (error) { showToast('Could not open a receipt. Refresh after signing in again.'); return { ...receipt, url: '' }; }
        return { ...receipt, url: data.signedUrl };
      })),
    })));

    const sorted = formattedData.sort((a, b) => {
      if (a.cy !== b.cy) {
        return (b.cy || "").localeCompare(a.cy || "");
      }
      const monthIdxA = MONTHS.indexOf(a.month);
      const monthIdxB = MONTHS.indexOf(b.month);
      return monthIdxA - monthIdxB;
    });

    setRecords(sorted);
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const numericAllocation = parseNum(rawAllocation);
  const totalExpenses = rows.reduce((s, r) => s + parseNum(r.amount), 0);
  const balance = numericAllocation - totalExpenses;

  const handleAllocationFormat = () => {
    const val = parseNum(rawAllocation);
    if (val > 0) {
      setDisplayAllocation(`₱${fmt(val)}`);
    } else {
      setDisplayAllocation("");
    }
  };

  const handleAllocationFocus = () => {
    setDisplayAllocation(rawAllocation);
  };

  const handleAllocationChange = (e) => {
    const val = e.target.value;
    setRawAllocation(val);
    setDisplayAllocation(val);
  };

  const handleAllocationKeyDown = (e) => {
    if (e.key === "Enter") e.target.blur();
  };

  const handleRowAmountChange = (id, val) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, amount: val, displayAmount: val } : r,
      ),
    );
  };

  const handleRowAmountFocus = (id) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, displayAmount: r.amount } : r)),
    );
  };

  const handleRowAmountFormat = (id) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const val = parseNum(r.amount);
          return { ...r, displayAmount: val > 0 ? `₱${fmt(val)}` : "" };
        }
        return r;
      }),
    );
  };

  const handleRowAmountKeyDown = (e) => {
    if (e.key === "Enter") e.target.blur();
  };

  // ── RECEIPT HANDLERS ──
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const validFiles = files.filter((f) => f.type.startsWith("image/"));
    if (validFiles.length !== files.length) {
      showToast("⚠ Only image files are accepted.");
    }

    const previews = validFiles.map((f) => URL.createObjectURL(f));
    setReceiptFiles((prev) => [...prev, ...validFiles]);
    setReceiptPreviews((prev) => [...prev, ...previews]);
    // reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeNewReceipt = (idx) => {
    URL.revokeObjectURL(receiptPreviews[idx]);
    setReceiptFiles((prev) => prev.filter((_, i) => i !== idx));
    setReceiptPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeExistingReceipt = (url, storagePath) => {
    setExistingReceipts((prev) => prev.filter((r) => r.url !== url));
    setRemovedReceipts((prev) => [...prev, storagePath]);
  };

  // Persist storage paths; authenticated reads get temporary signed URLs.
  const uploadReceipts = async (cy, month) => {
    if (!receiptFiles.length) return [];
    const uploaded = [];
    for (const file of receiptFiles) {
      const ext = file.name.split(".").pop();
      const path = `${cy}/${month}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(path, file, { upsert: false });

      if (error) {
        if (uploaded.length) await supabase.storage.from(SUPABASE_BUCKET).remove(uploaded.map(receipt => receipt.path));
        throw new Error(`Failed to upload ${file.name}. The entry was not saved.`);
      }

      uploaded.push({ path });
    }
    return uploaded;
  };

  // Delete removed receipts from Supabase Storage
  const deleteRemovedReceipts = async () => {
    if (!removedReceipts.length) return;
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove(removedReceipts);
    if (error) console.error("Delete receipt error:", error);
  };

  const openNew = () => {
    setMonth("");
    setRawAllocation("");
    setDisplayAllocation("");
    setRows([newRow(), newRow()]);

    const lastHead =
      records.find((r) => r.liquidatedBy?.trim())?.liquidatedBy || "";
    setLiquidatedBy(lastHead);
    setIsLockedHead(!!lastHead.trim());

    setDateReceived("");
    setDateLiquidated(new Date().toISOString().split("T")[0]);
    setRemarks("");
    setFormError("");
    setEditEntry(null);

    // reset receipt state
    setReceiptFiles([]);
    setReceiptPreviews([]);
    setExistingReceipts([]);
    setRemovedReceipts([]);

    setView("form");
  };

  const openEdit = (entry) => {
    setMonth(entry.month);
    const allocVal = String(entry.allocation || "");
    setRawAllocation(allocVal);
    setDisplayAllocation(allocVal ? `₱${fmt(allocVal)}` : "");
    setRows(
      (entry.items || []).map((i) => {
        const amtStr = String(i.amount || "");
        return {
          ...i,
          id: Date.now() + Math.random(),
          amount: amtStr,
          displayAmount: amtStr ? `₱${fmt(amtStr)}` : "",
        };
      }),
    );

    const headName = entry.liquidatedBy || "";
    setLiquidatedBy(headName);
    setIsLockedHead(!!headName.trim());

    setDateReceived(entry.dateReceived || "");
    setDateLiquidated(
      entry.dateLiquidated || new Date().toISOString().split("T")[0],
    );
    setRemarks(entry.remarks || "");
    setFormError("");
    setEditEntry(entry);

    // load existing receipts
    setReceiptFiles([]);
    setReceiptPreviews([]);
    setExistingReceipts(entry.receipts || []);
    setRemovedReceipts([]);

    setView("form");
  };

  const handleSave = async () => {
    if (!month) {
      setFormError("Please select a Month.");
      return;
    }
    if (!numericAllocation || numericAllocation <= 0) {
      setFormError("Please enter a valid MOOE allocation.");
      return;
    }

    const items = rows.filter((r) => r.objectCode && parseNum(r.amount) > 0);
    if (!items.length) {
      setFormError(
        "Please add at least one valid expense item with Object Code and Amount.",
      );
      return;
    }
    setFormError("");
    setUploading(true);

    const cy = deriveCYFromDate(dateLiquidated || dateReceived);

    try {
      // Keep saved receipt files until the database confirms the change.
      const newUploaded = await uploadReceipts(cy, month);

      const allReceipts = [...existingReceipts, ...newUploaded];

      const payload = {
        cy,
        sy: cy,
        month,
        allocation: numericAllocation,
        items: items.map((i) => ({
          objectCode: i.objectCode,
          amount: parseNum(i.amount),
        })),
        total: totalExpenses,
        balance,
        liquidated_by: liquidatedBy,
        date_received: dateReceived || null,
        date_liquidated: dateLiquidated || null,
        remarks,
        receipts: allReceipts.map(receipt => receipt.path ? { path: receipt.path } : receipt),
      };

      if (editEntry?.id) {
        payload.id = editEntry.id;
      }

      const { error } = await supabase
        .from(MOOE_TABLE)
        .upsert(payload, { onConflict: "cy, month" });

      if (error) {
        // A lost response can follow a committed save; keep newly uploaded receipts.
        console.error("Supabase save error:", error);
        setFormError(`Failed to save to Supabase: ${error.message}`);
        return;
      }

      await deleteRemovedReceipts();
      await loadRecords();
      showToast("✅ MOOE entry saved to Supabase!");
      setView("list");
    } catch (error) {
      setFormError(error.message || 'Could not save the entry. Your form has been kept.');
    } finally { setUploading(false); }
  };

  const handleDelete = async (entry) => {
    const { error } = await supabase
      .from(MOOE_TABLE)
      .delete()
      .eq("id", entry.id);

    if (error) {
      console.error("Supabase delete error:", error);
      showToast("❌ Failed to delete record.");
      return;
    }

    // Delete associated receipts from storage
    const paths = (entry.receipts || []).map((r) => r.path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(SUPABASE_BUCKET).remove(paths);
    }

    await loadRecords();
    setDeleteConfirm(null);
    showToast("🗑 Entry deleted.");
  };

  const updateRow = (id, field, val) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
    );
  };
  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const delRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const cyFilterOptions = Array.from(
    new Set([...CY_OPTIONS, ...records.map((r) => r.cy).filter(Boolean)]),
  ).sort((a, b) => a.localeCompare(b));

  const filteredRecords = filterCY
    ? records.filter((r) => r.cy === filterCY)
    : records;

  const handleHeadBlur = () => {
    if (liquidatedBy.trim()) {
      setIsLockedHead(true);
    }
  };

  const getObjectLabel = (code) => {
    const item = OBJECT_CODES.find((o) => o.code === code);
    return item ? item.label : "";
  };

  // ── LIST VIEW ──
  if (view === "list")
    return (
      <div className="mooe-root mooe-list-page">
        <Topbar
          user={user}
          onLogout={onLogout}
          onBack={onBack}
          title="MOOE Expenses & Liquidation"
        />
        <div className="mooe-body">
          <div className="mooe-list-header">
            <div>
              <p className="mooe-eyebrow">FINANCE &amp; ACCOUNTABILITY</p>
              <h1 className="mlh-title">MOOE Liquidation Records</h1>
              <div className="mlh-sub">
                Monthly budget utilization and liquidation entries
              </div>
            </div>
            <div className="mlh-actions">
              <select
                value={filterCY}
                onChange={(e) => setFilterCY(e.target.value)}
                className="filter-sy"
                aria-label="Filter by calendar year"
              >
                <option value="">All Calendar Years</option>
                {cyFilterOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button className="btn-primary" onClick={openNew}>
                + New Entry
              </button>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="es-title">Loading records from Supabase...</div>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">📊</div>
              <div className="es-title">No MOOE entries yet</div>
              <div className="es-sub">
                Click "New Entry" to start encoding monthly expenses.
              </div>
              <button
                className="btn-primary"
                onClick={openNew}
                style={{ marginTop: 16 }}
              >
                + New Entry
              </button>
            </div>
          ) : (
            <div className="records-list-wrapper">
              {filteredRecords.map((r, i) => (
                <div key={r.id || i} className="record-card">
                  <div className="record-heading"><div><span className="record-year">{r.cy}</span><h2>{r.month} liquidation</h2></div><span className="record-caption">Monthly expense breakdown</span></div>
                  {/* SUMMARY TOP BAR */}
                  <div className="records-table-wrap header-table-wrap">
                    <table className="records-table header-summary-table">
                      <thead>
                        <tr>
                          <th>CALENDAR YEAR</th>
                          <th>MONTH</th>
                          <th>ALLOCATION</th>
                          <th>TOTAL EXPENSES</th>
                          <th>BALANCE</th>
                          <th>LIQUIDATED BY</th>
                          <th>DATE</th>
                          <th>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="td-sy">{r.cy}</td>
                          <td className="td-month">{r.month}</td>
                          <td className="td-money">₱{fmt(r.allocation)}</td>
                          <td className="td-money expense">₱{fmt(r.total)}</td>
                          <td
                            className={`td-money ${
                              r.balance < 0 ? "neg" : "pos"
                            }`}
                          >
                            ₱{fmt(r.balance)}
                          </td>
                          <td>{r.liquidatedBy || "—"}</td>
                          <td>{r.dateLiquidated || "—"}</td>
                          <td>
                            <button
                              className="btn-edit"
                              onClick={() => openEdit(r)}
                            >
                              ✏ Edit
                            </button>
                            <button
                              className="btn-del"
                              aria-label={`Delete ${r.month} ${r.cy} entry`}
                              onClick={() => setDeleteConfirm(r)}
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* OBJECT CODES / EXPENSES BREAKDOWN TABLE */}
                  <div className="records-table-wrap items-table-wrap">
                    <table className="records-table items-breakdown-table">
                      <thead>
                        <tr>
                          <th style={{ width: "75%" }}>
                            OBJECT CODE / ACCOUNT TITLE
                          </th>
                          <th style={{ width: "20%" }}>AMOUNT (₱)</th>
                          <th style={{ width: "5%" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(r.items || []).map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="code-text">
                                {item.objectCode}
                              </span>
                              {getObjectLabel(item.objectCode) && (
                                <span className="label-text">
                                  {" "}
                                  — {getObjectLabel(item.objectCode)}
                                </span>
                              )}
                            </td>
                            <td className="td-money">₱{fmt(item.amount)}</td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* RECEIPT THUMBNAILS IN LIST VIEW */}
                  {r.receipts && r.receipts.length > 0 && (
                    <div className="receipt-list-row">
                      <span className="receipt-list-label">📎 Receipts:</span>
                      <div className="receipt-thumb-row">
                        {r.receipts.map((rec, idx) => (
                          <img
                            key={idx}
                            src={rec.url}
                            alt={`Receipt ${idx + 1}`}
                            className="receipt-thumb"
                            onClick={() => setLightboxUrl(rec.url)}
                            title="Click to view"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
              <div className="cb-icon">⚠️</div>
              <div className="cb-title">Delete Entry?</div>
              <div className="cb-msg">
                This will permanently remove the MOOE entry for{" "}
                <b>
                  {deleteConfirm.month} — {deleteConfirm.cy}
                </b>
                . This cannot be undone.
              </div>
              <div className="cb-btns">
                <button
                  className="btn-cancel"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(deleteConfirm)}
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LIGHTBOX */}
        {lightboxUrl && (
          <div className="modal-overlay" onClick={() => setLightboxUrl(null)}>
            <div className="lightbox-box" onClick={(e) => e.stopPropagation()}>
              <button
                className="lightbox-close"
                onClick={() => setLightboxUrl(null)}
              >
                ✕
              </button>
              <img src={lightboxUrl} alt="Receipt" className="lightbox-img" />
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    );

  // ── FORM VIEW ──
  const currentCalculatedCY = deriveCYFromDate(dateLiquidated || dateReceived);

  return (
    <div className="mooe-root">
      <Topbar
        user={user}
        onLogout={onLogout}
        onBack={() => setView("list")}
        title={editEntry ? "Edit MOOE Entry" : "New MOOE Entry"}
      />
      <div className="mooe-body">
        <div className="form-card">
          {/* PERIOD */}
          <div className="section-label">📅 Report Period</div>
          <div className="form-row">
            <div className="fg">
              <label>
                Month <span className="req">*</span>
              </label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">— Select Month —</option>
                {MONTHS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>
                MOOE Allocation (₱) <span className="req">*</span>
              </label>
              <input
                type="text"
                value={displayAllocation}
                onChange={handleAllocationChange}
                onBlur={handleAllocationFormat}
                onFocus={handleAllocationFocus}
                onKeyDown={handleAllocationKeyDown}
                placeholder="0.00"
              />
            </div>
            <div className="fg">
              <label>Date Cash Advance Received</label>
              <input
                type="date"
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
              />
            </div>
            <div className="fg">
              <label>Calendar Year (Auto-derived)</label>
              <input
                type="text"
                value={currentCalculatedCY}
                readOnly
                className="input-readonly"
              />
            </div>
          </div>

          {/* EXPENSE TABLE */}
          <div className="section-label" style={{ marginTop: 24 }}>
            🧾 Expense Items (COA Object Codes)
          </div>
          <div className="expense-wrap">
            <table className="exp-table">
              <thead>
                <tr>
                  <th style={{ width: "70%" }}>Object Code / Account Title</th>
                  <th style={{ width: "25%" }}>Amount (₱)</th>
                  <th style={{ width: "5%" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <select
                        value={row.objectCode}
                        onChange={(e) =>
                          updateRow(row.id, "objectCode", e.target.value)
                        }
                      >
                        <option value="">— Select Account —</option>
                        {row.objectCode && !OBJECT_CODES.some(item => item.code === row.objectCode) && (
                          <option value={row.objectCode}>{row.objectCode} — Legacy code (review classification)</option>
                        )}
                        {OBJECT_CODES.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.code} — {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.displayAmount}
                        onChange={(e) =>
                          handleRowAmountChange(row.id, e.target.value)
                        }
                        onBlur={() => handleRowAmountFormat(row.id)}
                        onFocus={() => handleRowAmountFocus(row.id)}
                        onKeyDown={handleRowAmountKeyDown}
                        placeholder="0.00"
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="del-row-btn"
                        onClick={() => delRow(row.id)}
                        title="Remove row"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="add-row-btn" onClick={addRow}>
            + Add Item
          </button>

          {/* TOTALS */}
          <div className="totals-bar">
            <div className="tb-item">
              <span className="tb-lbl">Allocation</span>
              <span className="tb-val">₱{fmt(numericAllocation)}</span>
            </div>
            <div className="tb-sep">−</div>
            <div className="tb-item">
              <span className="tb-lbl">Total Expenses</span>
              <span className="tb-val expense">₱{fmt(totalExpenses)}</span>
            </div>
            <div className="tb-sep">=</div>
            <div className="tb-item">
              <span className="tb-lbl">Balance</span>
              <span className={`tb-val ${balance < 0 ? "neg" : "pos"}`}>
                ₱{fmt(balance)}
              </span>
            </div>
          </div>

          {/* LIQUIDATION */}
          <div className="section-label" style={{ marginTop: 24 }}>
            📝 Liquidation Details
          </div>
          <div className="form-row">
            <div className="fg">
              <label>Liquidated By (School Head)</label>
              <div className="lockable-input-wrapper">
                <input
                  type="text"
                  value={liquidatedBy}
                  onChange={(e) => setLiquidatedBy(e.target.value)}
                  onBlur={handleHeadBlur}
                  readOnly={isLockedHead}
                  placeholder="Full name and position of School Head"
                  className={isLockedHead ? "input-locked" : ""}
                />
                {isLockedHead && (
                  <button
                    type="button"
                    className="btn-unlock-head"
                    onClick={() => setIsLockedHead(false)}
                    title="Edit School Head"
                  >
                    ✏ Edit
                  </button>
                )}
              </div>
            </div>
            <div className="fg">
              <label>Date Liquidated</label>
              <input
                type="date"
                value={dateLiquidated}
                onChange={(e) => setDateLiquidated(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="fg" style={{ flex: 1 }}>
              <label>General Remarks / Notes</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional: purpose, fund source, or COA notes..."
                rows={3}
              />
            </div>
          </div>

          {/* ── RECEIPT UPLOAD SECTION ── */}
          <div className="section-label" style={{ marginTop: 24 }}>
            📷 Receipt / Supporting Documents
          </div>

          {/* Existing receipts (edit mode) */}
          {existingReceipts.length > 0 && (
            <div className="receipt-grid">
              {existingReceipts.map((rec, idx) => (
                <div key={idx} className="receipt-item">
                  <img
                    src={rec.url}
                    alt={`Receipt ${idx + 1}`}
                    className="receipt-preview"
                    onClick={() => setLightboxUrl(rec.url)}
                    title="Click to view"
                  />
                  <button
                    className="receipt-remove"
                    onClick={() => removeExistingReceipt(rec.url, rec.path)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* New receipt previews */}
          {receiptPreviews.length > 0 && (
            <div className="receipt-grid">
              {receiptPreviews.map((url, idx) => (
                <div key={idx} className="receipt-item receipt-item-new">
                  <img
                    src={url}
                    alt={`New receipt ${idx + 1}`}
                    className="receipt-preview"
                    onClick={() => setLightboxUrl(url)}
                    title="Click to view"
                  />
                  <button
                    className="receipt-remove"
                    onClick={() => removeNewReceipt(idx)}
                    title="Remove"
                  >
                    ✕
                  </button>
                  <div className="receipt-new-badge">NEW</div>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <button
            className="btn-upload-receipt"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            📎 {uploading ? "Uploading..." : "Attach Receipt Photos"}
          </button>
          <div className="receipt-hint">
            Accepted: JPG, PNG, WEBP. Multiple files allowed.
          </div>

          {formError && <div className="form-error">⚠ {formError}</div>}

          <div className="form-footer">
            <button className="btn-cancel" onClick={() => setView("list")}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={uploading}
            >
              {uploading ? "⏳ Saving..." : "💾 Save Entry"}
            </button>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightboxUrl && (
        <div className="modal-overlay" onClick={() => setLightboxUrl(null)}>
          <div className="lightbox-box" onClick={(e) => e.stopPropagation()}>
            <button
              className="lightbox-close"
              onClick={() => setLightboxUrl(null)}
            >
              ✕
            </button>
            <img src={lightboxUrl} alt="Receipt" className="lightbox-img" />
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
