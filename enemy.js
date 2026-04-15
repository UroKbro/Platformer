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
    const ox = e.detectionBox?.ox ?? (e.facing >= 0 ? 40 : -40 - w);
    const oy = e.detectionBox?.oy ?? -40;
    return { x: e.x + ox, y: e.y + oy, w, h };
  }

  function setState(e, next, now) {
    if (e.state === next) return;
    e.state = next;
    e.stateSince = now;
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
      predictedY: null
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
      e.detectionBox = { w: e.aggroRange, h: 140, ox: e.facing >= 0 ? 30 : -30 - e.aggroRange, oy: -60 };
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
      e.hoverPhase = random() * Math.PI * 2;
      return e;
    }

    return null;
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
        if (e) enemies.push(e);
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
      e.vx = e.facing * e.speed;
    } else if (e.state === ENEMY_STATES.PURSUIT) {
      const targetX = clamp(player.x + player.w * 0.5 - e.w * 0.5, e.patrolMinX, e.patrolMaxX);
      const dir = targetX > e.x ? 1 : -1;
      e.facing = dir;
      e.vx = dir * (e.speed * 1.15);
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
        e.vx = dir * e.speed;
      }
    }

    // Clamp and flip at edges.
    const nextX = e.x + e.vx * dt;
    if (nextX <= e.patrolMinX) {
      e.x = e.patrolMinX;
      e.facing = 1;
    } else if (nextX >= e.patrolMaxX) {
      e.x = e.patrolMaxX;
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
    const maxStep = (e.speed ?? 190) * dt;

    // Smooth arrival.
    const step = Math.min(maxStep, len);
    e.x += (vx / len) * step;
    e.y += (vy / len) * step;
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
    const maxStep = (e.speed ?? 210) * dt;
    const step = Math.min(maxStep, len);

    e.x += (vx / len) * step;
    e.y += (vy / len) * step;
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

  function updateEnemies(enemies, player, platforms, dt, now) {
    if (!enemies || enemies.length === 0) return;
    for (const e of enemies) {
      if (!e) continue;
      if (e.type === "pacingStalker") updatePacingStalker(e, player, platforms, dt, now);
      else if (e.type === "gapGuard") updateGapGuard(e, player, platforms, dt, now);
      else if (e.type === "hoverer") updateHoverer(e, player, platforms, dt, now);
      else if (e.type === "sentinel") updateSentinel(e, player, platforms, dt, now);
    }
  }

  function enemyCollisionBox(e, now) {
    if (e.type === "gapGuard" && e.state === ENEMY_STATES.ACTIVE && now <= e.activeUntil) {
      // Expanded hazard zone when active.
      return { x: e.x - 30, y: e.y - 24, w: e.w + 60, h: e.h + 48 };
    }
    return { x: e.x, y: e.y, w: e.w, h: e.h };
  }

  function checkEnemyCollisions(enemies, player, now) {
    if (!enemies || enemies.length === 0) return false;
    for (const e of enemies) {
      if (!e) continue;
      const box = enemyCollisionBox(e, now);
      if (aabbOverlaps(box, player)) return true;
    }
    return false;
  }

  function drawEnemies(ctx, enemies, camera, now) {
    if (!enemies || enemies.length === 0) return;

    for (const e of enemies) {
      const sx = e.x - camera.x;
      const sy = e.y - camera.y;

      if (e.type === "pacingStalker") {
        ctx.fillStyle = "#2B2B2B";
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
        ctx.fillStyle = "#3C3C3C";
        ctx.fillRect(sx, sy, e.w, e.h);
        ctx.fillStyle = "#111111";
        ctx.fillRect(sx + 6, sy + 6, e.w - 12, e.h - 12);

        if (active) {
          const box = enemyCollisionBox(e, now);
          const cx = box.x + box.w * 0.5 - camera.x;
          const cy = box.y + box.h * 0.5 - camera.y;
          ctx.save();
          ctx.globalAlpha = 0.75 + 0.15 * Math.sin(now / 60);
          ctx.strokeStyle = "#00F0FF";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(box.w, box.h) * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      } else if (e.type === "hoverer") {
        ctx.save();
        ctx.translate(sx + e.w * 0.5, sy + e.h * 0.5);
        ctx.fillStyle = "#7B2CBF";
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
        ctx.fillStyle = active ? "#FF6B6B" : "#00D4FF";
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
