function createLevelGenerator() {
  const PLAYER = {
    jump_power: 15,
    gravity: 0.475,
    max_speed: 4.5,
    dash_speed: 12,
    dash_duration_frames: Math.floor(120 / 16.67),
    player_w: 50,
    player_h: 50,
    jump_x: 280,
    dash_x: 360
  };

  const POWER_UP_TYPES = [
    "doubleDash",
    "highJump",
    "antiGravity",
    "superSpeed",
    "giantBox",
    "icePhysics",
    "ghost",
    "miniBox",
    "feather"
  ];

  const THEMES = {
    ruins: {
      easy: "#5B9B63",
      hard: "#C97B35",
      shared: "#5C7AEA",
      branch: "#8A6F50",
      background: "rgba(82, 78, 72, 0.18)"
    },
    cavern: {
      easy: "#2E8B57",
      hard: "#D16C3F",
      shared: "#4C6FFF",
      branch: "#6D5A4E",
      background: "rgba(73, 94, 90, 0.18)"
    },
    fortress: {
      easy: "#517A8A",
      hard: "#D06464",
      shared: "#7A6FF0",
      branch: "#7E746B",
      background: "rgba(74, 74, 82, 0.18)"
    },
    industrial: {
      easy: "#5E9C7F",
      hard: "#E0764E",
      shared: "#6D6CFF",
      branch: "#7F6F58",
      background: "rgba(93, 94, 98, 0.18)"
    },
    overgrown: {
      easy: "#4E9B59",
      hard: "#C96A3C",
      shared: "#5A78F2",
      branch: "#76644A",
      background: "rgba(58, 89, 60, 0.18)"
    }
  };

  let _s = 1;
  let nextId = 0;
  let branchCounter = 0;

  function random() {
    _s |= 0;
    _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function ri(a, b) {
    return Math.floor(a + random() * (b - a + 0.999));
  }

  function chance(p) {
    return random() < p;
  }

  function choice(arr) {
    return arr[ri(0, arr.length - 1)];
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function Platform(x, y, w, h, type, tag) {
    return { x, y, w, h, type: type || "standard", tag: tag || "", id: nextId++ };
  }

  function decoratePlatform(platform, meta) {
    return Object.assign(platform, meta || {});
  }

  function createPlatformRecord(x, y, w, h, type, meta) {
    const platform = Platform(x, y, w, h, type || "standard", meta?.tag || "");
    return decoratePlatform(platform, {
      role: meta?.role || "path",
      pathType: meta?.pathType || "easy",
      tier: meta?.tier || "critical",
      layer: meta?.layer || "action",
      collisionMode: meta?.collisionMode || "solid",
      isEssential: meta?.isEssential !== false,
      travelHint: meta?.travelHint || "standard_preferred",
      riskScore: meta?.riskScore || 0,
      rewardScore: meta?.rewardScore || 0,
      supportsPowerUp: !!meta?.supportsPowerUp,
      supportsHazard: meta?.supportsHazard !== false,
      supportsEnemy: meta?.supportsEnemy !== false,
      anchorId: meta?.anchorId ?? null,
      branchId: meta?.branchId ?? null,
      edgeType: meta?.edgeType || null,
      visualTheme: meta?.visualTheme || null,
      hasReservedSlot: !!meta?.hasReservedSlot,
      durability: meta?.durability ?? null,
      degradeMode: meta?.degradeMode ?? null,
      degradeState: meta?.degradeState ?? null,
      isLeafNode: !!meta?.isLeafNode
    });
  }

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
        if (p2.y + 50 < p1.y) dy = -0.4;
        const len = Math.sqrt(1 + dy * dy);
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

      if (
        px + PLAYER.player_w > p2.x &&
        px < p2.x + p2.w &&
        vy >= 0 &&
        py + PLAYER.player_h >= p2.y &&
        py + PLAYER.player_h <= p2.y + 36
      ) {
        return true;
      }

      if (py > Math.max(p1.y, p2.y) + 600) return false;
    }

    return false;
  }

  function isReachable(p1, p2, travelHint) {
    if (travelHint === "standard_only") return simJump(p1, p2, false);
    if (travelHint === "dash_required") {
      return !simJump(p1, p2, false) && simJump(p1, p2, true);
    }
    return simJump(p1, p2, false) || simJump(p1, p2, true);
  }

  function createLevelProfile(seed, difficulty, worldWidth, worldHeight) {
    const themes = Object.keys(THEMES);
    const openness = choice(["cavernous", "mixed", "compact"]);
    const branchDensity = choice(["sparse", "medium", "dense"]);
    const hazardPressure = choice(["low", "medium", "high"]);
    const enemyPressure = choice(["low", "medium", "high"]);
    const rewardDensity = choice(["low", "medium", "high"]);
    const verticalBias = choice(["low", "medium", "high"]);

    return {
      seed,
      difficulty,
      theme: choice(themes),
      openness,
      branchDensity,
      hazardPressure,
      enemyPressure,
      rewardDensity,
      verticalBias,
      anchorCount: clamp(Math.floor(worldWidth / 950) + ri(0, 2), 3, 6),
      easyAmplitude: verticalBias === "high" ? 70 : verticalBias === "medium" ? 50 : 35,
      hardAmplitude: verticalBias === "high" ? 180 : verticalBias === "medium" ? 145 : 110,
      branchChance: branchDensity === "dense" ? 0.42 : branchDensity === "medium" ? 0.28 : 0.18,
      hazardChance: hazardPressure === "high" ? 0.32 : hazardPressure === "medium" ? 0.2 : 0.12,
      enemyChance: enemyPressure === "high" ? 0.28 : enemyPressure === "medium" ? 0.18 : 0.1,
      rewardChance: rewardDensity === "high" ? 0.4 : rewardDensity === "medium" ? 0.28 : 0.18,
      worldWidth,
      worldHeight
    };
  }

  function buildSharedAnchors(profile, worldWidth, worldHeight) {
    const anchors = [];
    const groundY = worldHeight - 40;
    const startX = 100;
    const goalX = worldWidth - 420;
    const startY = groundY - 180;
    const goalY = groundY - ri(300, 380);
    const gap = (goalX - startX) / (profile.anchorCount + 1);
    const palette = THEMES[profile.theme];

    const start = createPlatformRecord(startX, startY, 260, 26, "start", {
      role: "start",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      anchorId: 0,
      travelHint: "standard_only",
      colorHint: palette.shared,
      supportsHazard: false,
      supportsEnemy: false,
      supportsPowerUp: false,
      riskScore: 0
    });
    start.colorHint = palette.shared;
    anchors.push(start);

    for (let i = 1; i <= profile.anchorCount; i++) {
      const t = i / (profile.anchorCount + 1);
      const x = Math.round(startX + gap * i + ri(-60, 60));
      const baseY = lerp(startY, goalY, t);
      const wave = Math.sin(t * Math.PI * 1.6 + random() * 0.8) * (profile.easyAmplitude + 10);
      const y = clamp(Math.round(baseY + wave + ri(-30, 30)), 220, groundY - 180);
      const anchor = createPlatformRecord(x, y, ri(190, 270), 24, "standard", {
        role: "anchor",
        pathType: "shared",
        tier: "critical",
        layer: "action",
        anchorId: i,
        travelHint: "standard_only",
        supportsHazard: false,
        supportsEnemy: false,
        supportsPowerUp: chance(0.35),
        rewardScore: 1
      });
      anchor.colorHint = palette.shared;
      anchor.tag = "shared";
      anchors.push(anchor);
    }

    const goal = createPlatformRecord(goalX, goalY, 300, 30, "exit", {
      role: "goal",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      anchorId: profile.anchorCount + 1,
      travelHint: "standard_only",
      supportsHazard: false,
      supportsEnemy: false,
      supportsPowerUp: false
    });
    goal.colorHint = palette.shared;
    goal.tag = "shared";
    anchors.push(goal);

    return anchors;
  }

  function makePathPlatform(pathType, x, y, width, meta) {
    const palette = THEMES[meta.profile.theme];
    const type = pathType === "hard" && meta.travelHint === "dash_required" ? "risk" : "standard";
    const platform = createPlatformRecord(x, y, width, meta.height || 20, type, {
      role: meta.role || "path",
      pathType,
      tier: meta.tier || "critical",
      layer: meta.layer || "action",
      anchorId: meta.anchorId ?? null,
      branchId: meta.branchId ?? null,
      travelHint: meta.travelHint || (pathType === "hard" ? "dash_optional" : "standard_preferred"),
      supportsPowerUp: !!meta.supportsPowerUp,
      supportsHazard: meta.supportsHazard !== false,
      supportsEnemy: meta.supportsEnemy !== false,
      riskScore: meta.riskScore || (pathType === "hard" ? 2 : 1),
      rewardScore: meta.rewardScore || 0,
      edgeType: meta.edgeType || null,
      isEssential: meta.isEssential !== false,
      visualTheme: meta.profile.theme,
      durability: meta.durability ?? null,
      degradeMode: meta.degradeMode ?? null,
      degradeState: meta.degradeState ?? null,
      isLeafNode: !!meta.isLeafNode,
      tag: meta.tag || ""
    });
    platform.colorHint = pathType === "easy"
      ? palette.easy
      : pathType === "hard"
        ? palette.hard
        : palette.branch;
    if (meta.colorHint) platform.colorHint = meta.colorHint;
    return platform;
  }

  function tryRepairEdge(from, to, pathType, profile, travelHint) {
    const repaired = { ...to };
    const hard = pathType === "hard";

    for (let attempt = 0; attempt < 8; attempt++) {
      if (isReachable(from, repaired, travelHint)) return repaired;

      if (travelHint === "dash_required") {
        repaired.x = from.x + from.w + ri(PLAYER.jump_x + 16, PLAYER.dash_x - 38);
        repaired.w = Math.max(repaired.w, 92);
        repaired.y = clamp(from.y + ri(-80, 80), 180, profile.worldHeight - 320);
      } else {
        repaired.x = from.x + from.w + ri(110, hard ? 200 : 170);
        repaired.w = Math.max(repaired.w, hard ? 90 : 135);
        repaired.y = clamp(from.y + ri(-75, 75), 180, profile.worldHeight - 220);
      }
    }

    return repaired;
  }

  function buildRouteBetweenAnchors(fromAnchor, toAnchor, pathType, profile) {
    const routePlatforms = [];
    const edges = [];
    const hard = pathType === "hard";
    const segmentDistance = toAnchor.x - fromAnchor.x;
    const internalCount = hard ? ri(2, 4) : ri(2, 3);
    const dashEdgeIndex = hard ? ri(1, internalCount) : -1;
    let current = fromAnchor;
    let currentTravelHint = "standard_only";

    for (let i = 1; i <= internalCount; i++) {
      const t = i / (internalCount + 1);
      const reserveForGoal = (internalCount - i + 1) * (hard ? 170 : 145);
      let width = hard ? ri(82, 132) : ri(145, 220);
      let gapMin = hard ? 125 : 110;
      let travelHint = hard ? "dash_optional" : "standard_preferred";

      if (hard && i === dashEdgeIndex && segmentDistance > 520) {
        gapMin = PLAYER.jump_x + 12;
        travelHint = "dash_required";
        width = ri(90, 125);
      }

      const idealX = lerp(fromAnchor.x + fromAnchor.w, toAnchor.x - width, t);
      let x = Math.round(Math.max(current.x + current.w + gapMin, idealX + ri(-50, 50)));
      x = Math.min(x, toAnchor.x - reserveForGoal);
      x = Math.max(x, current.x + current.w + gapMin);

      const segmentBaseY = lerp(fromAnchor.y, toAnchor.y, t);
      const wave = Math.sin(t * Math.PI * (hard ? 3.4 : 1.8) + random()) * (hard ? profile.hardAmplitude : profile.easyAmplitude);
      let y = clamp(
        Math.round(segmentBaseY + wave + ri(hard ? -55 : -25, hard ? 55 : 25)),
        170,
        profile.worldHeight - (hard ? 300 : 220)
      );

      const platform = makePathPlatform(pathType, x, y, width, {
        profile,
        supportsPowerUp: !hard && chance(0.2),
        supportsEnemy: true,
        supportsHazard: true,
        travelHint,
        edgeType: hard ? (travelHint === "dash_required" ? "dash_gate" : "risk") : "safe",
        anchorId: toAnchor.anchorId,
        riskScore: hard ? (travelHint === "dash_required" ? 3 : 2) : 1
      });

      const repaired = tryRepairEdge(current, platform, pathType, profile, travelHint);
      platform.x = repaired.x;
      platform.y = repaired.y;
      platform.w = repaired.w;

      if (!isReachable(current, platform, travelHint)) {
        const rescue = makePathPlatform(pathType, current.x + current.w + 150, current.y + (hard ? ri(-40, 40) : ri(-20, 20)), hard ? 120 : 160, {
          profile,
          supportsPowerUp: false,
          supportsEnemy: false,
          supportsHazard: false,
          travelHint: "standard_preferred",
          edgeType: "rescue",
          anchorId: toAnchor.anchorId,
          riskScore: 0,
          colorHint: THEMES[profile.theme][pathType === "hard" ? "hard" : "easy"]
        });
        routePlatforms.push(rescue);
        edges.push({ fromId: current.id, toId: rescue.id, traversalType: "jump", requiredDash: false, difficulty: pathType });
        current = rescue;
        currentTravelHint = "standard_preferred";
      }

      routePlatforms.push(platform);
      edges.push({
        fromId: current.id,
        toId: platform.id,
        traversalType: travelHint === "dash_required" ? "dash_jump" : "jump",
        requiredDash: travelHint === "dash_required",
        difficulty: pathType
      });
      current = platform;
      currentTravelHint = travelHint;
    }

    if (!isReachable(current, toAnchor, hard && currentTravelHint !== "dash_required" && chance(0.45) ? "dash_required" : "standard_preferred")) {
      const bridge = makePathPlatform(pathType, current.x + current.w + ri(120, 180), clamp(lerp(current.y, toAnchor.y, 0.5) + ri(-25, 25), 180, profile.worldHeight - 250), hard ? 120 : 170, {
        profile,
        supportsPowerUp: false,
        supportsEnemy: hard,
        supportsHazard: hard,
        travelHint: hard ? "dash_optional" : "standard_preferred",
        edgeType: "bridge",
        anchorId: toAnchor.anchorId,
        riskScore: hard ? 2 : 0
      });
      routePlatforms.push(bridge);
      edges.push({ fromId: current.id, toId: bridge.id, traversalType: "jump", requiredDash: false, difficulty: pathType });
      current = bridge;
    }

    edges.push({ fromId: current.id, toId: toAnchor.id, traversalType: "jump", requiredDash: false, difficulty: pathType });
    return { platforms: routePlatforms, edges };
  }

  function buildDualSpines(anchors, profile) {
    const easyPlatforms = [];
    const hardPlatforms = [];
    const pathEdges = [];

    for (let i = 0; i < anchors.length - 1; i++) {
      const easySegment = buildRouteBetweenAnchors(anchors[i], anchors[i + 1], "easy", profile);
      const hardSegment = buildRouteBetweenAnchors(anchors[i], anchors[i + 1], "hard", profile);
      easyPlatforms.push(...easySegment.platforms);
      hardPlatforms.push(...hardSegment.platforms);
      pathEdges.push(...easySegment.edges, ...hardSegment.edges);
    }

    return { easyPlatforms, hardPlatforms, pathEdges };
  }

  function createSceneryBlock(platforms, branchPlatform) {
    const block = createPlatformRecord(branchPlatform.x + branchPlatform.w / 2 - 10, branchPlatform.y - 38, 20, 38, "standard", {
      role: "sceneryBlock",
      pathType: "branch",
      tier: "optional",
      layer: "midground",
      collisionMode: "solid",
      isEssential: false,
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false,
      branchId: branchPlatform.branchId,
      travelHint: "dash_reward_branch"
    });
    block.isHiddenScenery = true;
    block.colorHint = branchPlatform.colorHint;
    platforms.push(block);
  }

  function generateOptionalBranches(sources, profile) {
    const branches = [];
    const branchEdges = [];
    const leafNodes = [];
    const sortedSources = sources.filter((p) => p.role === "path" || p.role === "anchor");
    const sourceLimit = clamp(Math.floor(sortedSources.length * (profile.branchChance + 0.12)), 5, 18);
    let used = 0;

    for (const source of sortedSources) {
      if (used >= sourceLimit) break;
      if (!chance(profile.branchChance)) continue;
      if (source.type === "exit" || source.type === "start") continue;

      const branchId = ++branchCounter;
      const branchDepth = ri(1, profile.branchDensity === "dense" ? 3 : 2);
      let current = source;
      let last = null;
      const direction = chance(0.5) ? 1 : -1;

      for (let step = 0; step < branchDepth; step++) {
        const gap = ri(90, 180);
        const width = ri(90, 150);
        const x = current.x + (direction > 0 ? current.w + gap : -(gap + width));
        const y = clamp(current.y + ri(-160, 160), 190, profile.worldHeight - 240);
        const travelHint = step === branchDepth - 1 && chance(0.4) ? "dash_reward_branch" : "dash_optional";
        const tier = step === branchDepth - 1 && chance(0.35) ? "hazardous" : "optional";
        const type = tier === "hazardous" && chance(0.65) ? "crumble" : "deadend";

        const platform = createPlatformRecord(x, y, width, 18, type, {
          role: "branch",
          pathType: "branch",
          tier,
          layer: "midground",
          branchId,
          collisionMode: "solid",
          isEssential: false,
          supportsPowerUp: tier !== "hazardous",
          supportsEnemy: true,
          supportsHazard: true,
          travelHint,
          riskScore: tier === "hazardous" ? 3 : 1,
          rewardScore: step === branchDepth - 1 ? 2 : 0,
          durability: type === "crumble" ? 1 : null,
          degradeMode: type === "crumble" ? "on_dash_contact" : null,
          degradeState: type === "crumble" ? "stable" : null
        });
        platform.colorHint = THEMES[profile.theme].branch;

        if (!isReachable(current, platform, travelHint === "dash_reward_branch" ? "dash_optional" : "standard_preferred")) {
          break;
        }

        branches.push(platform);
        branchEdges.push({
          fromId: current.id,
          toId: platform.id,
          traversalType: travelHint === "dash_reward_branch" ? "shortcut" : "jump",
          requiredDash: travelHint === "dash_reward_branch",
          difficulty: "branch"
        });

        if (chance(0.35)) {
          platform.hasScenery = true;
          platform.sceneryType = chance(0.5) ? "OLD_STATUE" : "VASE";
          createSceneryBlock(branches, platform);
        }

        last = platform;
        current = platform;
      }

      if (last) {
        last.isLeafNode = true;
        leafNodes.push(last);
        used++;
      }
    }

    return { branches, branchEdges, leafNodes };
  }

  function reservePowerUpSlots(platforms, profile) {
    const candidates = platforms.filter((p) => {
      if (!p.supportsPowerUp) return false;
      if (p.hasPowerUp || p.enemySpawn || p.hasSawblade) return false;
      if (p.isBackground || p.isHiddenScenery) return false;
      if (p.type === "start" || p.type === "exit" || p.type === "spike") return false;
      if (p.w < 110) return false;
      return true;
    });

    candidates.sort((a, b) => (a.x - b.x) || (a.y - b.y));
    let powerIndex = 0;
    let lastPowerX = -9999;

    for (const platform of candidates) {
      const xSpacing = platform.x - lastPowerX;
      if (xSpacing < 280) continue;
      if (platform.pathType === "hard" && chance(0.55) === false) continue;
      if (platform.pathType === "branch" && chance(profile.rewardChance) === false) continue;
      if (platform.pathType === "easy" && chance(0.28) === false) continue;
      if (platform.pathType === "shared" && chance(0.3) === false) continue;

      platform.hasPowerUp = true;
      platform.hasReservedSlot = true;
      platform.powerUpType = POWER_UP_TYPES[powerIndex % POWER_UP_TYPES.length];
      powerIndex++;
      lastPowerX = platform.x;
    }
  }

  function attachHazards(platforms, profile) {
    const actionPlatforms = platforms.filter((p) => !p.isBackground && !p.isHiddenScenery);
    for (const p of actionPlatforms) {
      if (!p.supportsHazard) continue;
      if (p.hasPowerUp || p.enemySpawn) continue;
      if (p.role === "anchor" || p.role === "start" || p.role === "goal") continue;
      if (p.type === "exit" || p.type === "start") continue;

      const hazardChance = p.pathType === "hard"
        ? profile.hazardChance
        : p.pathType === "branch"
          ? profile.hazardChance * 0.6
          : profile.hazardChance * 0.35;

      if (p.pathType === "hard" && p.edgeType === "dash_gate" && p.w >= 110 && chance(0.16)) {
        p.hasSawblade = true;
        p.sawX = p.w * 0.5;
        p.sawSpeed = chance(0.5) ? 65 : -65;
        p.sawSize = 15;
        continue;
      }

      if (p.pathType === "branch" && p.tier === "hazardous" && p.type !== "crumble" && chance(0.45)) {
        p.type = "crumble";
        p.durability = 1;
        p.degradeMode = "on_dash_contact";
        p.degradeState = "stable";
        continue;
      }

      if (chance(hazardChance * 0.2) && p.pathType !== "hard" && p.w >= 150) {
        p.type = "bounce";
        continue;
      }

      if (chance(hazardChance * 0.55)) {
        const spikeX = p.x + ri(5, Math.max(5, p.w - 25));
        const spike = createPlatformRecord(spikeX, p.y - 20, 20, 20, "spike", {
          role: "hazard",
          pathType: p.pathType,
          tier: "hazardous",
          layer: "action",
          collisionMode: "trigger",
          isEssential: false,
          supportsPowerUp: false,
          supportsEnemy: false,
          supportsHazard: false,
          riskScore: p.riskScore + 1,
          anchorId: p.anchorId,
          branchId: p.branchId
        });
        spike.colorHint = "#FF0000";
        platforms.push(spike);
      } else if (p.w >= 120 && chance(hazardChance * 0.4)) {
        p.hasSawblade = true;
        p.sawX = p.w * 0.5;
        p.sawSpeed = chance(0.5) ? 60 : -60;
        p.sawSize = 15;
      }
    }
  }

  function attachSupportFeatures(platforms, anchors, profile) {
    const refillCandidates = platforms.filter((p) =>
      !p.isBackground &&
      !p.isHiddenScenery &&
      !p.hasPowerUp &&
      !p.enemySpawn &&
      !p.hasSawblade &&
      p.pathType === "hard" &&
      p.role === "path" &&
      p.w >= 90
    );

    let refillsPlaced = 0;
    for (const p of refillCandidates) {
      if (refillsPlaced >= 5) break;
      if (p.edgeType !== "dash_gate" && !chance(0.18)) continue;
      p.hasDashRefill = true;
      refillsPlaced++;
    }

    const boostCandidates = platforms.filter((p) =>
      !p.isBackground &&
      !p.isHiddenScenery &&
      !p.hasPowerUp &&
      !p.enemySpawn &&
      !p.hasSawblade &&
      p.pathType !== "branch" &&
      p.type === "standard" &&
      p.w >= 150
    );

    let boostsPlaced = 0;
    for (const p of boostCandidates) {
      if (boostsPlaced >= 6) break;
      if (!chance(0.1)) continue;
      p.type = "boost";
      p.boostStrength = 8 + ri(0, 2);
      boostsPlaced++;
    }

    for (let i = 1; i < anchors.length - 1; i++) {
      if (!chance(0.75)) continue;
      anchors[i].isCheckpoint = true;
      anchors[i].checkpointTier = "shared";
    }
  }

  function attachEnemySpawns(platforms, leafNodes, profile) {
    const hardCandidates = platforms.filter((p) => p.pathType === "hard" && p.edgeType === "dash_gate" && p.w >= 110 && !p.hasPowerUp && !p.hasSawblade);
    const stalkerCandidates = platforms.filter((p) => p.pathType === "easy" && p.role === "path" && p.w >= 190 && !p.hasPowerUp && !p.hasSawblade && !p.enemySpawn);
    const sentinelCandidates = platforms.filter((p) => p.pathType === "hard" && p.role === "path" && p.w >= 150 && !p.hasPowerUp && !p.hasSawblade && !p.enemySpawn);

    for (const p of hardCandidates) {
      if (chance(profile.enemyChance * 0.85)) {
        p.enemySpawn = { type: "gapGuard", aggroRange: 220 + ri(0, 50) };
      }
    }

    let stalkersPlaced = 0;
    for (const p of stalkerCandidates) {
      if (stalkersPlaced >= 5) break;
      if (!chance(profile.enemyChance * 0.55)) continue;
      p.enemySpawn = { type: "pacingStalker", aggroRange: 240 + ri(0, 70), speed: 145 + ri(0, 35) };
      stalkersPlaced++;
    }

    let sentinelsPlaced = 0;
    for (const p of sentinelCandidates) {
      if (sentinelsPlaced >= 4) break;
      if (!chance(profile.enemyChance * 0.5)) continue;
      p.enemySpawn = { type: "sentinel", aggroRange: 280 + ri(0, 80), speed: 185 + ri(0, 40) };
      sentinelsPlaced++;
    }

    for (const leaf of leafNodes) {
      if (leaf.enemySpawn || leaf.hasPowerUp) continue;
      if (!chance(0.35 + profile.enemyChance * 0.3)) continue;
      leaf.enemySpawn = {
        type: "hoverer",
        aggroRange: 420 + ri(0, 120),
        speed: 175 + ri(0, 35),
        interceptLeadTime: 0.25 + random() * 0.18
      };
    }
  }

  function assignSceneryAndSecrets(leafNodes, profile) {
    for (const leaf of leafNodes) {
      if (chance(0.2)) {
        leaf.hasScenery = true;
        leaf.sceneryType = chance(0.5) ? "OLD_STATUE" : "VASE";
        leaf.rewardScore += 2;
      }
      if (!leaf.hasPowerUp && chance(profile.rewardChance * 0.45)) {
        leaf.hasPowerUp = true;
        leaf.powerUpType = POWER_UP_TYPES[ri(0, POWER_UP_TYPES.length - 1)];
      }
    }
  }

  function addLightGuidance(platforms, anchors, profile) {
    const palette = THEMES[profile.theme];
    for (let i = 1; i < anchors.length; i++) {
      const anchor = anchors[i];
      const hardEntrance = platforms.find((p) =>
        p.pathType === "hard" &&
        p.anchorId === anchor.anchorId &&
        p.role === "path" &&
        Math.abs(p.x - anchor.x) < 340
      );

      if (!hardEntrance || hardEntrance.lightGuidance) continue;
      hardEntrance.lightGuidance = chance(0.5) ? "torch" : "glowPlant";
      hardEntrance.lightColor = palette.reward;
    }
  }

  function addReactiveSetDressing(platforms) {
    for (const p of platforms) {
      if (p.isBackground || p.isHiddenScenery) continue;
      if (p.type === "spike" || p.type === "exit" || p.type === "start") continue;
      if (p.w < 90) continue;

      if (!p.reactiveGrass && chance(0.38)) {
        p.reactiveGrass = true;
        p.grassTufts = clamp(Math.floor(p.w / 28), 3, 8);
      }

      if (!p.reactivePebbles && p.pathType !== "shared" && chance(0.2)) {
        p.reactivePebbles = true;
        p.pebbleCount = clamp(Math.floor(p.w / 48), 2, 5);
      }
    }
  }

  function enforceBreatherRule(platforms) {
    const hardPath = platforms
      .filter((p) => p.pathType === "hard" && p.role === "path" && !p.isBackground)
      .sort((a, b) => a.x - b.x);

    let intensityRun = 0;
    for (const p of hardPath) {
      const intense = p.type === "crumble" || p.hasSawblade || p.edgeType === "dash_gate";
      if (!intense) {
        intensityRun = 0;
        continue;
      }

      intensityRun++;
      if (intensityRun <= 3) continue;

      p.hasSawblade = false;
      if (p.type === "crumble") {
        p.type = "standard";
        p.durability = null;
        p.degradeMode = null;
        p.degradeState = null;
      }
      p.isBreather = true;
      p.colorHint = "#E8D9A8";
      intensityRun = 0;
    }
  }

  function buildTeleporters(platforms, anchors, profile) {
    const teleporters = [];
    const entries = platforms.filter((p) =>
      p.isLeafNode &&
      !p.isBackground &&
      p.role === "branch" &&
      p.pathType === "branch"
    );

    let pairId = 0;
    for (const entryPlatform of entries) {
      if (!chance(0.28)) continue;
      const safeIndex = clamp(ri(0, Math.max(0, anchors.length - 2)), 0, Math.max(0, anchors.length - 2));
      const exitAnchor = anchors[safeIndex];
      if (!exitAnchor || exitAnchor.x >= entryPlatform.x - 300) continue;

      teleporters.push({
        id: `tele_${pairId++}`,
        entry: {
          x: entryPlatform.x + entryPlatform.w * 0.5,
          y: entryPlatform.y - 30,
          r: 20,
          platformId: entryPlatform.id
        },
        exit: {
          x: exitAnchor.x + exitAnchor.w * 0.5,
          y: exitAnchor.y - 30,
          r: 24,
          platformId: exitAnchor.id
        },
        color: THEMES[profile.theme].shared,
        kind: "loopback"
      });
    }

    return teleporters;
  }

  function generateBackgroundShell(platforms, anchors, profile, worldWidth, worldHeight) {
    const background = [];
    const groundY = worldHeight - 40;
    const palette = THEMES[profile.theme];
    const columns = clamp(Math.floor(worldWidth / 420), 8, 18);

    for (let i = 0; i < columns; i++) {
      const x = Math.round((worldWidth / columns) * i + ri(-80, 80));
      const width = ri(180, 420);
      const anchorRef = anchors[clamp(i % anchors.length, 0, anchors.length - 1)];
      const y = clamp(anchorRef.y - ri(180, 360), 60, groundY - 420);
      const h = ri(80, 260);
      const shell = createPlatformRecord(x, y, width, h, "ghost", {
        role: "background",
        pathType: "decor",
        tier: "optional",
        layer: i % 3 === 0 ? "foreground" : "background",
        collisionMode: "disabled",
        isEssential: false,
        supportsPowerUp: false,
        supportsEnemy: false,
        supportsHazard: false
      });
      shell.isBackground = true;
      shell.colorHint = palette.background;
      background.push(shell);
    }

    const floor = createPlatformRecord(0, groundY, worldWidth, 50, "ground", {
      role: "worldBoundary",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      collisionMode: "solid",
      isEssential: true,
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false
    });

    const ceiling = createPlatformRecord(0, -100, worldWidth, 150, "ground", {
      role: "worldBoundary",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      collisionMode: "solid",
      isEssential: true,
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false
    });

    floor.colorHint = "#245C24";
    ceiling.colorHint = "#245C24";
    background.push(floor, ceiling);
    return background;
  }

  function scoreLevelOutput(platforms, leafNodes, pathEdges) {
    let score = 0;
    const easyCount = platforms.filter((p) => p.pathType === "easy" && p.role === "path").length;
    const hardCount = platforms.filter((p) => p.pathType === "hard" && p.role === "path").length;
    const branchCount = platforms.filter((p) => p.pathType === "branch").length;
    const powerCount = platforms.filter((p) => p.hasPowerUp).length;
    const enemyCount = platforms.filter((p) => p.enemySpawn).length;
    const dashEdges = pathEdges.filter((e) => e.requiredDash).length;

    score += Math.min(easyCount, 14) * 2;
    score += Math.min(hardCount, 16) * 2;
    score += Math.min(branchCount, 12) * 1.5;
    score += Math.min(powerCount, 8) * 2;
    score += Math.min(enemyCount, 8) * 2;
    score += Math.min(dashEdges, 8) * 3;
    score += leafNodes.length * 2;
    return score;
  }

  return function generateLevel(seed, difficulty, worldWidth, worldHeight) {
    _s = seed;
    nextId = 0;
    branchCounter = 0;

    const profile = createLevelProfile(seed, difficulty, worldWidth, worldHeight);
    const anchors = buildSharedAnchors(profile, worldWidth, worldHeight);
    const { easyPlatforms, hardPlatforms, pathEdges } = buildDualSpines(anchors, profile);
    const actionPlatforms = [...anchors, ...easyPlatforms, ...hardPlatforms];
    const { branches, branchEdges, leafNodes } = generateOptionalBranches(actionPlatforms, profile);
    const platforms = [...actionPlatforms, ...branches];

    reservePowerUpSlots(platforms, profile);
    assignSceneryAndSecrets(leafNodes, profile);
    attachHazards(platforms, profile);
    attachSupportFeatures(platforms, anchors, profile);
    attachEnemySpawns(platforms, leafNodes, profile);

    addLightGuidance(platforms, anchors, profile);
    addReactiveSetDressing(platforms);
    enforceBreatherRule(platforms);
    const teleporters = buildTeleporters(platforms, anchors, profile);

    const background = generateBackgroundShell(platforms, anchors, profile, worldWidth, worldHeight);
    platforms.push(...background);

    const qualityScore = scoreLevelOutput(platforms, leafNodes, [...pathEdges, ...branchEdges]);
    const start = anchors[0];
    const goal = anchors[anchors.length - 1];

    return {
      platforms,
      startPos: { x: start.x + start.w / 2 - 25, y: start.y - 50 },
      goalPos: { x: goal.x + goal.w / 2 - 25, y: goal.y - 50 },
      seed,
      difficulty,
      theme: profile.theme,
      profile,
      anchors: anchors.map((a) => ({ id: a.id, x: a.x, y: a.y, w: a.w, h: a.h })),
      paths: {
        easy: easyPlatforms.map((p) => p.id),
        hard: hardPlatforms.map((p) => p.id)
      },
      branches: leafNodes.map((p) => p.id),
      pathEdges,
      branchEdges,
      qualityScore,
      teleporters
    };
  };
}

const generateLevel = createLevelGenerator();
