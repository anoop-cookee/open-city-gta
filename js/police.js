window.Police = (function () {
  const CITY = 560,
    BLOCK = 140,
    WR = 0.34;
  const LINES = [];
  for (let i = -4; i <= 4; i++) LINES.push(i * BLOCK);

  let scene = null,
    resolve = null,
    makePoliceCar = null,
    onCaught = null;
  const units = [];
  const lastPlayer = { x: 0, z: 0 };
  let spawnTimer = 0,
    bustT = 0,
    flashPhase = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nearestLine = (v) => {
    let best = LINES[0];
    for (const L of LINES) if (Math.abs(v - L) < Math.abs(v - best)) best = L;
    return best;
  };

  function init(opts) {
    scene = opts.scene;
    resolve = opts.resolve;
    makePoliceCar = opts.makePoliceCar;
    onCaught = opts.onCaught || function () {};
  }

  function removeUnit(i) {
    const u = units[i];
    if (u) scene.remove(u.car.g);
    units.splice(i, 1);
  }

  function clear() {
    while (units.length) removeUnit(0);
    bustT = 0;
    spawnTimer = 0;
  }

  function spawnCar() {
    let best = null,
      bestD = Infinity;
    for (let tries = 0; tries < 40; tries++) {
      const axis = Math.random() < 0.5 ? "x" : "z";
      const road = LINES[(Math.random() * LINES.length) | 0];
      const pos = (Math.random() * 2 - 1) * CITY;
      const x = axis === "x" ? pos : road;
      const z = axis === "x" ? road : pos;
      const d = Math.hypot(x - lastPlayer.x, z - lastPlayer.z);
      if (d < 70 || d > 170) continue;
      const score = Math.abs(d - 115);
      if (score < bestD) {
        bestD = score;
        best = { axis, road, pos, x, z };
      }
    }
    if (!best) return;

    const dir =
      (best.axis === "x" ? lastPlayer.x - best.pos : lastPlayer.z - best.pos) >= 0
        ? 1
        : -1;
    const car = makePoliceCar();
    const u = {
      car,
      x: best.x,
      z: best.z,
      psi:
        best.axis === "x"
          ? dir > 0
            ? Math.PI / 2
            : -Math.PI / 2
          : dir > 0
            ? 0
            : Math.PI,
      speed: 8,
      mode: "grid",
      ai: {
        axis: best.axis,
        road: best.road,
        pos: best.pos,
        dir,
        lastLine: 1e9,
      },
    };
    car.g.position.set(u.x, 0, u.z);
    car.g.rotation.y = u.psi;
    scene.add(car.g);
    units.push(u);
  }

  function snapToGrid(u) {
    const lx = nearestLine(u.x),
      lz = nearestLine(u.z);
    if (Math.abs(u.x - lx) <= Math.abs(u.z - lz)) {
      u.ai.axis = "z";
      u.ai.road = lx;
      u.ai.pos = u.z;
    } else {
      u.ai.axis = "x";
      u.ai.road = lz;
      u.ai.pos = u.x;
    }
    u.ai.lastLine = 1e9;
    const target = u.ai.axis === "x" ? lastPlayer.x : lastPlayer.z;
    u.ai.dir = target >= u.ai.pos ? 1 : -1;
    u.mode = "grid";
  }

  function gridStep(u, dt, px, pz, base) {
    const ai = u.ai;
    u.speed += clamp(base - u.speed, -26 * dt, 12 * dt);
    ai.pos += ai.dir * u.speed * dt;

    const lim = CITY + 60;
    if (ai.pos > lim || ai.pos < -lim) {
      ai.pos = -Math.sign(ai.pos) * lim;
      ai.lastLine = 1e9;
    }
    const ix = Math.round(ai.pos / BLOCK) * BLOCK;
    if (Math.abs(ai.pos - ix) < 1.2 && ai.lastLine !== ix) {
      ai.lastLine = ix;
      const alongDist =
        ai.axis === "x" ? Math.abs(px - ai.pos) : Math.abs(pz - ai.pos);
      const playerCross = ai.axis === "x" ? pz : px;
      const crossDist = Math.abs(playerCross - ai.road);
      if (crossDist > 24 && crossDist > alongDist * 0.5) {
        const cross = ai.road;
        ai.axis = ai.axis === "x" ? "z" : "x";
        ai.road = ix;
        ai.pos = cross;
      }
      const target = ai.axis === "x" ? px : pz;
      if ((target - ai.pos) * ai.dir < 0) ai.dir *= -1;
    }

    const lane = (ai.axis === "x" ? -1 : 1) * 4 * ai.dir;
    if (ai.axis === "x") {
      u.x = ai.pos;
      u.z = ai.road + lane;
      u.psi = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      u.x = ai.road + lane;
      u.z = ai.pos;
      u.psi = ai.dir > 0 ? 0 : Math.PI;
    }
    u.car.g.position.set(u.x, 0, u.z);
    u.car.g.rotation.y = u.psi;
    u.car.wheels.forEach((w) => (w.rotation.x += (u.speed * dt) / WR));
  }

  function directStep(u, dt, px, pz, base, dist) {
    const dx = px - u.x,
      dz = pz - u.z;
    const targetPsi = Math.atan2(dx, dz);
    let da = targetPsi - u.psi;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    u.psi += clamp(da, -2.4 * dt, 2.4 * dt);

    const want = clamp(dist * 1.1, 6, base + 4);
    u.speed += clamp(want - u.speed, -30 * dt, 16 * dt);
    u.x += Math.sin(u.psi) * u.speed * dt;
    u.z += Math.cos(u.psi) * u.speed * dt;

    const p = { x: u.x, z: u.z };
    if (resolve(p, 1.5)) u.speed *= 0.6;
    u.x = p.x;
    u.z = p.z;

    u.car.g.position.set(u.x, 0, u.z);
    u.car.g.rotation.y = u.psi;
    u.car.wheels.forEach((w) => (w.rotation.x += (u.speed * dt) / WR));
  }

  function update(dt, player) {
    if (!scene || !makePoliceCar) return;
    lastPlayer.x = player.x;
    lastPlayer.z = player.z;
    flashPhase += dt;

    const heat = player.heat;
    const target = heat > 0.05 ? Math.min(5, Math.ceil(heat)) : 0;

    if (target === 0) {
      if (units.length) clear();
      return;
    }

    if (units.length < target) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnCar();
        spawnTimer = 2;
      }
    } else {
      spawnTimer = 0.4;
    }
    while (units.length > target) {
      let fi = 0,
        fd = -1;
      units.forEach((u, i) => {
        const d = Math.hypot(u.x - player.x, u.z - player.z);
        if (d > fd) {
          fd = d;
          fi = i;
        }
      });
      removeUnit(fi);
    }

    const base = 15 + Math.min(5, heat) * 2.5;
    let caught = false;
    units.forEach((u, i) => {
      const dx = player.x - u.x,
        dz = player.z - u.z;
      const dist = Math.hypot(dx, dz);

      if (u.mode === "grid" && dist < 30) u.mode = "direct";
      else if (u.mode === "direct" && dist > 42) snapToGrid(u);

      if (u.mode === "direct") directStep(u, dt, player.x, player.z, base, dist);
      else gridStep(u, dt, player.x, player.z, base);

      if (player.mode === "car" && dist < 3.8 && dist > 0.01) {
        const push = ((3.8 - dist) / dist) * 0.35;
        player.x += dx * push;
        player.z += dz * push;
        player.vx *= 0.85;
      }

      const catchR = player.mode === "car" ? 4 : 2.6;
      if (dist < catchR) caught = true;

      const on = (flashPhase * 8 + i) % 2 < 1;
      u.car.lightR.emissiveIntensity = on ? 4 : 0.4;
      u.car.lightL.emissiveIntensity = on ? 0.4 : 4;
    });

    bustT = caught ? bustT + dt : Math.max(0, bustT - dt * 2);
    if (bustT > 0.4) {
      bustT = 0;
      clear();
      onCaught();
    }
  }

  return {
    init,
    update,
    clear,
    units,
    get flashPhase() {
      return flashPhase;
    },
  };
})();
