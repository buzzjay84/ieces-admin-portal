import bspLogo from "../../electron/bsp/src/assets/bsp-logo.png";
import schoolLogo from "../image/ieceslogo.png";
import "./Dashboard.css";

const SCHOOL_WEBSITE_URL = "https://project-rising-xi.vercel.app/";
const MODULES = [
  { id: "bsp", label: "BSP Registration", category: "Programs", desc: "Scout and adult registrations, receipts, and camping records.", image: bspLogo },
  { id: "enrollment", label: "Enrollment", category: "Learners", desc: "Daily enrollment and breakdowns by grade, gender, and 4Ps.", path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M17 11h6" },
  { id: "mooe", label: "MOOE Report", category: "Finance", desc: "Monthly expenses, liquidation entries, and supporting receipts.", path: "M4 3h16v18H4Z M8 7h8 M8 11h8 M8 15h3 M15 15h1 M8 18h3" },
  { id: "orgchart", label: "Organizational Chart", category: "Personnel", desc: "Staff profiles, positions, grade assignments, and substitutes.", path: "M9 3h6v5H9Z M3 16h6v5H3Z M15 16h6v5h-6Z M12 8v4 M6 16v-4h12v4" },
  { id: "media-manager", label: "Media and Homepage", category: "Communications", desc: "Review news submissions and update the website slideshow.", path: "M3 3h18v18H3Z M3 16l5-5 5 5 3-3 5 5 M16 7h.01" },
  { id: "school-bulletin", label: "School Bulletin", category: "Communications", desc: "Publish official notices, office orders, and class suspensions.", path: "M3 9v6h4l12 4V5L7 9H3Z M7 15l2 6h4l-2-5 M22 9v6" },
  { id: "form137", label: "Form 137 & Learner Records", category: "Learners", desc: "Find learner profiles and print SF10-ES / Form 137 records.", path: "M14 2H4v20h16V8l-6-6Z M14 2v6h6 M8 12h8 M8 16h8" },
  { id: "teaching-load", label: "Teaching Load", category: "Personnel", desc: "Plan teacher schedules and review daily teaching minutes.", path: "M3 5h18v16H3Z M7 2v6 M17 2v6 M3 10h18 M7 14h2 M13 14h4 M7 18h2" },
];

export default function Dashboard({ user, onLogout, onNavigate }) {
  return (
    <div className="dash-root dashboard-home">
      <main className="dash-body">
        <header className="dash-welcome">
          <img className="dash-banner-logo" src={schoolLogo} alt="IECES school seal" width="220" height="220" />
          <div className="dash-banner-copy">
            <p className="dash-school-name">Isabela East Central Elementary School</p>
            <p className="dash-school-division">Division of Isabela City</p>
            <p className="dash-eyebrow">SCHOOL ADMINISTRATION</p>
            <h1>Welcome back, {user?.name || "Admin"}.</h1>
            <p className="dw-sub">Your workspace for school records, reporting, and operations.</p>
          </div>
          <div className="dash-banner-actions">
          <a className="dash-site-link" href={SCHOOL_WEBSITE_URL} target="_blank" rel="noreferrer">
            School website <span aria-hidden="true">&#8599;</span><span className="dash-sr-only"> (opens in a new tab)</span>
          </a>
          <button type="button" className="tb-logout" onClick={onLogout}>Sign Out</button>
          </div>
        </header>
        <section aria-labelledby="modules-title">
          <div className="ds-header">
            <div><h2 id="modules-title">Your modules</h2><p>Choose an area to get started.</p></div>
            <span className="ds-count">8 modules</span>
          </div>
          <div className="module-grid">
            {MODULES.map((module) => (
              <button key={module.id} type="button" className="module-card" data-module={module.id} onClick={() => onNavigate(module.id)} aria-labelledby={`${module.id}-title`} aria-describedby={`${module.id}-description`}>
                <span className="mc-top"><span className={`mc-icon${module.image ? " mc-icon-logo" : ""}`}>{module.image ? <img src={module.image} alt="" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={module.path} /></svg>}</span><span className="mc-category">{module.category}</span></span>
                <span className="mc-label" id={`${module.id}-title`}>{module.label}</span>
                <span className="mc-desc" id={`${module.id}-description`}>{module.desc}</span>
                <span className="mc-action" aria-hidden="true">Open module <span>&#8594;</span></span>
              </button>
            ))}
          </div>
        </section>
        <footer className="dash-footer"><span>Isabela East Central Elementary School</span><span>Division of Isabela City</span></footer>
      </main>
    </div>
  );
}
