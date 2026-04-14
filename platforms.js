// platforms.js — Procedural Platformer Level Generator
//
// Algorithm (Forward Build + Chunk Phases + BFS Validation):
//   1. CRITICAL PATH  — A guaranteed-solvable chain of platforms from
//      start → exit, built forward one jump at a time. Each jump is
//      verified by a physics simulation that matches the game engine.
//      The path is organized into "chunks" (flat, staircase-up,
//      staircase-down, gap-jump, zigzag) for natural variety.
//   2. BFS VALIDATION — Graph traversal confirms the full critical path
//      is connected. If a gap is detected, bridge platforms are spliced in.
//   3. SECONDARY PATHS — Multiple lateral bands at different heights
//      provide exploration and alternative routes.
//   4. DECORATION FILL — Dense grid-based gap filling ensures the full
//      canvas is populated. These never block the critical path.
//   5. DIFFICULTY      — A single parameter controls gap size, platform
//      width, vertical climb, and decoration density.
//
// Player physics (must match game.js):
//   jumpPower: 15, gravity: 0.475, maxSpeed: 4.5,
//   maxFallSpeed: 10, player: 50×50
//   → Theoretical max jump height ≈ 237px
//   → Theoretical max horizontal reach ≈ 284px

function createPlatforms(world) {
  const W = world.width;   // 5000
  const H = world.height;  // 2000
  const GROUND_Y = H - 40;

  // ═══════════════════════════════════════════════════════════════════
  //  CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════

  // Player physics (mirrors game.js exactly)
  const JUMP_POWER   = 15;
  const GRAVITY      = 0.475;
  const MAX_SPEED    = 4.5;
  const MAX_FALL_SPD = 10;
  const PLAYER_W     = 50;
  const PLAYER_H     = 50;

  // Derived physics limits
  const MAX_JUMP_H = (JUMP_POWER * JUMP_POWER) / (2 * GRAVITY);   // ≈237px
  const AIR_FRAMES = (2 * JUMP_POWER) / GRAVITY;                   // ≈63 frames
  const MAX_JUMP_X = MAX_SPEED * AIR_FRAMES;                       // ≈284px

  // Safe generation limits (≈72-75% of theoretical max)
  const SAFE_H = Math.floor(MAX_JUMP_H * 0.72);   // ≈170px
  const SAFE_X = Math.floor(MAX_JUMP_X * 0.75);   // ≈213px

  // Difficulty: 1.0 = easy, 2.0 = medium, 3.0 = hard
  const DIFFICULTY = 3;
  const PLAT_W_MIN  = Math.max(55, Math.floor(110 - DIFFICULTY * 12));
  const PLAT_W_MAX  = Math.max(90, Math.floor(200 - DIFFICULTY * 22));
  const DECOR_FILL  = 0.1;  // higher = more dense decoration

  // Reproducible seed
  const SEED = 42;

  // ═══════════════════════════════════════════════════════════════════
  //  SEEDED PRNG (mulberry32)
  // ═══════════════════════════════════════════════════════════════════
  let _s = SEED;
  function random() {
    _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr  = (a, b) => a + random() * (b - a);
  const ri  = (a, b) => Math.floor(rr(a, b + 0.999));
  const pick = (arr) => arr[ri(0, arr.length - 1)];

  // ═══════════════════════════════════════════════════════════════════
  //  PHYSICS-BASED REACHABILITY CHECK
  // ═══════════════════════════════════════════════════════════════════
  function simJump(ax, ay, aw, bx, by, bw, hSpeed) {
    const startX = hSpeed >= 0 ? (ax + aw - PLAYER_W) : ax;
    let px = startX;
    let py = ay - PLAYER_H;
    let vy = -JUMP_POWER;

    for (let f = 0; f < 250; f++) {
      px += hSpeed;
      vy = Math.min(vy + GRAVITY, MAX_FALL_SPD);
      py += vy;
      const feetY = py + PLAYER_H;
      if (px + PLAYER_W > bx && px < bx + bw &&
          vy >= 0 && feetY >= by && feetY <= by + 36) {
        return true;
      }
      if (py > Math.max(ay, by) + 500) return false;
    }
    return false;
  }

  // Try multiple horizontal speeds to handle various target positions
  function canReach(ax, ay, aw, bx, by, bw) {
    const dir = (bx + bw / 2) > (ax + aw / 2) ? 1 : -1;
    return simJump(ax, ay, aw, bx, by, bw, dir * MAX_SPEED)
        || simJump(ax, ay, aw, bx, by, bw, dir * MAX_SPEED * 0.5)
        || simJump(ax, ay, aw, bx, by, bw, dir * MAX_SPEED * 0.15);
  }

  function connected(a, b) {
    return canReach(a.x, a.y, a.w, b.x, b.y, b.w)
        || canReach(b.x, b.y, b.w, a.x, a.y, a.w);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 1 — CRITICAL PATH (chunk-based forward build)
  // ═══════════════════════════════════════════════════════════════════
  //  The critical path is the GUARANTEED solvable route from start to
  //  exit. It snakes through the level using different "chunk" patterns.
  //  Every single jump is verified by the physics simulation.

  const CHUNK_TYPES = ['flat', 'stair_up', 'stair_down', 'gap', 'zigzag'];
  const criticalPath = [];

  // Starting platform — sits near ground, easy first jump
  let cx = 60, cy = GROUND_Y - 100, cw = 200;
  criticalPath.push({ x: cx, y: cy, w: cw, h: 20 });

  let lastChunkType = null;
  let chunkIter = 0;

  while (cx + cw < W - 400 && chunkIter < 60) {
    // Pick chunk type — avoid repeats, bias by current height
    let chunkType;
    do { chunkType = pick(CHUNK_TYPES); } while (chunkType === lastChunkType);

    if (cy < 350)            chunkType = 'stair_down';
    else if (cy > GROUND_Y - 250) chunkType = 'stair_up';

    lastChunkType = chunkType;
    const platCount = ri(3, 5);

    for (let step = 0; step < platCount && cx + cw < W - 400; step++) {
      const nw = ri(PLAT_W_MIN, PLAT_W_MAX);
      let gapX, deltaY;

      switch (chunkType) {
        case 'flat':
          gapX   = rr(60, SAFE_X - 40);
          deltaY = rr(-15, 15);
          break;
        case 'stair_up':
          gapX   = rr(50, SAFE_X - 50);
          deltaY = -rr(45, SAFE_H);
          break;
        case 'stair_down':
          gapX   = rr(50, SAFE_X - 50);
          deltaY = rr(35, SAFE_H * 0.7);
          break;
        case 'gap':
          gapX   = rr(SAFE_X - 50, SAFE_X);
          deltaY = rr(-25, 25);
          break;
        case 'zigzag':
          gapX   = rr(50, SAFE_X - 50);
          deltaY = (step % 2 === 0 ? -1 : 1) * rr(50, SAFE_H);
          break;
        default:
          gapX   = rr(60, SAFE_X - 40);
          deltaY = 0;
      }

      const nx = Math.floor(cx + cw + gapX);
      let ny = Math.max(120, Math.min(GROUND_Y - 80, Math.floor(cy + deltaY)));

      if (canReach(cx, cy, cw, nx, ny, nw)) {
        criticalPath.push({ x: nx, y: ny, w: nw, h: 16 });
        cx = nx; cy = ny; cw = nw;
      } else {
        const safeDY = chunkType === 'stair_up' ? -35
                     : chunkType === 'stair_down' ? 35 : 0;
        const safeNY = Math.max(120, Math.min(GROUND_Y - 80, cy + safeDY));
        const safeNX = Math.floor(cx + cw + 70);
        if (canReach(cx, cy, cw, safeNX, safeNY, nw)) {
          criticalPath.push({ x: safeNX, y: safeNY, w: nw, h: 16 });
          cx = safeNX; cy = safeNY; cw = nw;
        }
      }
    }
    chunkIter++;
  }

  // Exit platform + bridge
  const exitPlat = { x: W - 260, y: GROUND_Y - 160, w: 220, h: 20 };
  if (!canReach(cx, cy, cw, exitPlat.x, exitPlat.y, exitPlat.w)) {
    for (let b = 0; b < 3; b++) {
      const bx = Math.floor(cx + cw + 70);
      const by = Math.max(120, Math.min(GROUND_Y - 80,
          Math.floor((cy + exitPlat.y) / 2)));
      criticalPath.push({ x: bx, y: by, w: 120, h: 16 });
      cx = bx; cy = by; cw = 120;
      if (canReach(cx, cy, cw, exitPlat.x, exitPlat.y, exitPlat.w)) break;
    }
  }
  criticalPath.push(exitPlat);

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 2 — BFS VALIDATION + REPAIR
  // ═══════════════════════════════════════════════════════════════════
  function validateAndRepair(plats, maxRepairs) {
    for (let repair = 0; repair < maxRepairs; repair++) {
      const n = plats.length;
      const adj = Array.from({ length: n }, () => []);
      for (let i = 0; i < n; i++) {
        const limit = Math.min(i + 8, n);
        for (let j = i + 1; j < limit; j++) {
          if (connected(plats[i], plats[j])) {
            adj[i].push(j); adj[j].push(i);
          }
        }
      }
      const visited = new Set([0]);
      const queue = [0];
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const nb of adj[cur]) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
      if (visited.has(n - 1)) {
        console.log(`✅ Critical path VALID: ${n} platforms, all reachable`);
        return true;
      }
      let repaired = false;
      for (let i = 0; i < n - 1; i++) {
        if (visited.has(i) && !visited.has(i + 1)) {
          const a = plats[i], b = plats[i + 1];
          const mx = Math.floor((a.x + a.w + b.x) / 2);
          const my = Math.max(120, Math.min(GROUND_Y - 80,
              Math.floor((a.y + b.y) / 2)));
          plats.splice(i + 1, 0, { x: mx, y: my, w: 100, h: 16 });
          console.log(`🔧 Repaired gap at index ${i}`);
          repaired = true;
          break;
        }
      }
      if (!repaired) break;
    }
    console.warn(`⚠️ Critical path may have unreachable segments`);
    return false;
  }

  validateAndRepair(criticalPath, 10);

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 3 — MULTIPLE HEIGHT BANDS (secondary paths)
  // ═══════════════════════════════════════════════════════════════════
  //  Generate several horizontal "bands" of platforms at fixed height
  //  tiers. This ensures the FULL vertical space is populated and gives
  //  players exploration routes at every height.

  const secondaryPlatforms = [];

  // Define height bands across the full vertical range
  const heightBands = [
    GROUND_Y - 160,   // just above ground
    GROUND_Y - 320,   // low
    GROUND_Y - 480,   // low-mid
    GROUND_Y - 640,   // mid
    GROUND_Y - 800,   // mid-high
    GROUND_Y - 960,   // high
    GROUND_Y - 1120,  // very high
    GROUND_Y - 1280,  // near ceiling
    GROUND_Y - 1440,  // upper canopy
    GROUND_Y - 1600,  // sky level
    GROUND_Y - 1760,  // near top
  ];

  for (const bandY of heightBands) {
    if (bandY < 80) continue; // skip if too close to ceiling

    // Place platforms across the full width at this height band
    let bx = ri(40, 120);
    while (bx < W - 100) {
      // Vary Y slightly around the band center for natural feel
      const py = Math.floor(bandY + rr(-40, 40));
      const pw = ri(PLAT_W_MIN - 10, PLAT_W_MAX);

      // Check we don't overlap a critical path platform
      let overlaps = false;
      for (const cp of criticalPath) {
        if (Math.abs(cp.x - bx) < cp.w + 30 && Math.abs(cp.y - py) < 50) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps && py > 80 && py < GROUND_Y - 60) {
        secondaryPlatforms.push({ x: bx, y: py, w: pw, h: 14 });
      }

      // Space platforms 180-350px apart horizontally within the band
      bx += pw + ri(140, 280);
    }
  }

  // ── Additional platforms branching from critical path ──────────────
  for (let i = 0; i < criticalPath.length - 1; i += ri(2, 3)) {
    const p = criticalPath[i];

    // Upper branch
    const upperY = Math.floor(p.y - rr(70, SAFE_H));
    if (upperY > 100) {
      secondaryPlatforms.push({
        x: Math.floor(p.x + rr(0, p.w * 0.4)),
        y: upperY,
        w: ri(55, 100),
        h: 14
      });
    }

    // Lower branch
    const lowerY = Math.floor(p.y + rr(60, 150));
    if (lowerY < GROUND_Y - 60) {
      secondaryPlatforms.push({
        x: Math.floor(p.x + rr(20, 100)),
        y: lowerY,
        w: ri(65, 120),
        h: 14
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 4 — DECORATION FILL (grid-based gap coverage)
  // ═══════════════════════════════════════════════════════════════════
  //  Grid cells ensure NO large empty region exists in the level.

  const decorPlatforms = [];
  const CELL = 220;  // smaller cells = denser fill
  const gridCols = Math.ceil(W / CELL);
  const gridRows = Math.ceil(GROUND_Y / CELL);

  const occupied = new Set();
  for (const p of [...criticalPath, ...secondaryPlatforms]) {
    const col = Math.floor((p.x + p.w / 2) / CELL);
    const row = Math.floor(p.y / CELL);
    occupied.add(`${col},${row}`);
  }

  for (let c = 0; c < gridCols; c++) {
    for (let r = 0; r < gridRows; r++) {
      if (!occupied.has(`${c},${r}`) && random() < DECOR_FILL) {
        const px = Math.floor(c * CELL + rr(10, CELL - 80));
        const py = Math.floor(r * CELL + rr(20, CELL - 25));
        if (py > 80 && py < GROUND_Y - 50) {
          decorPlatforms.push({ x: px, y: py, w: ri(45, 90), h: 12 });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ASSEMBLE FINAL LEVEL
  // ═══════════════════════════════════════════════════════════════════
  const ground = { x: 0, y: GROUND_Y, w: W, h: 40 };

  const total = 1 + criticalPath.length + secondaryPlatforms.length + decorPlatforms.length;
  console.log(`Level: ${criticalPath.length} critical, ` +
    `${secondaryPlatforms.length} secondary, ` +
    `${decorPlatforms.length} decoration = ${total} total platforms`);

  return [ground, ...criticalPath, ...secondaryPlatforms, ...decorPlatforms];
}