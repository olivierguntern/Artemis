// ============================================================
// ARTEMIS III — Point d'entrée principal & boucle d'animation
// ============================================================

import { EARTH_RADIUS, MOON_RADIUS, SCALE, T, TIMELINE_SORTED, PHASE_NAMES } from './constants.js';
import { computeTrajectory, interpolateTrajectory, moonPosition,
         distToMoon, altAboveEarth, altAboveMoon }               from './physics.js';
import { initRenderer, createScene, createEarth, createMoon,
         createSLS, createOrion, createEngineParticles,
         createTrajectoryLine, updateSpacecraft, updateMoonPosition,
         updateCamera, rotateEarth, render, setCameraMode, getCameraMode,
         getCameraControls, getCamera, getScene }                from './renderer.js';
import { initHUD, updateHUD, setLoadingProgress, hideLoading }   from './hud.js';

// ─── Niveaux d'accélération du temps ──────────────────────────
const TIME_SCALES = [1, 10, 100, 1000, 10000, 100000];
const CAM_MODES   = ['overview', 'follow', 'earth', 'moon'];

const SPACECRAFT_CONFIG = {
  prelaunch:         'SLS Block 1',
  launch:            'SLS Block 1 (SRBs + Core)',
  ascent:            'SLS Block 1 (Core + ICPS)',
  stage_sep:         'ICPS + Orion',
  earth_orbit:       'ICPS + Orion',
  tli_burn:          'ICPS + Orion (TLI)',
  translunar_coast:  'Orion + ESM',
  mcc1:              'Orion + ESM',
  mcc2:              'Orion + ESM',
  loi_burn:          'Orion + ESM (LOI)',
  lunar_orbit:       'Orion + ESM',
  nrho:              'Orion + ESM (NRHO)',
  hls_undock:        'Orion + ESM / HLS',
  powered_descent:   'Starship HLS',
  touchdown:         'Starship HLS — Surface',
  lunar_surface:     'Starship HLS — Surface',
  eva_1:             'EVA-1 en cours',
  eva_2:             'EVA-2 en cours',
  lunar_ascent:      'Starship HLS — Ascension',
  orion_rendezvous:  'Orion + HLS (rendez-vous)',
  transearth_coast:  'Orion + ESM (retour)',
  reentry:           'Capsule Orion (rentrée)',
  splashdown:        'Capsule Orion (amerrissage)',
};

// ─── Calcul carburant (estimation par phase) ──────────────────
function estimateFuel(t) {
  if (t < T.SRB_SEP)         return 100 - (t / T.SRB_SEP) * 20;
  if (t < T.CORE_CUTOFF)     return 80  - ((t - T.SRB_SEP) / (T.CORE_CUTOFF - T.SRB_SEP)) * 35;
  if (t < T.TLI_CUTOFF)      return 45  - ((t - T.CORE_CUTOFF) / (T.TLI_CUTOFF - T.CORE_CUTOFF)) * 10;
  if (t < T.LOI_CUTOFF)      return 35  - ((t - T.TLI_CUTOFF) / (T.LOI_CUTOFF - T.TLI_CUTOFF)) * 10;
  if (t < T.TEI_CUTOFF)      return 25  - ((t - T.LOI_CUTOFF) / (T.TEI_CUTOFF - T.LOI_CUTOFF)) * 15;
  if (t < T.REENTRY_INTERFACE) return 10 - ((t - T.TEI_CUTOFF) / (T.REENTRY_INTERFACE - T.TEI_CUTOFF)) * 8;
  return 2;
}

// ─── Application principale ───────────────────────────────────
class ArtemisSimulator {
  constructor() {
    this.missionTime  = -300;    // démarre 5 min avant liftoff
    this.timeScale    = 100;
    this.paused       = false;
    this.camModeIdx   = 0;
    this.trajectory   = null;
    this.lastReal     = null;
    this.prevSpeed    = 0;
    this.prevTime     = 0;
  }

  async init() {
    const canvas = document.getElementById('canvas');

    // ── Rendu Three.js ───────────────────────────────────────
    setLoadingProgress(5,  'Initialisation du moteur 3D...');
    initRenderer(canvas);

    setLoadingProgress(15, 'Création de la scène spatiale...');
    createScene();

    setLoadingProgress(25, 'Génération de la Terre...');
    createEarth();

    setLoadingProgress(40, 'Génération de la Lune...');
    createMoon();

    setLoadingProgress(50, 'Assemblage du SLS...');
    createSLS();

    setLoadingProgress(60, 'Assemblage d'Orion...');
    createOrion();
    createEngineParticles();

    // ── Calcul de la trajectoire (physique RK4) ──────────────
    setLoadingProgress(65, 'Calcul de la trajectoire (intégration RK4)...');
    await new Promise(r => setTimeout(r, 50)); // laisser le DOM se mettre à jour
    this.trajectory = computeTrajectory();

    setLoadingProgress(85, 'Tracé de la trajectoire...');
    createTrajectoryLine(this.trajectory);

    // ── HUD ──────────────────────────────────────────────────
    setLoadingProgress(95, 'Interface de mission...');
    initHUD();
    this.buildPhaseButtons();
    this.setupControls();

    setLoadingProgress(100, 'Prêt au lancement.');
    await new Promise(r => setTimeout(r, 500));
    hideLoading();

    // ── Lancement de la boucle ───────────────────────────────
    this.animate();
  }

  // ─── Boucle d'animation principale ───────────────────────────
  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    if (this.lastReal === null) { this.lastReal = now; return; }
    const dtReal = Math.min((now - this.lastReal) / 1000, 0.1); // s réelles, max 100ms
    this.lastReal = now;

    if (!this.paused) {
      this.missionTime += dtReal * this.timeScale;
      // Boucler la mission
      if (this.missionTime > T.SPLASHDOWN + 3600) this.missionTime = -300;
    }

    // ── État du vaisseau ────────────────────────────────────
    const pt = interpolateTrajectory(this.trajectory, Math.max(0, this.missionTime));
    const moonDist = distToMoon(pt.t, pt.x, pt.y, pt.z);
    const altE = altAboveEarth(pt.x, pt.y, pt.z);
    const altM = altAboveMoon(pt.t, pt.x, pt.y, pt.z);

    // Choisir l'altitude pertinente selon la phase
    const nearMoon = ['loi_burn','lunar_orbit','nrho','hls_undock','powered_descent',
                      'touchdown','lunar_surface','eva_1','eva_2','lunar_ascent'].includes(pt.phase);
    const alt = nearMoon ? altM : altE;

    // Accélération approx (dérivée de vitesse)
    const accel = Math.abs((pt.speed - this.prevSpeed) / (Math.max(0.001, pt.t - this.prevTime)));
    this.prevSpeed = pt.speed;
    this.prevTime  = pt.t;

    const state = {
      ...pt,
      alt, moonDist,
      fuel:   estimateFuel(this.missionTime),
      config: SPACECRAFT_CONFIG[pt.phase] || 'Orion',
      camMode:    CAM_MODES[this.camModeIdx],
      timeScale:  this.timeScale,
      accel:      accel,
    };

    // ── Mises à jour scène ──────────────────────────────────
    updateSpacecraft(state);
    updateMoonPosition(this.missionTime);
    updateCamera(state);
    rotateEarth(dtReal * this.timeScale);

    // ── HUD ─────────────────────────────────────────────────
    updateHUD(state);

    // ── Rendu ───────────────────────────────────────────────
    render();
  }

  // ─── Contrôles clavier ────────────────────────────────────────
  setupControls() {
    document.addEventListener('keydown', (e) => this.handleKey(e));

    // Boutons de vitesse du temps
    document.querySelectorAll('[data-timescale]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.timeScale = parseInt(btn.dataset.timescale);
      });
    });
  }

  handleKey(e) {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.paused = !this.paused;
        break;
      case '1': this.timeScale = TIME_SCALES[0]; break;
      case '2': this.timeScale = TIME_SCALES[1]; break;
      case '3': this.timeScale = TIME_SCALES[2]; break;
      case '4': this.timeScale = TIME_SCALES[3]; break;
      case '5': this.timeScale = TIME_SCALES[4]; break;
      case '6': this.timeScale = TIME_SCALES[5]; break;
      case 'c':
      case 'C':
        this.camModeIdx = (this.camModeIdx + 1) % CAM_MODES.length;
        setCameraMode(CAM_MODES[this.camModeIdx]);
        break;
      case 'r':
      case 'R':
        this.missionTime = -300;
        break;
      case 'ArrowRight':
        this.jumpToNextPhase();
        break;
      case 'ArrowLeft':
        this.jumpToPrevPhase();
        break;
    }
  }

  // ─── Navigation par phases ────────────────────────────────────
  buildPhaseButtons() {
    const container = document.getElementById('phase-buttons');
    if (!container) return;
    const keyPhases = [
      { label: '🚀 Lancement',   t: T.LIFTOFF },
      { label: '⬆️  TLI',         t: T.TLI_IGNITION },
      { label: '🌕 LOI',          t: T.LOI_IGNITION },
      { label: '🌑 Atterrissage', t: T.TOUCHDOWN },
      { label: '🔼 Ascension',    t: T.ASCENT_IGNITION },
      { label: '🔁 Retour TEI',   t: T.TEI_IGNITION },
      { label: '🌊 Amerrissage',  t: T.SPLASHDOWN },
    ];
    for (const kp of keyPhases) {
      const btn = document.createElement('button');
      btn.className = 'phase-btn';
      btn.textContent = kp.label;
      btn.addEventListener('click', () => {
        this.missionTime = kp.t - 30;
      });
      container.appendChild(btn);
    }
  }

  jumpToNextPhase() {
    const nexts = TIMELINE_SORTED.filter(t => t > this.missionTime);
    if (nexts.length) this.missionTime = nexts[0] - 10;
  }

  jumpToPrevPhase() {
    const prevs = TIMELINE_SORTED.filter(t => t < this.missionTime - 30);
    if (prevs.length) this.missionTime = prevs[prevs.length-1] - 10;
  }
}

// ─── Démarrage ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const sim = new ArtemisSimulator();
  sim.init().catch(err => {
    console.error('Erreur initialisation simulateur:', err);
    const ls = document.getElementById('loading-screen');
    if (ls) ls.querySelector('p').textContent = 'Erreur : ' + err.message;
  });
});
