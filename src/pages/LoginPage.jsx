import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import iecesLogo from "../image/ieceslogo.png";
import enrollmentA from "../image/enrollmentA.png";
import enrollmentB from "../image/enrollmentB.png";
import enrollmentC from "../image/enrollmentC.png";
import { Cloud, CloudDrizzle, CloudLightning, CloudMoon, CloudRain, CloudSun, Eye, EyeOff, Moon, Sun } from "lucide-react";
import "@fontsource/cinzel/700.css";
import "@fontsource/outfit/200.css";
import "@fontsource/outfit/400.css";
import { fetchLoginWeather } from "../lib/loginWeather";
import { getActiveFerries } from "../lib/ferrySchedule";
import "./LoginPage.css";

const ENROLLMENT_SLIDES = [
  { src: enrollmentA, alt: "IECES enrollment assistance for families" },
  { src: enrollmentB, alt: "IECES on-campus enrollment" },
  { src: enrollmentC, alt: "IECES digital enrollment" },
];

function PasswordInput({ ariaLabel = "password", ...props }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="lf-password-wrap">
      <input type={isVisible ? "text" : "password"} {...props} />
      <button
        type="button"
        className="lf-password-toggle"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={`${isVisible ? "Hide" : "Show"} ${ariaLabel}`}
        aria-pressed={isVisible}
      >
        {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

function EnrollmentSlideshow() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const slideTimer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % ENROLLMENT_SLIDES.length);
    }, 4500);

    return () => window.clearInterval(slideTimer);
  }, [paused]);

  return (
    <div className="login-slideshow" aria-label="IECES enrollment highlights">
      {ENROLLMENT_SLIDES.map((slide, index) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={index === activeSlide ? slide.alt : ""}
          className={`login-slide${index === activeSlide ? " active" : ""}`}
          aria-hidden={index !== activeSlide}
        />
      ))}
      <div className="login-slide-shade" />
      <div className="login-slide-dots" aria-label="Choose enrollment image">
        <button type="button" className="login-slide-pause" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? "Play" : "Pause"}</button>
        {ENROLLMENT_SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            className={`login-slide-dot${index === activeSlide ? " active" : ""}`}
            onClick={() => setActiveSlide(index)}
            aria-label={`Show enrollment image ${index + 1}`}
            aria-current={index === activeSlide ? "true" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ── Live sky behind the branding panel ───────────────────────────────────────
// A coastal scene (Basilan) that shows a sunlit sea from 6:00 AM–5:59 PM and a
// moonlit sea otherwise. It re-checks every minute and crossfades on change.
const isDaytime = (date = new Date()) => {
  const hour = date.getHours();
  return hour >= 6 && hour < 18;
};

// Where the sun (day) or moon (night) sits on its arc. Each rises at the
// left horizon at 6:00, peaks at 12:00 (noon or midnight) and sets on the
// right at 6:00. "low" is 1 at the horizon and 0 at the peak, and drives the
// warm sunrise/sunset glow.
const getSkyPosition = (date = new Date()) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const progress = (((minutes - 360 + 1440) % 1440) % 720) / 720;
  const height = Math.sin(Math.PI * progress);
  return {
    day: isDaytime(date),
    x: 8 + progress * 84,
    y: 70 - height * 60,
    low: 1 - height,
  };
};

// Fixed pseudo-random star field so stars do not jump between renders.
const STARS = Array.from({ length: 90 }, (_, i) => {
  const rand = (n) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    top: `${rand(1) * 68}%`,
    left: `${rand(2) * 100}%`,
    size: rand(3) > 0.9 ? 2.5 : rand(3) > 0.55 ? 1.6 : 1,
    delay: `${(rand(4) * 6).toFixed(2)}s`,
    duration: `${(2.5 + rand(5) * 4).toFixed(2)}s`,
  };
});

// Ripple highlights on the sea. Depth (0 = horizon, 1 = foreground) makes
// ripples smaller and denser near the horizon for perspective.
const seededRandom = (seed) => (n) => {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const RIPPLES = Array.from({ length: 70 }, (_, i) => {
  const rand = seededRandom(i + 200);
  const depth = Math.pow(rand(1), 1.4);
  return {
    top: `${(depth * 96).toFixed(2)}%`,
    left: `${(rand(2) * 104 - 2).toFixed(2)}%`,
    width: `${(6 + depth * 46 * (0.6 + rand(3) * 0.8)).toFixed(1)}px`,
    height: `${(1 + depth * 1.5).toFixed(1)}px`,
    delay: `${(rand(4) * 7).toFixed(2)}s`,
    duration: `${(4 + rand(5) * 5).toFixed(2)}s`,
  };
});

// Sparkles clustered under the sun/moon; the spread widens toward the viewer.
const PATH_SPARKLES = Array.from({ length: 34 }, (_, i) => {
  const rand = seededRandom(i + 500);
  const depth = Math.pow(rand(1), 1.2);
  const spread = 3 + depth * 14;
  return {
    top: `${(depth * 94).toFixed(2)}%`,
    offset: `${((rand(2) * 2 - 1) * spread).toFixed(2)}%`,
    width: `${(4 + depth * 20 * (0.5 + rand(3))).toFixed(1)}px`,
    height: `${(1 + depth * 1.2).toFixed(1)}px`,
    delay: `${(rand(4) * 3).toFixed(2)}s`,
    duration: `${(1.6 + rand(5) * 2.4).toFixed(2)}s`,
  };
});

// Rain streaks; only rendered while it is raining.
const RAIN_DROPS = Array.from({ length: 110 }, (_, i) => {
  const rand = seededRandom(i + 900);
  return {
    left: `${(rand(1) * 110 - 5).toFixed(2)}%`,
    height: `${(14 + rand(2) * 22).toFixed(0)}px`,
    delay: `${(-rand(3) * 1.2).toFixed(2)}s`,
    duration: `${(0.55 + rand(4) * 0.45).toFixed(2)}s`,
    opacity: (0.35 + rand(5) * 0.5).toFixed(2),
  };
});

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

// Live weather for the scene and clock; null until loaded or when offline.
function useLoginWeather() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    let controller;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      fetchLoginWeather(controller.signal)
        .then(setWeather)
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, WEATHER_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return weather;
}

const WEATHER_ICONS = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  storm: [CloudLightning, CloudLightning],
};

function WeatherIcon({ condition, night = false, ...props }) {
  const [DayIcon, NightIcon] = WEATHER_ICONS[condition] || WEATHER_ICONS.cloudy;
  const Icon = night ? NightIcon : DayIcon;
  return <Icon aria-hidden="true" {...props} />;
}

function SkySea() {
  return (
    <div className="sky-sea">
      <div className="sky-sea-sheen" />
      {RIPPLES.map((ripple, index) => (
        <span
          key={index}
          className="sky-ripple"
          style={{
            top: ripple.top,
            left: ripple.left,
            width: ripple.width,
            height: ripple.height,
            animationDelay: ripple.delay,
            animationDuration: ripple.duration,
          }}
        />
      ))}
      <div className="sky-light-glow" />
      {PATH_SPARKLES.map((sparkle, index) => (
        <span
          key={index}
          className="sky-sparkle"
          style={{
            top: sparkle.top,
            left: `calc(var(--orb-x) + ${sparkle.offset})`,
            width: sparkle.width,
            height: sparkle.height,
            animationDelay: sparkle.delay,
            animationDuration: sparkle.duration,
          }}
        />
      ))}
    </div>
  );
}

// Island silhouettes, back to front; colours come from CSS per scene. The
// same shapes are mirrored below the horizon as a faint sea reflection.
function SkyIslands({ reflection = false }) {
  return (
    <svg
      className={reflection ? "sky-islands sky-reflection" : "sky-islands"}
      viewBox="0 0 800 160"
      preserveAspectRatio="xMidYMax slice"
    >
      <path
        className="isle-far"
        d="M0 160 L0 128 Q30 124 60 126 Q95 116 130 118 Q160 108 190 112 Q215 104 240 110 Q270 120 300 124 L360 160 Z M380 160 Q420 140 460 132 Q490 122 520 116 Q545 110 570 114 Q600 120 630 128 Q680 136 720 134 Q760 130 800 132 L800 160 Z"
      />
      <path
        className="isle-mid"
        d="M30 160 Q60 150 85 140 Q105 128 122 112 Q134 100 146 96 Q156 93 166 100 Q182 112 200 124 Q225 138 260 146 Q290 152 320 160 Z"
      />
      <path
        className="isle-mid"
        d="M440 160 Q470 152 495 144 Q515 136 532 134 Q548 133 562 140 Q585 150 610 160 Z"
      />
      <path
        className="isle-near"
        d="M560 160 Q595 152 625 140 Q650 126 672 112 Q690 100 708 98 Q724 97 738 106 Q755 118 772 126 Q786 132 800 134 L800 160 Z"
      />
    </svg>
  );
}

// FastCat-style catamaran RoRo, drawn facing right (toward Zamboanga).
function FerryShip() {
  return (
    <svg viewBox="0 0 160 58" className="ferry-svg">
      {/* Twin hulls */}
      <path d="M6 44 L150 44 Q158 44 156 50 L150 54 L14 54 Q6 54 6 48 Z" className="ferry-hull" />
      <path d="M8 49 L154 49" className="ferry-stripe-red" strokeWidth="2.4" />
      <path d="M10 53 L150 53" className="ferry-stripe-blue" strokeWidth="1.6" />
      {/* Car deck */}
      <rect x="10" y="32" width="136" height="12" className="ferry-hull" />
      <rect x="16" y="35" width="118" height="5" className="ferry-deck" />
      {/* Passenger cabin */}
      <path d="M38 32 L38 20 Q38 16 44 16 L124 16 Q136 16 142 26 L146 32 Z" className="ferry-hull" />
      <path d="M44 22 L128 22 Q134 22 137 27 L44 27 Z" className="ferry-windows" />
      {/* Bridge and mast */}
      <path d="M96 16 L96 8 Q96 6 99 6 L118 6 Q124 6 128 12 L130 16 Z" className="ferry-hull" />
      <path d="M100 9 L120 9 Q123 9 125 13 L100 13 Z" className="ferry-windows" />
      <line x1="108" y1="6" x2="108" y2="0" stroke="#5c6470" strokeWidth="1.2" />
      {/* Funnel stripe */}
      <rect x="66" y="10" width="14" height="6" rx="1" className="ferry-funnel" />
      {/* Shade toward the waterline so the hull sits in the sea */}
      <path d="M6 46 L156 46 L150 54 L14 54 Q6 54 6 48 Z" className="ferry-shade" />
    </svg>
  );
}

// Ferries under way right now, from the FastCat schedule. While a trip is
// scheduled the ferry sails across in a loop: left to right toward Zamboanga,
// right to left toward Isabela.
function SkyFerries() {
  const [ferries, setFerries] = useState(() => getActiveFerries());

  useEffect(() => {
    const timer = window.setInterval(() => setFerries(getActiveFerries()), 20000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="sky-ferries">
      {ferries.map(({ key, outbound }) => (
        <div key={key} className={`ferry${outbound ? "" : " ferry-inbound"}`}>
          <div className="ferry-body">
            <FerryShip />
            <div className="ferry-reflection">
              <FerryShip />
            </div>
            <span className="ferry-foam" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkyBackground({ condition = "clear" }) {
  const [sky, setSky] = useState(getSkyPosition);
  const raining = ["drizzle", "rain", "storm"].includes(condition);
  const { day } = sky;

  useEffect(() => {
    const timer = window.setInterval(() => setSky(getSkyPosition()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className={`sky sky--${condition}${day ? "" : " sky--night"}`}
      aria-hidden="true"
      style={{
        "--orb-x": `${sky.x.toFixed(2)}%`,
        "--orb-y": `${sky.y.toFixed(2)}%`,
        "--low": sky.low.toFixed(3),
      }}
    >
      <div className={`sky-scene sky-day${day ? " visible" : ""}`}>
        <div className="sky-warm" />
        <div className="sky-rays" />
        <div className="sky-orb sky-sun" />
        <div className="sky-cloud cloud-1" />
        <div className="sky-cloud cloud-2" />
        <div className="sky-cloud cloud-3" />
        <div className="sky-birds">
          <span />
          <span />
          <span />
        </div>
        <SkySea />
        <SkyIslands />
        <SkyIslands reflection />
        <div className="sky-haze" />
      </div>
      <div className={`sky-scene sky-night${day ? "" : " visible"}`}>
        {STARS.map((star, index) => (
          <span
            key={index}
            className="sky-star"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          />
        ))}
        <div className="sky-shooting" />
        <div className="sky-orb sky-moon" />
        <div className="sky-cloud cloud-1" />
        <div className="sky-cloud cloud-3" />
        <SkySea />
        <SkyIslands />
        <SkyIslands reflection />
        <div className="sky-haze" />
      </div>
      <SkyFerries />
      <div className="sky-overcast" />
      {raining && (
        <div className="sky-rain">
          {RAIN_DROPS.map((drop, index) => (
            <span
              key={index}
              style={{
                left: drop.left,
                height: drop.height,
                opacity: drop.opacity,
                animationDelay: drop.delay,
                animationDuration: drop.duration,
              }}
            />
          ))}
        </div>
      )}
      {condition === "storm" && <div className="sky-lightning" />}
      <div className="sky-vignette" />
    </div>
  );
}

// Live clock shown at the top of the branding panel.
function LoginClock({ weather }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [time, period] = now
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .split(" ");
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <div className="login-clock">
        <time className="login-clock-time" dateTime={now.toISOString()}>
          {time}
          <span className="login-clock-period">{period}</span>
        </time>
        <div className="login-clock-date">
          {date}
          {weather && (
            <span className="login-clock-now">
              <WeatherIcon
                condition={weather.current.condition}
                night={!isDaytime(now)}
              />
              {weather.current.label} · {weather.current.temperature}°C
            </span>
          )}
        </div>
      </div>
      {weather?.current.heatIndex != null && (
        <div className="login-heat-index" title="Estimated from current Isabela City temperature and humidity using the NOAA heat index formula.">
          <span>Current heat index</span>
          <strong>{weather.current.heatIndex}&deg;C</strong>
          <small>Isabela City &middot; estimated{weather.current.updatedAt && `, ${weather.current.updatedAt.slice(11, 16)} PHT`}</small>
        </div>
      )}
      {weather && (
        <ul className="login-forecast" aria-label="Today's forecast">
          {weather.forecast
            .filter((slot) => slot.available)
            .map((slot) => (
              <li key={slot.key} title={`${slot.name}: ${slot.label}`}>
                <span className="login-forecast-label">{slot.name}</span>
                <span className="login-forecast-value">
                  <WeatherIcon condition={slot.condition} />
                  {slot.temperature}°
                </span>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}

export default function LoginPage({ onLoginSuccess }) {
  const [view, setView] = useState("login"); // 'login' | 'register'
  const [appVersion, setAppVersion] = useState("");
  const weather = useLoginWeather();

  useEffect(() => {
    // Read app version via Electron preload bridge
    if (window?.ipc?.getVersion) {
      window.ipc.getVersion().then(setAppVersion).catch(() => {});
    }
  }, []);

  return (
    <div className="login-root">
      {/* Left panel — branding */}
      <div className="login-left">
        <SkyBackground condition={weather?.current.condition} />
        <LoginClock weather={weather} />
        <div className="login-brand">
          <div className="login-seal-wrapper">
            <div className="login-seal">
              <img
                src={iecesLogo}
                alt="IECES Logo"
                draggable={false}
              />
            </div>
          </div>

          <h1 className="login-school">
            Isabela East Central Elementary School
          </h1>
          <p className="login-sub">Division of Isabela City</p>
        </div>

        {/* Version badge only — no button */}
        {appVersion && (
          <div className="login-version-row">
            <span className="login-version">v{appVersion}</span>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="login-right">
        {/* The slideshow stays mounted behind every form so the background
            does not change when switching between sign in and register. */}
        <EnrollmentSlideshow />
        <div className="login-form-scroll">
          {view === "login" ? (
            <LoginForm
              onGoRegister={() => setView("register")}
              onLoginSuccess={onLoginSuccess}
            />
          ) : (
            <RegisterForm onGoLogin={() => setView("login")} />
          )}
        </div>
      </div>

    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────
function LoginForm({ onGoRegister, onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const identifier = username.trim().toLowerCase();
      let loginEmail = identifier;
      if (!identifier.includes("@")) {
        let { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("email")
          .eq("username", identifier)
          .maybeSingle();
        if (!profile && identifier === "admin") {
          const { data: ownerEmail, error: ownerError } = await supabase.rpc(
            "dashboard_login_email",
            { candidate_username: identifier },
          );
          profile = ownerEmail ? { email: ownerEmail } : null;
          profileErr = ownerError;
        }
        if (profileErr || !profile) {
          setError("Username not found.");
          setLoading(false);
          return;
        }
        loginEmail = profile.email;
      }

      const { data: authData, error: authErr } =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

      if (authErr) {
        setError(authErr.message);
        setLoading(false);
        return;
      }

      const { error: ownerAccessError } = await supabase.rpc(
        "ensure_owner_app_access",
        { app_key: "report" },
      );
      if (ownerAccessError) {
        await supabase.auth.signOut();
        setError("Could not verify application access. Please try again.");
        return;
      }

      if (onLoginSuccess) {
        onLoginSuccess(authData.session);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-card">
      <div className="lc-header">
        <h2>Sign In</h2>
        <p>Use your school account to continue.</p>
      </div>

      <form onSubmit={handleLogin} aria-busy={loading}>
        <div className="lf-group">
          <label htmlFor="login-username">Username or email</label>
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username or email address"
            required
          />
        </div>

        <div className="lf-group">
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && <div className="lf-error" role="alert">{error}</div>}

        <button type="submit" disabled={loading} className="lf-btn">
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="lc-footer">
        <p>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onGoRegister}
            className="lc-footer-btn"
          >
            Create an account
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Register Form ─────────────────────────────────────────────────────────────
function RegisterForm({ onGoLogin }) {
  const [form, setForm] = useState({
    familyName: "",
    firstName: "",
    middleInitial: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const normalizedEmail = form.email.trim().toLowerCase();

    // 1. Check report_allowed_users (set by Dashboard Manager)
    const { data: allowed } = await supabase.rpc("is_app_email_allowed", {
      app_key: "report",
      candidate_email: normalizedEmail,
    });

    if (!allowed) {
      setError("Email not authorized to register. Contact your administrator.");
      setLoading(false);
      return;
    }

    // 2. Check username uniqueness in profiles
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", form.username.trim())
      .maybeSingle();

    if (existingUser) {
      setError("Username is already taken.");
      setLoading(false);
      return;
    }

    // 3. Register via edge function — handles email already in auth (shared
    //    across apps) by reusing the existing auth.users record.
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "report-register",
      {
        body: {
          email: normalizedEmail,
          password: form.password,
          username: form.username.trim(),
          family_name: form.familyName.trim(),
          first_name: form.firstName.trim(),
          middle_initial: form.middleInitial.trim() || null,
        },
      }
    );

    if (fnErr || fnData?.error) {
      setError(fnData?.error || fnErr?.message || "Registration failed.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="login-card login-success" role="status">
        <div className="login-success-mark" aria-hidden="true">&#10003;</div>
        <div className="lc-header">
          <h2>Your account is ready</h2>
          <p>You can now sign in with your school account.</p>
        </div>
        <button type="button" onClick={onGoLogin} className="lf-btn">
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="lc-header">
        <h2>Create Account</h2>
        <p>Use the email approved by your school administrator. Fields marked * are required.</p>
      </div>

      <form onSubmit={handleRegister} aria-busy={loading}>
        <div className="lf-row">
          <div className="lf-group">
            <label htmlFor="register-familyName">Family Name *</label>
            <input
            id="register-familyName"
            name="familyName"
            autoComplete="family-name"
              type="text"
              value={form.familyName}
              onChange={set("familyName")}
              placeholder="Dela Cruz"
              required
            />
          </div>
          <div className="lf-group">
            <label htmlFor="register-firstName">First Name *</label>
            <input
            id="register-firstName"
            name="firstName"
            autoComplete="given-name"
              type="text"
              value={form.firstName}
              onChange={set("firstName")}
              placeholder="Juan"
              required
            />
          </div>
        </div>

        <div className="lf-group">
          <label htmlFor="register-middleInitial">Middle Initial</label>
          <input
            id="register-middleInitial"
            name="middleInitial"
            autoComplete="additional-name"
            type="text"
            value={form.middleInitial}
            onChange={set("middleInitial")}
            placeholder="B."
            maxLength={3}
          />
        </div>

        <div className="lf-group">
          <label htmlFor="register-username">Username *</label>
          <input
            id="register-username"
            name="username"
            autoComplete="username"
            type="text"
            value={form.username}
            onChange={set("username")}
            placeholder="juan_delacruz"
            required
          />
        </div>

        <div className="lf-group">
          <label htmlFor="register-email">Email *</label>
          <input
            id="register-email"
            name="email"
            autoComplete="email"
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@deped.gov.ph"
            required
          />
        </div>

        <div className="lf-group">
          <label htmlFor="register-password">Password *</label>
          <PasswordInput
            id="register-password"
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            placeholder="Min. 6 characters"
            required
          />
        </div>

        <div className="lf-group">
          <label htmlFor="register-confirmPassword">Confirm Password *</label>
          <PasswordInput
            id="register-confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            placeholder="Re-enter password"
            required
          />
        </div>

        {error && <div className="lf-error" role="alert">{error}</div>}

        <button type="submit" disabled={loading} className="lf-btn">
          {loading ? "Registering…" : "Create Account"}
        </button>
      </form>

      <div className="lc-footer">
        <p>
          Already have an account?{" "}
          <button type="button" onClick={onGoLogin} className="lc-footer-btn">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
