import iecesLogo from "../image/ieceslogo.png";
import "./Topbar.css";

export default function Topbar({ user, onLogout, title, onBack }) {
  return (
    <div className="topbar">
      <div className="tb-left">
        {onBack && (
          <button type="button" className="tb-back" onClick={onBack}>
            ← Back
          </button>
        )}
        <div className="tb-logo">
          <img src={iecesLogo} alt="IECES Logo" />
        </div>
        <div className="tb-titles">
          <div className="tb-app">Isabela East Central Elementary School</div>
          {title && <div className="tb-page">{title}</div>}
        </div>
      </div>
      <div className="tb-right">
        <span className="tb-user">{user?.name || user?.username}</span>
        <button className="tb-logout" onClick={onLogout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
