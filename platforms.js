// platforms.js — Cohesive Multi-Path Level Generator
//
// New Features:
//   1. WEAVING PATHS — Two parallel standard paths that diverge and rejoin.
//   2. STRUCTURAL BEAMS — Vertical background 'pylons' that visually anchor platforms.
//   3. BACKGROUND SCENERY — Ghost platforms (non-colliding) to fill depth.
//   4. COHESION — Paths are no longer isolated; they cross and overlap visually.

function createPlatforms(world) {
  const W = world.width;
  const H = world.height;
  const GROUND_Y = H - 40;

  // Physics constants (for reachability simulation)
  const JUMP_POWER   = 15, GRAVITY = 0.475, MAX_SPEED = 4.5;
  const MAX_JUMP_H   = (JUMP_POWER * JUMP_POWER) / (2 * GRAVITY);
  const AIR_TIME     = (2 * JUMP_POWER) / GRAVITY;
  const MAX_JUMP_X   = MAX_SPEED * AIR_TIME;
  const PLAYER_W = 50, PLAYER_H = 50;

  // PRNG
  let _s = 88; // New seed for more variety
  function random() {
    _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (a, b) => a + random() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 0.999));

  // Simulators
  function simJump(ax, ay, aw, bx, by, bw, hSpeed) {
    let px = hSpeed >= 0 ? (ax + aw - PLAYER_W) : ax;
    let py = ay - PLAYER_H, vy = -JUMP_POWER;
    for (let f = 0; f < 300; f++) {
      px += hSpeed; vy = Math.min(vy + GRAVITY, 10); py += vy;
      if (px + PLAYER_W > bx && px < bx + bw && vy >= 0 && py + PLAYER_H >= by && py + PLAYER_H <= by + 36) return true;
      if (py > Math.max(ay, by) + 600) return false;
    }
    return false;
  }
  const canReach = (ax, ay, aw, bx, by, bw) => simJump(ax, ay, aw, bx, by, bw, (bx > ax ? 1 : -1) * MAX_SPEED);

  const platforms = [];

  // ── Step 0: Ground ────────────────────────────────────────────────
  platforms.push({ x: 0, y: GROUND_Y, w: W, h: 40, type: 'ground' });

  // ── Step 1: Weaving Main Paths (Main A and Main B) ────────────────
  const pathA = [], pathB = [];
  let ax = 60, ay = GROUND_Y - 120, aw = 250;
  let bx = 60, by = GROUND_Y - 120, bw = 250;
  
  const startPlat = { x: 60, y: GROUND_Y - 120, w: 260, h: ri(20, 28), type: 'standard' };
  platforms.push(startPlat);
  pathA.push(startPlat); pathB.push(startPlat);

  while (ax + aw < W - 400 || bx + bw < W - 400) {
    // Generate next for Path A (Higher road)
    if (ax + aw < W - 400) {
      const nw = ri(120, 240), gap = rr(0.5, 0.7) * MAX_JUMP_X;
      const nx = Math.floor(ax + aw + gap);
      const ny = Math.max(GROUND_Y - 450, Math.min(GROUND_Y - 150, Math.floor(ay + rr(-60, 40))));
      if (canReach(ax, ay, aw, nx, ny, nw)) {
        const p = { x: nx, y: ny, w: nw, h: ri(18, 26), type: 'standard' };
        platforms.push(p); pathA.push(p);
        ax = nx; ay = ny; aw = nw;
      } else { ax += 100; } // skip if break
    }

    // Generate next for Path B (Lower/Middle road) - sometimes rejoins A
    if (bx + bw < W - 400) {
      const nw = ri(140, 260), gap = rr(0.4, 0.6) * MAX_JUMP_X;
      const nx = Math.floor(bx + bw + gap);
      const ny = Math.max(GROUND_Y - 300, Math.min(GROUND_Y - 100, Math.floor(by + rr(-30, 60))));
      
      // Occasionally try to reach back to Path A to create a loop
      const targetA = pathA[pathA.length - 1];
      if (random() > 0.8 && canReach(bx, by, bw, targetA.x, targetA.y, targetA.w)) {
        bx = targetA.x; by = targetA.y; bw = targetA.w;
      } else if (canReach(bx, by, bw, nx, ny, nw)) {
        const p = { x: nx, y: ny, w: nw, h: ri(18, 26), type: 'standard' };
        platforms.push(p); pathB.push(p);
        bx = nx; by = ny; bw = nw;
      } else { bx += 100; }
    }
  }

  // ── Step 2: High-Risk Intersections ──────────────────────────────
  // Place risk pips that bridge between Path A and Path B
  for (let i = 2; i < pathA.length - 2; i += 3) {
    const pA = pathA[i];
    const pB = pathB[Math.min(i, pathB.length - 1)];
    if (Math.abs(pA.y - pB.y) > 150) {
        // Vertical bridge of pips
        let curY = pB.y - 70;
        const bridgeX = (pA.x + pB.x) / 2;
        while (curY > pA.y + 40) {
            platforms.push({ x: bridgeX + rr(-20, 20), y: curY, w: 50, h: 12, type: 'risk' });
            curY -= 80;
        }
    }
  }

  // ── Step 3: Structural Scenery (Cohesion) ────────────────────────
  // Add vertical beams that visually "hold" platforms
  const solidPlats = platforms.slice(1); // skip ground
  solidPlats.forEach(p => {
    if (random() > 0.6 && p.type === 'standard') {
        const beamW = ri(10, 20);
        platforms.push({
            x: p.x + p.w / 2 - beamW / 2,
            y: p.y + p.h,
            w: beamW,
            h: GROUND_Y - (p.y + p.h),
            isBackground: true
        });
    }
  });

  // ── Step 4: Background Scenery (Depth) ───────────────────────────
  // Add faded ghost platforms to fill negative space
  for (let i = 0; i < 15; i++) {
    platforms.push({
        x: rr(0, W),
        y: rr(100, GROUND_Y - 200),
        w: rr(200, 500),
        h: rr(5, 15),
        isBackground: true
    });
  }

  // ── Step 5: Dead-Ends ─────────────────────────────────────────────
  // Sparse but intentional dead ends branching off
  for (let i = 4; i < pathA.length - 4; i += 6) {
    const anchor = pathA[i];
    const deX = anchor.x + rr(100, 200);
    const deY = anchor.y - rr(150, 250);
    platforms.push({ x: deX, y: deY, w: 80, h: 15, type: 'deadend' });
  }

  // ── Step 6: Exit platform ─────────────────────────────────────────
  platforms.push({ x: W - 320, y: GROUND_Y - 140, w: 300, h: 30, type: 'standard' });

  return platforms;
}