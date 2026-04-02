// ============================================================
// ARTEMIS III — Gestion du HUD (Head-Up Display)
// ============================================================

// Références DOM
let els = {};

export function initHUD() {
  const ids = [
    'met','phase-name','velocity','altitude','distance-moon',
    'acceleration','fuel-bar','fuel-percent','spacecraft-config',
    'camera-mode','time-scale','loading-screen','loading-progress'
  ];
  for (const id of ids) {
    els[id] = document.getElementById(id);
  }
}

// ─── Formatage MET (Mission Elapsed Time) ─────────────────────
export function formatMET(seconds) {
  const s = Math.abs(Math.floor(seconds));
  const d  = Math.floor(s / 86400);
  const h  = Math.floor((s % 86400) / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  const sign = seconds < 0 ? 'T-' : 'T+';
  return `${sign}${String(d).padStart(2,'0')}:${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
}

// ─── Mise à jour complète du HUD ──────────────────────────────
export function updateHUD(state) {
  const { t, speed, alt, phase, moonDist, fuel, config, camMode, timeScale, accel } = state;

  set('met',              formatMET(t));
  set('phase-name',       phaseFR(phase));
  set('velocity',         (speed / 1000).toFixed(3) + ' km/s');
  set('altitude',         formatAlt(alt));
  set('distance-moon',    formatDist(moonDist));
  set('acceleration',     (accel || 0).toFixed(2) + ' m/s²');
  set('spacecraft-config', config || 'SLS + ORION');
  set('camera-mode',      camModeFR(camMode));
  set('time-scale',       timeScale + '×');

  // Barre de carburant
  const pct = Math.max(0, Math.min(100, fuel || 100));
  if (els['fuel-bar']) {
    els['fuel-bar'].style.width = pct + '%';
    els['fuel-bar'].style.background =
      pct > 50 ? '#00e676' : pct > 20 ? '#ffb300' : '#f44336';
  }
  set('fuel-percent', Math.round(pct) + '%');
}

// ─── Affichage de l'écran de chargement ───────────────────────
export function setLoadingProgress(pct, msg) {
  if (els['loading-progress']) els['loading-progress'].style.width = pct + '%';
  const txt = document.querySelector('#loading-screen p');
  if (txt && msg) txt.textContent = msg;
}

export function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (ls) {
    ls.style.opacity = '0';
    ls.style.transition = 'opacity 1s';
    setTimeout(() => ls.style.display = 'none', 1000);
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function set(id, val) {
  if (els[id]) els[id].textContent = val;
}

function formatAlt(meters) {
  if (meters == null) return '—';
  const km = meters / 1000;
  if (km > 100000) return (km / 1000).toFixed(0) + ' Mm';
  return km.toFixed(1) + ' km';
}

function formatDist(meters) {
  if (meters == null) return '—';
  const km = meters / 1000;
  if (km > 10000) return (km / 1000).toFixed(1) + ' Mm';
  return km.toFixed(0) + ' km';
}

function phaseFR(phase) {
  const map = {
    prelaunch:         'Pré-lancement',
    launch:            'Lancement',
    ascent:            'Ascension',
    stage_sep:         'Séparation de l'étage',
    earth_orbit:       'Orbite terrestre (185 km)',
    tli_burn:          'Injection Trans-Lunaire',
    translunar_coast:  'Trajet translunar',
    mcc1:              'Correction mi-parcours 1',
    mcc2:              'Correction mi-parcours 2',
    loi_burn:          'Insertion en orbite lunaire',
    lunar_orbit:       'Orbite lunaire basse',
    nrho:              'Orbite de halo (NRHO)',
    hls_undock:        'Séparation HLS Starship',
    powered_descent:   'Descente motorisée',
    touchdown:         'Atterrissage lunaire',
    lunar_surface:     'Surface lunaire',
    eva_1:             'EVA-1 — Sortie extravéhiculaire',
    eva_2:             'EVA-2 — Sortie extravéhiculaire',
    lunar_ascent:      'Ascension lunaire',
    orion_rendezvous:  'Rendez-vous Orion / HLS',
    transearth_coast:  'Trajet retour Terre',
    reentry:           'Rentrée atmosphérique',
    splashdown:        'Amerrissage — Pacifique',
  };
  return map[phase] || phase?.toUpperCase() || '—';
}

function camModeFR(mode) {
  const map = {
    overview: 'Vue d'ensemble',
    follow:   'Suivi vaisseau',
    earth:    'Orbite terrestre',
    moon:     'Orbite lunaire',
  };
  return map[mode] || mode || '—';
}
