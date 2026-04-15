// Runtime enemy system (global-script style)
// APIs: createEnemies(level), updateEnemies(enemies, player, platforms, dt, now),
//       checkEnemyCollisions(enemies, player, now), drawEnemies(ctx, enemies, camera, now)

(function () {
  const ENEMY_STATES = {
    IDLE: "IDLE",
    PATROL: "PATROL",
    PURSUIT: "PURSUIT",
    INTERCEPT: "INTERCEPT",
    RETURN: "RETURN",
    ACTIVE: "ACTIVE"
  };

  const DEBUG = {
    enabled: false,
    showDetection: false,
    showState: false,
    showPrediction: false
  };

  const WORLD_ENEMY_COLORS = {
    mesa: { stalker: "#4B2E20", guard: "#5A4438", hoverer: "#C86B3C", sentinel: "#FFBE5C", razorbat: "#8F3F2A" },
    tundra: { stalker: "#304556", guard: "#41657D", hoverer: "#7ED6FF", sentinel: "#C8F1FF", razorbat: "#5A78A8" },
    overgrowth: { stalker: "#244330", guard: "#35583F", hoverer: "#6FE38D", sentinel: "#C7FF6A", razorbat: "#4D8C45" },
    foundry: { stalker: "#3C3C42", guard: "#534C52", hoverer: "#D16C4E", sentinel: "#FF9F6E", razorbat: "#8B4253" }
  };

  // Allow toggling from devtools: window.ENEMY_DEBUG = { enabled: true, showState: true }
  Object.defineProperty(window, "ENEMY_DEBUG", {
    get() {
      return DEBUG;
    },
    set(v) {
      if (!v || typeof v !== "object") return;
      for (const k of Object.keys(DEBUG)) {
        if (k in v) DEBUG[k] = !!v[k];
      }
    }
  });

  function aabbOverlaps(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getPlatformById(platforms, id) {
    if (id == null) return null;
    for (const p of platforms) {
      if (p.id === id) return p;
    }
    return null;
  }

  function calcDetectionBox(e) {
    const w = e.detectionBox?.w ?? 260;
    const h = e.detectionBox?.h ?? 120;
    const lead = e.detectionBox?.lead ?? 40;
    const ox = e.detectionBox?.followFacing
      ? (e.facing >= 0 ? lead : -lead - w)
      : (e.detectionBox?.ox ?? (e.facing >= 0 ? 40 : -40 - w));
    const oy = e.detectionBox?.oy ?? -40;
    return { x: e.x + ox, y: e.y + oy, w, h };
  }

  function setState(e, next, now) {
    if (e.state === next) return;
    e.state = next;
    e.stateSince = now;
  }

  function getEnemyPalette(worldType) {
    return WORLD_ENEMY_COLORS[worldType] || WORLD_ENEMY_COLORS.foundry;
  }

  function makeBaseEnemy(id, type, x, y, w, h, platformId) {
    return {
      id,
      type,
      x,
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      platformId: platformId ?? null,
      state: ENEMY_STATES.IDLE,
      stateSince: 0,
      facing: 1,
      speed: 0,
      detectionBox: null,
      spawnX: x,
      spawnY: y,
      homeX: x,
      homeY: y,
      // Variant config slots
      patrolMinX: null,
      patrolMaxX: null,
      aggroRange: null,
      interceptLeadTime: null,
      activeUntil: 0,
      lastAttackAt: 0,
      attackTargetX: null,
      attackTargetY: null,
      predictedX: null,
      predictedY: null,
      hp: 1,
      maxHp: 1,
      dead: false,
      deadAt: 0,
      hurtUntil: 0,
      invulnerableUntil: 0
    };
  }

  function createEnemyFromSpawn(spawn, platform, idx) {
    const type = spawn.type;
    if (type === "pacingStalker") {
      const w = 42;
      const h = 34;
      const x = clamp(
        (spawn.x ?? (platform.x + platform.w * 0.5 - w * 0.5)),
        platform.x,
        platform.x + platform.w - w
      );
      const y = platform.y - h;
      const e = makeBaseEnemy(`stalker_${idx}`, type, x, y, w, h, platform.id);
      e.speed = spawn.speed ?? 160; // px/s
      e.state = ENEMY_STATES.PATROL;
      e.patrolMinX = platform.x;
      e.patrolMaxX = platform.x + platform.w - e.w;
      e.aggroRange = spawn.aggroRange ?? 260;
      e.detectionBox = { w: e.aggroRange, h: 140, lead: 30, oy: -60, followFacing: true };
      e.hoverBob = randomSeedFromId(idx) * Math.PI * 2;
      e.hp = 2;
      e.maxHp = 2;
      return e;
    }

    if (type === "gapGuard") {
      const w = 46;
      const h = 26;
      const x = clamp(
        (spawn.x ?? (platform.x + platform.w * 0.5 - w * 0.5)),
        platform.x,
        platform.x + platform.w - w
      );
      const y = platform.y - h;
      const e = makeBaseEnemy(`gapguard_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.IDLE;
      e.speed = 0;
      e.aggroRange = spawn.aggroRange ?? 240;
      e.activeWindowMs = spawn.activeWindowMs ?? 260;
      e.hoverBob = randomSeedFromId(idx) * Math.PI * 2;
      e.hp = 2;
      e.maxHp = 2;
      return e;
    }

    if (type === "hoverer") {
      const w = 36;
      const h = 36;
      const x = spawn.x ?? (platform.x + platform.w * 0.5 - w * 0.5);
      const y = spawn.y ?? (platform.y - 120);
      const e = makeBaseEnemy(`hoverer_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.INTERCEPT;
      e.speed = spawn.speed ?? 190;
      e.interceptLeadTime = spawn.interceptLeadTime ?? 0.35;
      e.homeX = e.spawnX;
      e.homeY = e.spawnY;
      e.aggroRange = spawn.aggroRange ?? 520;
      e.hoverBob = randomSeedFromId(idx) * Math.PI * 2;
      e.hp = 2;
      e.maxHp = 2;
      return e;
    }

    if (type === "sentinel") {
      const w = 30;
      const h = 30;
      const x = spawn.x ?? (platform.x + platform.w * 0.5 - w * 0.5);
      const y = spawn.y ?? (platform.y - 92);
      const e = makeBaseEnemy(`sentinel_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.PATROL;
      e.speed = spawn.speed ?? 210;
      e.aggroRange = spawn.aggroRange ?? 360;
      e.homeX = x;
      e.homeY = y;
      e.hoverPhase = randomSeedFromId(idx + 100) * Math.PI * 2;
      e.hoverBob = randomSeedFromId(idx + 200) * Math.PI * 2;
      e.hp = 3;
      e.maxHp = 3;
      return e;
    }

    if (type === "razorbat") {
      const w = 34;
      const h = 20;
      const x = spawn.x ?? (platform.x + platform.w * 0.5 - w * 0.5);
      const y = spawn.y ?? (platform.y - 110);
      const e = makeBaseEnemy(`razorbat_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.PATROL;
      e.speed = spawn.speed ?? 235;
      e.aggroRange = spawn.aggroRange ?? 340;
      e.homeX = x;
      e.homeY = y;
      e.hoverPhase = randomSeedFromId(idx + 300) * Math.PI * 2;
      e.hoverBob = randomSeedFromId(idx + 400) * Math.PI * 2;
      e.hp = 1;
      e.maxHp = 1;
      return e;
    }

    if (type === "bossColossus") {
      const w = 168;
      const h = 124;
      const x = platform.x + platform.w * 0.5 - w * 0.5;
      const y = platform.y - h;
      const e = makeBaseEnemy(`boss_colossus_${idx}`, type, x, y, w, h, platform.id);
      e.isBoss = true;
      e.state = ENEMY_STATES.PATROL;
      e.speed = 255;
      e.homeX = x;
      e.homeY = y;
      e.hp = 14;
      e.maxHp = 14;
      e.aggroRange = 900;
      e.chargeCooldown = 1100;
      e.hoverBob = randomSeedFromId(idx) * Math.PI * 2;
      return e;
    }

    if (type === "bossTempest") {
      const w = 112;
      const h = 92;
      const x = platform.x + platform.w * 0.5 - w * 0.5;
      const y = platform.y - 320;
      const e = makeBaseEnemy(`boss_tempest_${idx}`, type, x, y, w, h, platform.id);
      e.isBoss = true;
      e.state = ENEMY_STATES.PATROL;
      e.speed = 255;
      e.homeX = x;
      e.homeY = y;
      e.hp = 11;
      e.maxHp = 11;
      e.aggroRange = 1100;
      e.chargeCooldown = 1350;
      e.hoverPhase = randomSeedFromId(idx + 500) * Math.PI * 2;
      e.hoverBob = randomSeedFromId(idx + 600) * Math.PI * 2;
      return e;
    }

    if (type === "bossOracle") {
      const w = 96;
      const h = 96;
      const x = platform.x + platform.w * 0.5 - w * 0.5;
      const y = platform.y - 240;
      const e = makeBaseEnemy(`boss_oracle_${idx}`, type, x, y, w, h, platform.id);
      e.isBoss = true;
      e.state = ENEMY_STATES.PATROL;
      e.speed = 200;
      e.homeX = x;
      e.homeY = y;
      e.hp = 12;
      e.maxHp = 12;
      e.aggroRange = 1100;
      e.chargeCooldown = 1200;
      e.hoverPhase = randomSeedFromId(idx + 700) * Math.PI * 2;
      e.hoverBob = randomSeedFromId(idx + 800) * Math.PI * 2;
      return e;
    }

    return null;
  }

  function randomSeedFromId(id) {
    const n = (id + 1) * 16807 % 2147483647;
    return (n % 1000) / 1000;
  }

  function createEnemies(level) {
    const enemies = [];
    const plats = level?.platforms ?? [];
    let idx = 0;
    for (const p of plats) {
      if (!p || !p.enemySpawn) continue;
      const spawn = p.enemySpawn;
      const list = Array.isArray(spawn) ? spawn : [spawn];
      for (const s of list) {
        const e = createEnemyFromSpawn(s, p, idx++);
        if (e) {
          e.worldType = level?.worldType || "foundry";
          enemies.push(e);
        }
      }
    }
    return enemies;
  }

  function updatePacingStalker(e, player, platforms, dt, now) {
    const plat = getPlatformById(platforms, e.platformId);
    if (!plat) return;

    // Keep it on its platform.
    e.patrolMinX = plat.x;
    e.patrolMaxX = plat.x + plat.w - e.w;
    e.y = plat.y - e.h;

    const det = calcDetectionBox(e);
    const seesPlayer = aabbOverlaps(det, player);
    if (seesPlayer) setState(e, ENEMY_STATES.PURSUIT, now);

    if (!seesPlayer && e.state === ENEMY_STATES.PURSUIT) {
      setState(e, ENEMY_STATES.RETURN, now);
    }

    if (e.state === ENEMY_STATES.PATROL) {
      e.vx = lerp(e.vx, e.facing * e.speed, Math.min(1, dt * 7));
    } else if (e.state === ENEMY_STATES.PURSUIT) {
      const targetX = clamp(player.x + player.w * 0.5 - e.w * 0.5, e.patrolMinX, e.patrolMaxX);
      const dx = targetX - e.x;
      const dir = Math.abs(dx) < 3 ? e.facing : (dx > 0 ? 1 : -1);
      e.facing = dir;
      e.vx = lerp(e.vx, dir * (e.speed * 1.15), Math.min(1, dt * 9));
    } else if (e.state === ENEMY_STATES.RETURN) {
      const homeX = clamp(e.spawnX, e.patrolMinX, e.patrolMaxX);
      const dx = homeX - e.x;
      if (Math.abs(dx) < 2) {
        e.x = homeX;
        e.vx = 0;
        setState(e, ENEMY_STATES.PATROL, now);
      } else {
        const dir = dx > 0 ? 1 : -1;
        e.facing = dir;
        e.vx = lerp(e.vx, dir * e.speed, Math.min(1, dt * 8));
      }
    }

    // Clamp and flip at edges.
    const nextX = e.x + e.vx * dt;
    if (nextX <= e.patrolMinX) {
      e.x = e.patrolMinX;
      e.vx = 0;
      e.facing = 1;
    } else if (nextX >= e.patrolMaxX) {
      e.x = e.patrolMaxX;
      e.vx = 0;
      e.facing = -1;
    } else {
      e.x = nextX;
    }
  }

  function updateGapGuard(e, player, platforms, dt, now) {
    const plat = getPlatformById(platforms, e.platformId);
    if (plat) e.y = plat.y - e.h;

    // Face toward player for readability.
    e.facing = (player.x + player.w * 0.5) >= (e.x + e.w * 0.5) ? 1 : -1;

    const dx = Math.abs((player.x + player.w * 0.5) - (e.x + e.w * 0.5));
    const dy = Math.abs((player.y + player.h * 0.5) - (e.y + e.h * 0.5));
    const inRange = dx <= e.aggroRange && dy <= 140;

    if (player.state === "dash" && inRange) {
      e.activeUntil = Math.max(e.activeUntil, now + (e.activeWindowMs ?? 260));
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    if (e.state === ENEMY_STATES.ACTIVE && now > e.activeUntil) {
      setState(e, ENEMY_STATES.IDLE, now);
    }

    e.vx = lerp(e.vx, 0, Math.min(1, dt * 10));
  }

  function updateHoverer(e, player, platforms, dt, now) {
    // Basic intercept: if player is airborne and nearby, lead their current velocity.
    const dx = (player.x + player.w * 0.5) - (e.x + e.w * 0.5);
    const dy = (player.y + player.h * 0.5) - (e.y + e.h * 0.5);
    const near = (dx * dx + dy * dy) <= (e.aggroRange * e.aggroRange);

    let targetX = e.homeX ?? e.spawnX;
    let targetY = e.homeY ?? e.spawnY;

    if (near && !player.onGround) {
      // Player velocities are tuned to ~60fps; approximate px/s by *60.
      const lead = e.interceptLeadTime ?? 0.35;
      const pvx = (player.vx ?? 0) * 60;
      const pvy = (player.vy ?? 0) * 60;
      targetX = player.x + pvx * lead;
      targetY = (player.y + pvy * lead) - 40;
      e.predictedX = targetX;
      e.predictedY = targetY;
    } else {
      e.predictedX = null;
      e.predictedY = null;
    }

    const cx = e.x + e.w * 0.5;
    const cy = e.y + e.h * 0.5;
    const tx = targetX;
    const ty = targetY;
    const vx = tx - cx;
    const vy = ty - cy;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    const desiredVx = (vx / len) * (e.speed ?? 190);
    const desiredVy = (vy / len) * (e.speed ?? 190);
    e.vx = lerp(e.vx, desiredVx, Math.min(1, dt * 4.8));
    e.vy = lerp(e.vy, desiredVy, Math.min(1, dt * 4.8));
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.facing = vx >= 0 ? 1 : -1;
  }

  function updateSentinel(e, player, platforms, dt, now) {
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const dx = px - (e.x + e.w * 0.5);
    const dy = py - (e.y + e.h * 0.5);
    const near = (dx * dx + dy * dy) <= (e.aggroRange * e.aggroRange);

    if (near && now - e.lastAttackAt > 850) {
      e.lastAttackAt = now;
      e.activeUntil = now + 240;
      e.attackTargetX = clamp(px - e.w * 0.5, e.homeX - 120, e.homeX + 120);
      e.attackTargetY = clamp(py - e.h * 0.5 - 20, e.homeY - 110, e.homeY + 90);
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
    const targetX = active ? e.attackTargetX : e.homeX;
    const targetY = active ? e.attackTargetY : e.homeY + Math.sin((now / 220) + e.hoverPhase) * 8;

    const cx = e.x + e.w * 0.5;
    const cy = e.y + e.h * 0.5;
    const vx = targetX - cx;
    const vy = targetY - cy;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    const desiredVx = (vx / len) * (e.speed ?? 210);
    const desiredVy = (vy / len) * (e.speed ?? 210);
    e.vx = lerp(e.vx, desiredVx, Math.min(1, dt * 5.2));
    e.vy = lerp(e.vy, desiredVy, Math.min(1, dt * 5.2));
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.facing = vx >= 0 ? 1 : -1;

    if (!active && e.state === ENEMY_STATES.ACTIVE && now > e.activeUntil) {
      setState(e, ENEMY_STATES.RETURN, now);
    }

    if (!active && Math.abs(e.x - e.homeX) < 2 && Math.abs(e.y - e.homeY) < 2) {
      e.x = e.homeX;
      e.y = e.homeY;
      if (e.state !== ENEMY_STATES.PATROL) setState(e, ENEMY_STATES.PATROL, now);
    }
  }

  function updateRazorbat(e, player, platforms, dt, now) {
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const ex = e.x + e.w * 0.5;
    const ey = e.y + e.h * 0.5;
    const dx = px - ex;
    const dy = py - ey;
    const near = (dx * dx + dy * dy) <= (e.aggroRange * e.aggroRange);

    if (near && now - e.lastAttackAt > 1150 && e.state !== ENEMY_STATES.ACTIVE) {
      e.lastAttackAt = now;
      e.activeUntil = now + 360;
      e.attackTargetX = px + Math.sign(dx || 1) * 50;
      e.attackTargetY = py - 12;
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    let targetX = e.homeX + Math.cos(now / 260 + e.hoverPhase) * 26;
    let targetY = e.homeY + Math.sin(now / 190 + e.hoverPhase) * 16;

    if (e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      targetX = e.attackTargetX;
      targetY = e.attackTargetY;
    } else if (e.state === ENEMY_STATES.ACTIVE && now > e.activeUntil) {
      setState(e, ENEMY_STATES.RETURN, now);
    }

    if (e.state === ENEMY_STATES.RETURN) {
      targetX = e.homeX;
      targetY = e.homeY;
      if (Math.abs(ex - e.homeX) < 10 && Math.abs(ey - e.homeY) < 10) {
        setState(e, ENEMY_STATES.PATROL, now);
      }
    }

    const vx = targetX - ex;
    const vy = targetY - ey;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    const desiredVx = (vx / len) * (e.speed ?? 235);
    const desiredVy = (vy / len) * (e.speed ?? 235);
    e.vx = lerp(e.vx, desiredVx, Math.min(1, dt * 8));
    e.vy = lerp(e.vy, desiredVy, Math.min(1, dt * 8));
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.facing = vx >= 0 ? 1 : -1;
  }

  function updateBossColossus(e, player, platforms, dt, now) {
    const floor = getPlatformById(platforms, e.platformId);
    if (!floor) return;
    e.y = floor.y - e.h;
    const leftBound = floor.x + 100;
    const rightBound = floor.x + floor.w - e.w - 100;
    const playerCenter = player.x + player.w * 0.5;
    const myCenter = e.x + e.w * 0.5;

    if (e.state !== ENEMY_STATES.ACTIVE && now - e.lastAttackAt > (e.chargeCooldown || 1100)) {
      e.lastAttackAt = now;
      e.activeUntil = now + 720;
      e.facing = playerCenter >= myCenter ? 1 : -1;
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    if (e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      e.vx = lerp(e.vx, e.facing * e.speed * 1.45, Math.min(1, dt * 8));
    } else {
      if (e.state === ENEMY_STATES.ACTIVE && now > e.activeUntil) setState(e, ENEMY_STATES.RETURN, now);
      const patrolTarget = clamp(playerCenter - e.w * 0.5, leftBound, rightBound);
      const dx = patrolTarget - e.x;
      e.facing = dx >= 0 ? 1 : -1;
      e.vx = lerp(e.vx, Math.sign(dx || 1) * e.speed * 0.45, Math.min(1, dt * 4));
    }

    e.x = clamp(e.x + e.vx * dt, leftBound, rightBound);
    if (e.x === leftBound || e.x === rightBound) e.vx *= -0.3;
  }

  function updateBossTempest(e, player, platforms, dt, now) {
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const ex = e.x + e.w * 0.5;
    const ey = e.y + e.h * 0.5;

    if (e.state !== ENEMY_STATES.ACTIVE && now - e.lastAttackAt > (e.chargeCooldown || 1350)) {
      e.lastAttackAt = now;
      e.activeUntil = now + 680;
      e.attackTargetX = px - e.w * 0.5;
      e.attackTargetY = py - 18;
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    let targetX = e.homeX + Math.cos(now / 260 + e.hoverPhase) * 170;
    let targetY = e.homeY + Math.sin(now / 320 + e.hoverPhase) * 46;
    if (e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      targetX = e.attackTargetX;
      targetY = e.attackTargetY;
    } else if (e.state === ENEMY_STATES.ACTIVE && now > e.activeUntil) {
      setState(e, ENEMY_STATES.RETURN, now);
    }

    if (e.state === ENEMY_STATES.RETURN) {
      targetX = e.homeX;
      targetY = e.homeY;
      if (Math.abs(e.x - e.homeX) < 12 && Math.abs(e.y - e.homeY) < 12) setState(e, ENEMY_STATES.PATROL, now);
    }

    const vx = targetX - ex;
    const vy = targetY - ey;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    const desiredSpeed = e.state === ENEMY_STATES.ACTIVE ? e.speed * 1.45 : e.speed;
    e.vx = lerp(e.vx, (vx / len) * desiredSpeed, Math.min(1, dt * 5.2));
    e.vy = lerp(e.vy, (vy / len) * desiredSpeed, Math.min(1, dt * 5.2));
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.facing = vx >= 0 ? 1 : -1;
  }

  function updateBossOracle(e, player, platforms, dt, now) {
    const floor = getPlatformById(platforms, e.platformId);
    if (!floor) return;
    const perches = [
      { x: floor.x + 180, y: floor.y - 220 },
      { x: floor.x + floor.w * 0.5 - e.w * 0.5, y: floor.y - 340 },
      { x: floor.x + floor.w - 180 - e.w, y: floor.y - 220 }
    ];

    if (e.state !== ENEMY_STATES.ACTIVE && now - e.lastAttackAt > (e.chargeCooldown || 1200)) {
      e.lastAttackAt = now;
      e.activeUntil = now + 380;
      const playerCenter = player.x + player.w * 0.5;
      let best = perches[0];
      let bestDist = Infinity;
      for (const perch of perches) {
        const dx = perch.x - playerCenter;
        const score = Math.abs(dx);
        if (score < bestDist) {
          bestDist = score;
          best = perch;
        }
      }
      e.x = best.x;
      e.y = best.y;
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    if (e.state === ENEMY_STATES.ACTIVE && now > e.activeUntil) {
      setState(e, ENEMY_STATES.PATROL, now);
    }

    if (e.state !== ENEMY_STATES.ACTIVE) {
      const homeX = floor.x + floor.w * 0.5 - e.w * 0.5;
      const homeY = floor.y - 300 + Math.sin(now / 220 + e.hoverPhase) * 18;
      e.vx = lerp(e.vx, (homeX - e.x) * 2.2, Math.min(1, dt * 2.8));
      e.vy = lerp(e.vy, (homeY - e.y) * 2.2, Math.min(1, dt * 2.8));
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
  }

  function updateEnemies(enemies, player, platforms, dt, now) {
    if (!enemies || enemies.length === 0) return;
    for (const e of enemies) {
      if (!e || e.dead) continue;
      if (e.type === "pacingStalker") updatePacingStalker(e, player, platforms, dt, now);
      else if (e.type === "gapGuard") updateGapGuard(e, player, platforms, dt, now);
      else if (e.type === "hoverer") updateHoverer(e, player, platforms, dt, now);
      else if (e.type === "sentinel") updateSentinel(e, player, platforms, dt, now);
      else if (e.type === "razorbat") updateRazorbat(e, player, platforms, dt, now);
      else if (e.type === "bossColossus") updateBossColossus(e, player, platforms, dt, now);
      else if (e.type === "bossTempest") updateBossTempest(e, player, platforms, dt, now);
      else if (e.type === "bossOracle") updateBossOracle(e, player, platforms, dt, now);
    }
  }

  function enemyCollisionBox(e, now) {
    if (e.type === "gapGuard" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      // Expanded hazard zone when active.
      return { x: e.x - 30, y: e.y - 24, w: e.w + 60, h: e.h + 48 };
    }
    if (e.type === "bossColossus" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      return { x: e.x - 16, y: e.y, w: e.w + 32, h: e.h };
    }
    if (e.type === "bossTempest" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      return { x: e.x - 12, y: e.y - 12, w: e.w + 24, h: e.h + 24 };
    }
    if (e.type === "bossOracle" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      return { x: e.x - 40, y: e.y - 40, w: e.w + 80, h: e.h + 80 };
    }
    return { x: e.x, y: e.y, w: e.w, h: e.h };
  }

  function checkEnemyCollisions(enemies, player, now) {
    if (!enemies || enemies.length === 0) return false;
    for (const e of enemies) {
      if (!e || e.dead) continue;
      const box = enemyCollisionBox(e, now);
      if (aabbOverlaps(box, player)) return true;
    }
    return false;
  }

  function drawEnemies(ctx, enemies, camera, now) {
    if (!enemies || enemies.length === 0) return;

    for (const e of enemies) {
      if (e.dead && now - e.deadAt > 260) continue;
      const palette = getEnemyPalette(e.worldType);
      const bob = e.type === "hoverer"
        ? Math.sin(now / 180 + (e.hoverBob || 0)) * 4
        : Math.sin(now / 260 + (e.hoverBob || 0)) * 1.5;
      const sx = e.x - camera.x;
      const sy = e.y - camera.y + bob;
      const hurtAlpha = e.hurtUntil && now < e.hurtUntil ? 0.55 : 1;
      const deathAlpha = e.dead ? Math.max(0, 1 - (now - e.deadAt) / 260) : 1;

      ctx.save();
      ctx.globalAlpha = hurtAlpha * deathAlpha;

      if (e.type === "pacingStalker") {
        ctx.fillStyle = palette.stalker;
        ctx.fillRect(sx, sy, e.w, e.h);

        // Eye indicator.
        ctx.fillStyle = "#FFFFFF";
        const eyeX = sx + (e.facing >= 0 ? e.w * 0.65 : e.w * 0.2);
        const eyeY = sy + e.h * 0.35;
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 4, 0, Math.PI * 2);
        ctx.fill();

        if (e.state === ENEMY_STATES.PURSUIT) {
          ctx.fillStyle = "#FF4444";
          ctx.fillRect(sx + e.w * 0.5 - 4, sy - 10, 8, 8);
        }
      } else if (e.type === "gapGuard") {
        const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
        ctx.fillStyle = palette.guard;
        ctx.fillRect(sx, sy, e.w, e.h);
        ctx.fillStyle = "#111111";
        ctx.fillRect(sx + 6, sy + 6, e.w - 12, e.h - 12);

        if (active) {
          const box = enemyCollisionBox(e, now);
          const cx = box.x + box.w * 0.5 - camera.x;
          const cy = box.y + box.h * 0.5 - camera.y;
          ctx.save();
          ctx.globalAlpha = 0.75 + 0.15 * Math.sin(now / 60);
          ctx.strokeStyle = palette.sentinel;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(box.w, box.h) * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      } else if (e.type === "hoverer") {
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.fillStyle = palette.hoverer;
        ctx.beginPath();
        ctx.arc(0, 0, e.w * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, e.w * 0.5 + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (DEBUG.enabled && DEBUG.showPrediction && e.predictedX != null) {
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.beginPath();
          ctx.arc(e.predictedX - camera.x, e.predictedY - camera.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (e.type === "sentinel") {
        const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.rotate((now / 220) * (e.facing >= 0 ? 1 : -1));
        ctx.fillStyle = active ? "#FF6B6B" : palette.sentinel;
        ctx.beginPath();
        ctx.moveTo(0, -e.h * 0.55);
        ctx.lineTo(e.w * 0.55, 0);
        ctx.lineTo(0, e.h * 0.55);
        ctx.lineTo(-e.w * 0.55, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.type === "razorbat") {
        const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
        ctx.fillStyle = active ? "#FF6B6B" : palette.razorbat;
        ctx.beginPath();
        ctx.moveTo(sx, sy + e.h * 0.5);
        ctx.quadraticCurveTo(sx + e.w * 0.25, sy - 10, sx + e.w * 0.5, sy + e.h * 0.35);
        ctx.quadraticCurveTo(sx + e.w * 0.75, sy - 10, sx + e.w, sy + e.h * 0.5);
        ctx.quadraticCurveTo(sx + e.w * 0.75, sy + e.h, sx + e.w * 0.5, sy + e.h * 0.7);
        ctx.quadraticCurveTo(sx + e.w * 0.25, sy + e.h, sx, sy + e.h * 0.5);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(sx + (e.facing >= 0 ? e.w * 0.62 : e.w * 0.18), sy + e.h * 0.32, 4, 4);
      } else if (e.type === "bossColossus") {
        const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
        ctx.fillStyle = active ? "#E76F51" : "#6D6875";
        ctx.fillRect(sx, sy + 18, e.w, e.h - 18);
        ctx.fillStyle = "#B7B1C2";
        ctx.fillRect(sx + 18, sy, e.w - 36, 44);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(sx + (e.facing >= 0 ? e.w - 42 : 26), sy + 14, 12, 12);
      } else if (e.type === "bossTempest") {
        const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.rotate(Math.sin(now / 180 + e.hoverPhase) * 0.15);
        ctx.fillStyle = active ? "#7BE0FF" : "#4C6FFF";
        ctx.beginPath();
        ctx.moveTo(0, -e.h * 0.55);
        ctx.quadraticCurveTo(e.w * 0.52, -e.h * 0.2, e.w * 0.35, e.h * 0.45);
        ctx.quadraticCurveTo(0, e.h * 0.2, -e.w * 0.35, e.h * 0.45);
        ctx.quadraticCurveTo(-e.w * 0.52, -e.h * 0.2, 0, -e.h * 0.55);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.arc(0, 0, e.w * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === "bossOracle") {
        const active = e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil;
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.rotate(now / 620);
        ctx.fillStyle = active ? "#D65DFF" : "#7075FF";
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6;
          const r = i % 2 === 0 ? e.w * 0.54 : e.w * 0.26;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (active) {
          const box = enemyCollisionBox(e, now);
          ctx.strokeStyle = "rgba(214,93,255,0.55)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(box.x + box.w * 0.5 - camera.x, box.y + box.h * 0.5 - camera.y, box.w * 0.42, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();

      if (DEBUG.enabled && DEBUG.showDetection && e.type === "pacingStalker") {
        const det = calcDetectionBox(e);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(det.x - camera.x, det.y - camera.y, det.w, det.h);
      }
      if (DEBUG.enabled && DEBUG.showState) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(sx - 2, sy - 18, 90, 16);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "12px Arial";
        ctx.fillText(e.state, sx + 2, sy - 6);
      }
    }
  }

  window.createEnemies = createEnemies;
  window.updateEnemies = updateEnemies;
  window.checkEnemyCollisions = checkEnemyCollisions;
  window.drawEnemies = drawEnemies;
})();
