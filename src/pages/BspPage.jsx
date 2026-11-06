import { useEffect, useState } from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import "./Dashboard.css";
import "./BspPage.css";

export default function BspPage({ user, onBack, onLogout, addToast }) {
  const [enabled, setEnabled] = useState(null);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const { data, error } = await supabase.from("bsp_registration_control").select("enabled").eq("id", true).single();
      if (error) throw error;
      setEnabled(data.enabled);
    } catch (err) {
      setEnabled(null);
      setError(`Cannot read registration status: ${err.message}. Check the connection and apply supabase-bsp-registration-control.sql.`);
    }
  }

  useEffect(() => {
    void refresh();
    const channel = supabase.channel("bsp-registration-control-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "bsp_registration_control" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.from("bsp_registration_control")
        .update({ enabled: !enabled }).eq("id", true).select("enabled").single();
      if (error) throw error;
      setEnabled(data.enabled);
      addToast(data.enabled ? "Website registration is open." : "Website registration is closed.", "success");
    } catch (err) { setError(`Could not change registration: ${err.message}. A BSP administrator account is required.`); }
    finally { setBusy(false); }
  }

  async function openWorkspace() {
    setOpening(true);
    try { await window.ipc.bsp.open(); }
    catch (err) { addToast(`Could not open BSP Registration: ${err.message}`, "error"); }
    finally { setOpening(false); }
  }

  return (
    <div className="dash-root bsp-page">
      <Topbar user={user} onLogout={onLogout} title="BSP Registration" onBack={onBack} />
      <div className="dash-body">
        <h1>BSP Registration</h1>
        <section className="tip-card" style={{ display: "block", marginBottom: 24 }}>
          <h2>Website registration</h2>
          <p id="bsp-registration-help">Open or close new scout and adult submissions on the school website. Existing registrations, payments, and desktop registration remain available.</p>
          <button type="button" role="switch" aria-label="Allow BSP website registration" aria-checked={enabled === true} aria-describedby="bsp-registration-help" disabled={enabled === null || busy} onClick={toggle}>
            {busy ? "Saving…" : enabled === null ? "Status unavailable" : enabled ? "Registration open — turn off" : "Registration closed — turn on"}
          </button>
          <button type="button" disabled={busy} onClick={refresh} style={{ marginLeft: 12 }}>Refresh status</button>
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="tip-card" style={{ display: "block" }}>
          <h2>Registration workspace</h2>
          <p>Scout units, adult forms, online imports, camping, receipts, summaries, and backups.</p>
          <button type="button" disabled={!window.ipc?.bsp || opening} onClick={openWorkspace}>{opening ? "Opening workspace..." : "Open BSP workspace"}</button>
          {!window.ipc?.bsp && <p>Open the desktop admin portal to use the BSP workspace.</p>}
          <p>BSP records, payments, receipt numbers, settings, and archives are shared through Supabase. Apply supabase-bsp-workspace.sql, then sign in on the Online tab and upload the existing records once from the app with the complete data. Other installations load the shared records automatically.</p>
          <p>Local files are recovery caches. Edits require a connection; stale saves are blocked to protect payments and receipt numbers.</p>
          <p>For online imports, sign in on the workspace’s Online tab with a BSP administrator account.</p>
        </section>
      </div>
    </div>
  );
}
