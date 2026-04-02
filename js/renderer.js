import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EARTH_RADIUS, MOON_RADIUS, MOON_SMA, SCALE, SPACECRAFT_SCALE } from "./constants.js";
import { moonPosition } from "./physics.js";

// ─── Constantes de rendu ───────────────────────────────────────
const EU = EARTH_RADIUS / SCALE;   // 6.371  unités
const MU = MOON_RADIUS  / SCALE;   // 1.737  unités
const SP = SPACECRAFT_SCALE;       // 400×

let renderer, scene, camera, controls, composer;
let earthGroup, moonMesh, starField;
let slsGroup, orionGroup;
let trajectoryLine, engineParticles;
let sunLight;

// ─── Initialisations ──────────────────────────────────────────
export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 100000);
  camera.position.set(0, 30, 60);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.01;
  controls.maxDistance = 5000;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, camera, controls };
}

// ─── Scène ────────────────────────────────────────────────────
export function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);

  // Lumière solaire (direction +X)
  sunLight = new THREE.DirectionalLight(0xfff5e0, 2.0);
  sunLight.position.set(500, 80, 0);
  sunLight.castShadow = true;
  scene.add(sunLight);

  // Lumière ambiante minimale (espace)
  scene.add(new THREE.AmbientLight(0x111122, 0.08));

  // Étoiles
  starField = createStars();
  scene.add(starField);

  // Post-processing bloom (initialisé ici car la scène est prête)
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8, 0.4, 0.85
  ));

  return scene;
}

// ─── Étoiles ─────────────────────────────────────────────────
function createStars() {
  const N = 15000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  // Palettes de couleurs stellaires réalistes
  const starColors = [
    [1.0, 1.0, 1.0],  // blanc
    [0.7, 0.8, 1.0],  // bleu-blanc (classe B)
    [1.0, 0.9, 0.7],  // jaune-blanc (classe F/G)
    [1.0, 0.7, 0.4],  // orange (classe K)
    [0.9, 0.95, 1.0], // bleu très pâle
  ];
  for (let i = 0; i < N; i++) {
    // Distribution sphérique uniforme
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r = 8000 + Math.random() * 2000;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
    const c = starColors[Math.floor(Math.random() * starColors.length)];
    const bright = 0.5 + Math.random() * 0.5;
    col[i*3]   = c[0] * bright;
    col[i*3+1] = c[1] * bright;
    col[i*3+2] = c[2] * bright;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, sizeAttenuation: false });
  return new THREE.Points(geo, mat);
}

// ─── Texture procédurale Terre ────────────────────────────────
function createEarthTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // Océan
  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0.0,  "#0a2d50");
  ocean.addColorStop(0.35, "#1565a8");
  ocean.addColorStop(0.5,  "#1a78c2");
  ocean.addColorStop(0.65, "#1565a8");
  ocean.addColorStop(1.0,  "#0a2d50");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  // Continents simplifiés (coord UV → lon/lat)
  ctx.fillStyle = "#3d7a2e";
  // Amérique du Nord
  ctx.beginPath();
  ctx.ellipse(W*0.18, H*0.28, W*0.09, H*0.15, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W*0.20, H*0.42, W*0.06, H*0.10, 0.2, 0, Math.PI*2);
  ctx.fill();
  // Amérique du Sud
  ctx.beginPath();
  ctx.ellipse(W*0.26, H*0.62, W*0.05, H*0.14, 0.1, 0, Math.PI*2);
  ctx.fill();
  // Europe/Afrique
  ctx.beginPath();
  ctx.ellipse(W*0.50, H*0.30, W*0.05, H*0.12, 0.0, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W*0.52, H*0.55, W*0.05, H*0.18, 0.0, 0, Math.PI*2);
  ctx.fill();
  // Asie
  ctx.beginPath();
  ctx.ellipse(W*0.70, H*0.27, W*0.15, H*0.15, 0.0, 0, Math.PI*2);
  ctx.fill();
  // Australie
  ctx.beginPath();
  ctx.ellipse(W*0.78, H*0.63, W*0.06, H*0.08, 0.0, 0, Math.PI*2);
  ctx.fill();
  // Antarctique
  ctx.fillStyle = "#ddeeff";
  ctx.fillRect(0, H*0.88, W, H*0.12);
  // Arctique
  ctx.fillRect(0, 0, W, H*0.07);

  // Déserts (Sahara, Arabie)
  ctx.fillStyle = "#c4a45a";
  ctx.beginPath();
  ctx.ellipse(W*0.53, H*0.43, W*0.07, H*0.06, 0.0, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W*0.61, H*0.43, W*0.04, H*0.05, 0.0, 0, Math.PI*2);
  ctx.fill();

  // Bruit léger pour réalisme
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  return new THREE.CanvasTexture(c);
}

// ─── Texture procédurale nuages ───────────────────────────────
function createCloudTexture() {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.clearRect(0, 0, W, H);
  // Nuages procéduraux
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 20 + Math.random() * 60;
    const alpha = 0.1 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

// ─── Texture procédurale Lune ─────────────────────────────────
function createMoonTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // Base grise
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, W, H);

  // Maria (mers lunaires sombres)
  const maria = [
    { x:0.32, y:0.38, rx:0.09, ry:0.08 }, // Mare Imbrium
    { x:0.42, y:0.42, rx:0.06, ry:0.05 }, // Mare Serenitatis
    { x:0.50, y:0.46, rx:0.05, ry:0.05 }, // Mare Tranquillitatis
    { x:0.55, y:0.50, rx:0.04, ry:0.04 }, // Mare Fecunditatis
    { x:0.38, y:0.50, rx:0.04, ry:0.03 }, // Mare Vaporum
    { x:0.22, y:0.44, rx:0.05, ry:0.04 }, // Oceanus Procellarum
  ];
  for (const m of maria) {
    ctx.fillStyle = "#555560";
    ctx.beginPath();
    ctx.ellipse(m.x*W, m.y*H, m.rx*W, m.ry*H, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // Hautes terres (plus claires)
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = "rgba(170,165,155,0.3)";
    ctx.beginPath();
    ctx.ellipse(Math.random()*W, Math.random()*H, 20+Math.random()*80, 15+Math.random()*60, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // Cratères
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 2 + Math.random() * 20;
    // Bord brillant
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(150,148,145,0.8)";
    ctx.fill();
    // Centre sombre
    ctx.beginPath();
    ctx.arc(x, y, r*0.7, 0, Math.PI*2);
    ctx.fillStyle = "rgba(60,58,55,0.6)";
    ctx.fill();
  }
  // Grands cratères
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 20 + Math.random() * 60;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.strokeStyle = "rgba(200,195,185,0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r*0.8, 0, Math.PI*2);
    ctx.fillStyle = "rgba(65,62,58,0.5)";
    ctx.fill();
  }

  return new THREE.CanvasTexture(c);
}

// ─── Terre ────────────────────────────────────────────────────
export function createEarth() {
  earthGroup = new THREE.Group();

  // Sphère principale
  const geo = new THREE.SphereGeometry(EU, 64, 32);
  const mat = new THREE.MeshPhongMaterial({
    map: createEarthTexture(),
    shininess: 15,
    specular: new THREE.Color(0x226688),
  });
  const earth = new THREE.Mesh(geo, mat);
  earth.castShadow = true;
  earth.receiveShadow = true;
  earth.name = "earthSurface";
  earthGroup.add(earth);

  // Nuages
  const cloudGeo = new THREE.SphereGeometry(EU * 1.005, 64, 32);
  const cloudMat = new THREE.MeshPhongMaterial({
    map: createCloudTexture(),
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.name = "clouds";
  earthGroup.add(clouds);

  // Atmosphère (shader de bord)
  // sunDir référence le même objet Vector3 que la DirectionalLight → mise à jour auto
  const atmGeo = new THREE.SphereGeometry(EU * 1.04, 64, 32);
  const atmMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunLight.position.clone().normalize() } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal  = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - abs(dot(vViewDir, vNormal));
        float atm = pow(rim, 2.5);
        float day = max(0.0, dot(vNormal, normalize(sunDir)));
        float bright = smoothstep(0.0, 0.4, day);
        vec3 dayCol   = vec3(0.25, 0.55, 1.00);
        vec3 nightCol = vec3(0.00, 0.05, 0.20);
        vec3 col = mix(nightCol, dayCol, bright);
        gl_FragColor = vec4(col, atm * 0.75);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  earthGroup.add(new THREE.Mesh(atmGeo, atmMat));

  scene.add(earthGroup);
  return earthGroup;
}

// ─── Lune ─────────────────────────────────────────────────────
export function createMoon() {
  const geo = new THREE.SphereGeometry(MU, 48, 24);
  const mat = new THREE.MeshPhongMaterial({
    map: createMoonTexture(),
    shininess: 5,
    specular: new THREE.Color(0x111111),
  });
  moonMesh = new THREE.Mesh(geo, mat);
  moonMesh.castShadow = true;
  moonMesh.receiveShadow = true;
  moonMesh.name = "moon";
  scene.add(moonMesh);
  return moonMesh;
}

// ─── SLS ──────────────────────────────────────────────────────
export function createSLS() {
  slsGroup = new THREE.Group();
  // Echelle : SLS fait 98 m réels → 98/1e6*400 unités
  const s = (m) => m / SCALE * SP;

  const matOrange = new THREE.MeshPhongMaterial({ color: 0xc85a00, shininess: 30 });
  const matWhite  = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 40 });
  const matDark   = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 10 });

  // Noyau central (Core Stage) — orangé type réservoir externe
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(s(4.2), s(4.2), s(65), 16),
    matOrange
  );
  core.name = "coreStage";
  slsGroup.add(core);

  // Deux boosters solides (SRB)
  const srbOff = s(6.5);
  for (let side = -1; side <= 1; side += 2) {
    const srb = new THREE.Group();
    srb.name = "srb_" + side;
    const srbBody = new THREE.Mesh(
      new THREE.CylinderGeometry(s(1.85), s(1.85), s(54), 12),
      matWhite
    );
    srbBody.position.y = s(-5);
    srb.add(srbBody);
    // Nez du booster
    srb.add(Object.assign(new THREE.Mesh(
      new THREE.ConeGeometry(s(1.85), s(5), 12), matWhite),
      { position: new THREE.Vector3(0, s(22), 0) }
    ));
    srb.position.set(side * srbOff, s(-5), 0);
    slsGroup.add(srb);
  }

  // ICPS (étage cryogénique intermédiaire)
  const icps = new THREE.Mesh(
    new THREE.CylinderGeometry(s(2.75), s(2.75), s(9.6), 12),
    matWhite
  );
  icps.position.y = s(37);
  icps.name = "icps";
  slsGroup.add(icps);

  // Coiffe (payload fairing) — Orion est dedans
  const fairing = new THREE.Group();
  fairing.name = "fairing";
  fairing.add(Object.assign(new THREE.Mesh(
    new THREE.CylinderGeometry(s(2.5), s(2.75), s(8), 12), matWhite),
    { position: new THREE.Vector3(0, s(4), 0) }
  ));
  fairing.add(Object.assign(new THREE.Mesh(
    new THREE.ConeGeometry(s(2.5), s(10), 12), matWhite),
    { position: new THREE.Vector3(0, s(13), 0) }
  ));
  fairing.position.y = s(46);
  slsGroup.add(fairing);

  // Tuyères RS-25 (4×)
  const nozzleOffsets = [[s(2), 0],[s(-2),0],[0,s(2)],[0,s(-2)]];
  for (const [ox, oz] of nozzleOffsets) {
    const n = new THREE.Mesh(
      new THREE.ConeGeometry(s(0.9), s(2.5), 8), matDark
    );
    n.rotation.x = Math.PI;
    n.position.set(ox, s(-34), oz);
    slsGroup.add(n);
  }

  slsGroup.visible = true;
  scene.add(slsGroup);
  return slsGroup;
}

// ─── Orion + ESM ──────────────────────────────────────────────
export function createOrion() {
  orionGroup = new THREE.Group();
  const s = (m) => m / SCALE * SP;

  const matDark  = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 20 });
  const matWhite = new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 40 });
  const matBlue  = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 60 });

  // Capsule (cône tronqué)
  const capsule = new THREE.Mesh(
    new THREE.CylinderGeometry(s(1.5), s(2.5), s(3.3), 16),
    matDark
  );
  capsule.position.y = s(3);
  orionGroup.add(capsule);

  // Module de service européen (ESM)
  const esm = new THREE.Mesh(
    new THREE.CylinderGeometry(s(2.0), s(2.0), s(2.7), 16),
    matWhite
  );
  esm.position.y = s(-0.3);
  orionGroup.add(esm);

  // Panneaux solaires (4×)
  for (let a = 0; a < 4; a++) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(s(4), s(0.05), s(1.5)),
      matBlue
    );
    const angle = a * Math.PI / 2;
    panel.position.set(Math.cos(angle)*s(4), s(-0.3), Math.sin(angle)*s(4));
    panel.rotation.y = angle;
    orionGroup.add(panel);
  }

  // Tuyère principale AJ-10
  const nozzle = new THREE.Mesh(
    new THREE.ConeGeometry(s(0.6), s(1.2), 8),
    new THREE.MeshPhongMaterial({ color: 0x111111 })
  );
  nozzle.rotation.x = Math.PI;
  nozzle.position.y = s(-2.2);
  orionGroup.add(nozzle);

  orionGroup.visible = false;
  scene.add(orionGroup);
  return orionGroup;
}

// ─── Particules moteur ────────────────────────────────────────
export function createEngineParticles() {
  const N = 600;
  const positions = new Float32Array(N * 3);
  const colors    = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
  const mat = new THREE.PointsMaterial({
    size: 0.8, vertexColors: true,
    sizeAttenuation: false,
    transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  engineParticles = new THREE.Points(geo, mat);
  engineParticles.visible = false;
  scene.add(engineParticles);
  return engineParticles;
}

// ─── Ligne de trajectoire ─────────────────────────────────────
export function createTrajectoryLine(trajectoryPoints) {
  const stride = 10; // 1 point sur 10 pour la perf
  const verts = [];
  for (let i = 0; i < trajectoryPoints.length; i += stride) {
    const p = trajectoryPoints[i];
    verts.push(p.x / SCALE, p.y / SCALE, p.z / SCALE);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, opacity: 0.5, transparent: true });
  trajectoryLine = new THREE.Line(geo, mat);
  scene.add(trajectoryLine);
  return trajectoryLine;
}

// ─── Mise à jour du vaisseau ──────────────────────────────────
export function updateSpacecraft(state) {
  const { x, y, z, vx, vy, vz, phase, speed } = state;
  const px = x / SCALE, py = y / SCALE, pz = z / SCALE;

  const launchPhases   = ["launch", "ascent", "stage_sep", "earth_orbit", "tli_burn"];
  const onPadPhases    = ["prelaunch"];
  const orionPhases    = ["translunar_coast", "mcc1", "mcc2", "loi_burn", "lunar_orbit",
                          "nrho", "hls_undock", "powered_descent", "touchdown",
                          "lunar_surface", "eva_1", "eva_2", "lunar_ascent",
                          "orion_rendezvous", "transearth_coast", "reentry", "splashdown"];

  // Choisir quel vaisseau afficher
  slsGroup.visible   = launchPhases.includes(phase) || onPadPhases.includes(phase);
  orionGroup.visible = orionPhases.includes(phase);

  // SRBs visibles seulement avant séparation
  const srbLeft  = slsGroup.getObjectByName("srb_-1");
  const srbRight = slsGroup.getObjectByName("srb_1");
  const fairingObj = slsGroup.getObjectByName("fairing");
  const srbVisible  = ["launch", "prelaunch"].includes(phase);
  if (srbLeft)    srbLeft.visible  = srbVisible;
  if (srbRight)   srbRight.visible = srbVisible;
  if (fairingObj) fairingObj.visible = ["launch", "ascent", "prelaunch"].includes(phase);

  // Positionner
  if (slsGroup.visible) {
    slsGroup.position.set(px, py, pz);
    // Orienter le SLS : axe +Y pointe dans la direction radiale (loin du centre Terre)
    // On calcule le vecteur radial normalisé, puis on aligne l'axe Y dessus.
    const rLen = Math.sqrt(px*px + py*py + pz*pz) || 1;
    const upX  = px / rLen, upY = py / rLen, upZ = pz / rLen;
    // lookAt oriente -Z vers la cible → pointer la "tête" vers le haut radial
    // en utilisant la position + vecteur radial comme cible
    slsGroup.up.set(0, 1, 0);
    slsGroup.lookAt(px + upX, py + upY, pz + upZ);
    slsGroup.rotateX(Math.PI / 2); // axe +Y du groupe vers la direction radiale
  }
  if (orionGroup.visible) {
    orionGroup.position.set(px, py, pz);
  }

  // Particules moteur — direction anti-prograde du vaisseau
  const enginesOn = ["launch", "ascent", "tli_burn", "loi_burn",
                     "lunar_ascent", "transearth_coast"].includes(phase);
  const vlen = Math.sqrt(vx*vx + vy*vy + vz*vz) || 1;
  // Direction anti-prograde normalisée en unités Three.js
  const apx = -(vx / vlen) / SCALE * 100;
  const apy = -(vy / vlen) / SCALE * 100;
  const apz = -(vz / vlen) / SCALE * 100;
  updateEngineParticles(enginesOn, px, py, pz, apx, apy, apz);
}

function updateEngineParticles(on, px, py, pz, apx, apy, apz) {
  if (!engineParticles) return;
  engineParticles.visible = on;
  if (!on) return;

  const pos  = engineParticles.geometry.attributes.position;
  const col  = engineParticles.geometry.attributes.color;
  const N    = pos.count;
  const jitter = (amp) => (Math.random() - 0.5) * amp;

  for (let i = 0; i < N; i++) {
    const frac = i / N;           // 0 (noyau) → 1 (queue)
    const spread = frac * 0.15;   // panache qui s'élargit
    pos.setXYZ(i,
      px + apx * frac + jitter(spread),
      py + apy * frac + jitter(spread),
      pz + apz * frac + jitter(spread)
    );
    // Dégradé blanc→orange→rouge de la base vers la queue
    const g = frac < 0.3 ? 1.0 : Math.max(0, 1.0 - (frac - 0.3) * 2.0);
    const b = frac < 0.1 ? 0.8 : 0.0;
    col.setXYZ(i, 1.0, g, Math.max(0, b));
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

// ─── Mise à jour de la Lune ───────────────────────────────────
export function updateMoonPosition(t) {
  const [mx, my, mz] = moonPosition(t);
  moonMesh.position.set(mx / SCALE, my / SCALE, mz / SCALE);
}

// ─── Caméra ───────────────────────────────────────────────────
let cameraMode = "overview";
let cameraTarget = new THREE.Vector3();
let smoothTarget = new THREE.Vector3();

export function setCameraMode(mode) { cameraMode = mode; }
export function getCameraMode()     { return cameraMode; }
export function getCameraControls() { return controls; }

export function updateCamera(state) {
  const { x, y, z, phase } = state;
  const px = x / SCALE, py = y / SCALE, pz = z / SCALE;
  const LERP = 0.03;

  switch (cameraMode) {
    case "follow": {
      // Caméra suit le vaisseau à distance fixe
      const dist = ["launch", "ascent", "prelaunch"].includes(phase) ? 0.5 : 5.0;
      const dir  = new THREE.Vector3(px, py, pz).normalize().multiplyScalar(dist);
      cameraTarget.set(px + dir.x*3, py + dir.y*3 + dist, pz + dir.z*3);
      camera.position.lerp(cameraTarget, LERP);
      smoothTarget.lerp(new THREE.Vector3(px, py, pz), LERP);
      camera.lookAt(smoothTarget);
      break;
    }
    case "earth": {
      cameraTarget.set(0, 20, 30);
      camera.position.lerp(cameraTarget, LERP);
      camera.lookAt(0, 0, 0);
      break;
    }
    case "moon": {
      const [mx,,mz_] = moonPosition(state.t);
      const mxu = mx/SCALE, mzu = mz_/SCALE;
      cameraTarget.set(mxu + 5, 3, mzu + 5);
      camera.position.lerp(cameraTarget, LERP);
      camera.lookAt(mxu, 0, mzu);
      break;
    }
    case "overview":
    default: {
      // Vue d'ensemble Terre-Lune
      controls.enabled = true;
      break;
    }
  }

  // Désactiver OrbitControls si caméra gérée manuellement
  controls.enabled = (cameraMode === "overview");
  if (controls.enabled) controls.update();
}

// ─── Rotation Terre ───────────────────────────────────────────
export function rotateEarth(dt) {
  // Rotation sidérale : 7.292e-5 rad/s
  const earthSurface = earthGroup.getObjectByName("earthSurface");
  const clouds       = earthGroup.getObjectByName("clouds");
  if (earthSurface) earthSurface.rotation.y += 7.292e-5 * dt;
  if (clouds)       clouds.rotation.y       += 8.0e-5   * dt;
}

// ─── Rendu ────────────────────────────────────────────────────
export function render() {
  composer.render();
}

export function getScene()  { return scene; }
export function getCamera() { return camera; }
