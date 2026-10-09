const $ = (id) => document.getElementById(id),
  cv = $("c");
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
R.setPixelRatio(Math.min(devicePixelRatio, 2));
R.shadowMap.enabled = true;
R.shadowMap.type = THREE.PCFSoftShadowMap;
R.outputEncoding = THREE.sRGBEncoding;
R.toneMapping = THREE.ACESFilmicToneMapping;
R.toneMappingExposure = 1.0;
const scene = new THREE.Scene(),
  cam = new THREE.PerspectiveCamera(65, 1, 0.1, 4000);
const HOR = 0xbfd2e6;
scene.fog = new THREE.Fog(HOR, 220, 1400);
function resize() {
  R.setSize(innerWidth, innerHeight, false);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---- Sky + image-based lighting
const sunDir = new THREE.Vector3(0.5, 0.6, 0.35).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { sun: { value: sunDir } },
  vertexShader:
    "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader:
    "varying vec3 p;uniform vec3 sun;void main(){vec3 d=normalize(p);float h=max(d.y,0.);vec3 c=mix(vec3(.75,.82,.9),vec3(.16,.38,.78),pow(h,.45));float s=max(dot(d,sun),0.);c+=vec3(1.,.85,.6)*(pow(s,600.)*4.+pow(s,12.)*.25);if(d.y<0.)c=vec3(.45,.5,.45);gl_FragColor=vec4(c,1.);}",
});
const skyGeo = new THREE.SphereGeometry(2400, 32, 16);
const skyScene = new THREE.Scene();
skyScene.add(new THREE.Mesh(skyGeo, skyMat));
scene.add(new THREE.Mesh(skyGeo, skyMat));
const pm = new THREE.PMREMGenerator(R);
scene.environment = pm.fromScene(skyScene).texture;
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 0.4));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -70;
sc.right = sc.top = 70;
sc.near = 1;
sc.far = 400;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// ---- Textures
function tex(w, h, fn) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  fn(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}
function noise(g, w, h, base, amp) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 2; i++) {
    const v = (Math.random() * amp) | 0;
    g.fillStyle = `rgba(${v},${v},${v},.18)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}
const asphalt = tex(256, 256, (g, w, h) => noise(g, w, h, "#33353a", 120));
asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
asphalt.repeat.set(40, 40);
const grass = tex(256, 256, (g, w, h) => noise(g, w, h, "#3f6b2c", 160));
grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
grass.repeat.set(600, 600);
const concrete = tex(128, 128, (g, w, h) => noise(g, w, h, "#8d8f93", 90));
concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
concrete.repeat.set(6, 6);
const winBase = tex(64, 64, (g, w, h) => {
  g.fillStyle = "#232833";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#141820";
  g.lineWidth = 1;
  for (let y = 2; y < h; y += 11) {
    for (let x = 2; x < w; x += 11) {
      const lit = Math.random() < 0.32;
      g.fillStyle = lit
        ? ["#ffe6a3", "#d9ecff", "#ffd27a"][(Math.random() * 3) | 0]
        : "#161b24";
      g.fillRect(x, y, 8, 8);
    }
  }
});

// ---- World layout
const CITY = 560,
  BLOCK = 140,
  ROADW = 18,
  SIDEWALK = 8,
  HALFLINES = 4;
const LINES = [];
for (let i = -HALFLINES; i <= HALFLINES; i++) LINES.push(i * BLOCK);
const boxes = []; // building AABBs {x0,x1,z0,z1}
const lotBlocks = []; // parking-lot block interiors
const pOff = {
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
};

// ground
const grassGround = new THREE.Mesh(
  new THREE.PlaneGeometry(9000, 9000),
  new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
);
grassGround.rotation.x = -Math.PI / 2;
grassGround.position.y = -0.05;
grassGround.receiveShadow = true;
scene.add(grassGround);
const cityGround = new THREE.Mesh(
  new THREE.PlaneGeometry((CITY + 40) * 2, (CITY + 40) * 2),
  new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }),
);
cityGround.rotation.x = -Math.PI / 2;
cityGround.receiveShadow = true;
scene.add(cityGround);

// lane markings
{
  const mark = new THREE.MeshBasicMaterial({ color: 0xdedede, ...pOff });
  const dash = new THREE.BoxGeometry(0.35, 0.02, 3);
  const span = (LINES[HALFLINES] + BLOCK) * 2;
  LINES.forEach((L) => {
    for (let d = -span / 2; d < span / 2; d += 9) {
      const mx = new THREE.Mesh(dash, mark);
      mx.position.set(d, 0.02, L);
      scene.add(mx);
      const mz = new THREE.Mesh(dash, mark);
      mz.rotation.y = Math.PI / 2;
      mz.position.set(L, 0.02, d);
      scene.add(mz);
    }
  });
}

// ---- Game Center (arcade) reserved block
const ARCADE_I = 4,
  ARCADE_J = 4;
let arcade = null;
let arcadeDoorMat = null;
const arcadeSign = tex(512, 128, (g, w, h) => {
  g.fillStyle = "#0b0f1a";
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 18) {
    g.fillStyle = x % 36 ? "#ff2d95" : "#5ce1ff";
    g.fillRect(x, 6, 9, 5);
    g.fillRect(x, h - 11, 9, 5);
  }
  g.font = "bold 72px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "#ff2d95";
  g.shadowBlur = 26;
  g.fillStyle = "#ffd23f";
  g.fillText("GAME CENTER", w / 2, h / 2 + 3);
});

// blocks: sidewalk platform + buildings
const bMat = [];
for (let i = 0; i < 6; i++) bMat.push(0x3d424d + ((Math.random() * 0x181818) | 0));
for (let i = 0; i < LINES.length - 1; i++) {
  for (let j = 0; j < LINES.length - 1; j++) {
    const x0 = LINES[i],
      x1 = LINES[i + 1],
      z0 = LINES[j],
      z1 = LINES[j + 1];
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      w = x1 - x0 - ROADW,
      d = z1 - z0 - ROADW;
    const plat = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.25, d),
      new THREE.MeshStandardMaterial({ map: concrete.clone(), roughness: 0.95 }),
    );
    plat.material.map.repeat.set(w / 8, d / 8);
    plat.position.set(cx, 0.12, cz);
    plat.receiveShadow = true;
    scene.add(plat);

    // building region
    const bx0 = x0 + ROADW / 2 + SIDEWALK,
      bx1 = x1 - ROADW / 2 - SIDEWALK,
      bz0 = z0 + ROADW / 2 + SIDEWALK,
      bz1 = z1 - ROADW / 2 - SIDEWALK;
    const bw = bx1 - bx0,
      bd = bz1 - bz0;

    // reserved block: build the Game Center instead of random towers
    if (i === ARCADE_I && j === ARCADE_J) {
      const ax0 = bx0 + 3,
        ax1 = bx1 - 3,
        az0 = bz0 + 13,
        az1 = bz1 - 3;
      const acx = (ax0 + ax1) / 2;
      const ah = 18;

      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(ax1 - ax0, ah, az1 - az0),
        new THREE.MeshStandardMaterial({ color: 0x1a1f2e, roughness: 0.9 }),
      );
      shell.position.set(acx, 0.25 + ah / 2, (az0 + az1) / 2);
      shell.castShadow = true;
      shell.receiveShadow = true;
      scene.add(shell);
      boxes.push({ x0: ax0, x1: ax1, z0: az0, z1: az1 });

      // neon marquee sign facing the street
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(ax1 - ax0, 90), 6),
        new THREE.MeshBasicMaterial({ map: arcadeSign, toneMapped: false }),
      );
      sign.position.set(acx, 12.5, az0 - 0.06);
      sign.rotation.y = Math.PI;
      scene.add(sign);

      // glowing doorway
      arcadeDoorMat = new THREE.MeshBasicMaterial({
        color: 0x5ce1ff,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), arcadeDoorMat);
      door.position.set(acx, 2.45, az0 - 0.08);
      door.rotation.y = Math.PI;
      scene.add(door);

      // canopy light
      const glow = new THREE.PointLight(0xff5fc8, 1.2, 34, 2);
      glow.position.set(acx, 6, az0 - 2);
      scene.add(glow);

      // ground marker + trigger point out front
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.7, 2.3, 36),
        new THREE.MeshBasicMaterial({
          color: 0xffd23f,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(acx, 0.27, az0 - 7);
      scene.add(ring);
      arcade = { x: acx, z: az0 - 7, r: 3.4 };
      continue;
    }

    // reserved: surface parking lots (filled with parked vehicles later)
    if ((i * 7 + j * 11) % 13 === 0) {
      lotBlocks.push({
        x0: bx0 + 2,
        x1: bx1 - 2,
        z0: bz0 + 2,
        z1: bz1 - 2,
      });
      const booth = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 3, 3.4),
        new THREE.MeshStandardMaterial({ color: 0xced2d8, roughness: 0.7 }),
      );
      booth.position.set(bx0 + 4, 0.25 + 1.5, bz0 + 4);
      booth.castShadow = true;
      scene.add(booth);
      boxes.push({ x0: bx0 + 2.3, x1: bx0 + 5.7, z0: bz0 + 2.3, z1: bz0 + 5.7 });
      continue;
    }

    const dist = Math.hypot(cx, cz);
    const downtown = Math.max(0, 1 - dist / (CITY * 0.85));
    const mode = Math.random();
    const cells =
      mode < 0.3
        ? [[0, 0, 1, 1]]
        : mode < 0.75
          ? [
              [0, 0, 0.5, 1],
              [0.5, 0, 1, 1],
            ]
          : [
              [0, 0, 0.5, 0.5],
              [0.5, 0, 1, 0.5],
              [0, 0.5, 0.5, 1],
              [0.5, 0.5, 1, 1],
            ];
    cells.forEach(([fx0, fz0, fx1, fz1]) => {
      const gx0 = bx0 + bw * fx0 + 3,
        gx1 = bx0 + bw * fx1 - 3,
        gz0 = bz0 + bd * fz0 + 3,
        gz1 = bz0 + bd * fz1 - 3;
      if (gx1 - gx0 < 6 || gz1 - gz0 < 6) return;
      const hh = 12 + Math.random() * (30 + downtown * 90);
      const mat = new THREE.MeshStandardMaterial({
        map: winBase.clone(),
        color: bMat[(Math.random() * bMat.length) | 0],
        roughness: 0.82,
        metalness: 0.05,
      });
      mat.map.repeat.set((gx1 - gx0) / 6, hh / 6);
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(gx1 - gx0, hh, gz1 - gz0),
        mat,
      );
      b.position.set((gx0 + gx1) / 2, 0.25 + hh / 2, (gz0 + gz1) / 2);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      boxes.push({ x0: gx0, x1: gx1, z0: gz0, z1: gz1 });
      // roof cap
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(gx1 - gx0 + 1, 1.2, gz1 - gz0 + 1),
        new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 1 }),
      );
      cap.position.set((gx0 + gx1) / 2, 0.25 + hh + 0.6, (gz0 + gz1) / 2);
      scene.add(cap);
    });
  }
}

const SIDE_Y = 0.245,
  PED_OFF = ROADW / 2 + SIDEWALK - 3;
function onRoad(x, z) {
  const nx = Math.abs(x - Math.round(x / BLOCK) * BLOCK) < ROADW / 2;
  const nz = Math.abs(z - Math.round(z / BLOCK) * BLOCK) < ROADW / 2;
  return nx || nz;
}
function groundY(x, z) {
  if (Math.abs(x) > CITY || Math.abs(z) > CITY) return -0.05;
  return onRoad(x, z) ? 0 : SIDE_Y;
}
function resolve(p, r) {
  let hit = false;
  for (let k = 0; k < boxes.length; k++) {
    const b = boxes[k];
    const ex0 = b.x0 - r,
      ex1 = b.x1 + r,
      ez0 = b.z0 - r,
      ez1 = b.z1 + r;
    if (p.x > ex0 && p.x < ex1 && p.z > ez0 && p.z < ez1) {
      const dl = p.x - ex0,
        dr = ex1 - p.x,
        db = p.z - ez0,
        dt = ez1 - p.z;
      const m = Math.min(dl, dr, db, dt);
      if (m === dl) p.x = ex0;
      else if (m === dr) p.x = ex1;
      else if (m === db) p.z = ez0;
      else p.z = ez1;
      hit = true;
    }
  }
  return hit;
}

// ---- Vehicle factory
const paintColors = [
  0xc4001a, 0x1a63c4, 0xe8b400, 0x1f9d4d, 0xdddddd, 0x222222, 0xe06a10,
  0x7a1fd0, 0x18b6b6, 0xd44a8a, 0xf2f2f2, 0x0b3d91,
];
const CAR_TYPES = ["sedan", "sports", "van", "taxi", "muscle"];
const BIKE_TYPES = ["sport", "cruiser", "scooter"];

const CAR_SPECS = {
  sedan: {
    name: "Sedan", mass: 1300, torque: 420, grip: 1.0, Iz: 2000,
    wbA: 1.2, wbB: 1.4, topRpm: 7700, wr: 0.33, colR: 1.5,
    wtrack: 0.98, fz: 1.4, rz: -1.4, front: 2.26, rear: -2.26,
  },
  sports: {
    name: "Sports", mass: 1130, torque: 520, grip: 1.16, Iz: 1650,
    wbA: 1.25, wbB: 1.35, topRpm: 8400, wr: 0.34, colR: 1.5,
    wtrack: 1.02, fz: 1.35, rz: -1.35, front: 2.2, rear: -2.2,
  },
  van: {
    name: "Van", mass: 1950, torque: 380, grip: 0.92, Iz: 2750,
    wbA: 1.45, wbB: 1.65, topRpm: 6800, wr: 0.38, colR: 1.6,
    wtrack: 1.02, fz: 1.55, rz: -1.55, front: 2.38, rear: -2.38,
  },
  taxi: {
    name: "Taxi", mass: 1350, torque: 415, grip: 1.0, Iz: 2050,
    wbA: 1.2, wbB: 1.4, topRpm: 7600, wr: 0.33, colR: 1.5,
    wtrack: 0.98, fz: 1.4, rz: -1.4, front: 2.26, rear: -2.26,
  },
  muscle: {
    name: "Muscle", mass: 1520, torque: 485, grip: 0.96, Iz: 2200,
    wbA: 1.3, wbB: 1.5, topRpm: 7600, wr: 0.35, colR: 1.55,
    wtrack: 1.0, fz: 1.45, rz: -1.45, front: 2.28, rear: -2.28,
  },
};
const BIKE_SPECS = {
  sport: {
    name: "Sport Bike", mass: 230, torque: 78, grip: 1.3, Iz: 120,
    wbA: 0.75, wbB: 0.85, topRpm: 9200, wr: 0.33, colR: 0.9,
    wtrack: 0, fz: 0.78, rz: -0.78, front: 1.0, rear: -1.0,
  },
  cruiser: {
    name: "Cruiser", mass: 300, torque: 60, grip: 1.15, Iz: 160,
    wbA: 0.85, wbB: 0.95, topRpm: 7000, wr: 0.32, colR: 0.95,
    wtrack: 0, fz: 0.85, rz: -0.85, front: 1.05, rear: -1.05,
  },
  scooter: {
    name: "Scooter", mass: 165, torque: 34, grip: 1.05, Iz: 85,
    wbA: 0.7, wbB: 0.8, topRpm: 6600, wr: 0.26, colR: 0.8,
    wtrack: 0, fz: 0.72, rz: -0.72, front: 0.95, rear: -0.95,
  },
};

function makeWheel(g, wheels, fw, x, z, r, isFront, width) {
  const st = new THREE.Group(),
    sp = new THREE.Group();
  st.position.set(x, r, z);
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, width, 22),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 10),
    new THREE.MeshStandardMaterial({
      color: 0xbbbbbb,
      metalness: 1,
      roughness: 0.25,
    }),
  );
  rim.rotation.z = Math.PI / 2;
  sp.add(tire, rim);
  st.add(sp);
  g.add(st);
  wheels.push(sp);
  if (isFront) fw.push(st);
}

function makeCar(color, type = "sedan") {
  const spec = CAR_SPECS[type] || CAR_SPECS.sedan;
  const g = new THREE.Group(),
    b = new THREE.Group();
  g.add(b);
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.6,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.3,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a0e14,
    metalness: 0.9,
    roughness: 0.05,
    clearcoat: 1,
  });
  const blk = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
  });
  const tailM = new THREE.MeshStandardMaterial({
    color: 0x330000,
    emissive: 0xff0000,
    emissiveIntensity: 0.6,
  });
  const headM = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff2cc,
    emissiveIntensity: 1.4,
  });
  function box(w, h, d, m, x, y, z, rx) {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    if (rx) me.rotation.x = rx;
    me.castShadow = true;
    b.add(me);
    return me;
  }
  if (type === "van") {
    box(2.0, 0.7, 4.7, paint, 0, 0.72, 0);
    box(2.0, 1.2, 3.5, paint, 0, 1.62, -0.55);
    box(1.9, 0.55, 1.0, glass, 0, 1.6, 1.45, 0.1);
    box(2.02, 0.42, 2.4, glass, 0, 1.95, -0.5);
    box(2.04, 0.1, 3.6, paint, 0, 2.27, -0.55);
    box(1.95, 0.14, 0.5, blk, 0, 0.42, 2.3);
    box(2.05, 0.1, 0.7, blk, 0, 1.1, -2.35);
  } else if (type === "sports") {
    box(1.98, 0.42, 4.4, paint, 0, 0.52, 0);
    box(1.8, 0.16, 1.7, paint, 0, 0.76, 1.45, 0.16);
    box(1.55, 0.4, 1.7, glass, 0, 0.86, -0.3);
    box(1.45, 0.06, 1.1, paint, 0, 1.06, -0.45);
    box(1.7, 0.06, 0.45, blk, 0, 1.02, -2.25);
    box(1.98, 0.1, 0.5, blk, 0, 0.34, 2.2);
  } else {
    box(type === "muscle" ? 2.0 : 1.9, 0.5, 4.5, paint, 0, 0.6, 0);
    box(1.78, 0.18, 1.5, paint, 0, 0.9, 1.4, 0.12);
    box(1.6, 0.45, 1.9, glass, 0, 0.98, -0.35);
    box(1.5, 0.08, 1.3, paint, 0, 1.22, -0.35);
    box(1.95, 0.12, 0.5, blk, 0, 0.34, 2.2);
    box(2, 0.08, 0.7, blk, 0, 1.12, -2.1);
    if (type === "muscle") {
      box(0.8, 0.14, 0.6, blk, 0, 1.02, 1.1);
      box(1.7, 0.06, 0.45, blk, 0, 1.06, -2.24);
    }
    if (type === "taxi") {
      const signM = new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: 0xffcc33,
        emissiveIntensity: 1.2,
        toneMapped: false,
      });
      box(0.7, 0.28, 0.5, signM, 0, 1.45, -0.35);
    }
  }
  box(0.45, 0.12, 0.05, headM, 0.65, 0.72, spec.front);
  box(0.45, 0.12, 0.05, headM, -0.65, 0.72, spec.front);
  box(0.6, 0.1, 0.05, tailM, 0.6, 0.8, spec.rear);
  box(0.6, 0.1, 0.05, tailM, -0.6, 0.8, spec.rear);
  const wheels = [],
    fw = [];
  [
    [-spec.wtrack, spec.fz, 1],
    [spec.wtrack, spec.fz, 1],
    [-spec.wtrack, spec.rz, 0],
    [spec.wtrack, spec.rz, 0],
  ].forEach(([x, z, f]) =>
    makeWheel(g, wheels, fw, x, z, spec.wr, f, type === "van" ? 0.36 : 0.3),
  );
  return { g, b, wheels, fw, tailM, brake: 0, kind: "car", type, spec };
}

function makeBike(color, type = "sport") {
  const spec = BIKE_SPECS[type] || BIKE_SPECS.sport;
  const g = new THREE.Group(),
    b = new THREE.Group();
  g.add(b);
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.7,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const blk = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xcfcfcf,
    metalness: 1,
    roughness: 0.25,
  });
  const tailM = new THREE.MeshStandardMaterial({
    color: 0x330000,
    emissive: 0xff0000,
    emissiveIntensity: 0.6,
  });
  const headM = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff2cc,
    emissiveIntensity: 1.4,
  });
  function box(w, h, d, m, x, y, z, rx) {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    if (rx) me.rotation.x = rx;
    me.castShadow = true;
    b.add(me);
    return me;
  }
  box(0.3, 0.32, 1.5, paint, 0, 0.72, 0);
  box(0.34, 0.16, 0.85, blk, 0, 0.88, -0.5);
  box(0.3, 0.26, 0.6, paint, 0, 0.92, 0.35);
  box(0.1, 0.62, 0.1, chrome, 0, 0.86, 0.72, -0.28);
  box(0.68, 0.06, 0.06, blk, 0, 1.1, 0.62);
  box(0.16, 0.16, 0.1, headM, 0, 1.0, 0.82);
  box(0.14, 0.1, 0.06, tailM, 0, 0.92, -0.92);
  box(0.1, 0.1, 0.6, chrome, 0.17, 0.5, -0.35);
  const wheels = [],
    fw = [];
  makeWheel(g, wheels, fw, 0, spec.fz, spec.wr, 1, 0.12);
  makeWheel(g, wheels, fw, 0, spec.rz, spec.wr, 0, 0.16);
  return { g, b, wheels, fw, tailM, brake: 0, kind: "bike", type, spec };
}

function makePoliceCar() {
  const car = makeCar(0x0e1116);
  const white = new THREE.MeshStandardMaterial({
    color: 0xeef1f5,
    metalness: 0.4,
    roughness: 0.4,
  });
  [-0.97, 0.97].forEach((x) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 2.1), white);
    stripe.position.set(x, 0.62, 0.05);
    car.b.add(stripe);
  });
  const barBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.12, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }),
  );
  barBase.position.set(0, 1.3, -0.3);
  car.b.add(barBase);
  const mkLight = (color, x) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      toneMapped: false,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.34), mat);
    m.position.set(x, 1.41, -0.3);
    car.b.add(m);
    return mat;
  };
  car.lightR = mkLight(0xff2b2b, 0.32);
  car.lightL = mkLight(0x2b6bff, -0.32);
  return car;
}

// ---- Character
function makeChar() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
      color: 0xd9a066,
      roughness: 0.7,
    }),
    shirt = new THREE.MeshStandardMaterial({
      color: 0x2b6cb0,
      roughness: 0.8,
    }),
    pants = new THREE.MeshStandardMaterial({
      color: 0x2a2f3a,
      roughness: 0.85,
    });
  const parts = {};
  function limb(w, h, d, m) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, -h / 2, 0);
    const me = new THREE.Mesh(geo, m);
    me.castShadow = true;
    return me;
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  const aL = limb(0.18, 0.62, 0.18, shirt),
    aR = limb(0.18, 0.62, 0.18, shirt);
  aL.position.set(-0.4, 1.42, 0);
  aR.position.set(0.4, 1.42, 0);
  const lL = limb(0.22, 0.7, 0.22, pants),
    lR = limb(0.22, 0.7, 0.22, pants);
  lL.position.set(-0.16, 0.78, 0);
  lR.position.set(0.16, 0.78, 0);
  g.add(torso, head, aL, aR, lL, lR);
  parts.aL = aL;
  parts.aR = aR;
  parts.lL = lL;
  parts.lR = lR;
  return { g, parts };
}

// ---- Player state
const player = {
  mode: "foot",
  x: 0,
  z: 0,
  psi: 0,
  vx: 0,
  vy: 0,
  w: 0,
  steer: 0,
  gear: 0,
  rpm: 1000,
  axp: 0,
  thr: 0,
  brk: 0,
  slip: 0,
  walkPhase: 0,
  hp: 100,
  heat: 0,
  walkSpeed: 0,
  wr: 0.33,
};
const char = makeChar();
scene.add(char.g);
let occupied = null; // current car object
let hood = false;

// player's starter car
const startCar = makeCar(0xc4001a);
startCar.x = ROADW / 4;
startCar.z = 0;
startCar.psi = 0;
startCar.free = true;
scene.add(startCar.g);
const cars = [startCar];

// ---- Traffic cars
function spawnTraffic(bikeChance = 0.15) {
  const axis = Math.random() < 0.5 ? "x" : "z";
  const line = LINES[(Math.random() * LINES.length) | 0];
  const color = paintColors[(Math.random() * paintColors.length) | 0];
  const isBike = Math.random() < bikeChance;
  const veh = isBike
    ? makeBike(color, BIKE_TYPES[(Math.random() * BIKE_TYPES.length) | 0])
    : makeCar(color, CAR_TYPES[(Math.random() * CAR_TYPES.length) | 0]);
  veh.ai = {
    axis,
    road: line,
    pos: (Math.random() - 0.5) * CITY * 2,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: isBike ? 14 + Math.random() * 9 : 9 + Math.random() * 7,
    turnP: isBike ? 0.4 : 0.25,
    lastLine: 1e9,
  };
  veh.x = axis === "x" ? veh.ai.pos : line;
  veh.z = axis === "x" ? line : veh.ai.pos;
  veh.psi = 0;
  scene.add(veh.g);
  cars.push(veh);
}
for (let i = 0; i < 21; i++) spawnTraffic(i % 7 === 0 ? 1 : 0.12);

// ---- Parked vehicles (lots, roadside, bike racks)
function placeVehicle(veh, x, z, psi, y) {
  veh.x = x;
  veh.z = z;
  veh.psi = psi;
  veh.parked = true;
  veh.g.position.set(x, y, z);
  veh.g.rotation.y = psi;
  veh.g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  scene.add(veh.g);
  cars.push(veh);
  return veh;
}
const randCar = () =>
    makeCar(
      paintColors[(Math.random() * paintColors.length) | 0],
      CAR_TYPES[(Math.random() * CAR_TYPES.length) | 0],
    ),
  randBike = () =>
    makeBike(
      paintColors[(Math.random() * paintColors.length) | 0],
      BIKE_TYPES[(Math.random() * BIKE_TYPES.length) | 0],
    );

// parking lots: rows of stalls
let lots = 0,
  parkedCount = 0;
lotBlocks.forEach((L) => {
  lots++;
  const rows = 2 + ((Math.random() * 2) | 0);
  for (let r = 0; r < rows; r++) {
    const z = L.z0 + 6 + r * ((L.z1 - L.z0 - 12) / Math.max(1, rows - 1));
    for (let k = 0; k < 3; k++) {
      const x = L.x0 + 5 + k * ((L.x1 - L.x0 - 10) / 2);
      if (Math.random() < 0.3) continue;
      const veh =
        Math.random() < 0.18 ? randBike() : randCar();
      const psi = Math.random() < 0.5 ? 0 : Math.PI;
      placeVehicle(veh, x, z + (Math.random() - 0.5) * 1.2, psi, SIDE_Y);
      parkedCount++;
    }
  }
  // stall divider lines
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, ...pOff });
  for (let r = 0; r < rows; r++) {
    const z = L.z0 + 6 + r * ((L.z1 - L.z0 - 12) / Math.max(1, rows - 1));
    for (let k = 0; k < 3; k++) {
      const x = L.x0 + 4 + k * ((L.x1 - L.x0 - 8) / 2);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 5), lineM);
      stripe.position.set(x, SIDE_Y + 0.02, z);
      scene.add(stripe);
    }
  }
});

// roadside parking along every road, plus occasional bike racks
LINES.forEach((line) => {
  for (const axis of ["z", "x"]) {
    for (let p = -CITY + 30; p < CITY - 30; p += 55 + Math.random() * 45) {
      if (Math.abs(p - Math.round(p / BLOCK) * BLOCK) < 14) continue;
      const side = Math.random() < 0.5 ? 1 : -1;
      const off = side * 6.8;
      const x = axis === "z" ? line + off : p;
      const z = axis === "z" ? p : line + off;
      if (Math.hypot(x - (arcade ? arcade.x : 1e9), z - (arcade ? arcade.z : 1e9)) < 12)
        continue;
      if (Math.random() < 0.35) continue;
      const veh = Math.random() < 0.14 ? randBike() : randCar();
      const psi = axis === "z" ? (side > 0 ? 0 : Math.PI) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
      placeVehicle(veh, x, z, psi, 0);
      parkedCount++;
    }
  }
});
// a couple of bike racks on sidewalks
for (let n = 0; n < 5; n++) {
  const line = LINES[(Math.random() * LINES.length) | 0];
  const axis = Math.random() < 0.5 ? "z" : "x";
  const p = (Math.random() * 1.6 - 0.8) * CITY;
  const x = axis === "z" ? line + 13 : p;
  const z = axis === "z" ? p : line + 13;
  for (let k = 0; k < 3 + ((Math.random() * 3) | 0); k++) {
    const veh = randBike();
    const psi = axis === "z" ? 0 : Math.PI / 2;
    placeVehicle(veh, x + (axis === "z" ? 0 : k * 1.1), z + (axis === "z" ? k * 1.1 : 0), psi, SIDE_Y);
    parkedCount++;
  }
}

// ---- Pedestrians
const peds = [];
function spawnPed() {
  const c = makeChar();
  const axis = Math.random() < 0.5 ? "x" : "z";
  const line = LINES[(Math.random() * LINES.length) | 0];
  const ped = {
    c,
    axis,
    road: line,
    side: Math.random() < 0.5 ? 1 : -1,
    pos: (Math.random() - 0.5) * CITY * 1.6,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: 1.2 + Math.random() * 0.9,
    turnP: 0.5,
    lastLine: 1e9,
    phase: Math.random() * 6,
    flee: 0,
  };
  const po = ped.side * PED_OFF;
  c.g.position.set(
    axis === "x" ? ped.pos : ped.road + po,
    SIDE_Y,
    axis === "x" ? ped.road + po : ped.pos,
  );
  scene.add(c.g);
  peds.push(ped);
}
for (let i = 0; i < 34; i++) spawnPed();

// ---- Skid marks
const SK = 2000,
  skid = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.3, 0.8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    SK,
  );
const dm = new THREE.Object3D();
dm.scale.set(0, 0, 0);
dm.updateMatrix();
for (let i = 0; i < SK; i++) skid.setMatrixAt(i, dm.matrix);
skid.frustumCulled = false;
scene.add(skid);
let sk = 0;

// ---- Physics
const M = 1300,
  Iz = 2000,
  A = 1.2,
  B = 1.4,
  L = 2.6,
  H = 0.5,
  G = 9.81,
  WR = 0.33,
  GR = [3.6, 2.5, 1.9, 1.5, 1.2, 0.98],
  FD = 3.5;
const sgn = (v) => (v < 0 ? -1 : 1);

function carStep(dt, inp) {
  const spec = (occupied && occupied.spec) || CAR_SPECS.sedan;
  const M = spec.mass,
    A = spec.wbA,
    B = spec.wbB,
    L = A + B,
    Iz = spec.Iz,
    WR = spec.wr,
    H = 0.5,
    redline = spec.topRpm;
  const road = onRoad(occupied.x, occupied.z);
  const surf = road ? 1 : 0.9;
  player.wr = WR;
  player.thr = inp.th;
  player.brk = inp.br && player.vx > 1;
  player.steer +=
    (inp.steer - player.steer) * Math.min(1, dt * (inp.steer ? 5 : 9));
  const v = Math.abs(player.vx);
  player.delta = (player.steer * 0.55) / (1 + Math.pow(v / 20, 1.6));
  const mu = 1.5 * surf * spec.grip,
    mur = mu * (inp.hb ? 0.4 : 1);
  player.rpm = Math.max(1100, (v / WR) * GR[player.gear] * FD * 9.549);
  if (player.rpm > redline && player.gear < 5) player.gear++;
  else if (player.rpm < redline * 0.43 && player.gear > 0) player.gear--;
  let Fx = 0,
    brk = 0;
  const tq =
    player.rpm > redline + 650
      ? 0
      : spec.torque *
        Math.max(
          0.25,
          1 - Math.pow((player.rpm - redline * 0.68) / (redline * 0.62), 2),
        );
  if (inp.th) {
    if (player.vx < -1) brk = 1;
    else Fx = (tq * GR[player.gear] * FD * 0.88) / WR;
  }
  if (inp.br) {
    if (player.vx > 1) brk = 1;
    else Fx = -4500 * (player.vx > -12 ? 1 : 0);
  }
  const down = 1.0 * player.vx * player.vx,
    Fzf = Math.max(
      500,
      (M * G * B) / L - (M * player.axp * H) / L + 0.4 * down,
    ),
    Fzr = Math.max(
      500,
      (M * G * A) / L + (M * player.axp * H) / L + 0.6 * down,
    );
  const lim = mur * Fzr;
  let Fd = Math.max(-lim, Math.min(lim, Fx));
  const spin = Math.abs(Fx) > lim;
  const Fb =
    -sgn(player.vx) *
    Math.min(13000, mu * (Fzf + Fzr) * 0.95) *
    brk *
    (Math.abs(player.vx) > 0.3 ? 1 : 0);
  const den = Math.max(v, 2.5),
    af = Math.atan2(player.vy + A * player.w, den) - player.delta,
    ar = Math.atan2(player.vy - B * player.w, den);
  const circ = Math.max(0.3, Math.sqrt(Math.max(0, 1 - (Fd / lim) ** 2)));
  const Fyf =
      -mu * Fzf * Math.sin(1.4 * Math.atan(9 * af)) * (1 - 0.2 * brk),
    Fyr = -mur * Fzr * Math.sin(1.4 * Math.atan(9 * ar)) * circ;
  const drag =
    0.4 * player.vx * Math.abs(player.vx) +
    150 * Math.tanh(player.vx) +
    (1 - surf) * 600 * Math.tanh(player.vx) +
    (inp.th ? 0 : 350 * Math.tanh(player.vx));
  const ax =
      (Fd + Fb - Fyf * Math.sin(player.delta) - drag) / M + player.w * player.vy,
    ay = (Fyr + Fyf * Math.cos(player.delta)) / M - player.w * player.vx,
    dw = (A * Fyf * Math.cos(player.delta) - B * Fyr) / Iz;
  player.vx += ax * dt;
  player.vy += ay * dt;
  player.w += dw * dt;
  const low = Math.max(0, 1 - v / 4);
  player.vy -= player.vy * low * 10 * dt;
  player.w -= player.w * low * 8 * dt;
  player.axp += (ax - player.axp) * Math.min(1, dt * 8);
  player.slip = Math.max(
    Math.abs(ar) - 0.12,
    Math.abs(af) - 0.14,
    spin && v > 3 ? 0.3 : 0,
    brk && v > 8 ? 0.25 : 0,
  );
  const f = [Math.sin(player.psi), Math.cos(player.psi)],
    l = [Math.cos(player.psi), -Math.sin(player.psi)];
  let nx = player.x + (player.vx * f[0] + player.vy * l[0]) * dt;
  let nz = player.z + (player.vx * f[1] + player.vy * l[1]) * dt;
  const p = { x: nx, z: nz };
  if (resolve(p, spec.colR || 1.5)) {
    const dx = p.x - nx,
      dz = p.z - nz;
    const nl = Math.hypot(dx, dz) || 1;
    const dot = (player.vx * dx + player.vy * dz) / nl;
    player.vx *= 0.45;
    player.vy *= 0.45;
    player.w *= 0.6;
    if (Math.abs(dot) > 6) {
      player.hp -= Math.min(10, Math.abs(dot) * 0.5);
      bump(4);
      flash("CRASH!", 700);
    }
  }
  player.x = p.x;
  player.z = p.z;
  player.psi += player.w * dt;
  const lim2 = CITY + 30;
  player.x = Math.max(-lim2, Math.min(lim2, player.x));
  player.z = Math.max(-lim2, Math.min(lim2, player.z));
}

function footStep(dt, inp) {
  let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0),
    mz = (inp.th ? 1 : 0) - (inp.br ? 1 : 0);
  const len = Math.hypot(mx, mz);
  const onPave = onRoad(player.x, player.z);
  let sp = inp.hb ? (onPave ? 7.6 : 6.8) : (onPave ? 4.2 : 3.6);
  if (len > 0) {
    mx /= len;
    mz /= len;
    const cy = camYaw;
    const wx = Math.sin(cy) * mz - Math.cos(cy) * mx;
    const wz = Math.cos(cy) * mz + Math.sin(cy) * mx;
    const target = Math.atan2(wx, wz);
    let d = target - player.psi;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.psi += d * Math.min(1, dt * 12);
    player.x += wx * sp * dt;
    player.z += wz * sp * dt;
    player.walkPhase += dt * sp * 2.4;
    player.walkSpeed = sp;
  } else {
    player.walkSpeed *= Math.max(0, 1 - dt * 8);
  }
  const p = { x: player.x, z: player.z };
  if (resolve(p, 0.5)) {
    player.x = p.x;
    player.z = p.z;
  }
  const lim2 = CITY + 30;
  player.x = Math.max(-lim2, Math.min(lim2, player.x));
  player.z = Math.max(-lim2, Math.min(lim2, player.z));
  player.hp = Math.min(100, player.hp + dt * 1.5);
}

// ---- Input
const keys = {};
let paused = false;
let gameOver = false;
let promptShown = false;
const uiOpen = () => !!(window.MiniGames && window.MiniGames.isOpen);

function openArcade() {
  if (!arcade || player.mode !== "foot" || uiOpen()) return;
  for (const k in keys) keys[k] = 0;
  window.MiniGames.open();
}
function tryEnterArcade() {
  if (!arcade || player.mode !== "foot") return;
  if (Math.hypot(player.x - arcade.x, player.z - arcade.z) >= arcade.r) return;
  openArcade();
}

addEventListener("keydown", (e) => {
  if (uiOpen() || gameOver) return;
  keys[e.key.toLowerCase()] = 1;
  if (e.key === "c") hood = !hood;
  if (e.key === "r") resetPlayer();
  if (e.key.toLowerCase() === "f") toggleEnter();
  if (e.key.toLowerCase() === "e") tryEnterArcade();
  if (e.key === " ") e.preventDefault();
});
addEventListener("keyup", (e) => {
  if (uiOpen() || gameOver) return;
  keys[e.key.toLowerCase()] = 0;
});

function resetPlayer() {
  player.x = 0;
  player.z = 0;
  player.psi = 0;
  player.vx = player.vy = player.w = 0;
  player.axp = 0;
  if (player.mode === "car" && occupied) {
    occupied.x = 0;
    occupied.z = 0;
    occupied.psi = 0;
  }
  flash("RESPAWN", 900);
}

function nearestCar() {
  let best = null,
    bd = 4.5 * 4.5;
  for (const c of cars) {
    if (c === occupied) continue;
    const d = (c.x - player.x) ** 2 + (c.z - player.z) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
function toggleEnter() {
  if (player.mode === "car") {
    // exit onto left side
    const l = [Math.cos(player.psi), -Math.sin(player.psi)];
    player.mode = "foot";
    const car = occupied;
    player.x = car.x + l[0] * 2.6;
    player.z = car.z + l[1] * 2.6;
    player.psi = car.psi;
    const p = { x: player.x, z: player.z };
    resolve(p, 0.5);
    player.x = p.x;
    player.z = p.z;
    occupied = null;
    char.g.visible = true;
    car.g.visible = true;
  } else {
    const c = nearestCar();
    if (!c) {
      flash("NO VEHICLE NEARBY", 900);
      return;
    }
    occupied = c;
    if (c.ai) c.ai = null;
    player.mode = "car";
    player.x = c.x;
    player.z = c.z;
    player.psi = c.psi;
    player.vx = player.vy = player.w = 0;
    player.gear = 0;
    player.axp = 0;
    player.wr = c.spec ? c.spec.wr : WR;
    char.g.visible = c.kind === "bike";
    flash(c.kind === "bike" ? "BIKE STOLEN" : "CAR STOLEN", 900);
    bump(2);
  }
}

// ---- Chaos / wanted
function bump(n) {
  player.heat = Math.min(5, player.heat + n * 0.34);
}
let heatCool = 0;

// ---- Collisions with traffic / peds (car mode)
function carWorldCollisions(dt) {
  const f = [Math.sin(player.psi), Math.cos(player.psi)];
  if (player.mode === "car") {
    for (const c of cars) {
      if (c === occupied) continue;
      const dx = c.x - player.x,
        dz = c.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.2 && d > 0.01) {
        const push = (3.2 - d) / d;
        c.x -= dx * push;
        c.z -= dz * push;
        if (c.ai) {
          c.ai.pos -= (c.ai.axis === "x" ? dx : dz) * push;
          c.ai.dir *= -1;
        }
        player.vx *= 0.7;
        if (player.vx > 8) bump(0.6);
      }
    }
    for (const pd of peds) {
      const d = Math.hypot(
        pd.c.g.position.x - player.x,
        pd.c.g.position.z - player.z,
      );
      if (d < 2.4) {
        pd.flee = 3;
        bump(1.2);
        flash("HIT A PEDESTRIAN!", 900);
      }
    }
  }
}

// ---- Traffic walkers
function trafficUpdate(dt) {
  for (const c of cars) {
    const ai = c.ai;
    if (ai) {
      ai.pos += ai.dir * ai.speed * dt;
      const lim = CITY + 60;
      if (ai.pos > lim || ai.pos < -lim) {
        ai.pos = -Math.sign(ai.pos) * lim;
        ai.lastLine = 1e9;
      }
      const ix = Math.round(ai.pos / BLOCK) * BLOCK;
      if (Math.abs(ai.pos - ix) < 1.2 && ai.lastLine !== ix) {
        ai.lastLine = ix;
        if (Math.random() < ai.turnP) {
          const cross = ai.road;
          ai.axis = ai.axis === "x" ? "z" : "x";
          ai.road = ix;
          ai.pos = cross;
          ai.dir = Math.random() < 0.5 ? 1 : -1;
        }
      }
      const lane = (ai.axis === "x" ? -1 : 1) * 4 * ai.dir;
      if (ai.axis === "x") {
        c.x = ai.pos;
        c.z = ai.road + lane;
        c.psi = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        c.x = ai.road + lane;
        c.z = ai.pos;
        c.psi = ai.dir > 0 ? 0 : Math.PI;
      }
      c.g.position.set(c.x, 0, c.z);
      c.g.rotation.y = c.psi;
      if (c.kind === "bike") {
        const dp = Math.atan2(
          Math.sin(c.psi - (c.pPsi || c.psi)),
          Math.cos(c.psi - (c.pPsi || c.psi)),
        );
        const yaw = dp / Math.max(dt, 1e-3);
        const lean = Math.atan2(Math.min(ai.speed, 30) * yaw, 9.81);
        c.bank = (c.bank || 0) + (Math.max(-0.5, Math.min(0.5, lean)) - (c.bank || 0)) * Math.min(1, dt * 8);
        c.b.rotation.z = c.bank;
      }
      c.pPsi = c.psi;
      c.wheels.forEach(
        (w) => (w.rotation.x += (ai.speed * dt) / (c.spec ? c.spec.wr : WR)),
      );
    } else if (c !== occupied) {
      c.g.position.set(c.x, 0, c.z);
      c.g.rotation.y = c.psi;
    }
  }
}

function pedUpdate(dt) {
  for (const pd of peds) {
    if (pd.flee > 0) {
      pd.flee -= dt;
      // run away from player
      const dx = pd.c.g.position.x - player.x,
        dz = pd.c.g.position.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      pd.c.g.position.x += (dx / d) * 7 * dt;
      pd.c.g.position.z += (dz / d) * 7 * dt;
      pd.c.g.rotation.y = Math.atan2(dx, dz);
      pd.phase += dt * 16;
      animatePed(pd.c, pd.phase, 1);
      continue;
    }
    pd.pos += pd.dir * pd.speed * dt;
    const lim = CITY * 0.85;
    if (pd.pos > lim || pd.pos < -lim) {
      pd.pos = -Math.sign(pd.pos) * lim;
      pd.lastLine = 1e9;
    }
    const ix = Math.round(pd.pos / BLOCK) * BLOCK;
    if (Math.abs(pd.pos - ix) < 0.8 && pd.lastLine !== ix) {
      pd.lastLine = ix;
      if (Math.random() < pd.turnP) {
        const cross = pd.axis === "x" ? pd.road : pd.road;
        pd.axis = pd.axis === "x" ? "z" : "x";
        pd.road = ix;
        pd.pos = cross;
        pd.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }
    const po = pd.side * PED_OFF;
    let px, pz;
    if (pd.axis === "x") {
      px = pd.pos;
      pz = pd.road + po;
    } else {
      px = pd.road + po;
      pz = pd.pos;
    }
    const r = { x: px, z: pz };
    if (resolve(r, 0.4)) {
      pd.dir *= -1;
      pd.pos += pd.dir * 2;
    } else {
      px = r.x;
      pz = r.z;
    }
    pd.c.g.position.set(px, SIDE_Y, pz);
    pd.c.g.rotation.y =
      pd.axis === "x"
        ? pd.dir > 0
          ? Math.PI / 2
          : -Math.PI / 2
        : pd.dir > 0
          ? 0
          : Math.PI;
    pd.phase += dt * pd.speed * 2.6;
    animatePed(pd.c, pd.phase, 0.7);
  }
}
function animatePed(c, phase, amp) {
  const s = Math.sin(phase) * amp;
  c.parts.lL.rotation.x = s * 0.6;
  c.parts.lR.rotation.x = -s * 0.6;
  c.parts.aL.rotation.x = -s * 0.5;
  c.parts.aR.rotation.x = s * 0.5;
}

// ---- Audio
let ac, o1, o2, gn, sir, sirG;
function audio() {
  ac = new (window.AudioContext || window.webkitAudioContext)();
  gn = ac.createGain();
  gn.gain.value = 0;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1100;
  o1 = ac.createOscillator();
  o1.type = "sawtooth";
  o2 = ac.createOscillator();
  o2.type = "square";
  o1.connect(f);
  o2.connect(f);
  f.connect(gn);
  gn.connect(ac.destination);
  o1.start();
  o2.start();
  sirG = ac.createGain();
  sirG.gain.value = 0;
  const sf = ac.createBiquadFilter();
  sf.type = "bandpass";
  sf.frequency.value = 850;
  sf.Q.value = 1.2;
  sir = ac.createOscillator();
  sir.type = "square";
  sir.frequency.value = 700;
  sir.connect(sf);
  sf.connect(sirG);
  sirG.connect(ac.destination);
  sir.start();
}

// ---- Minimap
const mm = $("mm").getContext("2d");
const scale = 150 / (CITY * 2);
const mp = (x, z) => [80 + x * scale, 80 + z * scale];
function drawMini() {
  mm.clearRect(0, 0, 160, 160);
  mm.strokeStyle = "rgba(255,255,255,.25)";
  mm.lineWidth = 4;
  LINES.forEach((L) => {
    mm.beginPath();
    mm.moveTo(80 + L * scale, 80 - CITY * scale);
    mm.lineTo(80 + L * scale, 80 + CITY * scale);
    mm.moveTo(80 - CITY * scale, 80 + L * scale);
    mm.lineTo(80 + CITY * scale, 80 + L * scale);
    mm.stroke();
  });
  // traffic + parked
  for (const c of cars) {
    if (c === occupied) continue;
    const [a, b] = mp(c.x, c.z);
    if (c.kind === "bike") {
      mm.fillStyle = c.ai ? "#c9d4e0" : "#7f8a98";
      mm.fillRect(a - 1, b - 1, 2, 2);
    } else {
      mm.fillStyle = c.ai ? "#9aa4b2" : "#6f7885";
      mm.fillRect(a - 1.5, b - 1.5, 3, 3);
    }
  }
  // peds
  mm.fillStyle = "#ffe9a3";
  for (const pd of peds) {
    const [a, b] = mp(pd.c.g.position.x, pd.c.g.position.z);
    mm.fillRect(a - 1, b - 1, 2, 2);
  }
  // police
  if (window.Police) {
    const ph = (performance.now() / 140) | 0;
    window.Police.units.forEach((u, i) => {
      const [a, b] = mp(u.x, u.z);
      mm.fillStyle = (ph + i) % 2 ? "#2b6bff" : "#ff2b2b";
      mm.fillRect(a - 2.5, b - 2.5, 5, 5);
    });
  }
  const [a, b] = mp(player.x, player.z);
  mm.fillStyle = "#ff3b30";
  mm.beginPath();
  mm.arc(a, b, 4.5, 0, 7);
  mm.fill();
  mm.strokeStyle = "#fff";
  mm.lineWidth = 1.5;
  mm.beginPath();
  mm.moveTo(a, b);
  mm.lineTo(a + Math.sin(player.psi) * 9, b + Math.cos(player.psi) * 9);
  mm.stroke();
}

// ---- Messages
let msgT = 0;
function flash(t, ms) {
  $("msg").textContent = t;
  msgT = performance.now() + ms;
}

// ---- Loop
const _d = new THREE.Object3D();
let camYaw = 0,
  acc = 0,
  last = performance.now(),
  fr = 0,
  skT = 0,
  whl = 0,
  run = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (run && !paused && !gameOver) {
    acc += dt;
    while (acc >= 1 / 120) {
      if (player.mode === "car") carStep(1 / 120, inputState());
      else footStep(1 / 120, inputState());
      acc -= 1 / 120;
    }
    trafficUpdate(dt);
    pedUpdate(dt);
    if (player.mode === "car") carWorldCollisions(dt);
    if (window.Police) window.Police.update(dt, player);
    // heat cooldown
    heatCool += dt;
    if (heatCool > 3 && player.heat > 0) {
      heatCool = 0;
      player.heat = Math.max(0, player.heat - 0.25);
    }
    if (player.hp <= 0) {
      player.hp = 100;
      player.heat = 0;
      flash("WASTED", 2000);
      if (player.mode === "car") toggleEnter();
      player.x = 0;
      player.z = 0;
    }
  }

  const sp = Math.hypot(player.vx, player.vy);
  const f = [Math.sin(player.psi), Math.cos(player.psi)];

  if (player.mode === "car" && occupied) {
    const bike = occupied.kind === "bike";
    occupied.x = player.x;
    occupied.z = player.z;
    occupied.psi = player.psi;
    occupied.g.position.set(player.x, groundY(player.x, player.z), player.z);
    occupied.g.rotation.y = player.psi;
    if (bike) {
      const lean = -player.steer * Math.min(1, sp / 14) * 0.4;
      occupied.b.rotation.z += (lean - occupied.b.rotation.z) * Math.min(1, dt * 6);
      occupied.b.rotation.x = -player.axp * 0.002;
      char.g.visible = true;
      char.g.position.set(player.x, groundY(player.x, player.z), player.z);
      char.g.rotation.y = player.psi;
      char.g.rotation.z = occupied.b.rotation.z;
      char.parts.lL.rotation.x = -1.15;
      char.parts.lR.rotation.x = -1.15;
      char.parts.aL.rotation.x = -0.55;
      char.parts.aR.rotation.x = -0.55;
    } else {
      occupied.b.rotation.z = 0;
      occupied.b.rotation.x = -player.axp * 0.004;
    }
    whl += (player.vx * dt) / (player.wr || WR);
    occupied.wheels.forEach((w) => (w.rotation.x = whl));
    occupied.fw.forEach((w) => (w.rotation.y = player.delta));
    occupied.tailM.emissiveIntensity = player.brk ? 4 : 0.6;
    // skid marks
    skT += dt;
    if (player.slip > 0.06 && sp > 3 && onRoad(player.x, player.z) && skT > 0.025) {
      skT = 0;
      [-0.98, 0.98].forEach((x) => {
        const px = player.x + Math.cos(player.psi) * x - f[0] * 1.4,
          pz = player.z - Math.sin(player.psi) * x - f[1] * 1.4;
        _d.position.set(px, groundY(px, pz) + 0.07, pz);
        _d.rotation.set(
          0,
          Math.atan2(
            player.vx * f[0] + player.vy * Math.cos(player.psi),
            player.vx * f[1] + player.vy * -Math.sin(player.psi),
          ),
          0,
        );
        _d.scale.set(1, 1, 1);
        _d.updateMatrix();
        skid.setMatrixAt(sk++ % SK, _d.matrix);
      });
      skid.instanceMatrix.needsUpdate = true;
    }
  } else {
    char.g.position.set(player.x, groundY(player.x, player.z), player.z);
    char.g.rotation.y = player.psi;
    char.g.rotation.z = 0;
    const s = Math.sin(player.walkPhase) * Math.min(1, player.walkSpeed / 3);
    char.parts.lL.rotation.x = s * 0.6;
    char.parts.lR.rotation.x = -s * 0.6;
    char.parts.aL.rotation.x = -s * 0.5;
    char.parts.aR.rotation.x = s * 0.5;
  }

  // camera
  let dY = player.psi - camYaw;
  dY = Math.atan2(Math.sin(dY), Math.cos(dY));
  camYaw += dY * Math.min(1, dt * (player.mode === "car" ? 4 : 3));
  if (player.mode === "car") {
    if (hood && occupied && occupied.kind !== "bike") {
      cam.position.set(
        player.x + f[0] * 0.4,
        1.15,
        player.z + f[1] * 0.4,
      );
      cam.lookAt(player.x + f[0] * 30, 1, player.z + f[1] * 30);
    } else {
      const cx = player.x - Math.sin(camYaw) * (8 + sp * 0.03),
        cz = player.z - Math.cos(camYaw) * (8 + sp * 0.03);
      cam.position.set(cx, 2.8 + sp * 0.012, cz);
      cam.lookAt(player.x + f[0] * 5, 1.1, player.z + f[1] * 5);
    }
    cam.fov = 62 + Math.min(sp, 90) * 0.28;
  } else {
    const d = 5.5;
    cam.position.set(
      player.x - Math.sin(camYaw) * d,
      2.7,
      player.z - Math.cos(camYaw) * d,
    );
    cam.lookAt(player.x, 1.3, player.z);
    cam.fov = 60;
  }
  cam.updateProjectionMatrix();
  sun.position.set(
    player.x + sunDir.x * 120,
    sunDir.y * 120,
    player.z + sunDir.z * 120,
  );
  sun.target.position.set(player.x, 0, player.z);

  if (arcadeDoorMat) arcadeDoorMat.opacity = 0.55 + 0.3 * Math.sin(now * 0.004);

  // arcade interaction prompt
  const nearArcade =
    run &&
    !paused &&
    arcade &&
    player.mode === "foot" &&
    Math.hypot(player.x - arcade.x, player.z - arcade.z) < arcade.r;
  if (nearArcade !== promptShown) {
    promptShown = nearArcade;
    $("prompt").classList.toggle("show", nearArcade);
  }

  // HUD
  if (++fr % 3 === 0) {
    const onBike =
      player.mode === "car" && occupied && occupied.kind === "bike";
    $("kmh").textContent = Math.round(sp * 3.6);
    $("gear").textContent =
      player.mode === "foot"
        ? "WALK"
        : onBike
          ? "BIKE"
          : player.vx < -0.5
            ? "R"
            : sp < 0.5
              ? "N"
              : player.gear + 1;
    $("rpmf").style.width =
      Math.min(100, ((player.rpm - 1000) / 6800) * 100) + "%";
    $("hpf").style.width = Math.max(0, player.hp) + "%";
    const stars = Math.round(player.heat);
    $("wanted").textContent = stars > 0 ? "★".repeat(stars) : "–";
    $("mode").textContent =
      player.mode === "car"
        ? onBike
          ? "BIKING · " + occupied.spec.name
          : "DRIVING"
        : "ON FOOT";
    drawMini();
    if (msgT && now > msgT) {
      $("msg").textContent = "";
      msgT = 0;
    }
  }
  if (ac) {
    const active = player.mode === "car";
    o1.frequency.value = active ? player.rpm / 30 : 40;
    o2.frequency.value = active ? player.rpm / 60 : 20;
    gn.gain.value = active ? 0.05 + 0.06 * player.thr : 0;
    const chasing =
      window.Police &&
      window.Police.units.length > 0 &&
      player.heat > 0 &&
      run &&
      !paused &&
      !gameOver;
    sir.frequency.value = 640 + Math.sin(now / 100) * 240;
    sirG.gain.value = chasing ? 0.05 : 0;
  }
  R.render(scene, cam);
}

function inputState() {
  const k = keys;
  const t = window.touchControls;
  const jx = t && t.active ? t.x : 0;
  const jy = t && t.active ? t.y : 0;
  const keySteer = (k.a || k.arrowleft ? 1 : 0) - (k.d || k.arrowright ? 1 : 0);
  return {
    th: k.w || k.arrowup || jy > 0.25 ? 1 : 0,
    br: k.s || k.arrowdown || jy < -0.25 ? 1 : 0,
    hb: k[" "] ? 1 : 0,
    steer: Math.max(-1, Math.min(1, keySteer - jx)),
    left: k.a || k.arrowleft || jx < -0.2 ? 1 : 0,
    right: k.d || k.arrowright || jx > 0.2 ? 1 : 0,
  };
}

// init
occupied = startCar;
player.mode = "car";
player.x = startCar.x;
player.z = startCar.z;
player.psi = startCar.psi;
char.g.visible = false;

if (window.MiniGames) {
  window.MiniGames.onOpen = () => {
    paused = true;
    promptShown = false;
    $("prompt").classList.remove("show");
  };
  window.MiniGames.onClose = () => {
    paused = false;
  };
}
const promptEl = $("prompt");
if (promptEl) promptEl.addEventListener("click", openArcade);

// ---- Police pursuit + game over
if (window.Police) {
  window.Police.init({
    scene,
    resolve,
    makePoliceCar,
    onCaught: triggerGameOver,
  });
}

function triggerGameOver() {
  if (gameOver) return;
  gameOver = true;
  for (const k in keys) keys[k] = 0;
  promptShown = false;
  $("prompt").classList.remove("show");
  const go = $("gameover");
  if (go) go.classList.add("show");
}

function respawn() {
  if (window.Police) window.Police.clear();
  const go = $("gameover");
  if (go) go.classList.remove("show");
  if (player.mode === "car") toggleEnter();
  player.hp = 100;
  player.heat = 0;
  heatCool = 0;
  player.x = 0;
  player.z = 0;
  player.psi = 0;
  player.vx = player.vy = player.w = 0;
  for (const k in keys) keys[k] = 0;
  gameOver = false;
  flash("BACK ON THE STREETS", 1500);
}
const respawnEl = $("respawn");
if (respawnEl) respawnEl.addEventListener("click", respawn);

$("go").onclick = () => {
  $("start").remove();
  audio();
  run = true;
  flash("WELCOME TO OPEN CITY", 1800);
};
requestAnimationFrame(frame);
