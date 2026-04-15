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
    mesa: { stalker: "#4B2E20", guard: "#5A4438", hoverer: "#C86B3C", sentinel: "#FFBE5C", razorbat: "#8F3F2A", sandrunner: "#E0A15A" },
    tundra: { stalker: "#304556", guard: "#41657D", hoverer: "#7ED6FF", sentinel: "#C8F1FF", razorbat: "#5A78A8", iceWisp: "#D7F7FF" },
    overgrowth: { stalker: "#244330", guard: "#35583F", hoverer: "#6FE38D", sentinel: "#C7FF6A", razorbat: "#4D8C45", vineCrawler: "#8DE36A" },
    foundry: { stalker: "#3C3C42", guard: "#534C52", hoverer: "#D16C4E", sentinel: "#FF9F6E", razorbat: "#8B4253", drillDrone: "#D7DCE2" }
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
      invulnerableUntil: 0,
      hazards: [],
      bossAttackMode: null,
      bossAttackStep: 0,
      attackStartedAt: 0,
      attackWindupUntil: 0,
      attackRecoverUntil: 0,
      orbitAngle: 0
    };
  }

  function getPlatformsByRole(platforms, role) {
    return platforms.filter((platform) => platform && platform.role === role && !platform.isBackground);
  }

  function addHazard(e, hazard) {
    if (!e.hazards) e.hazards = [];
    e.hazards.push(hazard);
    return hazard;
  }

  function updateEnemyHazards(e, dt, now) {
    if (!e.hazards || e.hazards.length === 0) return;
    e.hazards = e.hazards.filter((hazard) => {
      if (hazard.kind === "shockwave" || hazard.kind === "orb") {
        hazard.x += (hazard.vx || 0) * dt;
        hazard.y += (hazard.vy || 0) * dt;
      }

      if (hazard.kind === "orbit") {
        hazard.angle = (hazard.angle || 0) + (hazard.spin || 0) * dt;
        const cx = (hazard.anchorX || 0) + Math.cos(hazard.angle) * (hazard.radius || 0);
        const cy = (hazard.anchorY || 0) + Math.sin(hazard.angle) * (hazard.radius || 0);
        hazard.x = cx - hazard.w * 0.5;
        hazard.y = cy - hazard.h * 0.5;
      }

      return now < (hazard.expiresAt || 0);
    });
  }

  function hazardCollisionBox(hazard, now) {
    if (!hazard) return null;
    if (hazard.activeAt && now < hazard.activeAt) return null;
    return { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h };
  }

  function maybeBossContactBox(e, now) {
    if (e.type === "bossColossus" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      return { x: e.x - 16, y: e.y, w: e.w + 32, h: e.h };
    }
    if (e.type === "bossTempest" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      return { x: e.x - 12, y: e.y - 12, w: e.w + 24, h: e.h + 24 };
    }
    if (e.type === "bossOracle" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      return { x: e.x - 20, y: e.y - 20, w: e.w + 40, h: e.h + 40 };
    }
    return { x: e.x, y: e.y, w: e.w, h: e.h };
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

    if (type === "sandrunner") {
      const w = 54;
      const h = 28;
      const x = clamp((spawn.x ?? platform.x + platform.w * 0.5 - w * 0.5), platform.x, platform.x + platform.w - w);
      const y = platform.y - h;
      const e = makeBaseEnemy(`sandrunner_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.PATROL;
      e.speed = spawn.speed ?? 165;
      e.aggroRange = spawn.aggroRange ?? 280;
      e.patrolMinX = platform.x;
      e.patrolMaxX = platform.x + platform.w - e.w;
      e.hp = 2;
      e.maxHp = 2;
      return e;
    }

    if (type === "iceWisp") {
      const w = 30;
      const h = 30;
      const x = spawn.x ?? platform.x + platform.w * 0.5 - w * 0.5;
      const y = spawn.y ?? platform.y - 150;
      const e = makeBaseEnemy(`icewisp_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.INTERCEPT;
      e.speed = spawn.speed ?? 175;
      e.interceptLeadTime = spawn.interceptLeadTime ?? 0.3;
      e.aggroRange = spawn.aggroRange ?? 540;
      e.hp = 1;
      e.maxHp = 1;
      return e;
    }

    if (type === "vineCrawler") {
      const w = 40;
      const h = 24;
      const x = clamp((spawn.x ?? platform.x + platform.w * 0.5 - w * 0.5), platform.x, platform.x + platform.w - w);
      const y = platform.y - h;
      const e = makeBaseEnemy(`vinecrawler_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.PATROL;
      e.speed = spawn.speed ?? 130;
      e.aggroRange = spawn.aggroRange ?? 260;
      e.patrolMinX = platform.x;
      e.patrolMaxX = platform.x + platform.w - e.w;
      e.hp = 2;
      e.maxHp = 2;
      return e;
    }

    if (type === "drillDrone") {
      const w = 34;
      const h = 34;
      const x = spawn.x ?? platform.x + platform.w * 0.5 - w * 0.5;
      const y = spawn.y ?? platform.y - 110;
      const e = makeBaseEnemy(`drilldrone_${idx}`, type, x, y, w, h, platform.id);
      e.state = ENEMY_STATES.PATROL;
      e.speed = spawn.speed ?? 185;
      e.aggroRange = spawn.aggroRange ?? 320;
      e.homeX = x;
      e.homeY = y;
      e.hp = 2;
      e.maxHp = 2;
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
      e.chargeCooldown = 1050;
      e.bossAttackMode = "charge";
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
      e.chargeCooldown = 1200;
      e.bossAttackMode = "dive";
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
      e.chargeCooldown = 1100;
      e.bossAttackMode = "teleportBurst";
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

  function updateSandrunner(e, player, platforms, dt, now) {
    const plat = getPlatformById(platforms, e.platformId);
    if (!plat) return;
    e.y = plat.y - e.h;
    e.patrolMinX = plat.x;
    e.patrolMaxX = plat.x + plat.w - e.w;

    const px = player.x + player.w * 0.5;
    const dx = px - (e.x + e.w * 0.5);
    const chase = Math.abs(dx) < (e.aggroRange || 280);
    const dir = chase ? Math.sign(dx || e.facing || 1) : e.facing;
    e.facing = dir;
    const targetSpeed = (e.speed || 165) * (chase ? 1.35 : 0.85);
    e.vx = lerp(e.vx, dir * targetSpeed, Math.min(1, dt * 10));
    e.x = clamp(e.x + e.vx * dt, e.patrolMinX, e.patrolMaxX);
    if (e.x === e.patrolMinX || e.x === e.patrolMaxX) e.facing *= -1;
  }

  function updateVineCrawler(e, player, platforms, dt, now) {
    const plat = getPlatformById(platforms, e.platformId);
    if (!plat) return;
    e.y = plat.y - e.h;
    const px = player.x + player.w * 0.5;
    const dx = px - (e.x + e.w * 0.5);
    const segment = Math.max(36, (plat.w - e.w) * 0.5);
    const target = clamp((plat.x + plat.w * 0.5 - e.w * 0.5) + Math.sin(now / 320 + (e.hoverPhase || 0)) * segment, plat.x, plat.x + plat.w - e.w);
    const dir = dx >= 0 ? 1 : -1;
    e.facing = dir;
    e.vx = lerp(e.vx, dir * (e.speed || 130), Math.min(1, dt * 6));
    e.x = clamp(lerp(e.x, target, Math.min(1, dt * 2.5)), plat.x, plat.x + plat.w - e.w);
  }

  function updateIceWisp(e, player, platforms, dt, now) {
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const dx = px - (e.x + e.w * 0.5);
    const dy = py - (e.y + e.h * 0.5);
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const near = len < (e.aggroRange || 540);
    const drift = near ? 1 : -1;
    const speed = (e.speed || 175) * (near ? 1.2 : 0.6);
    e.vx = lerp(e.vx, (dx / len) * speed, Math.min(1, dt * 4.5));
    e.vy = lerp(e.vy, (dy / len) * speed * 0.75 + drift * 18, Math.min(1, dt * 4.5));
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  function updateDrillDrone(e, player, platforms, dt, now) {
    const floor = getPlatformById(platforms, e.platformId);
    if (!floor) return;
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const dx = px - (e.x + e.w * 0.5);
    const dy = py - (e.y + e.h * 0.5);
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const near = len < (e.aggroRange || 320);
    e.facing = dx >= 0 ? 1 : -1;
    e.vx = lerp(e.vx, ((near ? dx : e.facing * 1) / len) * (e.speed || 185), Math.min(1, dt * 5));
    e.vy = lerp(e.vy, ((near ? dy : Math.sin(now / 240 + (e.hoverPhase || 0)) * 40) / len) * (e.speed || 185), Math.min(1, dt * 5));
    e.x = clamp(e.x + e.vx * dt, floor.x + 52, floor.x + floor.w - e.w - 52);
    e.y = clamp(e.y + e.vy * dt, floor.y - 180, floor.y - 54);
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

    if (e.state !== ENEMY_STATES.ACTIVE && now >= (e.attackRecoverUntil || 0) && now - e.lastAttackAt > (e.chargeCooldown || 1050)) {
      e.lastAttackAt = now;
      e.attackStartedAt = now;
      e.bossAttackMode = e.bossAttackMode === "slam" ? "charge" : "slam";
      e.bossAttackStep = 0;
      if (e.bossAttackMode === "charge") {
        e.activeUntil = now + 760;
        e.facing = playerCenter >= myCenter ? 1 : -1;
      } else {
        e.attackWindupUntil = now + 420;
      }
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "charge") {
      if (now <= e.activeUntil) {
        e.vx = lerp(e.vx, e.facing * e.speed * 1.55, Math.min(1, dt * 8));
      } else {
        e.attackRecoverUntil = now + 360;
        setState(e, ENEMY_STATES.RETURN, now);
      }
    } else if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "slam") {
      e.vx = lerp(e.vx, 0, Math.min(1, dt * 9));
      e.facing = playerCenter >= myCenter ? 1 : -1;
      if (e.bossAttackStep === 0 && now >= e.attackWindupUntil) {
        e.bossAttackStep = 1;
        const waveY = floor.y - 24;
        addHazard(e, {
          kind: "shockwave",
          x: e.x + 18,
          y: waveY,
          w: 42,
          h: 24,
          vx: -420,
          vy: 0,
          color: "#FF9A62",
          expiresAt: now + 1500
        });
        addHazard(e, {
          kind: "shockwave",
          x: e.x + e.w - 60,
          y: waveY,
          w: 42,
          h: 24,
          vx: 420,
          vy: 0,
          color: "#FF9A62",
          expiresAt: now + 1500
        });
        e.activeUntil = now + 280;
      }
      if (e.bossAttackStep === 1 && now > e.activeUntil) {
        e.attackRecoverUntil = now + 420;
        setState(e, ENEMY_STATES.RETURN, now);
      }
    } else {
      const patrolTarget = clamp(playerCenter - e.w * 0.5, leftBound, rightBound);
      const dx = patrolTarget - e.x;
      e.facing = dx >= 0 ? 1 : -1;
      e.vx = lerp(e.vx, Math.sign(dx || 1) * e.speed * 0.45, Math.min(1, dt * 4));
    }

    e.x = clamp(e.x + e.vx * dt, leftBound, rightBound);
    if (e.x === leftBound || e.x === rightBound) e.vx *= -0.3;
    updateEnemyHazards(e, dt, now);
  }

  function updateBossTempest(e, player, platforms, dt, now) {
    const floor = getPlatformById(platforms, e.platformId);
    if (!floor) return;
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.5;
    const ex = e.x + e.w * 0.5;
    const ey = e.y + e.h * 0.5;

    if (e.state !== ENEMY_STATES.ACTIVE && now >= (e.attackRecoverUntil || 0) && now - e.lastAttackAt > (e.chargeCooldown || 1200)) {
      e.lastAttackAt = now;
      e.attackStartedAt = now;
      e.bossAttackMode = e.bossAttackMode === "storm" ? "dive" : "storm";
      e.bossAttackStep = 0;
      if (e.bossAttackMode === "dive") {
        e.activeUntil = now + 700;
        e.attackTargetX = px - e.w * 0.5;
        e.attackTargetY = py - 18;
      } else {
        e.attackWindupUntil = now + 280;
      }
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    let targetX = e.homeX + Math.cos(now / 260 + e.hoverPhase) * 170;
    let targetY = e.homeY + Math.sin(now / 320 + e.hoverPhase) * 46;

    if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "dive" && now <= e.activeUntil) {
      targetX = e.attackTargetX;
      targetY = e.attackTargetY;
    } else if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "dive" && now > e.activeUntil) {
      e.attackRecoverUntil = now + 340;
      setState(e, ENEMY_STATES.RETURN, now);
    }

    if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "storm") {
      targetX = e.homeX + Math.cos(now / 210 + e.hoverPhase) * 60;
      targetY = e.homeY - 10 + Math.sin(now / 260 + e.hoverPhase) * 26;
      if (now >= e.attackWindupUntil && e.bossAttackStep < 3) {
        const strikeX = clamp(player.x + player.w * 0.5 + (e.bossAttackStep - 1) * 110, floor.x + 40, floor.x + floor.w - 66);
        addHazard(e, {
          kind: "lightning",
          x: strikeX,
          y: floor.y - 360,
          w: 26,
          h: 360,
          activeAt: now + 420,
          expiresAt: now + 680,
          color: "#8BE9FF",
          warningColor: "rgba(139, 233, 255, 0.3)"
        });
        e.bossAttackStep += 1;
        e.attackWindupUntil = now + 180;
      }
      if (e.bossAttackStep >= 3 && now >= e.attackWindupUntil + 320) {
        e.attackRecoverUntil = now + 380;
        setState(e, ENEMY_STATES.RETURN, now);
      }
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
    updateEnemyHazards(e, dt, now);
  }

  function updateBossOracle(e, player, platforms, dt, now) {
    const floor = getPlatformById(platforms, e.platformId);
    if (!floor) return;
    const perchPlatforms = getPlatformsByRole(platforms, "bossPerch");
    const perches = perchPlatforms.length
      ? perchPlatforms.map((platform) => ({ x: platform.x + platform.w * 0.5 - e.w * 0.5, y: platform.y - e.h - 20 }))
      : [
          { x: floor.x + 180, y: floor.y - 220 },
          { x: floor.x + floor.w * 0.5 - e.w * 0.5, y: floor.y - 340 },
          { x: floor.x + floor.w - 180 - e.w, y: floor.y - 220 }
        ];

    if (e.state !== ENEMY_STATES.ACTIVE && now >= (e.attackRecoverUntil || 0) && now - e.lastAttackAt > (e.chargeCooldown || 1100)) {
      e.lastAttackAt = now;
      e.attackStartedAt = now;
      e.bossAttackMode = e.bossAttackMode === "orbit" ? "teleportBurst" : "orbit";
      e.bossAttackStep = 0;
      if (e.bossAttackMode === "teleportBurst") {
        const playerCenter = player.x + player.w * 0.5;
        let best = perches[0];
        let bestDist = -1;
        for (const perch of perches) {
          const score = Math.abs((perch.x + e.w * 0.5) - playerCenter);
          if (score > bestDist) {
            bestDist = score;
            best = perch;
          }
        }
        e.x = best.x;
        e.y = best.y;
        e.attackWindupUntil = now + 260;
        e.activeUntil = now + 760;
      } else {
        e.attackWindupUntil = now + 260;
        e.activeUntil = now + 1500;
      }
      setState(e, ENEMY_STATES.ACTIVE, now);
    }

    if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "teleportBurst") {
      e.vx = lerp(e.vx, 0, Math.min(1, dt * 6));
      e.vy = lerp(e.vy, 0, Math.min(1, dt * 6));
      if (e.bossAttackStep === 0 && now >= e.attackWindupUntil) {
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6;
          addHazard(e, {
            kind: "orb",
            x: e.x + e.w * 0.5 - 10,
            y: e.y + e.h * 0.5 - 10,
            w: 20,
            h: 20,
            vx: Math.cos(angle) * 260,
            vy: Math.sin(angle) * 260,
            color: "#C77DFF",
            expiresAt: now + 1800
          });
        }
        e.bossAttackStep = 1;
      }
      if (now > e.activeUntil) {
        e.attackRecoverUntil = now + 320;
        setState(e, ENEMY_STATES.PATROL, now);
      }
    }

    if (e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "orbit") {
      if (e.bossAttackStep === 0 && now >= e.attackWindupUntil) {
        e.hazards = (e.hazards || []).filter((hazard) => hazard.kind !== "orbit");
        for (let i = 0; i < 4; i++) {
          addHazard(e, {
            kind: "orbit",
            x: e.x,
            y: e.y,
            w: 18,
            h: 18,
            anchorX: e.x + e.w * 0.5,
            anchorY: e.y + e.h * 0.5,
            radius: 72,
            angle: (Math.PI * 2 * i) / 4,
            spin: 3.6,
            color: "#8EA2FF",
            expiresAt: now + 1200
          });
        }
        e.bossAttackStep = 1;
      }
      for (const hazard of e.hazards || []) {
        if (hazard.kind === "orbit") {
          hazard.anchorX = e.x + e.w * 0.5;
          hazard.anchorY = e.y + e.h * 0.5;
        }
      }
      if (now > e.activeUntil) {
        e.attackRecoverUntil = now + 280;
        setState(e, ENEMY_STATES.PATROL, now);
      }
    }

    if (e.state !== ENEMY_STATES.ACTIVE) {
      const homeX = floor.x + floor.w * 0.5 - e.w * 0.5;
      const homeY = floor.y - 300 + Math.sin(now / 220 + e.hoverPhase) * 18;
      e.vx = lerp(e.vx, (homeX - e.x) * 2.2, Math.min(1, dt * 2.8));
      e.vy = lerp(e.vy, (homeY - e.y) * 2.2, Math.min(1, dt * 2.8));
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    updateEnemyHazards(e, dt, now);
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
      else if (e.type === "sandrunner") updateSandrunner(e, player, platforms, dt, now);
      else if (e.type === "iceWisp") updateIceWisp(e, player, platforms, dt, now);
      else if (e.type === "vineCrawler") updateVineCrawler(e, player, platforms, dt, now);
      else if (e.type === "drillDrone") updateDrillDrone(e, player, platforms, dt, now);
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
    if (e.isBoss) return maybeBossContactBox(e, now);
    if (e.type === "sandrunner") return { x: e.x + 6, y: e.y + 4, w: e.w - 12, h: e.h - 4 };
    if (e.type === "iceWisp") return { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 4 };
    if (e.type === "vineCrawler") return { x: e.x + 4, y: e.y + 5, w: e.w - 8, h: e.h - 5 };
    if (e.type === "drillDrone") return { x: e.x + 1, y: e.y + 1, w: e.w - 2, h: e.h - 2 };
    return { x: e.x, y: e.y, w: e.w, h: e.h };
  }

  function checkEnemyCollisions(enemies, player, now) {
    if (!enemies || enemies.length === 0) return false;
    for (const e of enemies) {
      if (!e || e.dead) continue;
      const box = enemyCollisionBox(e, now);
      if (aabbOverlaps(box, player)) return e;
      for (const hazard of e.hazards || []) {
        const hazardBox = hazardCollisionBox(hazard, now);
        if (hazardBox && aabbOverlaps(hazardBox, player)) return e;
      }
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
      } else if (e.type === "sandrunner") {
        ctx.fillStyle = palette.sandrunner;
        ctx.fillRect(sx, sy + 4, e.w, e.h - 4);
        ctx.fillStyle = "#FFF3D6";
        ctx.fillRect(sx + (e.facing >= 0 ? e.w - 10 : 4), sy + 8, 6, 6);
      } else if (e.type === "iceWisp") {
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.fillStyle = palette.iceWisp;
        ctx.beginPath();
        ctx.arc(0, 0, e.w * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.type === "vineCrawler") {
        ctx.fillStyle = palette.vineCrawler;
        ctx.fillRect(sx, sy, e.w, e.h);
        ctx.fillStyle = "#D8FFB0";
        ctx.fillRect(sx + (e.facing >= 0 ? e.w - 8 : 2), sy + 5, 4, 4);
      } else if (e.type === "drillDrone") {
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.rotate((now / 120) * (e.facing >= 0 ? 1 : -1));
        ctx.fillStyle = palette.drillDrone;
        ctx.beginPath();
        ctx.moveTo(0, -e.h * 0.55);
        ctx.lineTo(e.w * 0.5, 0);
        ctx.lineTo(0, e.h * 0.55);
        ctx.lineTo(-e.w * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();

      if (e.type === "bossColossus" && e.state === ENEMY_STATES.ACTIVE && e.bossAttackMode === "slam" && now < (e.attackWindupUntil || 0)) {
        ctx.fillStyle = "rgba(255, 154, 98, 0.28)";
        ctx.fillRect(sx - 18, sy + e.h - 18, e.w + 36, 18);
      }

      for (const hazard of e.hazards || []) {
        if (hazard.kind === "shockwave") {
          ctx.fillStyle = hazard.color || "#FF9A62";
          ctx.fillRect(hazard.x - camera.x, hazard.y - camera.y, hazard.w, hazard.h);
        } else if (hazard.kind === "lightning") {
          if (hazard.activeAt && now < hazard.activeAt) {
            ctx.fillStyle = hazard.warningColor || "rgba(139, 233, 255, 0.28)";
            ctx.fillRect(hazard.x - camera.x, hazard.y - camera.y, hazard.w, hazard.h);
          } else {
            ctx.fillStyle = hazard.color || "#8BE9FF";
            ctx.fillRect(hazard.x - camera.x, hazard.y - camera.y, hazard.w, hazard.h);
            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(hazard.x + hazard.w * 0.5 - camera.x, hazard.y - camera.y);
            ctx.lineTo(hazard.x + hazard.w * 0.5 - camera.x, hazard.y + hazard.h - camera.y);
            ctx.stroke();
          }
        } else if (hazard.kind === "orb" || hazard.kind === "orbit") {
          ctx.fillStyle = hazard.color || "#C77DFF";
          ctx.beginPath();
          ctx.arc(hazard.x + hazard.w * 0.5 - camera.x, hazard.y + hazard.h * 0.5 - camera.y, hazard.w * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

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
