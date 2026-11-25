// Batched road paint for the procedural orthogonal district.
// Call once after the asphalt planes have been added to the scene.
export function buildRoadDetails({ THREE, scene, city, roadLines, half }) {
  if (!THREE || !scene || !city || !Array.isArray(roadLines)) return null;

  const roadWidth = city.road;
  const stripeCount = 8;
  const stripeSpacing = 1.12;
  const crosswalkCount = roadLines.length * roadLines.length * 4 * stripeCount;
  const stopBarCount = roadLines.length * roadLines.length * 4;
  const paint = new THREE.MeshBasicMaterial({ color: 0xd9d4c5, toneMapped: false });
  const amberPaint = new THREE.MeshBasicMaterial({ color: 0xd1a85c, toneMapped: false });
  const white = new THREE.InstancedMesh(
    new THREE.BoxGeometry(roadWidth - 4.2, 0.045, 0.72), paint, crosswalkCount,
  );
  const stopBars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(roadWidth - 4, 0.05, 0.48), paint, stopBarCount,
  );
  const laneDashGeometry = new THREE.BoxGeometry(0.14, 0.035, 4.2);
  const laneDashesNS = new THREE.InstancedMesh(laneDashGeometry, paint, roadLines.length * 2 * 80);
  const laneDashesEW = new THREE.InstancedMesh(
    new THREE.BoxGeometry(4.2, 0.035, 0.14), paint, roadLines.length * 2 * 80,
  );
  const centerGeometry = new THREE.BoxGeometry(0.16, 0.04, 5.1);
  const centerYellowNS = new THREE.InstancedMesh(centerGeometry, amberPaint, roadLines.length * 2 * 80);
  const centerYellowEW = new THREE.InstancedMesh(
    new THREE.BoxGeometry(5.1, 0.04, 0.16), amberPaint, roadLines.length * 2 * 80,
  );
  const temp = new THREE.Object3D();
  const y = 0.092;
  let crossIndex = 0;
  let stopIndex = 0;
  const set = (mesh, index, x, z, sx = 1, sz = 1, yaw = 0) => {
    temp.position.set(x, y, z);
    temp.rotation.set(0, yaw, 0);
    temp.scale.set(sx, 1, sz);
    temp.updateMatrix();
    mesh.setMatrixAt(index, temp.matrix);
  };

  // Four pedestrian crossings around every junction, with a clean buffer
  // between the bars and the stop line.
  const crossingOffset = roadWidth / 2 - 4.7;
  for (const x of roadLines) for (const z of roadLines) {
    for (const side of [-1, 1]) {
      const crossZ = z + side * crossingOffset;
      for (let stripe = 0; stripe < stripeCount; stripe++) {
        const dz = (stripe - (stripeCount - 1) / 2) * stripeSpacing;
        set(white, crossIndex++, x, crossZ + dz);
      }
      const crossX = x + side * crossingOffset;
      for (let stripe = 0; stripe < stripeCount; stripe++) {
        const dx = (stripe - (stripeCount - 1) / 2) * stripeSpacing;
        set(white, crossIndex++, crossX + dx, z, 1, 1, Math.PI / 2);
      }
    }
    // Stop bars sit just inside each approach, behind the pedestrian crossing.
    for (const side of [-1, 1]) {
      set(stopBars, stopIndex++, x, z + side * 5.25);
      set(stopBars, stopIndex++, x + side * 5.25, z, 1, 1, Math.PI / 2);
    }
  }
  white.count = crossIndex;
  stopBars.count = stopIndex;

  // Dashed lane dividers and double-amber centerlines. Leave each junction
  // open so markings do not run through the crosswalks.
  let nsIndex = 0, ewIndex = 0, yellowNSIndex = 0, yellowEWIndex = 0;
  const laneOffset = 6.5;
  const nearJunction = (position) => roadLines.some((line) => Math.abs(position - line) < 15.5);
  for (const line of roadLines) {
    for (const side of [-1, 1]) {
      for (let p = -half + 8; p <= half - 8; p += 14) {
        if (nearJunction(p)) continue;
        set(laneDashesNS, nsIndex++, line + side * laneOffset, p, 1, 1);
        // EW geometry is already long along X, the direction of travel.
        set(laneDashesEW, ewIndex++, p, line + side * laneOffset);
      }
    }
    for (let p = -half + 8; p <= half - 8; p += 16) {
      if (nearJunction(p)) continue;
      set(centerYellowNS, yellowNSIndex++, line - 0.28, p);
      set(centerYellowNS, yellowNSIndex++, line + 0.28, p);
      set(centerYellowEW, yellowEWIndex++, p, line - 0.28);
      set(centerYellowEW, yellowEWIndex++, p, line + 0.28);
    }
  }
  laneDashesNS.count = nsIndex;
  laneDashesEW.count = ewIndex;
  centerYellowNS.count = yellowNSIndex;
  centerYellowEW.count = yellowEWIndex;

  // Turn arrows mark a subset of junction approaches rather than repeating
  // everywhere. Shape coordinates are laid flat in the XZ plane.
  const makeTurnArrow = (mirror = false) => {
    const s = new THREE.Shape();
    const p = mirror ? -1 : 1;
    s.moveTo(-0.34, -4.2); s.lineTo(0.34, -4.2); s.lineTo(0.34, 0.35);
    s.quadraticCurveTo(0.34, 1.65, p * 1.45, 1.65);
    s.lineTo(p * 2.05, 1.65); s.lineTo(p * 2.05, 0.8);
    s.lineTo(p * 3.5, 2.25); s.lineTo(p * 2.05, 3.7);
    s.lineTo(p * 2.05, 2.75); s.lineTo(p * 1.45, 2.75);
    s.quadraticCurveTo(-0.34, 2.75, -0.34, 0.35); s.closePath();
    const geometry = new THREE.ShapeGeometry(s);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  };
  const rightArrow = new THREE.InstancedMesh(makeTurnArrow(false), amberPaint, roadLines.length ** 2);
  const leftArrow = new THREE.InstancedMesh(makeTurnArrow(true), amberPaint, roadLines.length ** 2);
  let arrowIndex = 0;
  for (let i = 0; i < roadLines.length; i++) for (let j = 0; j < roadLines.length; j++) {
    if ((i + j) % 2 !== 0) continue;
    const x = roadLines[i], z = roadLines[j];
    // South approach: arrows face north, each placed in its own lane.
    set(rightArrow, arrowIndex, x + laneOffset, z + 23, 0.78, 0.78);
    set(leftArrow, arrowIndex, x - laneOffset, z + 23, 0.78, 0.78);
    arrowIndex++;
  }
  rightArrow.count = arrowIndex;
  leftArrow.count = arrowIndex;

  scene.add(white, stopBars, laneDashesNS, laneDashesEW, centerYellowNS, centerYellowEW, rightArrow, leftArrow);
  white.instanceMatrix.needsUpdate = true;
  stopBars.instanceMatrix.needsUpdate = true;
  laneDashesNS.instanceMatrix.needsUpdate = true;
  laneDashesEW.instanceMatrix.needsUpdate = true;
  centerYellowNS.instanceMatrix.needsUpdate = true;
  centerYellowEW.instanceMatrix.needsUpdate = true;
  rightArrow.instanceMatrix.needsUpdate = true;
  leftArrow.instanceMatrix.needsUpdate = true;

  return { white, stopBars, laneDashesNS, laneDashesEW, centerYellowNS, centerYellowEW, rightArrow, leftArrow };
}
