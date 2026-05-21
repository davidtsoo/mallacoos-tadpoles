// =============================================================
// Tadpole Tracker — Main Application Logic
// You do NOT need to edit this file.
// =============================================================

const STAGES = [
  { key: "egg",         label: "Egg",         emoji: "🥚", badge: "badge-egg"         },
  { key: "no-legs",     label: "No Legs",     emoji: "🐟", badge: "badge-no-legs"     },
  { key: "back-legs",   label: "Back Legs",   emoji: "🦵", badge: "badge-back-legs"   },
  { key: "front-legs",  label: "Front Legs",  emoji: "🤲", badge: "badge-front-legs"  },
  { key: "froglet",     label: "Froglet",     emoji: "🐸", badge: "badge-froglet"     },
  { key: "released",    label: "Released!",   emoji: "🌿", badge: "badge-released"    },
];

const STAGE_MAP = {
  "egg":         "egg",
  "no legs":     "no-legs",    "no-legs":     "no-legs",
  "back legs":   "back-legs",  "back-legs":   "back-legs",
  "front legs":  "front-legs", "front-legs":  "front-legs",
  "froglet":     "froglet",
  "released":    "released",   "released!":   "released",
};

// ── Weather ───────────────────────────────────────────────────
const WEATHER_CODES = {
  0:  { emoji: "☀️",  desc: "Clear skies"    },
  1:  { emoji: "🌤️", desc: "Mainly clear"   },
  2:  { emoji: "⛅",  desc: "Partly cloudy"  },
  3:  { emoji: "☁️",  desc: "Overcast"       },
  45: { emoji: "🌫️", desc: "Foggy"          },
  48: { emoji: "🌫️", desc: "Foggy"          },
  51: { emoji: "🌦️", desc: "Light drizzle"  },
  53: { emoji: "🌦️", desc: "Drizzle"        },
  55: { emoji: "🌦️", desc: "Drizzle"        },
  61: { emoji: "🌧️", desc: "Light rain"     },
  63: { emoji: "🌧️", desc: "Rain"           },
  65: { emoji: "🌧️", desc: "Heavy rain"     },
  80: { emoji: "🌦️", desc: "Showers"        },
  81: { emoji: "🌧️", desc: "Heavy showers"  },
  95: { emoji: "⛈️",  desc: "Thunderstorm"  },
};

function describeWeather(code) {
  if (WEATHER_CODES[code]) return WEATHER_CODES[code];
  if (code >= 95) return { emoji: "⛈️",  desc: "Thunderstorm" };
  if (code >= 80) return { emoji: "🌧️", desc: "Showers"       };
  if (code >= 61) return { emoji: "🌧️", desc: "Rain"          };
  if (code >= 51) return { emoji: "🌦️", desc: "Drizzle"       };
  if (code >= 45) return { emoji: "🌫️", desc: "Foggy"         };
  if (code >= 1)  return { emoji: "⛅",  desc: "Cloudy"        };
  return { emoji: "☀️", desc: "Clear skies" };
}

async function fetchWeather(dates) {
  const sorted = [...new Set(dates)].sort();
  const url = "https://api.open-meteo.com/v1/forecast?" +
    `latitude=${CONFIG.lat}&longitude=${CONFIG.lon}` +
    `&daily=weathercode&timezone=America%2FNew_York` +
    `&start_date=${sorted[0]}&end_date=${sorted[sorted.length - 1]}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  const data = await res.json();
  const map  = {};
  (data.daily?.time || []).forEach((date, i) => {
    map[date] = { code: data.daily.weathercode[i] };
  });
  return map;
}

// ── GitHub data loading ───────────────────────────────────────
async function loadFromGitHub() {
  const { owner, repo } = CONFIG.github || {};
  if (!owner || owner === "YOUR_GITHUB_USERNAME") throw new Error("GitHub not configured");
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/entries.json?cb=${Date.now()}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error("Could not reach GitHub");
  const data = await res.json();
  return (data.entries || []).sort((a,b) => toIsoDate(b.date).localeCompare(toIsoDate(a.date)));
}

// ── CSV / Sheet parsing ───────────────────────────────────────
// Sheet columns: Date | Stage | Notes | Photo 1 | Photo 2 | Photo 3 | Photo 4
function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let field = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { field += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        row.push(field.trim()); field = "";
      } else { field += ch; }
    }
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

async function loadFromSheet(url) {
  const res  = await fetch(url);
  if (!res.ok) throw new Error("Could not load sheet");
  const rows = parseCSV(await res.text());
  if (rows.length < 2) throw new Error("Sheet is empty");
  return rows.slice(1).filter(r => r[0]?.trim()).map(r => ({
    id:     "sheet_" + r[0],
    date:   r[0] || "",
    stage:  r[1] || "no-legs",
    notes:  r[2] || "",
    photos: [r[3], r[4], r[5], r[6]].filter(Boolean).map(resolvePhoto),
  })).sort((a,b) => toIsoDate(b.date).localeCompare(toIsoDate(a.date)));
}

// ── Helpers ───────────────────────────────────────────────────
function toIsoDate(d) {
  if (!d) return "";
  if (d.includes("/")) {
    const [m, day, y] = d.split("/");
    return `${y.padStart(4,"0")}-${m.padStart(2,"0")}-${day.padStart(2,"0")}`;
  }
  return d;
}

function formatDate(d) {
  const iso = toIsoDate(d);
  const [y,m,day] = iso.split("-");
  return new Date(+y, +m-1, +day).toLocaleDateString("en-US",
    { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

function resolvePhoto(url) {
  if (!url?.trim()) return "";
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : url.trim();
}

function getStage(raw) {
  const key = STAGE_MAP[(raw||"").toLowerCase().trim()] || "no-legs";
  return STAGES.find(s => s.key === key) || STAGES[1];
}

function getStageIndex(key) { return STAGES.findIndex(s => s.key === key); }

function dayNum(entries, i) {
  const ms = new Date(toIsoDate(entries[i].date)+"T12:00:00") -
             new Date(toIsoDate(entries[entries.length-1].date)+"T12:00:00");
  return Math.round(ms/86400000) + 1;
}

// ── Lightbox ──────────────────────────────────────────────────
let __lbPhotos = [], __lbIdx = 0;

function openLightbox(photos, idx) {
  __lbPhotos = photos;
  __lbIdx    = idx;
  showLightboxFrame();
  document.getElementById("lightbox").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.body.style.overflow = "";
}

function navLightbox(dir) {
  __lbIdx = (__lbIdx + dir + __lbPhotos.length) % __lbPhotos.length;
  showLightboxFrame();
}

function showLightboxFrame() {
  document.getElementById("lb-img").src = __lbPhotos[__lbIdx];
  const many = __lbPhotos.length > 1;
  document.getElementById("lb-counter").textContent = many ? `${__lbIdx+1} / ${__lbPhotos.length}` : "";
  document.getElementById("lb-prev").style.display = many ? "flex" : "none";
  document.getElementById("lb-next").style.display = many ? "flex" : "none";
}

function initLightbox() {
  if (document.getElementById("lightbox")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="lightbox" class="lightbox">
      <button class="lightbox-close" onclick="closeLightbox()">✕</button>
      <button id="lb-prev" class="lightbox-nav lightbox-prev" onclick="navLightbox(-1)">‹</button>
      <img id="lb-img" class="lightbox-img" src="" alt="Full size photo">
      <button id="lb-next" class="lightbox-nav lightbox-next" onclick="navLightbox(1)">›</button>
      <div id="lb-counter" class="lightbox-counter"></div>
    </div>`);

  document.getElementById("lightbox").addEventListener("click", e => {
    if (e.target.id === "lightbox") closeLightbox();
  });
  document.addEventListener("keydown", e => {
    if (!document.getElementById("lightbox").classList.contains("open")) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  navLightbox(-1);
    if (e.key === "ArrowRight") navLightbox(1);
  });

  // Photo click handler — delegated from body so it survives re-renders
  document.addEventListener("click", e => {
    const slot = e.target.closest(".photo-slot[data-ei]");
    if (!slot) return;
    const set = window.__photoSets?.[+slot.dataset.ei];
    if (set) openLightbox(set, +slot.dataset.pi);
  });
}

// ── Rendering ─────────────────────────────────────────────────
function renderStageProgress(key) {
  const track = document.getElementById("stage-track");
  if (!track) return;
  const idx = getStageIndex(key);
  track.innerHTML = STAGES.map((s,i) => `
    <div class="stage-step ${i<idx?"done":i===idx?"current":""}">
      <div class="stage-dot">${s.emoji}</div>
      <div class="stage-name">${s.label}</div>
    </div>`).join("");
}

function renderStats(entries) {
  const latest = entries[0];
  const first  = entries[entries.length-1];
  const days   = Math.round(
    (new Date(toIsoDate(latest.date)+"T12:00:00") -
     new Date(toIsoDate(first.date) +"T12:00:00")) / 86400000
  ) + 1;
  const stage = getStage(latest.stage);
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set("stat-days",    days);
  set("stat-entries", entries.length);
  set("stat-stage",   stage.emoji+" "+stage.label);
  renderStageProgress(stage.key);
}

function renderEntries(entries, weatherMap) {
  const list    = document.getElementById("entries-list");
  const countEl = document.getElementById("entry-count");
  if (!list) return;
  if (countEl) countEl.textContent = entries.length+(entries.length===1?" entry":" entries");

  // Store photo sets globally for lightbox access
  window.__photoSets = {};

  list.innerHTML = entries.map((entry, i) => {
    const stage    = getStage(entry.stage);
    const isLatest = i === 0;
    const iso      = toIsoDate(entry.date);
    const wx       = weatherMap?.[iso];
    const wxInfo   = wx ? describeWeather(wx.code) : null;
    const photos   = (entry.photos || []).filter(Boolean);

    window.__photoSets[i] = photos;

    const cols = photos.length === 1 ? "count-1" : "count-2";

    return `
      <article class="entry-card${isLatest?" latest":""}">
        <div class="entry-header">
          <div class="entry-date-block">
            <span class="entry-date">${formatDate(entry.date)}</span>
            <span class="day-chip">Day ${dayNum(entries,i)}</span>
          </div>
          <div class="entry-badges">
            ${isLatest?'<span class="latest-badge">Latest</span>':""}
            <span class="stage-badge ${stage.badge}">${stage.emoji} ${stage.label}</span>
          </div>
        </div>
        ${wxInfo?`<div class="entry-metrics"><div class="metric">${wxInfo.emoji} ${wxInfo.desc}</div></div>`:""}
        ${entry.notes?`<div class="entry-notes">${entry.notes}</div>`:""}
        ${photos.length?`<div class="entry-photos ${cols}">
          ${photos.map((src,j)=>`
            <div class="photo-slot" data-ei="${i}" data-pi="${j}">
              <img src="${src}" alt="Tadpole photo" loading="lazy">
            </div>`).join("")}
        </div>`:""}
      </article>`;
  }).join("");

}

// ── Banner ────────────────────────────────────────────────────
function showBanner(msg, type) {
  const b = document.getElementById("status-banner");
  if (!b) return;
  b.textContent = msg;
  b.className   = "status-banner " + type;
  b.style.display = "block";
}

// ── Bootstrap ─────────────────────────────────────────────────
async function init() {
  initLightbox();
  document.querySelectorAll(".farm-name").forEach(el => el.textContent = CONFIG.farmName);
  document.querySelectorAll(".pond-name").forEach(el => el.textContent = CONFIG.pondName);
  document.querySelectorAll(".season-name").forEach(el => el.textContent = CONFIG.season);
  document.querySelectorAll(".location-name").forEach(el => el.textContent = CONFIG.location);

  let entries = [];

  // Load from GitHub (public entries.json in the repo)
  try {
    entries = await loadFromGitHub();
  } catch (e) {
    if ((CONFIG.github?.owner || "") === "YOUR_GITHUB_USERNAME") {
      showBanner("📋 GitHub not yet configured — see SETUP.md to go live", "banner-info");
    } else {
      showBanner("⚠️ Could not load entries from GitHub. Check your internet connection.", "banner-warn");
    }
  }

  if (entries.length === 0) {
    document.getElementById("entries-list").innerHTML =
      `<div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
        <div style="font-size:3rem;margin-bottom:0.75rem;">🐸</div>
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.4rem;">No entries yet</div>
        <div style="font-size:0.9rem;">
          <a href="admin.html" style="color:var(--green-dark);font-weight:700;">✏️ Add your first entry →</a>
        </div>
      </div>`;
    return;
  }

  renderStats(entries);

  // Fetch weather (condition only, no temperature)
  let weatherMap = {};
  try {
    const dates = entries.map(e => toIsoDate(e.date)).filter(Boolean);
    if (dates.length) weatherMap = await fetchWeather(dates);
  } catch { /* Weather unavailable — entries still render fine */ }

  renderEntries(entries, weatherMap);
}

document.addEventListener("DOMContentLoaded", init);
