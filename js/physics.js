// ============================================================
// ARTEMIS III — Moteur physique & calcul de trajectoire
// Mécanique orbitale N-corps (Terre + Lune) via intégration RK4
// ============================================================

import {
  EARTH_MU, EARTH_RADIUS,
  MOON_MU, MOON_RADIUS, MOON_SMA, MOON_PERIOD,
  SCALE, T, LANDING_SITE, LAUNCH_PAD,
  SLS, ORION,
} from './constants.js';

// ── Utilitaires vecteurs 6D [x,y,z,vx,vy,vz] ──────────────

const vadd = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3], a[4]+b[4], a[5]+b[5]];
const vscale = (a, s) => [a[0]*s, a[1]*s, a[2]*s, a[3]*s, a[4]*s, a[5]*s];
const norm3 = (x,y,z) => Math.sqrt(x*x + y*y + z*z);

// ── Position de la Lune à l'instant t (orbite quasi-circulaire) ─
const MOON_OMEGA = 2 * Math.PI / MOON_PERIOD;   // rad/s

// Calculer l'angle réel du TLI dans l'orbite de stationnement :
//   theta_TLI = OM_PARK × (T_TLI - T_ORBIT_START)
// Le vaisseau part de theta_TLI et arrive à theta_TLI+π (apoapsis Hohmann)
// après TRANSIT_TIME secondes. La Lune doit être là à ce moment.
// => MOON_THETA_0 = (theta_TLI + π) - MOON_OMEGA*(T_TLI + TRANSIT_TIME)
const _R_PARK    = EARTH_RADIUS + 185e3;
const _OM_PARK   = Math.sqrt(EARTH_MU / (_R_PARK * _R_PARK * _R_PARK)); // rad/s
const _THETA_TLI = _OM_PARK * (T.TLI_CUTOFF - T.CORE_CUTOFF); // angle complet (cos/sin)
const TRANSIT_TIME = 5.4 * 86400; // s ≈ durée trajet Terre→Lune
const MOON_THETA_0 = (_THETA_TLI + Math.PI) - MOON_OMEGA * (T.TLI_CUTOFF + TRANSIT_TIME);

export function moonPosition(t) {
  const theta = MOON_THETA_0 + MOON_OMEGA * t;
  return [
    MOON_SMA * Math.cos(theta),
    0,
    MOON_SMA * Math.sin(theta),
  ];
}


function derivatives(t, s) {
  const [x, y, z, vx, vy, vz] = s;
  const rE = norm3(x, y, z);
  const muE_r3 = EARTH_MU / (rE * rE * rE);

  const [mx, my, mz] = moonPosition(t);
  const dx = x - mx, dy = y - my, dz2 = z - mz;
  const rM = norm3(dx, dy, dz2);
  const muM_r3 = MOON_MU / (rM * rM * rM);

  return [
    vx, vy, vz,
    -muE_r3*x - muM_r3*dx,
    -muE_r3*y - muM_r3*dy,
    -muE_r3*z - muM_r3*dz2,
  ];
}

// ── Intégrateur RK4 ──────────────────────────────────────────
function rk4(t, s, dt) {
  const k1 = derivatives(t,        s);
  const k2 = derivatives(t + dt/2, vadd(s, vscale(k1, dt/2)));
  const k3 = derivatives(t + dt/2, vadd(s, vscale(k2, dt/2)));
  const k4 = derivatives(t + dt,   vadd(s, vscale(k3, dt)));
  return vadd(s, vscale(vadd(vadd(k1, vscale(k2,2)), vadd(vscale(k3,2), k4)), dt/6));
}

// ============================================================
// CALCUL DE TRAJECTOIRE COMPLÈTE (pré-calcul au démarrage)
// Retourne un tableau de points :
//   { t, x, y, z, vx, vy, vz, phase, alt, speed }
// ============================================================

export function computeTrajectory() {
  const points = [];
  const DT = 60; // pas d'intégration : 60 secondes

  // ── Constantes orbitales ─────────────────────────────────
  const R_PARK   = EARTH_RADIUS + 185e3;  // 185 km altitude parking
  const V_CIRC   = Math.sqrt(EARTH_MU / R_PARK);
  const V_TLI    = 10_930; // m/s  vitesse après impulsion TLI
  const DV_TLI   = V_TLI - V_CIRC;       // Δv ≈ 3 137 m/s

  const R_LUNAR  = MOON_RADIUS + 100e3;  // altitude orbite lunaire 100 km
  const V_LO_CIRC = Math.sqrt(MOON_MU / R_LUNAR); // ~1 633 m/s
  const OM_PARK  = V_CIRC / R_PARK;       // rad/s, orbite parking
  const OM_LO    = V_LO_CIRC / R_LUNAR;   // rad/s, orbite lunaire basse

  // Landing site : pôle sud lunaire
  const LAND_LAT = LANDING_SITE.lat;
  const LAND_LON = LANDING_SITE.lon;

  // ── Aide push ──────────────────────────────────────────────
  let currentPhase = 'prelaunch';
  function push(t, x, y, z, vx, vy, vz, phase) {
    if (phase) currentPhase = phase;
    const alt = norm3(x,y,z) - EARTH_RADIUS;
    const speed = norm3(vx, vy, vz);
    points.push({ t, x, y, z, vx, vy, vz, phase: currentPhase, alt, speed });
  }

  // ════════════════════════════════════════════════════════
  // Phase 1 : LANCEMENT (T+0 → T+490s)
  // Trajectoire de gravité simplifiée vers l'orbite de stationnement
  // ════════════════════════════════════════════════════════
  {
    const tEnd = T.CORE_CUTOFF;
    const steps = Math.ceil(tEnd / DT);
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(i * DT, tEnd);
      const progress = t / tEnd;

      // Altitude : montée exponentielle jusqu'à 160 km
      const alt = EARTH_RADIUS + progress * progress * 160e3;
      // Angle de trajectoire : débute vertical, tourne vers l'orbite
      const trajAngle = progress * Math.PI / 2; // 0..π/2
      // Position dans le plan XZ (orbite équatoriale simplifiée)
      const orbitAngle = progress * 0.3; // angle en orbite
      const r = alt;
      const x = r * Math.cos(orbitAngle);
      const y = r * Math.sin(0.1 * progress); // légère inclinaison launch
      const z = r * Math.sin(orbitAngle) * 0.1;

      // Vitesse : augmente jusqu'à V_CIRC
      const speed = progress * V_CIRC * 1.05;
      const vx = -speed * Math.sin(orbitAngle);
      const vy = 0;
      const vz =  speed * Math.cos(orbitAngle) * 0.1;

      const p = t < T.SRB_SEP ? 'launch' :
                t < T.CORE_CUTOFF ? 'ascent' : 'stage_sep';
      push(t, x, y, z, vx, vy, vz, p);
    }
  }

  // ════════════════════════════════════════════════════════
  // Phase 2 : ORBITE DE STATIONNEMENT (T+490 → TLI)
  // Orbite circulaire à 185 km, plan XZ
  // ════════════════════════════════════════════════════════
  {
    const tStart = T.CORE_CUTOFF;
    const tEnd   = T.TLI_IGNITION;
    let t = tStart;
    while (t <= tEnd) {
      const dt_orb = t - tStart;
      const theta = OM_PARK * dt_orb;
      const x =  R_PARK * Math.cos(theta);
      const y =  0;
      const z =  R_PARK * Math.sin(theta);
      const vx = -V_CIRC * Math.sin(theta);
      const vy =  0;
      const vz =  V_CIRC * Math.cos(theta);
      push(t, x, y, z, vx, vy, vz, t === tStart ? 'earth_orbit' : null);
      t += DT;
    }
  }

  // ════════════════════════════════════════════════════════
  // Phase 3 : IMPULSION TLI (instantanée)
  // Le vaisseau est à (R_PARK, 0, 0), on ajoute Δv en +Z
  // ════════════════════════════════════════════════════════
  const t_TLI = T.TLI_CUTOFF;
  // Angle de l'orbite de stationnement au moment TLI
  const theta_TLI = OM_PARK * (t_TLI - T.CORE_CUTOFF);
  const tli_x  = R_PARK * Math.cos(theta_TLI);
  const tli_z  = R_PARK * Math.sin(theta_TLI);
  // Prograde direction
  const tli_vx = -V_TLI * Math.sin(theta_TLI);
  const tli_vz =  V_TLI * Math.cos(theta_TLI);

  // ════════════════════════════════════════════════════════
  // Phase 4 : TRAJET TRANSLUNAR (RK4 jusqu'à LOI)
  // ════════════════════════════════════════════════════════
  let loiS, loiT; // état transmis à la phase LOI
  {
    let s = [tli_x, 0, tli_z, tli_vx, 0, tli_vz];
    let t = t_TLI;
    const tEnd = T.LOI_IGNITION;
    push(t, ...s, 'tli_burn');
    while (t < tEnd) {
      const dt = Math.min(DT, tEnd - t);
      s = rk4(t, s, dt);
      t += dt;
      // Mise à jour de la phase à chaque point — la fonction push
      // ne change currentPhase que si phase != null.
      const ph = t >= T.MCC2 ? 'mcc2'
               : t >= T.MCC1 ? 'mcc1'
               : 'translunar_coast';
      push(t, ...s, ph);
    }
    // Transmettre l'état final à la phase suivante via variable locale
    loiS = s;
    loiT = t;
  }

  // ════════════════════════════════════════════════════════
  // Phase 5 : INSERTION EN ORBITE LUNAIRE (LOI) — impulsion
  // ════════════════════════════════════════════════════════
  let [lx, ly, lz, lvx, lvy, lvz] = loiS;
  {
    // Vecteur radial Moon→spacecraft
    const [mx,,mz] = moonPosition(T.LOI_CUTOFF);
    const rx = lx - mx, rz = lz - mz;
    const rm = Math.sqrt(rx*rx + rz*rz);
    // Vitesse hyperbole d'arrivée ≈ 2 400 m/s  →  orbite circulaire 1 633 m/s
    // On normalise la vitesse pour approcher V_LO_CIRC
    const vcur = Math.sqrt(lvx*lvx + lvy*lvy + lvz*lvz);
    const scale = V_LO_CIRC * 0.6 / vcur; // freinage LOI
    lvx *= scale; lvy *= scale; lvz *= scale;
    loiS = [lx, ly, lz, lvx, lvy, lvz];
  }

  // ════════════════════════════════════════════════════════
  // Phase 6 : ORBITE LUNAIRE BASSE + NRHO (simplifiée)
  // Orbite autour de la Lune dans le plan XZ lunaire
  // ════════════════════════════════════════════════════════
  {
    const [mx, my, mz] = moonPosition(T.LOI_CUTOFF);
    const tStart = T.LOI_CUTOFF;
    const tEnd   = T.TOUCHDOWN;
    let t = tStart;
    // Position relative à la Lune
    const rel_x = lx - mx, rel_z = lz - mz;
    const r0 = Math.sqrt(rel_x*rel_x + rel_z*rel_z);
    const r_orbit = Math.max(r0, R_LUNAR * 1.05);
    const om_moon_orbit = Math.sqrt(MOON_MU / (r_orbit*r_orbit*r_orbit));

    while (t <= tEnd) {
      const dt_orb = t - tStart;
      const theta = om_moon_orbit * dt_orb;
      const [mx2,,mz2] = moonPosition(t);
      const x = mx2 + r_orbit * Math.cos(theta);
      const y = 0;
      const z = mz2 + r_orbit * Math.sin(theta);
      const v = Math.sqrt(MOON_MU / r_orbit);
      const vx = -v * Math.sin(theta);
      const vy = 0;
      const vz =  v * Math.cos(theta);
      const ph = t < T.NRHO_INSERTION ? 'lunar_orbit' :
                 t < T.HLS_UNDOCK    ? 'nrho' :
                 t < T.POWERED_DESCENT ? 'hls_undock' : 'powered_descent';
      push(t, x, y, z, vx, vy, vz, t === tStart ? 'loi_burn' : null);
      t += DT;
    }
  }

  // ════════════════════════════════════════════════════════
  // Phase 7 : SURFACE LUNAIRE
  // ════════════════════════════════════════════════════════
  {
    const tStart = T.TOUCHDOWN;
    const tEnd   = T.ASCENT_IGNITION;
    // Position du site d'atterrissage (pôle sud lunaire)
    for (let t = tStart; t <= tEnd; t += DT) {
      const [mx,,mz] = moonPosition(t);
      // Shackleton rim : quasi pôle sud
      const x = mx + MOON_RADIUS * Math.cos(LAND_LAT) * Math.cos(LAND_LON);
      const y =       MOON_RADIUS * Math.sin(LAND_LAT);
      const z = mz + MOON_RADIUS * Math.cos(LAND_LAT) * Math.sin(LAND_LON);
      const ph = t < T.EVA_1_END ? 'eva_1' :
                 t < T.EVA_2_END ? 'eva_2' : 'lunar_surface';
      push(t, x, y, z, 0, 0, 0, t === tStart ? 'touchdown' : null);
    }
  }

  // ════════════════════════════════════════════════════════
  // Phase 8 : ASCENSION LUNAIRE + RETOUR TERRESTRE (RK4)
  // ════════════════════════════════════════════════════════
  {
    const tAscStart = T.ASCENT_IGNITION;
    // Conditions initiales : surface du site
    const [mx0,,mz0] = moonPosition(tAscStart);
    const sx = mx0 + MOON_RADIUS * Math.cos(LAND_LAT) * Math.cos(LAND_LON);
    const sy =       MOON_RADIUS * Math.sin(LAND_LAT);
    const sz = mz0 + MOON_RADIUS * Math.cos(LAND_LAT) * Math.sin(LAND_LON);
    // Vitesse d'ascension lunaire (~1 700 m/s tangentielle)
    const V_ASC = 1700;
    let s = [sx, sy, sz, -V_ASC * 0.5, V_ASC * 0.5, V_ASC * 0.5];
    let t = tAscStart;
    push(t, ...s, 'lunar_ascent');

    while (t < T.SPLASHDOWN) {
      const dt = Math.min(DT, T.SPLASHDOWN - t);
      s = rk4(t, s, dt);
      t += dt;

      // TEI : impulsion prograde au moment du TEI
      if (Math.abs(t - T.TEI_CUTOFF) < DT) {
        const vcur = Math.sqrt(s[3]*s[3] + s[4]*s[4] + s[5]*s[5]);
        // Augmenter la vitesse de 900 m/s en direction prograde
        const boost = 1 + 900 / vcur;
        s[3] *= boost; s[4] *= boost; s[5] *= boost;
      }

      const ph = t < T.HLS_RENDEZVOUS ? 'lunar_ascent' :
                 t < T.TEI_IGNITION   ? 'orion_rendezvous' :
                 t < T.REENTRY_INTERFACE ? 'transearth_coast' :
                 t < T.SPLASHDOWN ? 'reentry' : 'splashdown';
      push(t, ...s, t === tAscStart + DT ? 'lunar_ascent' : null);
    }
  }



  console.log(`[Trajectory] ${points.length} points calculés (${(points.length * DT / 86400).toFixed(1)} jours)`);
  return points;
}

// ── Interpolation linéaire entre deux points de trajectoire ─
export function interpolateTrajectory(points, missionTime) {
  if (missionTime <= points[0].t) return points[0];
  if (missionTime >= points[points.length-1].t) return points[points.length-1];

  // Recherche binaire
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= missionTime) lo = mid; else hi = mid;
  }
  const p0 = points[lo], p1 = points[hi];
  const alpha = (missionTime - p0.t) / (p1.t - p0.t);
  const lerp = (a, b) => a + (b - a) * alpha;
  return {
    t:     missionTime,
    x:     lerp(p0.x,  p1.x),
    y:     lerp(p0.y,  p1.y),
    z:     lerp(p0.z,  p1.z),
    vx:    lerp(p0.vx, p1.vx),
    vy:    lerp(p0.vy, p1.vy),
    vz:    lerp(p0.vz, p1.vz),
    alt:   lerp(p0.alt, p1.alt),
    speed: lerp(p0.speed, p1.speed),
    phase: p0.phase,
  };
}

// ── Utilitaire : convertir position (m) → unités Three.js ──
export function toUnits(meters) { return meters / SCALE; }
export function toUnitsVec(x, y, z) {
  return [x / SCALE, y / SCALE, z / SCALE];
}

// ── Vitesse circulaire à une altitude donnée (m) ────────────
export function circularVelocity(alt_m) {
  return Math.sqrt(EARTH_MU / (EARTH_RADIUS + alt_m));
}

// ── Distance d'un point à la Lune ────────────────────────────
export function distToMoon(t, x, y, z) {
  const [mx, my, mz] = moonPosition(t);
  return norm3(x - mx, y - my, z - mz);
}

// ── Altitude au-dessus de la Terre ───────────────────────────
export function altAboveEarth(x, y, z) {
  return norm3(x, y, z) - EARTH_RADIUS;
}

// ── Altitude au-dessus de la Lune ────────────────────────────
export function altAboveMoon(t, x, y, z) {
  const [mx, my, mz] = moonPosition(t);
  return norm3(x - mx, y - my, z - mz) - MOON_RADIUS;
}
