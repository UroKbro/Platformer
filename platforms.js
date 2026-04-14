// Phase 1: Define Your Core Systems (Foundation)
function createLevelGenerator() {
  
  // 1. Player Movement Spec (Non-Negotiable)
  const PLAYER = {
    jump_power: 15,
    gravity: 0.475,
    max_speed: 4.5,
    dash_speed: 12,
    dash_duration_frames: Math.floor(120 / 16.67),
    player_w: 50,
    player_h: 50,
    // Jump limits (derived manually to guide chunks)
    jump_x: 280,   // Max standard horizontal distance
    jump_y: 230,   // Max vertical jump height
    dash_x: 360    // Max horizontal distance with jump AND dash
  };

  // Seeded Random Helper
  let _s = 100;
  function random() {
    _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (a, b) => Math.floor(a + random() * (b - a + 0.999));
  const chance = (p) => random() < p;
  const choice = (arr) => arr[ri(0, arr.length - 1)];

  // 2. Platform Data Structure
  let nextId = 0;
  function Platform(x, y, w = 100, h = 20, type = 'standard', tag = '') {
    return { x, y, w, h, type, tag, id: nextId++ };
  }

  return function generateLevel(seed, difficulty, worldWidth, worldHeight) {
    _s = seed; // Initalize deterministic RNG
    nextId = 0;
    const GROUND_Y = worldHeight - 40;
    const GOAL_X = worldWidth - 400;

    // Phase 7: Validation System (CRITICAL)
    // Simulated physics loop traversing a jump arc between p1 and p2
    function simJump(p1, p2, useDash) {
      const hSpeedDir = p2.x > p1.x ? 1 : -1;
      let hSpeed = hSpeedDir * PLAYER.max_speed;
      let px = hSpeed >= 0 ? (p1.x + p1.w - PLAYER.player_w) : p1.x;
      let py = p1.y - PLAYER.player_h;
      let vy = -PLAYER.jump_power;
      
      let dashed = false;
      let dashFramesLeft = 0;

      for (let f = 0; f < 300; f++) {
        if (useDash && !dashed && vy >= -1 && vy <= 2) {
          dashed = true;
          dashFramesLeft = PLAYER.dash_duration_frames;
          let dy = 0;
          if (p2.y + 50 < p1.y) dy = -0.4; // slight vertical aim if target is high
          const len = Math.sqrt(1 + dy*dy);
          hSpeed = (hSpeedDir / len) * PLAYER.dash_speed;
          vy = (dy / len) * PLAYER.dash_speed;
        }

        if (dashFramesLeft > 0) {
          dashFramesLeft--;
          px += hSpeed;
          py += vy;
          if (dashFramesLeft === 0) {
            hSpeed = hSpeedDir * PLAYER.max_speed;
            vy = 0;
          }
        } else {
          px += hSpeed;
          vy = Math.min(vy + PLAYER.gravity, 10);
          py += vy;
        }

        // Landing Detection on p2
        if (px + PLAYER.player_w > p2.x && px < p2.x + p2.w && vy >= 0 && py + PLAYER.player_h >= p2.y && py + PLAYER.player_h <= p2.y + 36) {
          return true;
        }
        if (py > Math.max(p1.y, p2.y) + 600) return false;
      }
      return false;
    }

    function is_reachable(p1, p2, reqDash) {
      if (reqDash) return !simJump(p1, p2, false) && simJump(p1, p2, true);
      return simJump(p1, p2, false) || simJump(p1, p2, true);
    }

    // Phase 2: Build a Chunk System
    function build_chunk(type, current) {
      let platforms = [];
      let exit = current;
      
      // Easy Chunks
      if (type === 'flat') {
        const p1 = Platform(current.x + current.w + ri(60, 100), current.y, ri(150, 250), 20, 'standard');
        platforms.push(p1);
        exit = p1;
      } else if (type === 'small_gap') {
        const p1 = Platform(current.x + current.w + ri(120, 180), current.y + ri(-20, 20), ri(150, 200), 20, 'standard');
        platforms.push(p1);
        exit = p1;
      } else if (type === 'stair_up') {
        const p1 = Platform(current.x + current.w + 120, current.y - 70, 140, 20, 'standard');
        const p2 = Platform(p1.x + p1.w + 120, p1.y - 70, 140, 20, 'standard');
        platforms.push(p1, p2);
        exit = p2;
      } else if (type === 'stair_down') {
        const p1 = Platform(current.x + current.w + 120, current.y + 70, 140, 20, 'standard');
        const p2 = Platform(p1.x + p1.w + 120, p1.y + 70, 140, 20, 'standard');
        platforms.push(p1, p2);
        exit = p2;
      }
      // Hard Chunks
      else if (type === 'dash_gap') {
        // Gap of ~320 explicitly requires a dash
        const p1 = Platform(current.x + current.w + ri(300, 340), current.y + ri(-30, 30), ri(60, 100), 15, 'risk');
        platforms.push(p1);
        exit = p1;
      } else if (type === 'precision_jump') {
        const p1 = Platform(current.x + current.w + 240, current.y - ri(30, 60), 50, 15, 'risk');
        const p2 = Platform(p1.x + p1.w + 240, p1.y - ri(30, 60), 50, 15, 'risk');
        platforms.push(p1, p2);
        exit = p2;
      } else if (type === 'vertical_climb') {
        const p1 = Platform(current.x + current.w + 120, current.y - 120, 60, 15, 'risk');
        const p2 = Platform(p1.x + p1.w + 120, p1.y - 120, 60, 15, 'risk');
        platforms.push(p1, p2);
        exit = p2;
      } else if (type === 'risky_drop') {
        const p1 = Platform(current.x + current.w + 200, current.y + 180, 70, 15, 'crumble');
        platforms.push(p1);
        exit = p1;
      }

      return { platforms, exit };
    }

    // Phase 8: Difficulty & Rhythm Control (Curves)
    const easyCurve = ["flat", "small_gap", "flat", "stair_up", "flat", "stair_down"];
    const hardCurve = ["dash_gap", "precision_jump", "rest", "vertical_climb", "risky_drop", "dash_gap"];

    // Phase 3 & 4: Path Generators
    function generate_path(start, curve, isHard) {
      const path_platforms = [];
      let current = start;
      let curve_idx = 0;

      while (current.x < GOAL_X - 500) {
        let chunk_type = curve[curve_idx % curve.length];
        if (chunk_type === "rest") chunk_type = "flat";
        if (chance(0.2)) chunk_type = choice(curve.filter(c => c !== "rest")); // variance

        const chunk = build_chunk(chunk_type, current);
        let valid = true;

        // Phase 9: Polish Layer - Visual Flow & Ceilings/Floors
        chunk.platforms.forEach(p => {
          if (isHard) {
            p.type = chance(0.2) ? 'crumble' : (p.type === 'standard' ? 'risk' : p.type);
            p.y = Math.max(100, Math.min(GROUND_Y - 250, p.y)); // Hard = Higher
            p.colorHint = '#ff4444'; 
          } else {
            p.type = 'standard';
            p.y = Math.max(GROUND_Y - 350, Math.min(GROUND_Y - 100, p.y)); // Easy = Lower
            p.colorHint = '#1B7A1B';
          }
        });

        // Reachability Validation
        let testStart = current;
        for (let p of chunk.platforms) {
          if (!is_reachable(testStart, p, isHard && chunk_type === 'dash_gap')) {
            valid = false;
            break;
          }
          testStart = p;
        }

        if (valid) {
          path_platforms.push(...chunk.platforms);
          current = chunk.exit;
        } else {
          // Rescue: insert a guaranteed reachable platform
          const fallback = Platform(current.x + current.w + 180, current.y, 160, 20, isHard ? 'risk' : 'standard');
          if (isHard) { fallback.y -= 50; fallback.colorHint = '#ff4444'; }
          path_platforms.push(fallback);
          current = fallback;
        }

        curve_idx++;
      }
      return { path_platforms, exit: current };
    }

    // Phase 5: Shared Start + End
    const start  = Platform(100, GROUND_Y - 150, 250, 25, 'start', 'shared');
    const goal   = Platform(GOAL_X, GROUND_Y - 350, 300, 30, 'exit', 'shared');
    const all_platforms = [start, goal];

    // Build the easy and hard paths
    const { path_platforms: easyPath, exit: easyLast } = generate_path(start, easyCurve, false);
    const { path_platforms: hardPath, exit: hardLast } = generate_path(start, hardCurve, true);
    
    all_platforms.push(...easyPath);
    all_platforms.push(...hardPath);

    // Connect both trails to the goal safely
    function connect(lastP, isHard) {
      if (!is_reachable(lastP, goal, false)) {
        const bridge = Platform(lastP.x + lastP.w + 150, (lastP.y + goal.y) / 2, 120, 20, isHard ? 'risk' : 'standard');
        all_platforms.push(bridge);
      }
    }
    connect(easyLast, false);
    connect(hardLast, true);

    // Phase 6: Fake Platforms
    function generate_fake_platforms(main_paths) {
      const fakes = [];
      main_paths.forEach(p => {
        if (chance(0.25)) {
          const fake = Platform(
            p.x + ri(-200, 200),
            p.y + ri(-250, 250),
            ri(60, 140), 15, 'deadend', 'fake'
          );
          if (is_reachable(p, fake, false) || is_reachable(p, fake, true)) {
            // Apply Phase 9: Rewards/Set Dressing
            fake.hasScenery = chance(0.5);
            fake.sceneryType = chance(0.5) ? 'OLD_STATUE' : 'VASE';
            fakes.push(fake);
          }
        }
      });
      return fakes;
    }
    
    // Add fakes extending from both paths limits
    const fake_plats = generate_fake_platforms([...easyPath, ...hardPath]);
    all_platforms.push(...fake_plats);

    // Context / Decor Additions (Ground, Ceiling, Parallax)
    all_platforms.push(Platform(0, GROUND_Y, worldWidth, 50, 'ground')); // Floor
    all_platforms.push(Platform(0, -100, worldWidth, 150, 'ground'));    // Ceiling
    
    for (let i = 0; i < 30; i++) {
       const ghost = Platform(ri(0, worldWidth), ri(50, GROUND_Y - 100), ri(100, 400), ri(15, 45), 'ghost');
       ghost.isBackground = true;
       all_platforms.push(ghost);
    }

    const POWER_UP_TYPES = ['doubleDash', 'highJump', 'antiGravity', 'superSpeed', 'giantBox', 'icePhysics'];
    let powerUpIndex = 0;
    
    // Increased spawn probability to 25% and mapped sequentially ensuring a perfect variety
    all_platforms.forEach(p => {
        if ((p.type === 'standard' || p.type === 'risk') && chance(0.25)) {
            p.hasPowerUp = true;
            p.powerUpType = POWER_UP_TYPES[powerUpIndex % POWER_UP_TYPES.length];
            powerUpIndex++;
        }
    });

    return {
      platforms: all_platforms,
      startPos: { x: start.x + start.w / 2 - 25, y: start.y - 50 },
      goalPos:  { x: goal.x + goal.w / 2 - 25, y: goal.y - 50 },
      seed,
      difficulty
    };
  };
}

const generateLevel = createLevelGenerator();
