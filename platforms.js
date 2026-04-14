function createPlatforms(world) {
  const W = world.width;
  const H = world.height;
  const GROUND_Y = H - 40;

  const PLAYER_W = 50;
  const JUMP_POWER = 15;
  const GRAVITY = 0.475;
  const MAX_SPEED = 4.5;
  const DASH_SPEED = 12;
  const DASH_DURATION_MS = 120;

  const AIR_TIME = (2 * JUMP_POWER) / GRAVITY;
  const JUMP_DISTANCE = MAX_SPEED * AIR_TIME;
  const DASH_DISTANCE = DASH_SPEED * (DASH_DURATION_MS / 1000);

  const STANDARD_GAP = Math.floor(JUMP_DISTANCE * 0.75);
  const RISK_CHAIN_GAP = Math.floor((JUMP_DISTANCE + DASH_DISTANCE) * 0.9);
  const MAX_RISK_VERTICAL_STEP = 130;

  let seed = 1337;
  function random() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rr = (a, b) => a + random() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 0.999));

  const platforms = [];
  const standardPath = [];
  const riskPath = [];

  function addPlatform(platform, path) {
    platforms.push(platform);
    if (path) path.push(platform);
    return platform;
  }

  function makeStandardSegment(prev, index) {
    const w = ri(180, 280);
    const gap = ri(Math.floor(STANDARD_GAP * 0.82), Math.floor(STANDARD_GAP * 0.98));
    const x = prev.x + prev.w + gap;
    const yShift = ri(-45, 35);
    const minY = GROUND_Y - 320;
    const maxY = GROUND_Y - 120;
    const y = Math.max(minY, Math.min(maxY, prev.y + yShift));

    return {
      x,
      y,
      w,
      h: ri(20, 28),
      type: "standard",
      segmentIndex: index
    };
  }

  function addRiskBranch(anchor, branchIndex) {
    const branch = [];
    const branchCount = ri(3, 4);
    let prevX = anchor.x + anchor.w - 18;
    let prevY = anchor.y;

    for (let i = 0; i < branchCount; i++) {
      const stepX = Math.floor(RISK_CHAIN_GAP * rr(0.82, 0.94));
      const stepY = ri(70, MAX_RISK_VERTICAL_STEP);
      const pip = {
        x: prevX + stepX,
        y: prevY - stepY,
        w: ri(48, 64),
        h: 14,
        type: i === 1 ? "crumble" : "risk",
        branchIndex,
        branchStep: i
      };

      addPlatform(pip, riskPath);
      branch.push(pip);
      prevX = pip.x;
      prevY = pip.y;
    }

    const reward = addPlatform(
      {
        x: prevX + ri(80, 120),
        y: prevY - ri(20, 45),
        w: 160,
        h: 18,
        type: "reward",
        branchIndex
      },
      riskPath
    );

    return { branch, reward };
  }

  platforms.push({ x: 0, y: GROUND_Y, w: W, h: 40, type: "ground" });

  const startPlatform = addPlatform(
    {
      x: 70,
      y: GROUND_Y - 130,
      w: 280,
      h: 28,
      type: "standard",
      segmentIndex: 0,
      isStart: true
    },
    standardPath
  );

  let current = startPlatform;
  let segmentIndex = 1;
  const branchPlan = [];

  while (current.x + current.w < W - 700) {
    const next = makeStandardSegment(current, segmentIndex);
    addPlatform(next, standardPath);

    if (segmentIndex % 4 === 0 && next.x < W - 1400) {
      branchPlan.push({
        anchor: current,
        rejoin: next,
        branchIndex: branchPlan.length
      });
    }

    current = next;
    segmentIndex++;
  }

  branchPlan.forEach(({ anchor, rejoin, branchIndex }) => {
    const { reward } = addRiskBranch(anchor, branchIndex);

    addPlatform(
      {
        x: reward.x + reward.w + ri(90, 120),
        y: reward.y + ri(40, 70),
        w: 190,
        h: 20,
        type: "riskReset",
        branchIndex
      },
      riskPath
    );

    addPlatform(
      {
        x: rejoin.x - ri(70, 110),
        y: rejoin.y - ri(12, 24),
        w: 120,
        h: 16,
        type: "shortcut",
        branchIndex
      },
      riskPath
    );
  });

  const exitX = W - 340;
  const exitY = Math.min(current.y, GROUND_Y - 140);

  addPlatform(
    {
      x: exitX,
      y: exitY,
      w: 300,
      h: 30,
      type: "exit",
      isExit: true
    },
    standardPath
  );

  return platforms;
}
