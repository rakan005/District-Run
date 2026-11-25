import { initAudio, setEngine, setSiren, playDelivery, cleanupAudio } from './audio.js?v=3';

// Perspective Canvas fallback for browsers where WebGL is unavailable.
export function startFallback() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d', { alpha: false });
  const map = $('map'), mapCtx = map?.getContext('2d');
  const intro = $('intro'), pausePanel = $('pause'), status = $('status'), toast = $('toast');
  const startButton = $('start'), resumeButton = $('resume');
  const N = 7, SP = 150, ROAD = 30, HALF = N * SP / 2, SIZE = N * SP + 100;
  const roads = Array.from({ length: N + 1 }, (_, i) => -HALF + i * SP);
  const keys = new Set(), buildings = [], traffic = [], cops = [], missionPoints = [
    [75, 375, 'THE LAST-MINUTE PARCEL', 450], [225, 75, 'A QUIET PICKUP', 650],
    [375, -375, 'BAYFRONT RUN', 900], [-375, -225, 'NIGHT MARKET DROP', 1250], [75, 375, 'ONE MORE FAVOR', 1600],
  ];
  let W = 0, H = 0, DPR = 1, cash = 250, heat = 0, missionIndex = 0, paused = true, started = false;
  let timer = 0, crashCooldown = 0, clearHeat = 0, audioSpeed = -1, sirenOn = false;
  let seed = 82917;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const car = { x: 75, z: HALF - 31, yaw: 0, speed: 0, lateralSpeed: 0, steer: 0 };
  const colors = ['#566d77','#a66e60','#7d8285','#6c7d93','#b49a79','#537267','#826c79','#8e765f'];
  const bound = (v, a, b) => Math.max(a, Math.min(b, v));
  const angle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  function resize() { W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 1.4); canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  addEventListener('resize', resize); resize();

  // Deterministic blocks and recognizable plaza / park give the perspective renderer a clear skyline.
  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
    const cx = -HALF + (bx + 0.5) * SP, cz = -HALF + (bz + 0.5) * SP;
    if (bx === 3 && bz === 3) { buildings.push({ kind: 'plaza', x: cx, z: cz, w: 58, d: 58 }); continue; }
    if (bx === 0 && bz >= 4) {
      buildings.push({ kind: 'park', x: cx, z: cz, w: 58, d: 58 });
      for (let i = 0; i < 6; i++) buildings.push({ kind: 'tree', x: cx + (rand() - .5) * 40, z: cz + (rand() - .5) * 40, w: 7, d: 7, h: 16 + rand() * 5 });
      continue;
    }
    const lots = [[-25,-25], [24,-25], [-25,24], [24,24]];
    for (const [ox, oz] of lots) {
      if (rand() < .17) continue;
      const w = 19 + rand() * 9, d = 19 + rand() * 9;
      let h = 19 + rand() * 45; if (bx >= 2 && bx <= 4 && bz >= 2 && bz <= 4) h *= 1.38;
      buildings.push({ kind: 'building', x: cx + ox + (rand() - .5) * 7, z: cz + oz + (rand() - .5) * 7, w, d, h, color: colors[Math.floor(rand() * colors.length)], seed: rand() });
    }
  }
  const trafficColors = ['#cbc7bd','#427688','#c39458','#687a6b','#bec5c5','#756476'];
  for (let i = 0; i < 16; i++) {
    const ns = i % 2 === 0, line = roads[Math.floor(rand() * roads.length)], dir = rand() > .5 ? 1 : -1;
    traffic.push({ kind: 'car', x: ns ? line + (dir > 0 ? -5 : 5) : 0, z: ns ? 0 : line + (dir > 0 ? 5 : -5), ns, line, dir, phase: (rand() - .5) * SIZE, speed: 12 + rand() * 8, color: trafficColors[i % trafficColors.length] });
  }
  function mission() { return missionPoints[missionIndex]; }
  function cameraBasis() {
    const forwardX = -Math.sin(car.yaw), forwardZ = -Math.cos(car.yaw);
    const cx = car.x - forwardX * 15, cy = 7.4, cz = car.z - forwardZ * 15;
    const tx = car.x + forwardX * 5, ty = 1.0, tz = car.z + forwardZ * 5;
    let fx = tx - cx, fy = ty - cy, fz = tz - cz; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, ry = 0, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    return { cx, cy, cz, fx, fy, fz, rx, ry, rz, ux, uy, uz, focal: H * (1.04 + Math.min(.14, Math.abs(car.speed) * .002)) };
  }
  function project(x, y, z, cam) {
    const dx = x - cam.cx, dy = y - cam.cy, dz = z - cam.cz;
    const depth = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (depth < .6) return null;
    return { x: W / 2 + (dx * cam.rx + dy * cam.ry + dz * cam.rz) * cam.focal / depth, y: H * .425 - (dx * cam.ux + dy * cam.uy + dz * cam.uz) * cam.focal / depth, d: depth };
  }
  function poly(points, color, alpha = 1) {
    const pts = points.filter(Boolean); if (pts.length < 3) return;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  function face(points, cam, color) { poly(points.map(p => project(p[0], p[1], p[2], cam)), color); }
  function worldBox(o, cam, color, yaw = 0) {
    const { x, z, w, d, h } = o, base = o.kind === 'car' ? .2 : 0;
    const corners = [];
    for (const y of [base, base + h]) for (const lx of [-w / 2, w / 2]) for (const lz of [-d / 2, d / 2]) {
      corners.push([x + lx * Math.cos(yaw) - lz * Math.sin(yaw), y, z + lx * Math.sin(yaw) + lz * Math.cos(yaw)]);
    }
    const q = (i) => corners[i];
    const faces = [
      { points: [q(0),q(1),q(5),q(4)], shade: .56 }, { points: [q(2),q(3),q(7),q(6)], shade: .69 },
      { points: [q(0),q(2),q(6),q(4)], shade: .75 }, { points: [q(1),q(3),q(7),q(5)], shade: .47 },
      { points: [q(4),q(5),q(7),q(6)], shade: 1.05 }, { points: [q(0),q(1),q(3),q(2)], shade: .39 },
    ];
    const cameraDeltaX = cam.cx - x, cameraDeltaZ = cam.cz - z;
    faces.sort((a,b) => ((b.points.reduce((s,p)=>s+Math.hypot(p[0]-cam.cx,p[2]-cam.cz),0)/4) - (a.points.reduce((s,p)=>s+Math.hypot(p[0]-cam.cx,p[2]-cam.cz),0)/4)));
    for (const f of faces) {
      const shade = f.shade; const rgb = color.match(/[\da-f]{2}/gi)?.map(v => parseInt(v,16)) || [100,100,100];
      poly(f.points.map(p=>project(p[0],p[1],p[2],cam)), `rgb(${bound(rgb[0]*shade,0,255)|0},${bound(rgb[1]*shade,0,255)|0},${bound(rgb[2]*shade,0,255)|0})`);
    }
    if (o.kind === 'building') drawWindows(o, cam, cameraDeltaX, cameraDeltaZ);
    if (o.kind === 'car') drawCarDetails(o, cam, yaw);
  }
  function drawWindows(b, cam, dx, dz) {
    const rows = Math.min(7, Math.floor(b.h / 7)); if (rows < 2) return;
    const onZFace = Math.abs(dz) >= Math.abs(dx);
    const zFace = b.z + Math.sign(dz || 1) * (b.d / 2 + .08), xFace = b.x + Math.sign(dx || 1) * (b.w / 2 + .08);
    const cols = 3, wid = Math.min(2.1,b.w*.19), hi = 1.2;
    for (let r = 1; r <= rows; r++) for (let c = 0; c < cols; c++) {
      if ((Math.floor(b.seed * 997) + r * 17 + c * 13) % 8 === 0) continue;
      const y = r * b.h / (rows + 1), wx = b.x - b.w*.29 + c*b.w*.29, wz = b.z - b.d*.29 + c*b.d*.29;
      const glow = (r+c+Math.floor(b.seed*8))%5===0 ? '#82d9df' : '#ffd38a';
      let pts;
      if (onZFace) { const zz=zFace; pts=[[wx-wid/2,y-hi/2,zz],[wx+wid/2,y-hi/2,zz],[wx+wid/2,y+hi/2,zz],[wx-wid/2,y+hi/2,zz]]; }
      else { const xx=xFace; pts=[[xx,y-hi/2,wz-wid/2],[xx,y-hi/2,wz+wid/2],[xx,y+hi/2,wz+wid/2],[xx,y+hi/2,wz-wid/2]]; }
      ctx.shadowColor=glow;ctx.shadowBlur=5;face(pts,cam,glow);ctx.shadowBlur=0;
    }
  }
  function drawCarDetails(o, cam, yaw) {
    const local = (lx,ly,lz) => [o.x+lx*Math.cos(yaw)-lz*Math.sin(yaw),ly,o.z+lx*Math.sin(yaw)+lz*Math.cos(yaw)];
    const cab = [local(-.67,1.2,-.18),local(.67,1.2,-.18),local(.53,1.98,.45),local(-.53,1.98,.45)];
    face(cab,cam,'#203944');
    const hood = [local(-.78,1.0,-1.9),local(.78,1.0,-1.9),local(.63,1.02,-.8),local(-.63,1.02,-.8)];
    face(hood,cam,o.color||'#b74937');
    // Rear glass and side windows make the low-poly fallback car read as a coupe.
    face([local(-.5,1.76,.42),local(.5,1.76,.42),local(.59,1.23,.93),local(-.59,1.23,.93)],cam,'#122731');
    for (const side of [-1,1]) {
      const x=side*.79;
      face([local(x,1.27,-.68),local(x,1.27,-.05),local(x*.78,1.72,-.08),local(x*.78,1.72,-.53)],cam,'#42616a');
      face([local(x,1.27,.04),local(x,1.27,.62),local(x*.78,1.72,.49),local(x*.78,1.72,-.03)],cam,'#29434c');
      face([local(side*.94,.72,-.9),local(side*.94,.72,.9),local(side*1.01,.72,.9),local(side*1.01,.72,-.9)],cam,'#171d21');
      const mirror=project(...local(side*1.1,1.36,-.58),cam);
      if(mirror){ctx.fillStyle='#9ca8a2';ctx.beginPath();ctx.arc(mirror.x,mirror.y,2.3,0,Math.PI*2);ctx.fill();}
    }
    const drawWheel=(x,z)=>{
      const c=project(...local(x,.48,z),cam), edge=project(...local(x+.4,.48,z),cam), top=project(...local(x,.88,z),cam);
      if(!c||!edge||!top)return;
      const rx=Math.max(2,Math.hypot(edge.x-c.x,edge.y-c.y)), ry=Math.max(2,Math.hypot(top.x-c.x,top.y-c.y));
      ctx.fillStyle='#101417';ctx.beginPath();ctx.ellipse(c.x,c.y,rx,ry,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#697478';ctx.lineWidth=Math.max(1,rx*.18);ctx.stroke();
      ctx.fillStyle='#b5b8ad';ctx.beginPath();ctx.ellipse(c.x,c.y,rx*.42,ry*.42,0,0,Math.PI*2);ctx.fill();
    };
    for(const x of [-.96,.96])for(const z of [-1.42,1.42])drawWheel(x,z);
    face([local(-.72,.94,-2.3),local(-.3,.94,-2.3),local(-.32,1.05,-2.3),local(-.7,1.05,-2.3)],cam,'#fff0bd');
    face([local(.3,.94,-2.3),local(.72,.94,-2.3),local(.7,1.05,-2.3),local(.32,1.05,-2.3)],cam,'#fff0bd');
    face([local(-.72,.92,2.3),local(-.3,.92,2.3),local(-.3,1.04,2.3),local(-.72,1.04,2.3)],cam,'#ff4d5e');
    face([local(.3,.92,2.3),local(.72,.92,2.3),local(.72,1.04,2.3),local(.3,1.04,2.3)],cam,'#ff4d5e');
    if (o.police) {
      const p=project(...local(-.26,2.1,-.12),cam), q=project(...local(.26,2.1,-.12),cam);
      if(p&&q){ctx.fillStyle=Math.sin(performance.now()*.018)>0?'#fa344c':'#39bde8';ctx.fillRect(p.x,p.y,Math.max(2,Math.abs(q.x-p.x)),Math.max(2,Math.abs(q.y-p.y)));}
    }
  }
  function drawFlatGround(cam) {
    const edge = HALF + 60;
    face([[-edge,-.08,-edge],[edge,-.08,-edge],[edge,-.08,edge],[-edge,-.08,edge]],cam,'#283940');
    for(const p of roads){
      face([[p-ROAD/2,.015,-edge],[p+ROAD/2,.015,-edge],[p+ROAD/2,.015,edge],[p-ROAD/2,.015,edge]],cam,'#242c33');
      face([[-edge,.016,p-ROAD/2],[edge,.016,p-ROAD/2],[edge,.016,p+ROAD/2],[-edge,.016,p+ROAD/2]],cam,'#242c33');
      for(let t=-HALF+12;t<HALF;t+=30){
        face([[p-.08,.075,t],[p+.08,.075,t],[p+.08,.075,t+7],[p-.08,.075,t+7]],cam,'#d5c89e');
        face([[t,.075,p-.08],[t+7,.075,p-.08],[t+7,.075,p+.08],[t,.075,p+.08]],cam,'#d5c89e');
        face([[p-1.4,.078,t],[p-1.4,.078,t+7],[p-1.24,.078,t+7],[p-1.24,.078,t]],cam,'#d5c89e');
        face([[t,.078,p-1.4],[t+7,.078,p-1.4],[t+7,.078,p-1.24],[t,.078,p-1.24]],cam,'#d5c89e');
      }
      for(const cross of roads){
        if(Math.abs(cross-p)<ROAD)continue;
        for(let k=0;k<5;k++){
          const offset=-10+k*4.5;
          face([[p-12,.08,cross+offset],[p+12,.08,cross+offset],[p+12,.08,cross+offset+1.5],[p-12,.08,cross+offset+1.5]],cam,'#c9c6b7');
          face([[cross+offset,.08,p-12],[cross+offset+1.5,.08,p-12],[cross+offset+1.5,.08,p+12],[cross+offset,.08,p+12]],cam,'#c9c6b7');
        }
      }
      for(const s of [-1,1]){
        const a=p+s*(ROAD/2+2.5);face([[a-2.5,.09,-edge],[a+2.5,.09,-edge],[a+2.5,.09,edge],[a-2.5,.09,edge]],cam,'#777d7b');
        face([[-edge,.09,p+s*(ROAD/2+2.5)-2.5],[edge,.09,p+s*(ROAD/2+2.5)-2.5],[edge,.09,p+s*(ROAD/2+2.5)+2.5],[-edge,.09,p+s*(ROAD/2+2.5)+2.5]],cam,'#777d7b');
      }
    }
    for(const b of buildings){if(b.kind==='park')face([[b.x-b.w/2,.04,b.z-b.d/2],[b.x+b.w/2,.04,b.z-b.d/2],[b.x+b.w/2,.04,b.z+b.d/2],[b.x-b.w/2,.04,b.z+b.d/2]],cam,'#416b52');if(b.kind==='plaza')face([[b.x-b.w/2,.05,b.z-b.d/2],[b.x+b.w/2,.05,b.z-b.d/2],[b.x+b.w/2,.05,b.z+b.d/2],[b.x-b.w/2,.05,b.z+b.d/2]],cam,'#938b7d');}
  }
  function carObj(x,z,yaw,color,police=false){return {kind:'car',x,z,yaw,color,police,w:2.2,d:4.6,h:1.25};}
  function drawMarker(cam){const [x,z]=mission();ctx.save();ctx.shadowColor='#68e6d2';ctx.shadowBlur=18;ctx.strokeStyle='#68e6d2';ctx.lineWidth=3;ctx.beginPath();let n=20;for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,p=project(x+Math.cos(a)*5.4,.32+Math.sin(performance.now()*.003)*.25,z+Math.sin(a)*5.4,cam);if(!p)continue;i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}ctx.stroke();const top=project(x,.5,z,cam),high=project(x,15,z,cam);if(top&&high){ctx.globalAlpha=.12;poly([{x:top.x-4,y:top.y},{x:top.x+4,y:top.y},{x:high.x+2,y:high.y},{x:high.x-2,y:high.y}],'#68e6d2');ctx.globalAlpha=1}ctx.restore();}
  function renderScene(){
    const cam=cameraBasis(), grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#10192a');grad.addColorStop(.48,'#665363');grad.addColorStop(.53,'#303a3e');grad.addColorStop(1,'#172126');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    drawFlatGround(cam);
    const objects=buildings.filter(b=>b.kind==='building'||b.kind==='tree').map(b=>({...b,dist:Math.hypot(b.x-car.x,b.z-car.z)}));
    for(const t of traffic){t.phase+=t.dir*t.speed*(paused?0:1/60);if(t.phase>HALF+35)t.phase=-HALF-35;if(t.phase< -HALF-35)t.phase=HALF+35;t.x=t.ns?t.line+t.dir*5:t.phase;t.z=t.ns?t.phase:t.line-t.dir*5;objects.push({...carObj(t.x,t.z,t.ns?(t.dir>0?Math.PI:0):(t.dir>0?-Math.PI/2:Math.PI/2),t.color),dist:Math.hypot(t.x-car.x,t.z-car.z)});}
    for(const p of cops)objects.push({...carObj(p.x,p.z,p.yaw,'#e7e8e3',true),dist:Math.hypot(p.x-car.x,p.z-car.z)});
    objects.push({...carObj(car.x,car.z,car.yaw,'#b74937'),dist:0});objects.sort((a,b)=>b.dist-a.dist);
    for(const o of objects){if(o.dist>600)continue;if(o.kind==='tree'){worldBox({...o,h:o.h||19},cam,'#775b42');worldBox({x:o.x,y:0,z:o.z,w:11,d:11,h:10},cam,'#4b7b58');}else if(o.kind==='car')worldBox(o,cam,o.color,o.yaw);else worldBox(o,cam,o.color||'#6a7479');}
    drawMarker(cam);
  }
  function collision(x,z){if(Math.abs(x)>HALF+22||Math.abs(z)>HALF+22)return true;const onRoad=roads.some(p=>Math.abs(x-p)<ROAD/2+3||Math.abs(z-p)<ROAD/2+3);if(onRoad)return false;return buildings.some(b=>b.kind==='building'&&Math.abs(x-b.x)<b.w/2+2.7&&Math.abs(z-b.z)<b.d/2+2.7);}
  function update(dt){
    if(!paused){const throttle=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0),steer=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),brake=keys.has(' ');const max=throttle<0?19:42;if(throttle)car.speed+=throttle*(throttle>0?17:24)*dt;car.speed*=Math.max(0,1-(brake?2.1:.44)*dt);if(!throttle)car.speed*=Math.max(0,1-.35*dt);car.speed=bound(car.speed,-max*.48,max);car.steer+=(steer-car.steer)*Math.min(1,dt*4.8);car.yaw=angle(car.yaw-car.steer*bound(Math.abs(car.speed)/8,0,1)*dt*1.75*Math.sign(car.speed||1)*(brake?1.5:1));car.lateralSpeed+=car.steer*Math.abs(car.speed)/40*(brake?3.2:.75)*dt;car.lateralSpeed*=Math.exp(-(brake?.85:5.4)*dt);const ox=car.x,oz=car.z,mx=(-Math.sin(car.yaw)*car.speed+Math.cos(car.yaw)*car.lateralSpeed)*dt,mz=(-Math.cos(car.yaw)*car.speed-Math.sin(car.yaw)*car.lateralSpeed)*dt,bx=collision(ox+mx,oz),bz=collision(ox,oz+mz);car.x=bx?ox:ox+mx;car.z=bz?oz:oz+mz;if(bx||bz){car.speed*=Math.abs(car.speed)>3?-.12:.68;if(crashCooldown<=0){heat=Math.min(5,heat+.1);crashCooldown=.65;notify('CURB HIT · WATCH THE ROAD')}}if(crashCooldown>0)crashCooldown-=dt;
      for(const t of traffic){const tx=t.ns?t.line+t.dir*5:t.phase,tz=t.ns?t.phase:t.line-t.dir*5;if(Math.hypot(tx-car.x,tz-car.z)<4.4&&Math.abs(car.speed)>9&&crashCooldown<=0){car.speed*= -.18;heat=Math.min(5,heat+.18);crashCooldown=.9;notify('TRAFFIC COLLISION · PATROL ALERT')}}
      for(const cop of cops){const dx=car.x-cop.x,dz=car.z-cop.z;const target=Math.atan2(-dx,-dz);cop.yaw=angle(cop.yaw+bound(angle(target-cop.yaw),-2.1*dt,2.1*dt));cop.x-=Math.sin(cop.yaw)*cop.speed*dt;cop.z-=Math.cos(cop.yaw)*cop.speed*dt;if(Math.hypot(dx,dz)<5&&crashCooldown<=0){cash=Math.max(0,cash-100);heat=Math.max(0,heat-1);crashCooldown=2;notify('POLICE STOP · $100 FINE')}}
      if(heat>0){if(cops.every(c=>Math.hypot(c.x-car.x,c.z-car.z)>165))clearHeat+=dt;else clearHeat=0;if(clearHeat>18){heat=Math.max(0,heat-.35);clearHeat=0}}
    }
    renderScene();updateHUD();drawMap();setEngine(paused?0:Math.min(1,Math.abs(car.speed)/42));setSiren(!paused&&heat>0&&cops.length>0);
  }
  function updateHUD(){const m=mission(),dist=Math.round(Math.hypot(m[0]-car.x,m[1]-car.z));$('missionTitle').textContent=m[2];$('missionDesc').textContent=`Drive to the glowing marker · ${dist} m away · press E to deliver`;$('contractNo').textContent=String(missionIndex+1).padStart(2,'0');$('reward').textContent=`$${m[3]}`;$('cash').textContent=`$ ${String(cash).padStart(6,'0')}`;$('heat').textContent=`PATROL HEAT  ${Array.from({length:5},(_,i)=>i<Math.ceil(heat)?'◆':'◇').join(' ')}`;$('speed').textContent=String(Math.round(Math.abs(car.speed)*3.6)).padStart(3,'0');}
  function drawMap(){if(!mapCtx)return;const w=map.width,h=map.height,s=Math.min(w,h)/(SIZE);mapCtx.clearRect(0,0,w,h);mapCtx.fillStyle='#0d171d';mapCtx.fillRect(0,0,w,h);const mx=x=>w/2+x*s,mz=z=>h/2+z*s;mapCtx.fillStyle='#465450';mapCtx.fillRect(mx(-HALF),mz(-HALF),N*SP*s,N*SP*s);mapCtx.fillStyle='#707a77';for(const r of roads){mapCtx.fillRect(mx(r-ROAD/2),0,ROAD*s,h);mapCtx.fillRect(0,mz(r-ROAD/2),w,ROAD*s)}const m=mission();mapCtx.fillStyle='#68e6d2';mapCtx.beginPath();mapCtx.arc(mx(m[0]),mz(m[1]),7,0,Math.PI*2);mapCtx.fill();mapCtx.fillStyle='#fff0b4';mapCtx.beginPath();mapCtx.arc(mx(car.x),mz(car.z),7,0,Math.PI*2);mapCtx.fill();}
  function notify(text){toast.textContent=text;toast.classList.add('show');timer=2.5;}
  function deliver(){const m=mission();if(Math.hypot(m[0]-car.x,m[1]-car.z)>12){notify('MOVE CLOSER TO THE DROP');return}cash+=m[3];heat=Math.min(5,heat+.75);playDelivery();missionIndex=(missionIndex+1)%missionPoints.length;notify(`DELIVERY COMPLETE · +$${m[3]}`);$('flash').classList.add('on');setTimeout(()=>$('flash').classList.remove('on'),240);while(cops.length<Math.min(3,Math.ceil(heat/1.8)))spawnCop();}
  function spawnCop(){const p={x:car.x+(rand()-.5)*170,z:car.z+(rand()-.5)*170,yaw:0,speed:20};cops.push(p);}
  function setVisible(n,v){if(!n)return;n.hidden=!v;n.classList.toggle('hidden',!v);}
  function begin(){started=true;paused=false;setVisible(intro,false);setVisible(pausePanel,false);initAudio().then(()=>{audioSpeed=-1}).catch(()=>{});status.textContent='WASD / ARROWS · DRIVE   SPACE · HANDBRAKE   E · DELIVER   ESC · PAUSE';}
  function pause(){if(!started)return;paused=!paused;setVisible(pausePanel,paused);}
  function onKeyDown(e){const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();keys.add(k);if(k==='e'&&!e.repeat&&started&&!paused)deliver();if(k==='escape'&&!e.repeat&&started)pause();}
  function onKeyUp(e){keys.delete(e.key.toLowerCase());}function onBlur(){keys.clear();}
  startButton.addEventListener('click',begin);resumeButton.addEventListener('click',()=>{if(started&&paused)pause()});addEventListener('keydown',onKeyDown,{passive:false});addEventListener('keyup',onKeyUp);addEventListener('blur',onBlur);
  let last=performance.now(),frame=0;function loop(now){const dt=Math.min(.035,(now-last)/1000);last=now;update(dt);frame=requestAnimationFrame(loop);}frame=requestAnimationFrame(loop);
  notify('');setVisible(intro,true);setVisible(pausePanel,false);
  return {dispose(){cancelAnimationFrame(frame);removeEventListener('keydown',onKeyDown);removeEventListener('keyup',onKeyUp);removeEventListener('blur',onBlur);cleanupAudio();}};
}
