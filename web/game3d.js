import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { initAudio, setEngine, setSiren, playDelivery, cleanupAudio } from './audio.js?v=3';
import { addStreetProps } from './street-props.js?v=3';
import { buildRoadDetails } from './road-details.js?v=3';

// Nightshift: District Run — self-contained procedural third-person game module.
// Load with: import { startGame } from './game3d.js'; startGame();
export function startGame() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('scene');
  if (!canvas) throw new Error('Nightshift requires a canvas with id="scene".');
  const intro = $('intro');
  const startButton = $('start');
  const pausePanel = $('pause');
  const resumeButton = $('resume');
  const statusNode = $('status');
  const toastNode = $('toast');
  const flashNode = $('flash');
  const mapCanvas = $('map');
  const mapCtx = mapCanvas?.getContext?.('2d') ?? null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111923);
  scene.fog = new THREE.FogExp2(0x17212b, 0.00125);
  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 1250);
  const clock = new THREE.Clock();

  const C = { mint: 0x68e6d2, gold: 0xf1d398, coral: 0xef806d, navy: 0x111923 };
  const city = { blocks: 7, spacing: 150, road: 30 };
  const half = city.blocks * city.spacing / 2;
  const worldSize = city.blocks * city.spacing + 100;
  const roadLines = Array.from({ length: city.blocks + 1 }, (_, i) => -half + i * city.spacing);
  const keys = new Set();
  const collisionBoxes = [];
  const traffic = [];
  const police = [];
  const policePool = [];
  let missionIndex = 0;
  let cash = 250;
  let wanted = 0;
  let paused = true;
  let started = false;
  let toastTimer = 0;
  let wantedCool = 0;
  let collisionCooldown = 0;
  let frameHandle = 0;
  let disposed = false;
  let lastAudioSpeed = -1;
  let lastAudioSiren = false;

  const car = { x: 75, z: half - 31, yaw: 0, speed: 0, lateralSpeed: 0, steer: 0, wheelSpin: 0, lastCrash: 0 };
  const missions = [
    { x: 75, z: 375, title: 'THE LAST-MINUTE PARCEL', reward: 450 },
    { x: 225, z: 75, title: 'A QUIET PICKUP', reward: 650 },
    { x: 375, z: -375, title: 'BAYFRONT RUN', reward: 900 },
    { x: -375, z: -225, title: 'NIGHT MARKET DROP', reward: 1250 },
    { x: 75, z: 375, title: 'ONE MORE FAVOR', reward: 1600 },
  ];

  const mat = (color, roughness = 0.82, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const mats = {
    asphalt: mat(0x222b32, 0.94), sidewalk: mat(0x788080, 0.92), curb: mat(0x9a9c93, 0.8),
    paint: mat(0xd0c8ad, 0.72), ground: mat(0x26343b, 0.98), grass: mat(0x375946, 0.96),
    glass: mat(0x18323b, 0.2, 0.3, { metalness: 0.28 }), rubber: mat(0x101417, 0.94),
    metal: mat(0x38434a, 0.38, 0.72), lamp: mat(0xffd38b, 0.3, 0, { emissive: 0xffbd68, emissiveIntensity: 1.5 }),
    neon: mat(0x68e6d2, 0.27, 0, { emissive: 0x33cdbb, emissiveIntensity: 2.2 }),
    window: mat(0xffd38b, 0.27, 0.05, { emissive: 0xe5a353, emissiveIntensity: 1.35 }),
    windowCool: mat(0x8ed8e4, 0.25, 0.1, { emissive: 0x48a8bd, emissiveIntensity: 1.0 }),
  };

  function box(parent, name, size, material, pos, cast = false, receive = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.name = name;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
  }
  function plane(parent, name, width, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Night skyline, warm horizon and restrained realtime lighting.
  const hemi = new THREE.HemisphereLight(0x91a5c3, 0x202b31, 1.2);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xffc09a, 2.15);
  moon.position.set(-180, 260, 100);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -340; moon.shadow.camera.right = 340;
  moon.shadow.camera.top = 340; moon.shadow.camera.bottom = -340;
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 700;
  moon.shadow.bias = -0.00035;
  scene.add(moon);
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), new THREE.MeshBasicMaterial({ color: 0x1a2535, side: THREE.BackSide, fog: false }));
  scene.add(skyDome);
  const starsGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(420 * 3);
  let seed = 82026;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 420; i++) {
    const angle = random() * Math.PI * 2, radius = 480 + random() * 350;
    starPositions[i * 3] = Math.cos(angle) * radius;
    starPositions[i * 3 + 1] = 260 + random() * 400;
    starPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xdce7ed, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.74 }));
  scene.add(stars);

  // Base surface and connected road grid.
  plane(scene, 'District ground', worldSize + 100, worldSize + 100, mats.ground, 0, -0.12, 0);
  const roadGroup = new THREE.Group(); roadGroup.name = 'Avenues and streets'; scene.add(roadGroup);
  for (const p of roadLines) {
    plane(roadGroup, 'North-south avenue', city.road, worldSize, mats.asphalt, p, 0.015, 0);
    plane(roadGroup, 'East-west avenue', worldSize, city.road, mats.asphalt, 0, 0.016, p);
    for (const side of [-1, 1]) {
      plane(roadGroup, 'Sidewalk', 5, worldSize, mats.sidewalk, p + side * (city.road / 2 + 2.5), 0.11, 0);
      plane(roadGroup, 'Sidewalk', worldSize, 5, mats.sidewalk, 0, 0.11, p + side * (city.road / 2 + 2.5));
    }
  }
  const helper = new THREE.Object3D();
  const temp = new THREE.Object3D();
  buildRoadDetails({ THREE, scene, city, roadLines, half });

  // Repeating city windows are instanced into one draw call per facade direction.
  const buildingPalette = [0x546872, 0xa36e61, 0x777e80, 0x667489, 0xb29876, 0x4f7068, 0x7e6a77, 0x8b755f];
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, 0.91), 220);
  buildings.name = 'Downtown skyline'; buildings.castShadow = true; buildings.receiveShadow = true;
  const windowRows = [];
  let bIndex = 0;
  const addWindow = (x, y, z, rot, cool) => windowRows.push({ x, y, z, rot, cool });
  const collisionAdd = (x, z, w, d) => collisionBoxes.push({ x, z, w: w * 0.5 + 2.7, d: d * 0.5 + 2.7 });
  for (let bx = 0; bx < city.blocks; bx++) for (let bz = 0; bz < city.blocks; bz++) {
    const cx = -half + (bx + 0.5) * city.spacing;
    const cz = -half + (bz + 0.5) * city.spacing;
    if (bx === 3 && bz === 3) { buildPlaza(cx, cz); continue; }
    if (bx === 0 && bz >= 4) { buildPark(cx, cz); continue; }
    const lots = [[-25,-25], [24,-25], [-25,24], [24,24]];
    for (let k = 0; k < lots.length; k++) {
      if (random() < 0.17) continue;
      const [ox, oz] = lots[k];
      const w = 19 + random() * 9, d = 19 + random() * 9;
      let h = 19 + random() * 45;
      if (bx >= 2 && bx <= 4 && bz >= 2 && bz <= 4) h *= 1.38;
      const x = cx + ox + (random() - 0.5) * 7, z = cz + oz + (random() - 0.5) * 7;
      helper.position.set(x, h * 0.5, z); helper.scale.set(w, h, d); helper.rotation.set(0, 0, 0); helper.updateMatrix();
      buildings.setMatrixAt(bIndex, helper.matrix); buildings.setColorAt(bIndex, new THREE.Color(buildingPalette[Math.floor(random() * buildingPalette.length)])); bIndex++;
      collisionAdd(x, z, w, d);
      const floors = Math.max(2, Math.floor(h / 6.5));
      for (let floor = 1; floor <= floors; floor++) {
        const wy = floor * (h / (floors + 1));
        for (let col = 0; col < 3; col++) {
          const wx = x - w * 0.32 + col * w * 0.32;
          if (random() > 0.26) {
            addWindow(wx, wy, z - d / 2 - 0.07, 0, random() < 0.12);
            addWindow(wx, wy, z + d / 2 + 0.07, Math.PI, random() < 0.12);
          }
          const wz = z - d * 0.3 + col * d * 0.3;
          if (random() > 0.34) {
            addWindow(x + w / 2 + 0.07, wy, wz, Math.PI / 2, random() < 0.12);
            addWindow(x - w / 2 - 0.07, wy, wz, -Math.PI / 2, random() < 0.12);
          }
        }
      }
      if (h > 53 && random() > 0.5) {
        const sign = box(scene, 'Rooftop neon', [w * 0.56, 1.15, 0.28], mats.neon, [x, h * 0.72, z - d / 2 - 0.22]);
        sign.castShadow = false;
      }
    }
  }
  buildings.count = bIndex; buildings.instanceMatrix.needsUpdate = true; scene.add(buildings);
  const windowGeometry = new THREE.BoxGeometry(2.45, 1.1, 0.11);
  const windowWarm = new THREE.InstancedMesh(windowGeometry, mats.window, windowRows.length);
  const windowCool = new THREE.InstancedMesh(windowGeometry, mats.windowCool, windowRows.length);
  let wi = 0, ci = 0;
  for (const w of windowRows) {
    temp.position.set(w.x, w.y, w.z); temp.rotation.set(0, w.rot, 0); temp.scale.set(1, 0.8 + random() * 0.35, 1); temp.updateMatrix();
    if (w.cool) { windowCool.setMatrixAt(ci++, temp.matrix); } else { windowWarm.setMatrixAt(wi++, temp.matrix); }
  }
  windowWarm.count = wi; windowCool.count = ci; windowWarm.instanceMatrix.needsUpdate = true; windowCool.instanceMatrix.needsUpdate = true;
  scene.add(windowWarm, windowCool);

  const parkGroup = new THREE.Group(); scene.add(parkGroup);
  function buildPark(x, z) {
    plane(parkGroup, 'Bayfront park lawn', 56, 56, mats.grass, x, 0.025, z);
    const pathMat = mat(0xb5a58d, 0.95);
    plane(parkGroup, 'Park path', 3.4, 54, pathMat, x + 5, 0.065, z);
    const trunkGeo = new THREE.CylinderGeometry(0.42, 0.62, 5.4, 7);
    const crownGeo = new THREE.ConeGeometry(3.2, 7.0, 7);
    const trunk = new THREE.InstancedMesh(trunkGeo, mat(0x74543c, 0.94), 72);
    const crowns = new THREE.InstancedMesh(crownGeo, mat(0x477857, 0.91), 72);
    let n = 0;
    for (let i = 0; i < 18; i++) {
      const tx = x + (random() - 0.5) * 46, tz = z + (random() - 0.5) * 46;
      if (Math.abs(tx - (x + 5)) < 5) continue;
      temp.position.set(tx, 2.7, tz); temp.scale.setScalar(0.75 + random() * 0.5); temp.updateMatrix(); trunk.setMatrixAt(n, temp.matrix);
      temp.position.set(tx, 7.7, tz); temp.scale.setScalar(0.72 + random() * 0.58); temp.updateMatrix(); crowns.setMatrixAt(n, temp.matrix); n++;
    }
    trunk.count = n; crowns.count = n; parkGroup.add(trunk, crowns);
  }
  function buildPlaza(x, z) {
    plane(scene, 'Civic plaza', 58, 58, mat(0x999184, 0.88), x, 0.035, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.8, 32), mat(0x586c72, 0.28, 0.28));
    base.position.set(x, 0.48, z); base.receiveShadow = true; scene.add(base);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.9, 0.18, 32), mat(0x42aabd, 0.18, 0.3, { emissive: 0x125f76, emissiveIntensity: 0.45 }));
    water.position.set(x, 0.94, z); scene.add(water);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.65, 4.8, 7), mats.neon); spire.position.set(x, 3.3, z); scene.add(spire);
  }
  // Palm-lined avenues: combined instances keep the skyline light.
  const lampPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 7.8, 6), mats.metal, 250);
  const lampHead = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.22, 0.45), mats.lamp, 250);
  let lampN = 0;
  for (const x of roadLines) for (let z = -half + 32; z < half; z += 78) {
    for (const side of [-1, 1]) {
      temp.position.set(x + side * (city.road / 2 + 6), 3.9, z); temp.updateMatrix(); lampPole.setMatrixAt(lampN, temp.matrix);
      temp.position.set(x + side * (city.road / 2 + 6), 7.75, z); temp.updateMatrix(); lampHead.setMatrixAt(lampN, temp.matrix); lampN++;
    }
  }
  lampPole.count = lampN; lampHead.count = lampN; scene.add(lampPole, lampHead);
  addStreetProps({ THREE, scene, city, roadLines, half });
  addRoadDetails({ THREE, scene, city, roadLines, half });

  const headlightMat = mat(0xffedbf, 0.18, 0, { emissive: 0xffd786, emissiveIntensity: 2.4 });
  const tailMat = mat(0xed4251, 0.24, 0, { emissive: 0xc82435, emissiveIntensity: 1.3 });
  function createCarModel({ policeCar = false, color = 0xb74937, simple = false } = {}) {
    const group = new THREE.Group();
    const paint = policeCar ? mat(0xe7e8e3, 0.28, 0.48) : mat(color, 0.25, 0.58);
    const shell = new THREE.Group(); group.add(shell);
    // A beveled side silhouette gives the coupe a low roofline and shaped hood/trunk.
    const profile = new THREE.Shape();
    profile.moveTo(-2.24, 0.48); profile.lineTo(-2.15, 0.96); profile.lineTo(-1.35, 1.06);
    profile.lineTo(-0.79, 1.62); profile.quadraticCurveTo(-0.61, 1.78, -0.38, 1.79);
    profile.lineTo(0.63, 1.79); profile.quadraticCurveTo(0.84, 1.78, 0.99, 1.57);
    profile.lineTo(1.25, 1.16); profile.lineTo(2.13, 1.04); profile.lineTo(2.24, 0.53);
    profile.quadraticCurveTo(1.6, 0.38, 1.1, 0.44); profile.lineTo(-1.12, 0.44);
    profile.quadraticCurveTo(-1.68, 0.38, -2.24, 0.48);
    const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: 1.88, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.055, bevelThickness: 0.055, curveSegments: 5 });
    bodyGeo.rotateY(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, paint); body.position.x = -0.94; body.castShadow = true; body.receiveShadow = true; body.name = 'Beveled coupe body'; shell.add(body);
    box(shell, 'Front bumper', [1.94, 0.18, 0.16], mat(0x252b2d, 0.38, 0.56), [0, 0.52, -2.22], true);
    box(shell, 'Rear bumper', [1.94, 0.18, 0.16], mat(0x252b2d, 0.38, 0.56), [0, 0.52, 2.22], true);
    box(shell, 'Front grille', [0.77, 0.25, 0.045], mat(0x111719, 0.4, 0.28), [0, 0.77, -2.255]);
    box(shell, 'Lower intake', [1.12, 0.09, 0.045], mat(0x111719, 0.4, 0.28), [0, 0.59, -2.25]);
    const glass = mat(0x55909d, 0.16, 0.34, { transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    const sidePane = (points, x) => {
      const shape = new THREE.Shape(); shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
      shape.closePath();
      const pane = new THREE.Mesh(new THREE.ShapeGeometry(shape), glass); pane.rotation.y = Math.PI / 2; pane.position.x = x; pane.name = 'Tinted side glass'; shell.add(pane);
    };
    for (const sideX of [-0.952, 0.952]) {
      sidePane([[-0.77, 1.2], [-0.39, 1.67], [0.07, 1.67], [0.07, 1.2]], sideX);
      sidePane([[0.2, 1.2], [0.2, 1.67], [0.61, 1.67], [0.92, 1.2]], sideX);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.23), paint);
      mirror.position.set(sideX * 1.11, 1.25, -0.94); mirror.castShadow = true; shell.add(mirror);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.055, 0.25), mats.metal);
      handle.position.set(sideX * 1.005, 1.02, 0.04); shell.add(handle);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.43, 0.012), mats.metal);
      seam.position.set(sideX * 1.005, 0.82, 0.62); shell.add(seam);
    }
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.48, 0.055), glass);
    windshield.position.set(0, 1.55, -0.98); windshield.rotation.x = -0.42; shell.add(windshield);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.055), glass);
    rearGlass.position.set(0, 1.51, 0.88); rearGlass.rotation.x = 0.48; shell.add(rearGlass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 1.28), paint);
    roof.position.set(0, 1.79, 0.08); roof.castShadow = true; shell.add(roof);
    const wheelGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.32, 16);
    const wheels = [];
    for (const x of [-1.08, 1.08]) for (const z of [-1.43, 1.43]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.47, z); group.add(pivot);
      const tire = new THREE.Mesh(wheelGeo, mats.rubber); tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.335, 10), mat(0x9da8a6, 0.3, 0.8)); hub.rotation.z = Math.PI / 2; pivot.add(hub);
      wheels.push({ pivot, tire, front: z < 0 });
    }
    for (const x of [-0.68, 0.68]) {
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.08), headlightMat); front.position.set(x, 0.94, -2.31); shell.add(front);
      const rear = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.08), tailMat); rear.position.set(x, 0.93, 2.31); shell.add(rear);
    }
    if (policeCar) {
      const door = box(shell, 'Police door stripe', [2.18, 0.34, 1.65], mat(0x233d59, 0.28, 0.48), [0, 0.98, 0.12]);
      const bar = box(shell, 'Siren lightbar', [0.92, 0.14, 0.29], mat(0xe74453, 0.2, 0, { emissive: 0xe74453, emissiveIntensity: 2.3 }), [0, 2.04, -0.13]);
      bar.userData.siren = true;
    }
    if (!simple) {
      const lamps = [];
      for (const x of [-0.69, 0.69]) {
        const spot = new THREE.SpotLight(0xffe3ae, 42, 72, Math.PI / 8, 0.5, 1.5);
        spot.position.set(x, 0.94, -2.1); spot.target.position.set(x, 0.15, -30); group.add(spot, spot.target); lamps.push(spot);
      }
      group.userData.headlamps = lamps;
    }
    group.userData.wheels = wheels;
    group.userData.shell = shell;
    return group;
  }
  const playerCar = createCarModel();
  playerCar.name = 'Player coupe'; playerCar.position.set(car.x, 0, car.z); scene.add(playerCar);

  const marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.28, 8, 40), mat(C.mint, 0.24, 0, { emissive: C.mint, emissiveIntensity: 2.5 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; marker.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.2, 12, 14, 1, true), new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 6.1; marker.add(beam);
  const markerLight = new THREE.PointLight(C.mint, 12, 34, 2); markerLight.position.y = 3.5; marker.add(markerLight);
  scene.add(marker);
  function setMarker() { const m = missions[missionIndex]; marker.position.set(m.x, 0, m.z); }
  setMarker();

  // Moving traffic follows lanes around the district; each model has few meshes.
  const trafficColors = [0xc8c4b8, 0x3e7382, 0xc59055, 0x68796c, 0xb9c3c6, 0x756377];
  for (let i = 0; i < 16; i++) {
    const ns = i % 2 === 0;
    const line = roadLines[Math.floor(random() * roadLines.length)];
    const direction = random() > 0.5 ? 1 : -1;
    const offset = (direction > 0 ? -5 : 5);
    const mesh = createCarModel({ color: trafficColors[i % trafficColors.length], simple: true });
    mesh.scale.setScalar(0.77); scene.add(mesh);
    const phase = (random() - 0.5) * worldSize;
    traffic.push({ mesh, ns, line, direction, offset, phase, speed: 12 + random() * 8, axis: ns ? 'z' : 'x' });
  }

  function createPolice() {
    const mesh = createCarModel({ policeCar: true, simple: true });
    scene.add(mesh);
    const beacon = new THREE.PointLight(0xff304d, 7, 18, 2); beacon.position.set(0, 2.1, -0.1); mesh.add(beacon);
    const cop = { mesh, speed: 0, siren: mesh.userData.shell.children.find((c) => c.userData.siren) ?? null };
    policePool.push(cop);
    return cop;
  }

  function showToast(text, duration = 2.6) {
    if (toastNode) { toastNode.textContent = text; toastNode.classList.add('show'); toastNode.hidden = false; }
    toastTimer = duration;
  }
  function updateHUD() {
    const mission = missions[missionIndex];
    const distance = Math.round(Math.hypot(mission.x - car.x, mission.z - car.z));
    if ($('missionTitle')) $('missionTitle').textContent = mission.title;
    if ($('missionDesc')) $('missionDesc').textContent = `Drive to the glowing marker · ${distance} m away · press E to deliver`;
    if ($('contractNo')) $('contractNo').textContent = String(missionIndex + 1).padStart(2, '0');
    if ($('reward')) $('reward').textContent = `$${mission.reward}`;
    if ($('cash')) $('cash').textContent = `$ ${String(cash).padStart(6, '0')}`;
    if ($('heat')) $('heat').textContent = `POLICE  ${Array.from({ length: 5 }, (_, i) => i < Math.ceil(wanted) ? '◆' : '◇').join(' ')}`;
    if ($('speed')) $('speed').textContent = String(Math.round(Math.abs(car.speed) * 3.6)).padStart(3, '0');
  }
  function completeMission() {
    const m = missions[missionIndex];
    if (Math.hypot(m.x - car.x, m.z - car.z) > 11) { showToast('MOVE CLOSER TO THE DROP', 1.5); return; }
    cash += m.reward; playDelivery(); wanted = Math.min(5, wanted + 0.75); wantedCool = 0;
    missionIndex = (missionIndex + 1) % missions.length; setMarker();
    showToast(`DELIVERY COMPLETE  ·  +$${m.reward}`, 3.1);
    if (flashNode) { flashNode.classList.add('on'); window.setTimeout(() => flashNode.classList.remove('on'), 260); }
    const desiredPolice = Math.min(3, Math.ceil(wanted / 1.8));
    while (police.length < desiredPolice) spawnPolice();
  }
  function spawnPolice() {
    const cop = policePool.find((candidate) => !candidate.mesh.visible) ?? createPolice();
    cop.mesh.visible = true;
    if (!police.includes(cop)) police.push(cop);
    const angle = random() * Math.PI * 2, distance = 95 + random() * 38;
    cop.mesh.position.set(car.x + Math.cos(angle) * distance, 0, car.z + Math.sin(angle) * distance);
    cop.mesh.rotation.y = 0;
  }

  function collides(x, z) {
    if (Math.abs(x) > half + 22 || Math.abs(z) > half + 22) return true;
    const onRoad = roadLines.some((p) => Math.abs(x - p) < city.road / 2 + 3 || Math.abs(z - p) < city.road / 2 + 3);
    if (onRoad) return false;
    for (const b of collisionBoxes) if (Math.abs(x - b.x) < b.w && Math.abs(z - b.z) < b.d) return true;
    return false;
  }

  function updateTraffic(dt) {
    for (const t of traffic) {
      if (!t.mesh) continue;
      t.phase += t.direction * t.speed * dt;
      if (t.phase > half + 34) t.phase = -half - 34;
      if (t.phase < -half - 34) t.phase = half + 34;
      if (t.ns) { t.mesh.position.set(t.line + t.offset, 0, t.phase); t.mesh.rotation.y = t.direction > 0 ? Math.PI : 0; }
      else { t.mesh.position.set(t.phase, 0, t.line + t.offset); t.mesh.rotation.y = t.direction > 0 ? -Math.PI / 2 : Math.PI / 2; }
      const dx = t.mesh.position.x - car.x, dz = t.mesh.position.z - car.z;
      if (Math.hypot(dx, dz) < 4.4 && Math.abs(car.speed) > 9 && collisionCooldown <= 0) {
        car.speed *= -0.18; wanted = Math.min(5, wanted + 0.18); collisionCooldown = 0.9;
        showToast('TRAFFIC COLLISION  ·  PATROL ALERT', 1.8);
      }
    }
  }

  function updatePolice(dt) {
    if (wanted <= 0) {
      for (const cop of police) cop.mesh.visible = false;
      police.length = 0;
      return;
    }
    const targetCount = Math.min(3, Math.ceil(wanted / 1.8));
    while (police.length < targetCount) spawnPolice();
    while (police.length > targetCount) {
      const retiring = police.pop();
      retiring.mesh.visible = false; retiring.speed = 0;
    }
    let closest = Infinity;
    for (let i = police.length - 1; i >= 0; i--) {
      const cop = police[i], p = cop.mesh.position;
      const dx = car.x - p.x, dz = car.z - p.z, dist = Math.hypot(dx, dz); closest = Math.min(closest, dist);
      const targetYaw = Math.atan2(-dx, -dz);
      let deltaYaw = ((targetYaw - cop.mesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      cop.mesh.rotation.y += THREE.MathUtils.clamp(deltaYaw, -2.1 * dt, 2.1 * dt);
      cop.speed = THREE.MathUtils.damp(cop.speed, 19 + wanted * 2.8, 1.2, dt);
      p.x -= Math.sin(cop.mesh.rotation.y) * cop.speed * dt;
      p.z -= Math.cos(cop.mesh.rotation.y) * cop.speed * dt;
      const siren = cop.siren;
      if (siren) siren.material.emissiveIntensity = 1.0 + Math.max(0, Math.sin(performance.now() * 0.019)) * 3.4;
      if (dist < 4.8 && collisionCooldown <= 0) {
        cash = Math.max(0, cash - 100); wanted = Math.max(0, wanted - 1); collisionCooldown = 2.2;
        p.x += Math.cos(cop.mesh.rotation.y) * 28; p.z += Math.sin(cop.mesh.rotation.y) * 28;
        showToast('POLICE STOP  ·  $100 FINE', 2.1);
      }
    }
    if (closest > 165) wantedCool += dt; else wantedCool = 0;
    if (wantedCool > 18) { wanted = Math.max(0, wanted - 0.35); wantedCool = 0; }
  }

  function updatePlayer(dt) {
    const forward = keys.has('w') || keys.has('arrowup');
    const reverse = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');
    const handbrake = keys.has(' ');
    const throttle = (forward ? 1 : 0) - (reverse ? 1 : 0);
    const steeringInput = (right ? 1 : 0) - (left ? 1 : 0);
    const max = throttle < 0 ? 19 : 42;
    if (throttle) car.speed += throttle * (throttle > 0 ? 17 : 24) * dt;
    car.speed *= Math.max(0, 1 - (handbrake ? 2.1 : 0.44) * dt);
    if (!throttle) car.speed = THREE.MathUtils.damp(car.speed, 0, 0.16, dt);
    car.speed = THREE.MathUtils.clamp(car.speed, -max * 0.48, max);
    const speedFactor = THREE.MathUtils.clamp(Math.abs(car.speed) / 8, 0, 1);
    car.steer = THREE.MathUtils.damp(car.steer, steeringInput, 4.8, dt);
    const drift = handbrake ? 1.52 : 1;
    car.yaw -= car.steer * speedFactor * dt * (1.55 + Math.min(0.8, Math.abs(car.speed) * 0.017)) * Math.sign(car.speed || 1) * drift;
    car.lateralSpeed += car.steer * Math.abs(car.speed) / 40 * (handbrake ? 3.2 : 0.75) * dt;
    car.lateralSpeed *= Math.exp(-(handbrake ? 0.85 : 5.4) * dt);
    const oldX = car.x, oldZ = car.z;
    const moveX = (-Math.sin(car.yaw) * car.speed + Math.cos(car.yaw) * car.lateralSpeed) * dt;
    const moveZ = (-Math.cos(car.yaw) * car.speed - Math.sin(car.yaw) * car.lateralSpeed) * dt;
    const blockedX = collides(oldX + moveX, oldZ);
    const blockedZ = collides(oldX, oldZ + moveZ);
    car.x = blockedX ? oldX : oldX + moveX;
    car.z = blockedZ ? oldZ : oldZ + moveZ;
    if ((blockedX || blockedZ) && Math.abs(car.speed) > 3 && collisionCooldown <= 0) {
      car.speed *= -0.12; wanted = Math.min(5, wanted + 0.1); collisionCooldown = 0.65;
      showToast('CURB HIT  ·  WATCH THE ROAD', 1.25);
    } else if (blockedX || blockedZ) car.speed *= 0.68;
    car.wheelSpin += car.speed * dt / 0.47;
    playerCar.position.set(car.x, 0, car.z);
    playerCar.rotation.y = car.yaw;
    playerCar.rotation.z = -car.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 40, 0, 1) * 0.045;
    playerCar.userData.shell.position.y = Math.sin(performance.now() * 0.009) * Math.min(0.04, Math.abs(car.speed) * 0.0012);
    for (const w of playerCar.userData.wheels) {
      if (w.front) w.pivot.rotation.y = car.steer * 0.33;
      w.tire.rotation.x = car.wheelSpin;
    }
  }

  function updateCamera(dt) {
    const yaw = playerCar.rotation.y;
    const behind = new THREE.Vector3(0, 5.6, 13.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const desired = new THREE.Vector3(car.x, 0, car.z).add(behind);
    camera.position.lerp(desired, 1 - Math.exp(-3.8 * dt));
    const look = new THREE.Vector3(car.x, 1.2, car.z).add(new THREE.Vector3(0, 0.1, -4.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    camera.lookAt(look);
    camera.fov = THREE.MathUtils.damp(camera.fov, 64 + Math.min(9, Math.abs(car.speed) * 0.2), 2.6, dt);
    camera.updateProjectionMatrix();
  }

  function drawMinimap() {
    if (!mapCtx || !mapCanvas) return;
    const cssW = mapCanvas.clientWidth || 164, cssH = mapCanvas.clientHeight || 164;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (mapCanvas.width !== Math.round(cssW * dpr) || mapCanvas.height !== Math.round(cssH * dpr)) { mapCanvas.width = cssW * dpr; mapCanvas.height = cssH * dpr; }
    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW, h = cssH, scale = Math.min(w, h) / worldSize;
    mapCtx.fillStyle = '#0c171d'; mapCtx.fillRect(0, 0, w, h);
    const mx = (x) => w / 2 + x * scale, mz = (z) => h / 2 + z * scale;
    mapCtx.fillStyle = '#46514e'; mapCtx.fillRect(mx(-half), mz(-half), city.blocks * city.spacing * scale, city.blocks * city.spacing * scale);
    mapCtx.fillStyle = '#697675';
    for (const p of roadLines) { const qx = mx(p), qz = mz(p); mapCtx.fillRect(qx - city.road * scale / 2, 0, city.road * scale, h); mapCtx.fillRect(0, qz - city.road * scale / 2, w, city.road * scale); }
    mapCtx.fillStyle = '#487457';
    for (let z = 4; z < city.blocks; z++) { const x = -half + city.spacing / 2, bz = -half + (z + 0.5) * city.spacing; mapCtx.fillRect(mx(x - 28), mz(bz - 28), 56 * scale, 56 * scale); }
    const m = missions[missionIndex]; mapCtx.fillStyle = '#63e8d2'; mapCtx.beginPath(); mapCtx.arc(mx(m.x), mz(m.z), 4.5, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.save(); mapCtx.translate(mx(car.x), mz(car.z)); mapCtx.rotate(-car.yaw); mapCtx.fillStyle = '#fff0b4'; mapCtx.beginPath(); mapCtx.moveTo(0, -7); mapCtx.lineTo(4.3, 4.2); mapCtx.lineTo(-4.3, 4.2); mapCtx.closePath(); mapCtx.fill(); mapCtx.restore();
    mapCtx.strokeStyle = 'rgba(104,230,210,.75)'; mapCtx.lineWidth = 1; mapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  function render() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.04);
    if (!paused) {
      updatePlayer(dt);
      updateTraffic(dt);
      updatePolice(dt);
      if (collisionCooldown > 0) collisionCooldown -= dt;
      const pulse = 1 + Math.sin(performance.now() * 0.0035) * 0.12;
      marker.scale.setScalar(pulse);
      marker.children[1].material.opacity = 0.12 + Math.sin(performance.now() * 0.004) * 0.045;
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0 && toastNode) toastNode.classList.remove('show'); }
    }
    const engineLevel = paused ? 0 : Math.min(1, Math.abs(car.speed) / 42);
    if (Math.abs(engineLevel - lastAudioSpeed) > 0.025) { setEngine(engineLevel); lastAudioSpeed = engineLevel; }
    const sirenActive = !paused && wanted > 0 && police.length > 0;
    if (sirenActive !== lastAudioSiren) { setSiren(sirenActive); lastAudioSiren = sirenActive; }
    updateCamera(dt);
    updateHUD();
    drawMinimap();
    renderer.render(scene, camera);
    frameHandle = requestAnimationFrame(render);
  }

  function setVisible(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    node.classList.toggle('hidden', !visible);
    node.setAttribute('aria-hidden', String(!visible));
  }
  function begin() {
    started = true; paused = false;
    setVisible(intro, false); setVisible(pausePanel, false);
    initAudio().then(() => { lastAudioSpeed = -1; }).catch(() => {});
    if (statusNode) statusNode.textContent = 'WASD / ARROWS · DRIVE   SPACE · HANDBRAKE   E · DELIVER   ESC · PAUSE';
  }
  function togglePause() {
    if (!started) return;
    paused = !paused;
    setVisible(pausePanel, paused);
    if (!paused) setVisible(intro, false);
  }
  const onKeyDown = (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    keys.add(key);
    if (key === 'e' && !event.repeat && started && !paused) completeMission();
    if (key === 'escape' && !event.repeat) { if (!started) return; togglePause(); }
  };
  const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
  const onBlur = () => keys.clear();
  const onResize = () => {
    const width = window.innerWidth, height = window.innerHeight;
    camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false);
  };
  const onStart = (event) => { event?.preventDefault?.(); begin(); };
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  startButton?.addEventListener('click', onStart);
  const onResume = (event) => { event?.preventDefault?.(); if (started && paused) togglePause(); };
  resumeButton?.addEventListener('click', onResume);
  if (intro) setVisible(intro, true);
  if (pausePanel) setVisible(pausePanel, false);
  updateHUD();
  frameHandle = requestAnimationFrame(render);

  return {
    scene, camera, renderer,
    dispose() {
      disposed = true; cancelAnimationFrame(frameHandle);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      startButton?.removeEventListener('click', onStart);
      resumeButton?.removeEventListener('click', onResume);
      cleanupAudio();
      renderer.dispose();
      scene.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); } });
    },
  };
}
