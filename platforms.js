// platforms.js — Bifurcated Path Level Generator
//
// Architecture:
//   1. STANDARD PATH ("Low Road") — Wide platforms (3-5 player widths)
//      at 70-80% of max jump capacity. Fluid, forgiving progression.
//   2. HIGH-RISK PATH ("High Road") — Tiny "pip" platforms (1 player
//      width) at 85-95% of combined jump capacity. Precise, rewarding.
//   3. FORK EVENTS — Every few standard segments, a risk branch leads
//      the player upward through pips before looping back to standard.
//   4. DEAD-END PATHS — Tantalizing branches that lead nowhere, testing
//      the player's risk assessment and map reading.
//   5. DEAD ZONE FILTER — Only standard + risk + dead-end platforms
//      exist. Zero decoration. Intentional negative space everywhere.
//
// Player capabilities (from game.js):
//   jumpPower: 15, gravity: 0.475, maxSpeed: 4.5
//   dashSpeed: 12, dashDuration: 120ms, 2 charges
//   Max jump height ≈ 237px, max horizontal ≈ 284px
//   Dash boost ≈ 86px → effective max reach ≈ 370px
//   At 170px elevation: max horizontal drops to ≈218px (+86px dash = 304px)

function createPlatforms(world) {
  const W = world.width;   // 5000
  const H = world.height;  // 2000
  const GROUND_Y = H - 40;

  // ═══════════════════════════════════════════════════════════════════
  //  PLAYER PHYSICS (must match game.js)
  // ═══════════════════════════════════════════════════════════════════
  const JUMP_POWER   = 15;
  const GRAVITY      = 0.475;
  const MAX_SPEED    = 4.5;
  const MAX_FALL_SPD = 10;
  const PLAYER_W     = 50;
  const PLAYER_H     = 50;

  // Dash mechanics
  const DASH_SPEED    = 12;
  const DASH_DURATION = 120;   // ms
  const DASH_FRAMES   = DASH_DURATION / 16.67;  // ≈7.2 frames
  const DASH_BOOST    = DASH_SPEED * DASH_FRAMES; // ≈86px extra reach

  // Derived limits
  const MAX_JUMP_H = (JUMP_POWER * JUMP_POWER) / (2 * GRAVITY);   // ≈237px
  const AIR_TIME   = (2 * JUMP_POWER) / GRAVITY;                   // ≈63 frames
  const MAX_JUMP_X = MAX_SPEED * AIR_TIME;                         // ≈284px
  const MAX_DASH_X = MAX_JUMP_X + DASH_BOOST;                     // ≈370px (with 1 dash)

  // Max horizontal at a given height above the launch point
  function maxHorizAtHeight(h) {
    if (h >= MAX_JUMP_H) return 0;
    if (h <= 0) return MAX_JUMP_X;
    const disc = JUMP_POWER * JUMP_POWER - 2 * GRAVITY * h;
    if (disc <= 0) return 0;
    return MAX_SPEED * (JUMP_POWER + Math.sqrt(disc)) / GRAVITY;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SEEDED PRNG (mulberry32)
  // ═══════════════════════════════════════════════════════════════════
  let _s = 42;
  function random() {
    _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr  = (a, b) => a + random() * (b - a);
  const ri  = (a, b) => Math.floor(rr(a, b + 0.999));

  // ═══════════════════════════════════════════════════════════════════
  //  PHYSICS SIMULATION — Jump Reachability
  // ═══════════════════════════════════════════════════════════════════
  function simJump(ax, ay, aw, bx, by, bw, hSpeed) {
    let px = hSpeed >= 0 ? (ax + aw - PLAYER_W) : ax;
    let py = ay - PLAYER_H;
    let vy = -JUMP_POWER;
    for (let f = 0; f < 300; f++) {
      px += hSpeed;
      vy = Math.min(vy + GRAVITY, MAX_FALL_SPD);
      py += vy;
      if (px + PLAYER_W > bx && px < bx + bw &&
          vy >= 0 && py + PLAYER_H >= by && py + PLAYER_H <= by + 36) {
        return true;
      }
      if (py > Math.max(ay, by) + 600) return false;
    }
    return false;
  }

  // Simulate jump + one dash at the peak (extends reach significantly)
  function simJumpDash(ax, ay, aw, bx, by, bw, hSpeed) {
    let px = hSpeed >= 0 ? (ax + aw - PLAYER_W) : ax;
    let py = ay - PLAYER_H;
    let vy = -JUMP_POWER;
    let dashed = false;
    let dashFramesLeft = 0;

    for (let f = 0; f < 300; f++) {
      // Trigger dash near the peak of the jump arc (when vy crosses 0)
      if (!dashed && vy >= -1 && vy <= 2) {
        dashed = true;
        dashFramesLeft = Math.ceil(DASH_FRAMES);
        const dir = hSpeed >= 0 ? 1 : -1;
        // Dash direction: mostly horizontal, slight upward
        const dashDirX = dir;
        const dashDirY = (by < ay) ? -0.3 : 0;
        const len = Math.sqrt(dashDirX * dashDirX + dashDirY * dashDirY);
        vy = (dashDirY / len) * DASH_SPEED;
        hSpeed = (dashDirX / len) * DASH_SPEED;
      }

      if (dashFramesLeft > 0) {
        dashFramesLeft--;
        // During dash: fixed velocity, no gravity
        px += hSpeed;
        py += vy;
        if (dashFramesLeft === 0) {
          // Exit dash: restore normal horizontal speed
          hSpeed = (hSpeed > 0 ? 1 : -1) * MAX_SPEED;
          vy = 0;
        }
      } else {
        px += hSpeed;
        vy = Math.min(vy + GRAVITY, MAX_FALL_SPD);
        py += vy;
      }

      if (px + PLAYER_W > bx && px < bx + bw &&
          vy >= 0 && py + PLAYER_H >= by && py + PLAYER_H <= by + 36) {
        return true;
      }
      if (py > Math.max(ay, by) + 600) return false;
    }
    return false;
  }

  // Standard reachability (jump only, no dash)
  function canReach(ax, ay, aw, bx, by, bw) {
    const dir = (bx + bw / 2) > (ax + aw / 2) ? 1 : -1;
    return simJump(ax, ay, aw, bx, by, bw, dir * MAX_SPEED)
        || simJump(ax, ay, aw, bx, by, bw, dir * MAX_SPEED * 0.5)
        || simJump(ax, ay, aw, bx, by, bw, dir * MAX_SPEED * 0.2);
  }

  // Extended reachability (jump + dash — for dead-end and risk platforms)
  function canReachWithDash(ax, ay, aw, bx, by, bw) {
    return canReach(ax, ay, aw, bx, by, bw)
        || simJumpDash(ax, ay, aw, bx, by, bw, (bx > ax ? 1 : -1) * MAX_SPEED);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 1 — STANDARD PATH ("Low Road")
  //
  //  Wide platforms (120-280px). Gaps at 55-72% of max jump.
  //  Platform height varies 16-28px for organic feel.
  //  Gently undulates to keep the road visually interesting.
  // ═══════════════════════════════════════════════════════════════════
  const standardPath = [];

  let sx = 60, sy = GROUND_Y - 120, sw = ri(220, 280);
  standardPath.push({ x: sx, y: sy, w: sw, h: ri(20, 28), type: 'standard' });

  let waveDir = -1;
  let waveSteps = 0;
  const WAVE_LEN = 4;

  while (sx + sw < W - 380) {
    const nw = ri(120, 280);
    const gap = rr(0.55 * MAX_JUMP_X, 0.72 * MAX_JUMP_X);
    const dy = waveDir * rr(20, 55);

    const nx = Math.floor(sx + sw + gap);
    let ny = Math.max(GROUND_Y - 500, Math.min(GROUND_Y - 100,
        Math.floor(sy + dy)));

    if (canReach(sx, sy, sw, nx, ny, nw)) {
      standardPath.push({ x: nx, y: ny, w: nw, h: ri(16, 28), type: 'standard' });
      sx = nx; sy = ny; sw = nw;
      waveSteps++;
      if (waveSteps >= WAVE_LEN) { waveDir *= -1; waveSteps = 0; }
    } else {
      const safeNx = Math.floor(sx + sw + 0.50 * MAX_JUMP_X);
      if (canReach(sx, sy, sw, safeNx, sy, nw)) {
        standardPath.push({ x: safeNx, y: sy, w: nw, h: ri(16, 28), type: 'standard' });
        sx = safeNx; sw = nw;
      }
    }
  }

  // Exit platform
  const exitPlat = { x: W - 300, y: GROUND_Y - 140, w: ri(240, 300), h: ri(22, 30), type: 'standard' };
  if (!canReach(sx, sy, sw, exitPlat.x, exitPlat.y, exitPlat.w)) {
    const bx = Math.floor(sx + sw + 0.50 * MAX_JUMP_X);
    const by = Math.floor((sy + exitPlat.y) / 2);
    standardPath.push({ x: bx, y: by, w: ri(150, 210), h: ri(18, 26), type: 'standard' });
    sx = bx; sy = by; sw = 180;
  }
  standardPath.push(exitPlat);

  console.log(`Standard path: ${standardPath.length} platforms`);

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 2 — FORK EVENTS (High-Risk Pip Path)
  //
  //  Every FORK_EVERY platforms, a risk branch forks upward.
  //  Pips are 40-65px wide with 10-18px height (varied).
  //  Pip-to-pip gaps target 80-93% of MAX_JUMP_X.
  //  Entry jump accounts for elevation (reduced horizontal range).
  // ═══════════════════════════════════════════════════════════════════
  const riskPath = [];
  const FORK_EVERY = 4;
  const RISK_ELEVATION = 170;
  const PIP_W_MIN = 40, PIP_W_MAX = 65;
  const PIP_H_MIN = 10, PIP_H_MAX = 18;

  for (let i = 1; i < standardPath.length - FORK_EVERY; i += FORK_EVERY) {
    const forkFrom = standardPath[i];
    const rejoinIdx = Math.min(i + FORK_EVERY, standardPath.length - 1);
    const rejoinAt = standardPath[rejoinIdx];

    const forkEdge = forkFrom.x + forkFrom.w;
    const rejoinEdge = rejoinAt.x;
    const horizSpan = rejoinEdge - forkEdge;

    if (horizSpan < 400) continue;

    const riskY = Math.max(120, Math.floor(forkFrom.y - RISK_ELEVATION));
    const heightDiff = forkFrom.y - riskY;

    const entryMaxHoriz = maxHorizAtHeight(heightDiff);
    if (entryMaxHoriz < 100) continue;

    const entryGap = Math.floor(rr(0.60, 0.78) * entryMaxHoriz);
    const exitGap = Math.floor(rr(100, 180));

    const middleSpan = horizSpan - entryGap - exitGap;
    if (middleSpan < 200) continue;

    const pipGapTarget = rr(0.80, 0.93) * MAX_JUMP_X;
    const avgPipW = (PIP_W_MIN + PIP_W_MAX) / 2;
    const pipStep = avgPipW + pipGapTarget;
    const pipCount = Math.max(2, Math.min(5,
        Math.floor(middleSpan / pipStep) + 1));

    const actualStep = middleSpan / pipCount;

    const pips = [];
    let valid = true;

    for (let p = 0; p < pipCount; p++) {
      const pipW = ri(PIP_W_MIN, PIP_W_MAX);
      const pipH = ri(PIP_H_MIN, PIP_H_MAX);
      const px = Math.floor(forkEdge + entryGap + p * actualStep);
      const py = Math.max(120, Math.floor(riskY + rr(-20, 20)));

      const prevX = p === 0 ? forkFrom.x : pips[p - 1].x;
      const prevY = p === 0 ? forkFrom.y : pips[p - 1].y;
      const prevW = p === 0 ? forkFrom.w : pips[p - 1].w;

      if (canReach(prevX, prevY, prevW, px, py, pipW)) {
        pips.push({ x: px, y: py, w: pipW, h: pipH, type: 'risk' });
      } else {
        const fixedX = Math.floor(prevX + prevW + 0.55 * (p === 0 ? entryMaxHoriz : MAX_JUMP_X));
        const fixedY = Math.max(120, Math.floor(prevY - (p === 0 ? heightDiff * 0.6 : rr(-20, 20))));
        if (canReach(prevX, prevY, prevW, fixedX, fixedY, pipW)) {
          pips.push({ x: fixedX, y: fixedY, w: pipW, h: pipH, type: 'risk' });
        } else {
          valid = false;
          break;
        }
      }
    }

    if (!valid || pips.length < 2) continue;

    const lastPip = pips[pips.length - 1];
    if (canReach(lastPip.x, lastPip.y, lastPip.w,
                 rejoinAt.x, rejoinAt.y, rejoinAt.w)) {
      riskPath.push(...pips);
      console.log(`✅ Fork at std[${i}]: ${pips.length} pips → rejoin std[${rejoinIdx}]`);
    } else {
      console.log(`⚠️ Fork at std[${i}]: exit unreachable, discarded`);
    }
  }

  console.log(`Risk path: ${riskPath.length} pips`);

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 3 — DEAD-END PATHS
  //
  //  Tantalizing branches that lead nowhere. They test the player's
  //  map-reading skills and create risk/reward tension.
  //
  //  Types:
  //   A) "Cliff Tease" — 2-3 platforms branching downward from the
  //      standard path, ending at a ledge with no way forward.
  //   B) "Sky Lure" — 1-2 pips ABOVE the risk tier, reachable only
  //      with a dash, leading to empty air.
  //   C) "Side Detour" — platforms branching backward (left) from
  //      the standard path, dead-ending in negative space.
  //
  //  Dead-ends use dash-aware placement: some require a dash to reach,
  //  making them feel like they SHOULD lead somewhere important.
  // ═══════════════════════════════════════════════════════════════════
  const deadEnds = [];

  for (let i = 2; i < standardPath.length - 2; i += ri(3, 5)) {
    const anchor = standardPath[i];
    const deType = ri(0, 2); // 0=cliff, 1=sky, 2=side

    if (deType === 0) {
      // ── Cliff Tease: descend below standard path, then stop ──
      let dx = anchor.x + ri(30, 80);
      let dy = anchor.y;
      const steps = ri(2, 3);

      for (let s = 0; s < steps; s++) {
        const pw = ri(70, 130);
        const ph = ri(14, 22);
        const gapX = rr(60, 0.60 * MAX_JUMP_X);
        const dropY = rr(60, SAFE_DROP());
        dx = Math.floor(dx + gapX);
        dy = Math.min(GROUND_Y - 80, Math.floor(dy + dropY));

        if (canReach(
          s === 0 ? anchor.x : deadEnds[deadEnds.length - 1].x,
          s === 0 ? anchor.y : deadEnds[deadEnds.length - 1].y,
          s === 0 ? anchor.w : deadEnds[deadEnds.length - 1].w,
          dx, dy, pw
        )) {
          deadEnds.push({ x: dx, y: dy, w: pw, h: ph, type: 'deadend' });
        }
      }
      console.log(`💀 Cliff tease at std[${i}]: ${steps} platforms`);

    } else if (deType === 1) {
      // ── Sky Lure: pip(s) ABOVE risk tier, requires dash to reach ──
      const skyY = Math.max(80, Math.floor(anchor.y - rr(250, 340)));
      const pipW = ri(35, 55);
      const pipH = ri(8, 14);
      const skyX = Math.floor(anchor.x + rr(30, 120));

      // Must be unreachable by normal jump but reachable with dash
      if (!canReach(anchor.x, anchor.y, anchor.w, skyX, skyY, pipW) &&
          canReachWithDash(anchor.x, anchor.y, anchor.w, skyX, skyY, pipW)) {
        deadEnds.push({ x: skyX, y: skyY, w: pipW, h: pipH, type: 'deadend' });

        // Maybe one more lure pip further out
        if (random() > 0.4) {
          const lure2X = Math.floor(skyX + pipW + rr(0.75 * MAX_JUMP_X, 0.90 * MAX_JUMP_X));
          const lure2Y = Math.max(60, Math.floor(skyY + rr(-30, 30)));
          const lure2W = ri(30, 50);
          if (canReach(skyX, skyY, pipW, lure2X, lure2Y, lure2W)) {
            deadEnds.push({ x: lure2X, y: lure2Y, w: lure2W, h: ri(8, 12), type: 'deadend' });
          }
        }
        console.log(`💀 Sky lure at std[${i}]: dash-only pip at y=${skyY}`);

      } else {
        // Fallback: place a reachable-by-jump dead-end above
        const fallbackY = Math.max(100, Math.floor(anchor.y - rr(150, 200)));
        const fallbackX = Math.floor(anchor.x + rr(50, 150));
        if (canReach(anchor.x, anchor.y, anchor.w, fallbackX, fallbackY, pipW)) {
          deadEnds.push({ x: fallbackX, y: fallbackY, w: pipW, h: pipH, type: 'deadend' });
          console.log(`💀 Sky lure fallback at std[${i}]`);
        }
      }

    } else {
      // ── Side Detour: branch backward (leftward), dead-ending ──
      let dx = anchor.x;
      let dy = anchor.y;
      const steps = ri(2, 3);

      for (let s = 0; s < steps; s++) {
        const pw = ri(80, 150);
        const ph = ri(14, 24);
        const gapBack = rr(80, 0.65 * MAX_JUMP_X);
        const ddy = rr(-50, 50);

        const nx = Math.floor(dx - gapBack - pw);
        const ny = Math.max(200, Math.min(GROUND_Y - 80, Math.floor(dy + ddy)));

        if (nx < 10) break; // don't go off-world

        const fromX = s === 0 ? anchor.x : deadEnds[deadEnds.length - 1].x;
        const fromY = s === 0 ? anchor.y : deadEnds[deadEnds.length - 1].y;
        const fromW = s === 0 ? anchor.w : deadEnds[deadEnds.length - 1].w;

        if (canReach(fromX, fromY, fromW, nx, ny, pw)) {
          deadEnds.push({ x: nx, y: ny, w: pw, h: ph, type: 'deadend' });
        }
      }
      console.log(`💀 Side detour at std[${i}]: ${steps} platforms leftward`);
    }
  }

  // Helper: safe drop distance (player can fall far, limited by screen)
  function SAFE_DROP() { return rr(100, 250); }

  console.log(`Dead-ends: ${deadEnds.length} platforms`);

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 4 — BFS VALIDATION
  // ═══════════════════════════════════════════════════════════════════
  let stdValid = true;
  for (let i = 0; i < standardPath.length - 1; i++) {
    const a = standardPath[i], b = standardPath[i + 1];
    if (!canReach(a.x, a.y, a.w, b.x, b.y, b.w)) {
      console.warn(`❌ Standard path broken: std[${i}] → std[${i + 1}]`);
      stdValid = false;
    }
  }
  console.log(stdValid ? `✅ Standard path fully traversable` : `⚠️ Broken links detected`);

  // ═══════════════════════════════════════════════════════════════════
  //  STEP 5 — DEAD ZONE FILTER
  //
  //  Only ground + standard + risk + dead-end platforms exist.
  //  Everything else is intentional negative space.
  // ═══════════════════════════════════════════════════════════════════
  const ground = { x: 0, y: GROUND_Y, w: W, h: 40, type: 'ground' };
  const total = 1 + standardPath.length + riskPath.length + deadEnds.length;

  console.log(`\nFINAL LEVEL: ${standardPath.length} standard + ${riskPath.length} risk + ${deadEnds.length} dead-ends + ground = ${total} total`);

  return [ground, ...standardPath, ...riskPath, ...deadEnds];
}