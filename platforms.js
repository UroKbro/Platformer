function createLevelGenerator() {
  const PLAYER = {
    jump_power: 16.5,
    gravity: 0.52,
    max_speed: 5.2,
    dash_speed: 24,
    dash_duration_frames: Math.round(60 / 16.67),
    player_w: 50,
    player_h: 50,
    jump_x: 280,
    dash_x: 360
  };

  const WORLD_TYPES = {
    mesa: {
      displayName: "Mesa World",
      theme: {
        easy: "#C78652",
        hard: "#B6533C",
        shared: "#E4BE78",
        branch: "#8E5E45",
        reward: "#FFD36B",
        background: "rgba(188, 129, 84, 0.16)"
      },
      sky: { top: "#1B1210", bottom: "#8E5B38", haze: "rgba(255, 200, 132, 0.08)" },
      powerUps: ["highJump", "superSpeed", "doubleDash", "overcharge", "sandSkimmer"],
      attackPickups: ["chakram", "sandShuriken"],
      enemies: ["pacingStalker", "sentinel", "gapGuard", "sandrunner"],
      rewardBias: 0.02,
      enemyBias: 0.03,
      hazardBias: 0.02,
      boostBias: 0.08,
      conveyorBias: 0.02,
      phaseBias: -0.06
    },
    tundra: {
      displayName: "Tundra World",
      theme: {
        easy: "#78A8C8",
        hard: "#5D86B3",
        shared: "#CFE8FF",
        branch: "#8BA5B8",
        reward: "#9AF6FF",
        background: "rgba(137, 180, 210, 0.16)"
      },
      sky: { top: "#0B1625", bottom: "#4E7196", haze: "rgba(203, 235, 255, 0.08)" },
      powerUps: ["icePhysics", "feather", "doubleDash", "antiGravity", "glacierGrip"],
      attackPickups: ["burst", "iceNeedle"],
      enemies: ["hoverer", "razorbat", "gapGuard", "iceWisp"],
      rewardBias: 0.03,
      enemyBias: 0.01,
      hazardBias: 0.01,
      boostBias: -0.03,
      conveyorBias: -0.02,
      phaseBias: 0.04
    },
    overgrowth: {
      displayName: "Overgrowth World",
      theme: {
        easy: "#4E9B59",
        hard: "#2F6E43",
        shared: "#7ECF74",
        branch: "#5F6B3C",
        reward: "#D3F27A",
        background: "rgba(72, 120, 69, 0.16)"
      },
      sky: { top: "#0E1E13", bottom: "#2F5E39", haze: "rgba(164, 219, 132, 0.08)" },
      powerUps: ["ghost", "magnet", "miniBox", "highJump", "vineLeap"],
      attackPickups: ["chakram", "burst", "thornBurst"],
      enemies: ["hoverer", "pacingStalker", "razorbat", "vineCrawler"],
      rewardBias: 0.05,
      enemyBias: 0.02,
      hazardBias: -0.02,
      boostBias: -0.01,
      conveyorBias: -0.04,
      phaseBias: 0.07
    },
    foundry: {
      displayName: "Foundry World",
      theme: {
        easy: "#6D7E91",
        hard: "#D06464",
        shared: "#B5BDC9",
        branch: "#7E746B",
        reward: "#FFBE5C",
        background: "rgba(99, 102, 109, 0.16)"
      },
      sky: { top: "#171923", bottom: "#4E3B3C", haze: "rgba(242, 170, 130, 0.08)" },
      powerUps: ["overcharge", "giantBox", "doubleDash", "superSpeed", "forgeRunner"],
      attackPickups: ["burst", "forgeShot"],
      enemies: ["sentinel", "gapGuard", "razorbat", "drillDrone"],
      rewardBias: -0.01,
      enemyBias: 0.05,
      hazardBias: 0.05,
      boostBias: 0.03,
      conveyorBias: 0.07,
      phaseBias: -0.02
    }
  };

  const THEMES = {
    ruins: {
      easy: "#5B9B63",
      hard: "#C97B35",
      shared: "#5C7AEA",
      branch: "#8A6F50",
      reward: "#D7B84F",
      background: "rgba(82, 78, 72, 0.18)"
    },
    cavern: {
      easy: "#2E8B57",
      hard: "#D16C3F",
      shared: "#4C6FFF",
      branch: "#6D5A4E",
      reward: "#E6C85C",
      background: "rgba(73, 94, 90, 0.18)"
    },
    fortress: {
      easy: "#517A8A",
      hard: "#D06464",
      shared: "#7A6FF0",
      branch: "#7E746B",
      reward: "#D7B347",
      background: "rgba(74, 74, 82, 0.18)"
    },
    industrial: {
      easy: "#5E9C7F",
      hard: "#E0764E",
      shared: "#6D6CFF",
      branch: "#7F6F58",
      reward: "#F2C84B",
      background: "rgba(93, 94, 98, 0.18)"
    },
    overgrown: {
      easy: "#4E9B59",
      hard: "#C96A3C",
      shared: "#5A78F2",
      branch: "#76644A",
      reward: "#D3C058",
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
    const worldKeys = Object.keys(WORLD_TYPES);
    const worldType = choice(worldKeys);
    const worldConfig = WORLD_TYPES[worldType];
    const worldTier = clamp(Math.floor(difficulty || 1), 1, 4);
    const tierScale = 0.8 + worldTier * 0.13;
    const openness = choice(["cavernous", "mixed", "compact"]);
    const branchDensity = choice(["sparse", "medium", "dense"]);
    const hazardPressure = choice(["low", "medium", "high"]);
    const enemyPressure = choice(["low", "medium", "high"]);
    const rewardDensity = choice(["low", "medium", "high"]);
    const verticalBias = choice(["low", "medium", "high"]);

    return {
      seed,
      difficulty,
      worldType,
      worldName: worldConfig.displayName,
      worldTier,
      worldConfig,
      theme: worldConfig.theme,
      sky: worldConfig.sky,
      allowedPowerUps: worldConfig.powerUps,
      allowedAttackPickups: worldConfig.attackPickups,
      allowedEnemies: worldConfig.enemies,
      openness,
      branchDensity,
      hazardPressure,
      enemyPressure,
      rewardDensity,
      verticalBias,
      anchorCount: clamp(Math.floor(worldWidth / 950) + ri(0, 2) + Math.floor((worldTier - 1) / 2), 3, 7),
      easyAmplitude: (verticalBias === "high" ? 70 : verticalBias === "medium" ? 50 : 35) + (worldTier - 1) * 8,
      hardAmplitude: (verticalBias === "high" ? 180 : verticalBias === "medium" ? 145 : 110) + (worldTier - 1) * 18,
      branchChance: clamp((branchDensity === "dense" ? 0.42 : branchDensity === "medium" ? 0.28 : 0.18) + (worldTier - 1) * 0.02, 0.16, 0.5),
      hazardChance: clamp((hazardPressure === "high" ? 0.32 : hazardPressure === "medium" ? 0.2 : 0.12) * tierScale + worldConfig.hazardBias, 0.08, 0.55),
      enemyChance: clamp((enemyPressure === "high" ? 0.28 : enemyPressure === "medium" ? 0.18 : 0.1) * tierScale + worldConfig.enemyBias, 0.08, 0.52),
      enemyDensity: clamp(0.7 + (worldTier - 1) * 0.2 + (enemyPressure === "high" ? 0.25 : enemyPressure === "medium" ? 0.12 : 0), 0.7, 1.7),
      rewardChance: clamp((rewardDensity === "high" ? 0.4 : rewardDensity === "medium" ? 0.28 : 0.18) + worldConfig.rewardBias - (worldTier - 1) * 0.015, 0.14, 0.5),
      boostBias: worldConfig.boostBias,
      conveyorBias: worldConfig.conveyorBias,
      phaseBias: worldConfig.phaseBias,
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
    const palette = profile.theme;

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
    const palette = meta.profile.theme;
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
      visualTheme: meta.profile.worldType,
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
      const rawY = Math.round(segmentBaseY + wave + ri(hard ? -55 : -25, hard ? 55 : 25));
      const maxStepY = hard ? 120 : 82;
      let y = clamp(
        rawY,
        Math.max(170, current.y - maxStepY),
        Math.min(profile.worldHeight - (hard ? 300 : 220), current.y + maxStepY)
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
          colorHint: profile.theme[pathType === "hard" ? "hard" : "easy"]
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
        const gap = ri(90, 150);
        const width = ri(90, 150);
        const x = current.x + (direction > 0 ? current.w + gap : -(gap + width));
        const y = clamp(current.y + ri(-110, 110), 190, profile.worldHeight - 240);
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
        platform.colorHint = profile.theme.branch;

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
    const powerPool = profile.allowedPowerUps?.length ? profile.allowedPowerUps : ["doubleDash", "highJump"];
    const candidates = platforms.filter((p) => {
      if (!p.supportsPowerUp) return false;
      if (p.hasPowerUp || p.enemySpawn || p.hasSawblade) return false;
      if (p.isBackground || p.isHiddenScenery) return false;
      if (p.type === "start" || p.type === "exit" || p.type === "spike") return false;
      if (p.w < 110) return false;
      return true;
    });

    candidates.sort((a, b) => (a.x - b.x) || (a.y - b.y));
    let powerIndex = ri(0, powerPool.length - 1);
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
      platform.powerUpType = powerPool[powerIndex % powerPool.length];
      powerIndex++;
      lastPowerX = platform.x;
    }
  }

  function attachSpecialPlatforms(platforms, profile) {
    for (const p of platforms) {
      if (p.isBackground || p.isHiddenScenery) continue;
      if (p.role === "start" || p.role === "goal" || p.role === "anchor") continue;
      if (p.type !== "standard" && p.type !== "deadend" && p.type !== "risk") continue;
      if (p.w < 110) continue;

      if (
        p.pathType === "easy" &&
        p.role === "path" &&
        p.w >= 150 &&
        chance(clamp(0.16 + (profile.conveyorBias || 0), 0.04, 0.3))
      ) {
        p.type = "conveyor";
        p.conveyorSpeed = chance(0.5) ? -(1.1 + random() * 0.6) : (1.1 + random() * 0.6);
        p.supportsEnemy = false;
        p.supportsHazard = false;
        continue;
      }

      if (
        p.pathType === "branch" &&
        p.role === "branch" &&
        p.tier !== "critical" &&
        chance(clamp(0.18 + (profile.phaseBias || 0), 0.04, 0.32))
      ) {
        p.type = "phase";
        p.phasePeriod = 1500 + ri(0, 700);
        p.phaseDuty = 0.58 + random() * 0.1;
        p.phaseOffset = ri(0, 1200);
        p.hasPowerUp = false;
        p.supportsPowerUp = false;
        p.supportsEnemy = false;
        p.supportsHazard = false;
      }
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
      if (p.edgeType !== "dash_gate" && !chance(0.16 + Math.max(0, profile.worldTier - 1) * 0.03)) continue;
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
      if (!chance(clamp(0.1 + (profile.boostBias || 0), 0.03, 0.24))) continue;
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

  function attachAttackPickups(platforms, leafNodes, profile) {
    const candidates = [];

    for (const leaf of leafNodes) {
      if (leaf.isBackground || leaf.isHiddenScenery) continue;
      if (leaf.hasPowerUp || leaf.enemySpawn || leaf.hasAttackPickup) continue;
      if (leaf.supportsPowerUp === false || leaf.w < 100) continue;
      candidates.push(leaf);
    }

    for (const platform of platforms) {
      if (platform.pathType !== "hard" || platform.role !== "path") continue;
      if (platform.hasPowerUp || platform.enemySpawn || platform.hasAttackPickup) continue;
      if (platform.hasSawblade || platform.type === "crumble" || platform.w < 120) continue;
      candidates.push(platform);
    }

    let placed = 0;
    const attackPool = profile.allowedAttackPickups?.length ? profile.allowedAttackPickups : ["chakram"];
    for (const attackType of attackPool) {
      const platform = candidates.find((candidate) => !candidate.hasAttackPickup);
      if (!platform) break;
      platform.hasAttackPickup = true;
      platform.attackPickupType = attackType;
      platform.rewardScore = (platform.rewardScore || 0) + 3;
      placed++;
    }

    return placed;
  }

  function attachEnemySpawns(platforms, leafNodes, profile) {
    const allowedEnemies = new Set(profile.allowedEnemies || []);
    const density = profile.enemyDensity || 1;
    const tierBoost = Math.max(0, profile.worldTier - 1);
    const hardCandidates = platforms.filter((p) => p.pathType === "hard" && p.edgeType === "dash_gate" && p.w >= 110 && !p.hasPowerUp && !p.hasSawblade);
    const stalkerCandidates = platforms.filter((p) => p.pathType === "easy" && p.role === "path" && p.w >= 190 && !p.hasPowerUp && !p.hasSawblade && !p.enemySpawn);
    const sentinelCandidates = platforms.filter((p) => p.pathType === "hard" && p.role === "path" && p.w >= 150 && !p.hasPowerUp && !p.hasSawblade && !p.enemySpawn);
    const razorbatCandidates = platforms.filter((p) =>
      !p.isBackground &&
      !p.isHiddenScenery &&
      !p.enemySpawn &&
      !p.hasSawblade &&
      !p.hasPowerUp &&
      (p.pathType === "hard" || p.pathType === "branch") &&
      p.w >= 120 &&
      p.type !== "phase"
    );

    if (allowedEnemies.has("gapGuard")) {
      for (const p of hardCandidates) {
        if (chance(profile.enemyChance * 0.85 * density)) {
          p.enemySpawn = { type: "gapGuard", aggroRange: 220 + ri(0, 50) + tierBoost * 14 };
        }
      }
    }

    if (allowedEnemies.has("sandrunner")) {
      for (const p of hardCandidates) {
        if (p.enemySpawn || !chance(profile.enemyChance * 0.55 * density)) continue;
        p.enemySpawn = { type: "sandrunner", speed: 150 + ri(0, 30) + tierBoost * 18, aggroRange: 280 + tierBoost * 24 };
      }
    }

    let stalkersPlaced = 0;
    if (allowedEnemies.has("pacingStalker")) {
      for (const p of stalkerCandidates) {
        if (stalkersPlaced >= 3 + profile.worldTier) break;
        if (!chance(profile.enemyChance * 0.55 * density)) continue;
        p.enemySpawn = { type: "pacingStalker", aggroRange: 240 + ri(0, 70) + tierBoost * 10, speed: 145 + ri(0, 35) + tierBoost * 9 };
        stalkersPlaced++;
      }
    }

    let sentinelsPlaced = 0;
    if (allowedEnemies.has("sentinel")) {
      for (const p of sentinelCandidates) {
        if (sentinelsPlaced >= 2 + profile.worldTier) break;
        if (!chance(profile.enemyChance * 0.5 * density)) continue;
        p.enemySpawn = { type: "sentinel", aggroRange: 280 + ri(0, 80) + tierBoost * 14, speed: 185 + ri(0, 40) + tierBoost * 12 };
        sentinelsPlaced++;
      }
    }

    if (allowedEnemies.has("hoverer")) {
      for (const leaf of leafNodes) {
        if (leaf.enemySpawn || leaf.hasPowerUp) continue;
        if (!chance((0.25 + profile.enemyChance * 0.28) * density)) continue;
        leaf.enemySpawn = {
          type: "hoverer",
          aggroRange: 420 + ri(0, 120) + tierBoost * 26,
          speed: 175 + ri(0, 35) + tierBoost * 10,
          interceptLeadTime: 0.25 + random() * 0.18 + tierBoost * 0.02
        };
      }
    }

    if (allowedEnemies.has("iceWisp")) {
      for (const leaf of leafNodes) {
        if (leaf.enemySpawn || leaf.hasPowerUp || leaf.w < 120) continue;
        if (!chance((0.12 + profile.enemyChance * 0.2) * density)) continue;
        leaf.enemySpawn = {
          type: "iceWisp",
          aggroRange: 520 + tierBoost * 36,
          speed: 165 + ri(0, 25) + tierBoost * 12,
          interceptLeadTime: 0.3 + random() * 0.12 + tierBoost * 0.015
        };
      }
    }

    let batsPlaced = 0;
    if (allowedEnemies.has("razorbat")) {
      for (const p of razorbatCandidates) {
        if (batsPlaced >= 2 + profile.worldTier) break;
        if (!chance((0.12 + profile.enemyChance * 0.35) * density)) continue;
        p.enemySpawn = {
          type: "razorbat",
          aggroRange: 300 + ri(0, 90),
          speed: 210 + ri(0, 50) + tierBoost * 14
        };
        batsPlaced++;
      }
    }

    if (allowedEnemies.has("vineCrawler")) {
      for (const p of platforms) {
        if (p.pathType !== "branch" || p.role !== "path" || p.enemySpawn || p.hasPowerUp || p.w < 130) continue;
        if (!chance((0.18 + profile.enemyChance * 0.22) * density)) continue;
        p.enemySpawn = { type: "vineCrawler", speed: 120 + ri(0, 22) + tierBoost * 12, aggroRange: 260 + tierBoost * 20 };
      }
    }

    if (allowedEnemies.has("drillDrone")) {
      for (const p of hardCandidates) {
        if (p.enemySpawn || p.w < 140 || !chance((0.15 + profile.enemyChance * 0.24) * density)) continue;
        p.enemySpawn = { type: "drillDrone", aggroRange: 320 + tierBoost * 30, speed: 175 + ri(0, 30) + tierBoost * 14 };
      }
    }
  }

  function assignSceneryAndSecrets(leafNodes, profile) {
    const sceneryByWorld = {
      mesa: ["VASE", "TOTEM", "DRY_SHRUB"],
      tundra: ["ICE_SPIKE", "CRYSTAL", "SNOWDRIFT"],
      overgrowth: ["TREE", "MUSHROOM", "FERN"],
      foundry: ["GEAR", "PIPE", "CRATE"]
    };
    const options = sceneryByWorld[profile.worldType] || ["OLD_STATUE", "VASE"];
    for (const leaf of leafNodes) {
      if (chance(0.2)) {
        leaf.hasScenery = true;
        leaf.sceneryType = options[ri(0, options.length - 1)];
        leaf.rewardScore += 2;
      }
      if (!leaf.hasPowerUp && leaf.supportsPowerUp !== false && chance(profile.rewardChance * 0.45)) {
        leaf.hasPowerUp = true;
        leaf.powerUpType = profile.allowedPowerUps[ri(0, profile.allowedPowerUps.length - 1)];
      }
    }
  }

  function addLightGuidance(platforms, anchors, profile) {
    const palette = profile.theme;
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

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function getPlatformRect(platform) {
    return { x: platform.x, y: platform.y, w: platform.w, h: platform.h };
  }

  function getCheckpointZone(platform) {
    return {
      x: platform.x + platform.w - 38,
      y: platform.y - 86,
      w: 42,
      h: 92
    };
  }

  function getPowerUpZone(platform) {
    return {
      x: platform.x + platform.w * 0.5 - 28,
      y: platform.y - 56,
      w: 56,
      h: 56
    };
  }

  function getAttackPickupZone(platform) {
    return {
      x: platform.x + platform.w * 0.5 - 24,
      y: platform.y - 88,
      w: 48,
      h: 48
    };
  }

  function getDashRefillZone(platform) {
    return {
      x: platform.x + platform.w * 0.5 - 18,
      y: platform.y - 42,
      w: 36,
      h: 36
    };
  }

  function getExitFlagZone(platform) {
    return {
      x: platform.x + platform.w - 16,
      y: platform.y - 40,
      w: 30,
      h: 26
    };
  }

  function getExitAccessZone(platform) {
    return {
      x: platform.x + platform.w - 60,
      y: platform.y - 140,
      w: 120,
      h: 170
    };
  }

  function canReserveZone(platforms, owner, zone) {
    for (const candidate of platforms) {
      if (candidate.id === owner.id) continue;
      if (candidate.isBackground || candidate.isHiddenScenery) continue;
      if (candidate.collisionMode === "disabled") continue;
      if (!rectsOverlap(getPlatformRect(candidate), zone)) continue;
      return false;
    }
    return true;
  }

  function clearExitApproach(platforms, goal) {
    const zone = getExitAccessZone(goal);
    const flagZone = getExitFlagZone(goal);

    for (const platform of platforms) {
      if (platform.id === goal.id) continue;
      if (platform.isBackground || platform.isHiddenScenery) continue;
      if (platform.role === "worldBoundary") continue;
      if (!rectsOverlap(getPlatformRect(platform), zone)) continue;

      if (platform.type === "spike") {
        platform.collisionMode = "disabled";
        platform.isHiddenScenery = true;
        continue;
      }

      if (platform.enemySpawn) platform.enemySpawn = null;
      platform.hasSawblade = false;

      if (!platform.isEssential) {
        platform.collisionMode = "disabled";
        platform.isHiddenScenery = true;
        continue;
      }

      if (rectsOverlap(getPlatformRect(platform), flagZone)) {
        const leftOfGoal = goal.x - platform.w - 40;
        platform.x = Math.min(platform.x, leftOfGoal);
      }
    }
  }

  function enforceReservedClearances(platforms, anchors) {
    function clearBlockedPickups() {
      for (const platform of platforms) {
        if (platform.hasPowerUp && !canReserveZone(platforms, platform, getPowerUpZone(platform))) {
          platform.hasPowerUp = false;
          platform.powerUpType = null;
        }

        if (platform.hasAttackPickup && !canReserveZone(platforms, platform, getAttackPickupZone(platform))) {
          platform.hasAttackPickup = false;
          platform.attackPickupType = null;
        }

        if (platform.hasDashRefill && !canReserveZone(platforms, platform, getDashRefillZone(platform))) {
          platform.hasDashRefill = false;
        }
      }
    }

    function clearBlockedCheckpoints() {
      for (const anchor of anchors) {
        if (!anchor.isCheckpoint) continue;
        if (!canReserveZone(platforms, anchor, getCheckpointZone(anchor))) {
          anchor.isCheckpoint = false;
        }
      }
    }

    clearBlockedPickups();
    clearBlockedCheckpoints();

    const goal = anchors.find((anchor) => anchor.type === "exit");
    if (goal) {
      clearExitApproach(platforms, goal);
      if (!canReserveZone(platforms, goal, getExitFlagZone(goal))) {
        clearExitApproach(platforms, goal);
      }
    }

    clearBlockedPickups();
    clearBlockedCheckpoints();
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

    const exitCandidates = platforms.filter((p) =>
      !p.isBackground &&
      !p.isHiddenScenery &&
      p.role !== "branch" &&
      p.type !== "spike" &&
      p.type !== "ghost" &&
      p.w >= 120
    );

    function pickExitPlatform(entryPlatform) {
      let best = null;
      let bestScore = Infinity;

      for (const candidate of exitCandidates) {
        if (candidate.x >= entryPlatform.x - 280) continue;
        const dx = entryPlatform.x - candidate.x;
        const dy = Math.abs(candidate.y - entryPlatform.y);
        if (dx < 360 || dy > 220) continue;

        const checkpointBonus = candidate.isCheckpoint ? -180 : 0;
        const anchorBonus = candidate.role === "anchor" ? -120 : 0;
        const pathBonus = candidate.role === "path" ? -60 : 0;
        const score = dx * 0.55 + dy * 1.4 + checkpointBonus + anchorBonus + pathBonus;

        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      return best;
    }

    let pairId = 0;
    for (const entryPlatform of entries) {
      if (!chance(0.28)) continue;
      const exitPlatform = pickExitPlatform(entryPlatform);
      if (!exitPlatform) continue;

      teleporters.push({
        id: `tele_${pairId++}`,
        entry: {
          x: entryPlatform.x + entryPlatform.w * 0.5,
          y: entryPlatform.y - 30,
          r: 20,
          platformId: entryPlatform.id
        },
        exit: {
          x: exitPlatform.x + exitPlatform.w * 0.5,
          y: exitPlatform.y - 30,
          r: 24,
          platformId: exitPlatform.id
        },
        color: profile.theme.shared,
        kind: "loopback"
      });
    }

    return teleporters;
  }

  function generateBackgroundShell(platforms, anchors, profile, worldWidth, worldHeight) {
    const background = [];
    const groundY = worldHeight - 40;
    const palette = profile.theme;
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

  function generateBossLevel(seed, bossType, worldWidth, worldHeight) {
    _s = seed;
    nextId = 0;
    branchCounter = 0;

    const bossThemeMap = {
      bossColossus: "fortress",
      bossTempest: "cavern",
      bossOracle: "industrial"
    };
    const theme = bossThemeMap[bossType] || "fortress";
    const palette = THEMES[theme];
    const centerX = Math.floor(worldWidth * 0.52);
    const groundY = worldHeight - 140;
    const platforms = [];

    const floor = createPlatformRecord(centerX - 900, groundY, 1800, 44, "ground", {
      role: "bossFloor",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false,
      isEssential: true
    });
    floor.colorHint = bossType === "bossColossus" ? "#6F6A62" : bossType === "bossTempest" ? "#446C8E" : "#6467A8";
    floor.enemySpawn = { type: bossType };
    platforms.push(floor);

    const leftPlatform = createPlatformRecord(centerX - 620, groundY - 190, 220, 20, "standard", {
      role: "bossPerch",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false,
      isEssential: false
    });
    leftPlatform.colorHint = palette.shared;
    const midPlatform = createPlatformRecord(centerX - 90, groundY - 270, 180, 20, "standard", {
      role: "bossPerch",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false,
      isEssential: false
    });
    midPlatform.colorHint = palette.easy;
    const rightPlatform = createPlatformRecord(centerX + 380, groundY - 190, 220, 20, "standard", {
      role: "bossPerch",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false,
      isEssential: false
    });
    rightPlatform.colorHint = palette.shared;
    platforms.push(leftPlatform, midPlatform, rightPlatform);

    const startPad = createPlatformRecord(centerX - 1040, groundY - 30, 200, 24, "start", {
      role: "start",
      pathType: "shared",
      tier: "critical",
      layer: "action",
      supportsPowerUp: false,
      supportsEnemy: false,
      supportsHazard: false,
      isEssential: true
    });
    startPad.colorHint = palette.shared;
    platforms.push(startPad);

    const background = [];
    for (let i = 0; i < 7; i++) {
      const pillar = createPlatformRecord(centerX - 980 + i * 320, groundY - ri(220, 520), ri(120, 180), ri(180, 520), "ghost", {
        role: "background",
        pathType: "decor",
        tier: "optional",
        layer: i % 2 === 0 ? "foreground" : "background",
        collisionMode: "disabled",
        isEssential: false,
        supportsPowerUp: false,
        supportsEnemy: false,
        supportsHazard: false
      });
      pillar.isBackground = true;
      pillar.colorHint = palette.background;
      background.push(pillar);
    }

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
    ceiling.colorHint = "#1F2A37";

    const bottom = createPlatformRecord(0, worldHeight - 40, worldWidth, 60, "ground", {
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
    bottom.colorHint = floor.colorHint;

    platforms.push(...background, ceiling, bottom);

    return {
      platforms,
      startPos: { x: startPad.x + 50, y: startPad.y - 50 },
      goalPos: null,
      seed,
      difficulty: 4,
      theme,
      profile: { theme, bossType, bossArena: true },
      anchors: [
        { id: startPad.id, x: startPad.x, y: startPad.y, w: startPad.w, h: startPad.h },
        { id: floor.id, x: floor.x, y: floor.y, w: floor.w, h: floor.h }
      ],
      paths: { easy: [], hard: [] },
      branches: [],
      pathEdges: [],
      branchEdges: [],
      qualityScore: 100,
      teleporters: [],
      mode: "boss",
      boss: { type: bossType }
    };
  }

  function generateLevel(seed, difficulty, worldWidth, worldHeight) {
    _s = seed;
    nextId = 0;
    branchCounter = 0;

    const profile = createLevelProfile(seed, difficulty, worldWidth, worldHeight);
    const anchors = buildSharedAnchors(profile, worldWidth, worldHeight);
    const { easyPlatforms, hardPlatforms, pathEdges } = buildDualSpines(anchors, profile);
    const actionPlatforms = [...anchors, ...easyPlatforms, ...hardPlatforms];
    const { branches, branchEdges, leafNodes } = generateOptionalBranches(actionPlatforms, profile);
    const platforms = [...actionPlatforms, ...branches];

    attachSpecialPlatforms(platforms, profile);
    reservePowerUpSlots(platforms, profile);
    assignSceneryAndSecrets(leafNodes, profile);
    attachHazards(platforms, profile);
    attachSupportFeatures(platforms, anchors, profile);
    attachAttackPickups(platforms, leafNodes, profile);
    attachEnemySpawns(platforms, leafNodes, profile);

    addLightGuidance(platforms, anchors, profile);
    addReactiveSetDressing(platforms);
    enforceBreatherRule(platforms);
    enforceReservedClearances(platforms, anchors);
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
      worldType: profile.worldType,
      worldName: profile.worldName,
      worldTier: profile.worldTier,
      theme: profile.theme,
      sky: profile.sky,
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
  }

  generateLevel.generateBossLevel = generateBossLevel;
  return generateLevel;
}

const generateLevel = createLevelGenerator();
const generateBossLevel = generateLevel.generateBossLevel;
