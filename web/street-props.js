// Reusable procedural street furniture for Nightshift: District Run.
// Adds low-cost instanced lamp pools, bus shelters, benches and planters.
export function addStreetProps({ THREE, scene, city, roadLines, half }) {
  const group = new THREE.Group();
  group.name = 'Street furniture and warm lamp pools';
  const metallic = new THREE.MeshStandardMaterial({ color: 0x334047, roughness: 0.48, metalness: 0.58 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x35434a, roughness: 0.42, metalness: 0.46 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fc8c6, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  const benchWood = new THREE.MeshStandardMaterial({ color: 0x987354, roughness: 0.74, metalness: 0.04 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x616b68, roughness: 0.9, metalness: 0.02 });
  const leaves = new THREE.MeshStandardMaterial({ color: 0x477557, roughness: 0.88, metalness: 0.02 });
  const glowOuter = new THREE.MeshBasicMaterial({ color: 0xffc778, transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const glowInner = new THREE.MeshBasicMaterial({ color: 0xffd998, transparent: true, opacity: 0.055, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

  function instances(name, geometry, material, transforms) {
    if (!transforms.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name;
    mesh.castShadow = material !== glowOuter && material !== glowInner;
    mesh.receiveShadow = mesh.castShadow;
    const temp = new THREE.Object3D();
    transforms.forEach((t, i) => {
      temp.position.set(t.x, t.y, t.z);
      temp.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      temp.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  // Warm overlapping discs make existing streetlights visibly affect the pavement.
  const outer = [], inner = [];
  for (const x of roadLines) for (let z = -half + 32; z < half; z += 78) {
    for (const side of [-1, 1]) {
      const lx = x + side * (city.road / 2 + 6);
      outer.push({ x: lx, y: 0.024, z, rx: -Math.PI / 2 });
      inner.push({ x: lx, y: 0.03, z, rx: -Math.PI / 2 });
    }
  }
  instances('Soft amber streetlight spill', new THREE.CircleGeometry(9.5, 24), glowOuter, outer);
  instances('Streetlight center glow', new THREE.CircleGeometry(4.4, 20), glowInner, inner);

  // Place shelters on a few prominent avenues, away from intersections and building lots.
  const stops = [];
  const xRoads = [2, 4, 6];
  const zSegments = [0, 3, 6];
  for (const xi of xRoads) for (const zi of zSegments) {
    const xRoad = roadLines[xi];
    const z = (roadLines[zi] + roadLines[zi + 1]) / 2;
    for (const side of [-1, 1]) stops.push({ x: xRoad + side * (city.road / 2 + 2.5), z, side });
  }

  const roof = [], backGlass = [], posts = [], seats = [], seatBacks = [], planterBoxes = [], shrubs = [], bins = [];
  const postOffsets = [[-2.02, -3.55], [-2.02, 3.55], [2.02, -3.55], [2.02, 3.55]];
  for (const stop of stops) {
    roof.push({ x: stop.x, y: 3.0, z: stop.z });
    // The glass wall sits on the outside edge of the pavement; the road-facing side stays open.
    backGlass.push({ x: stop.x + stop.side * 1.55, y: 1.48, z: stop.z });
    for (const [ox, oz] of postOffsets) posts.push({ x: stop.x + ox, y: 1.48, z: stop.z + oz });
    seats.push({ x: stop.x, y: 0.64, z: stop.z + 0.35 });
    seatBacks.push({ x: stop.x + stop.side * 0.72, y: 1.05, z: stop.z + 0.35, rz: -stop.side * 0.06 });
    for (const offset of [-5.15, 5.15]) {
      planterBoxes.push({ x: stop.x, y: 0.38, z: stop.z + offset });
      for (let i = 0; i < 3; i++) shrubs.push({ x: stop.x - 0.55 + i * 0.55, y: 0.9 + (i % 2) * 0.08, z: stop.z + offset });
    }
    bins.push({ x: stop.x - stop.side * 1.6, y: 0.55, z: stop.z - 3.5 });
  }

  instances('Bus shelter canopy', new THREE.BoxGeometry(4.35, 0.17, 7.8), roofMat, roof);
  instances('Shelter glazing', new THREE.BoxGeometry(0.055, 2.25, 7.15), glass, backGlass);
  instances('Shelter steel posts', new THREE.BoxGeometry(0.13, 2.9, 0.13), metallic, posts);
  instances('Bench seats', new THREE.BoxGeometry(2.5, 0.16, 1.05), benchWood, seats);
  instances('Bench backs', new THREE.BoxGeometry(0.13, 0.77, 1.05), benchWood, seatBacks);
  instances('Concrete planter troughs', new THREE.BoxGeometry(1.05, 0.68, 1.9), concrete, planterBoxes);
  instances('Shelter shrubs', new THREE.DodecahedronGeometry(0.52, 0), leaves, shrubs);
  instances('Street bins', new THREE.CylinderGeometry(0.25, 0.31, 1.1, 8), metallic, bins);

  scene.add(group);
  return group;
}
