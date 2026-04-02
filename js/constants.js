// ============================================================
// ARTEMIS III MISSION SIMULATOR — Physical & Mission Constants
// All values in SI units unless stated otherwise
// ============================================================

// ── Universal constants ─────────────────────────────────────
export const G = 6.674e-11;           // N·m²/kg²

// ── Earth ───────────────────────────────────────────────────
export const EARTH_MASS   = 5.972e24;       // kg
export const EARTH_RADIUS = 6371e3;         // m  (mean)
export const EARTH_MU     = 3.986004418e14; // m³/s²  (= G·M)
export const EARTH_ROT    = 7.2921150e-5;   // rad/s  (sidereal)
export const EARTH_J2     = 1.08263e-3;     // oblateness

// ── Moon ────────────────────────────────────────────────────
export const MOON_MASS       = 7.342e22;        // kg
export const MOON_RADIUS     = 1737.4e3;        // m
export const MOON_MU         = 4.9048695e12;    // m³/s²
export const MOON_SMA        = 384400e3;        // m  (semi-major axis)
export const MOON_PERIOD     = 27.321661*86400; // s  (sidereal)
export const MOON_ECC        = 0.0549;          // eccentricity
export const MOON_INC        = 5.145*(Math.PI/180); // rad

// ── Sun ─────────────────────────────────────────────────────
export const SUN_DIRECTION = Object.freeze([1.0, 0.0, 0.0]); // unit vec (ECI +X)

// ── Rendering scale ─────────────────────────────────────────
// 1 Three.js unit = SCALE metres = 1 000 km
export const SCALE            = 1e6;
// Spacecraft are inflated by this factor so they are visible
export const SPACECRAFT_SCALE = 400;

// ── Mission total duration ───────────────────────────────────
export const MISSION_DURATION = 23*86400; // 23 days in seconds

// ============================================================
// SLS Block 1 — Space Launch System
// ============================================================
export const SLS = {
  // Geometry (metres)
  totalHeight:     98.0,
  coreDiameter:     8.4,
  srbDiameter:      3.71,
  srbLength:       54.0,
  icpsDiameter:     5.5,
  icpsHeight:       9.6,

  // Total liftoff mass
  liftoffMass: 2_608_000, // kg

  // ── Core Stage (CS-1) + 4× RS-25D ───────────────────────
  coreProps:   979_452, // kg  LH₂/LOX propellant
  coreDry:      87_000, // kg
  // RS-25D (each of 4 engines)
  rs25ThrustVac: 2_279e3, // N   vacuum
  rs25ThrustSL:  1_860e3, // N   sea-level
  rs25Isp:       452.3,   // s   vacuum Isp
  rs25Isp_SL:    366.0,   // s   sea-level Isp

  // ── Solid Rocket Boosters (×2) ──────────────────────────
  srbPropEach:  501_000, // kg  per SRB
  srbDryEach:    90_000, // kg  per SRB
  srbThrustSL:  16_000e3, // N  sea-level each
  srbThrustVac: 17_100e3, // N  vacuum each
  srbIsp:        268.5,   // s  average Isp
  srbBurnTime:   132,     // s

  // ── ICPS — Interim Cryogenic Propulsion Stage ──────────
  // RL10B-2 engine
  icpsProps:   27_200, // kg  LH₂/LOX
  icpsDry:      3_500, // kg
  icpsThrust:  110e3,  // N
  icpsIsp:     465.5,  // s
};

// ============================================================
// Orion + European Service Module (ESM)
// ============================================================
export const ORION = {
  // Geometry (metres)
  capsuleDiameter:  5.03,
  capsuleHeight:    3.30,
  esmDiameter:      4.00,
  esmHeight:        2.70,
  solarSpan:       19.00, // deployed

  // Mass
  crewModuleMass:  10_387, // kg  (with 4 crew & supplies)
  esmMass:         13_500, // kg  (with propellant)
  esmPropMass:      8_600, // kg

  // AJ10-190 main engine
  esmThrust:  26_700, // N
  esmIsp:     316.0,  // s
};

// ============================================================
// SpaceX Starship HLS — Human Landing System
// ============================================================
export const HLS = {
  height:         50.0,  // m
  diameter:        9.0,  // m
  dryMass:    200_000,   // kg  (approx)
  propMass: 1_200_000,   // kg  (for lunar ops)
  // 3 Raptor Vacuum + 3 Raptor SL (centre cluster)
  raptorVacThrust: 2_200e3, // N each
  raptorSLThrust:  2_300e3, // N each
  raptorIsp:       380,     // s  (vacuum)
};

// ============================================================
// Lunar Gateway
// ============================================================
export const GATEWAY = {
  // Power & Propulsion Element
  ppeMass:  5_000, // kg
  ppePower: 60_000, // W  solar electric propulsion
  // Habitation & Logistics Outpost
  haloMass:   11_000, // kg
  haloVolume:   125,  // m³
};

// ============================================================
// Mission Timeline  (seconds from T-0 / liftoff)
// Based on Artemis III reference mission profile
// ============================================================
export const T = {
  LIFTOFF:              0,
  MAX_Q:               88,        // T+01:28  max dynamic pressure
  SRB_SEP:            132,        // T+02:12  SRB jettison
  FAIRING_SEP:        215,        // T+03:35  payload fairing
  CORE_CUTOFF:        490,        // T+08:10  RS-25 engine cutoff
  STAGE_SEP:          500,        // T+08:20  core stage sep
  ICPS_BURN_1:        560,        // T+09:20  ICPS orbit insertion burn
  EARTH_ORBIT:        960,        // T+16:00  parking orbit achieved (~185 km)
  TLI_IGNITION:     93_780,       // T+26:03  trans-lunar injection start
  TLI_CUTOFF:       93_960,       // T+26:06  TLI burn end  (Δv ≈ 3 140 m/s)
  MCC1:            129_600,       // T+36:00  mid-course correction 1
  MCC2:            259_200,       // T+3d     mid-course correction 2
  LOI_IGNITION:    608_400,       // T+7d 1h  LOI burn start
  LOI_CUTOFF:      609_600,       // T+7d 1h 20min
  NRHO_INSERTION:  691_200,       // T+8d     NRHO insertion maneuver
  HLS_UNDOCK:      864_000,       // T+10d    Starship HLS undocking
  POWERED_DESCENT: 871_200,       // T+10d 2h powered descent initiation
  TOUCHDOWN:       874_800,       // T+10d 3h lunar touchdown
  EVA_1_START:     882_000,       // T+10d 5h first moonwalk
  EVA_1_END:       896_400,
  EVA_2_START:     968_400,       // T+11d 5h
  EVA_2_END:       982_800,
  ASCENT_IGNITION: 1_382_400,     // T+16d    lunar ascent
  ASCENT_ORBIT:    1_389_600,     // T+16d 2h ascent orbit achieved
  HLS_RENDEZVOUS:  1_404_000,     // T+16d 6h Orion rendezvous
  TEI_IGNITION:    1_468_800,     // T+17d    trans-Earth injection
  TEI_CUTOFF:      1_470_300,     // T+17d 25min
  MCC3:            1_728_000,     // T+20d    return MCC
  REENTRY_INTERFACE: 1_900_800,   // T+22d    entry interface (120 km alt)
  SPLASHDOWN:      1_904_400,     // T+22d 1h Pacific splashdown
};

// ── Phase names keyed by timeline event ─────────────────────
export const PHASE_NAMES = {
  [T.LIFTOFF]:            'Liftoff',
  [T.MAX_Q]:              'Maximum Dynamic Pressure',
  [T.SRB_SEP]:            'SRB Separation',
  [T.FAIRING_SEP]:        'Payload Fairing Jettison',
  [T.CORE_CUTOFF]:        'Core Stage Engine Cutoff',
  [T.STAGE_SEP]:          'Core Stage Separation',
  [T.ICPS_BURN_1]:        'ICPS Orbit Insertion Burn',
  [T.EARTH_ORBIT]:        'Earth Parking Orbit (185 km)',
  [T.TLI_IGNITION]:       'Trans-Lunar Injection — Ignition',
  [T.TLI_CUTOFF]:         'Translunar Coast',
  [T.MCC1]:               'Mid-Course Correction 1',
  [T.MCC2]:               'Mid-Course Correction 2',
  [T.LOI_IGNITION]:       'Lunar Orbit Insertion — Ignition',
  [T.LOI_CUTOFF]:         'Lunar Orbit',
  [T.NRHO_INSERTION]:     'NRHO Insertion — Near Rectilinear Halo Orbit',
  [T.HLS_UNDOCK]:         'Starship HLS Undocking',
  [T.POWERED_DESCENT]:    'Powered Descent Initiation',
  [T.TOUCHDOWN]:          'Lunar Touchdown — Shackleton Crater Rim',
  [T.EVA_1_START]:        'EVA-1 — Moonwalk 1',
  [T.EVA_2_START]:        'EVA-2 — Moonwalk 2',
  [T.ASCENT_IGNITION]:    'Lunar Ascent — Engine Ignition',
  [T.ASCENT_ORBIT]:       'Lunar Ascent Orbit',
  [T.HLS_RENDEZVOUS]:     'Orion–HLS Rendezvous & Docking',
  [T.TEI_IGNITION]:       'Trans-Earth Injection — Ignition',
  [T.TEI_CUTOFF]:         'Transearth Coast',
  [T.REENTRY_INTERFACE]:  'Entry Interface (120 km)',
  [T.SPLASHDOWN]:         'Splashdown — Pacific Ocean',
};

// ── Sorted timeline array ─────────────────────────────────────
export const TIMELINE_SORTED = Object.values(T).sort((a, b) => a - b);

// ── Landing site ─────────────────────────────────────────────
// Shackleton Crater rim, lunar south pole
export const LANDING_SITE = {
  lat:  -89.9 * (Math.PI/180), // rad
  lon:    0.0 * (Math.PI/180), // rad
};

// ── KSC launch pad LC-39B ─────────────────────────────────────
export const LAUNCH_PAD = {
  lat: 28.6273 * (Math.PI/180), // rad
  lon: -80.6209 * (Math.PI/180), // rad  (West = negative)
};
