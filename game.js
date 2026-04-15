window.onload = function () {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    const player = {
        x: 100,
        y: 100,
        w: 50,
        h: 50,
        vx: 0,
        vy: 0,

        accel: 2.05,
        friction: 0.78,
        maxSpeed: 5.2,
        brake: 0.28,
        maxFallSpeed: 12,
        jumpPower: 16.5,
        onGround: false,

        airControl: 0.82,

        coyoteTime: 85,
        lastGrounded: 0,
        jumpBufferTime: 95,
        lastJumpPress: 0,
        jumpCooldown: 220,
        lastJumpTime: 0,

        // ===== STATE SYSTEM =====
        state: "air", // grounded | air | dash

        // ===== DASH =====
        dashRequested: false,
        dashTime: 0,
        dashDuration: 60, // Much shorter explosive burst
        dashCooldown: 1200, 
        lastDashTime: 0,
        dashCharges: 1,
        maxDashCharges: 1,
        dashSpeed: 24, // Insanely fast speed to cover the exact same distance
        dashDirX: 1,
        dashDirY: 0,
        dashActiveDuration: 60,
        dashActiveSpeed: 24,
        
        baseW: 50,
        baseH: 50,
        baseAccel: 2.05,
        baseMaxSpeed: 5.2,
        baseJumpPower: 16.5,
        baseAirControl: 0.82,
        baseCoyoteTime: 85,
        baseJumpBufferTime: 95,
        baseMaxDashCharges: 1,
        baseDashDuration: 60,
        baseDashSpeed: 24,
        baseBrake: 0.28,
        baseGravity: 0.52,
        baseMaxFallSpeed: 12,
        basePickupRadius: 0,
        
        powerUps: {},
        trail: [], // Stores visual ghost frames
        facing: 1,
        renderScaleX: 1,
        renderScaleY: 1,
        stretchVel: 0,
        justLandedAt: 0,
        lastTeleportAt: 0,
        checkpointId: null,
        pickupRadius: 0,
        supportPlatformId: null,
        attackRequested: false,
        attackCooldownUntil: 0,
        attackInventory: ["slash"],
        currentAttackIndex: 0,
        attackCounter: 0,
        attackTrail: [],
        health: 3,
        maxHealth: 3,
        enemyInvulnerableUntil: 0
    };

    let gravity = 0.475;

    const world = {
        width: 5000,
        height: 2000
    };

    let level;
    let platforms;
    let enemies = [];
    let activeAttacks = [];
    let attackProjectiles = [];
    let teleporters = [];
    let teleporterHint = null;
    let portalParticles = [];
    let environmentParticles = [];
    let collectedPowerUpIds = new Set();
    let checkpoint = null;
    let lives = 3;
    let gameState = "playing"; // "playing" | "game_over" | "victory"
    const campaign = {
        currentLevel: 1,
        totalLevels: 3,
        inBossStage: false,
        bossType: null
    };
    const bossPool = ["bossColossus", "bossTempest", "bossOracle"];

    const camera = {
        x: 0,
        y: 0
    };

    const keys = {};
    const defaultBindings = {
        moveLeft: ["ArrowLeft", "a", "A"],
        moveRight: ["ArrowRight", "d", "D"],
        jump: ["ArrowUp", "w", "W"],
        dash: ["Space"],
        attack: ["KeyX", "x", "X"],
        swapAttack: ["KeyC", "c", "C"],
        confirm: ["Enter", "KeyE", "e", "E"],
        restart: ["KeyR", "r", "R"]
    };

    function cloneBindingsMap(source = defaultBindings) {
        const clone = {};
        for (const action of Object.keys(defaultBindings)) {
            const bindings = source[action] || defaultBindings[action] || [];
            clone[action] = [...new Set(bindings.filter((value) => typeof value === "string" && value.length > 0))];
        }
        return clone;
    }

    function normalizeBindingsMap(rawBindings) {
        if (!rawBindings || typeof rawBindings !== "object") return cloneBindingsMap();

        const normalized = cloneBindingsMap();
        for (const action of Object.keys(defaultBindings)) {
            const source = rawBindings[action];
            if (!Array.isArray(source)) continue;
            const cleaned = source.filter((value) => typeof value === "string" && value.length > 0);
            if (cleaned.length > 0) normalized[action] = [...new Set(cleaned)];
        }
        return normalized;
    }

    function getBindingsFor(action) {
        return controlBindings[action] || defaultBindings[action] || [];
    }

    function prettyBindingName(binding) {
        if (binding === " ") return "Space";
        if (binding === "Space") return "Space";
        if (binding.startsWith("Arrow")) return binding.replace("Arrow", "");
        if (binding.startsWith("Key") && binding.length === 4) return binding.slice(3);
        return binding;
    }

    function formatBindingList(action) {
        return getBindingsFor(action).map(prettyBindingName).join(" / ");
    }

    function actionMatchesEvent(action, e) {
        const bindings = getBindingsFor(action);
        return bindings.includes(e.key) || bindings.includes(e.code);
    }

    function isActionPressed(action) {
        return getBindingsFor(action).some((binding) => keys[binding]);
    }

    function clearActionState(action) {
        for (const key of getBindingsFor(action)) keys[key] = false;
    }
    function loadControlBindings() {
        try {
            const saved = JSON.parse(localStorage.getItem("platformerBindings") || "null");
            return normalizeBindingsMap(saved);
        } catch {
            return cloneBindingsMap();
        }
    }

    let controlBindings = loadControlBindings();
    let settingsOpen = false;
    let levelInstanceId = 0;

    window.setPlatformerBindings = function (nextBindings) {
        if (!nextBindings || typeof nextBindings !== "object") return;
        controlBindings = normalizeBindingsMap(nextBindings);
        try {
            localStorage.setItem("platformerBindings", JSON.stringify(controlBindings));
        } catch {
            // Ignore storage failures and keep the live bindings active.
        }
    };

    window.resetPlatformerBindings = function () {
        controlBindings = cloneBindingsMap();
        try {
            localStorage.removeItem("platformerBindings");
        } catch {
            // Ignore storage failures; the in-memory reset still succeeds.
        }
    };

    function isPlatformSolid(platform) {
        if (platform.isBackground) return false;
        if (platform.collisionMode === "disabled") return false;
        if (platform.isHiddenScenery) return false;
        if (platform.type === "crumble" && platform.crumbleState === "hidden") return false;
        if (platform.type === "phase" && platform.phaseState === "hidden") return false;
        if (platform.type === "spike") return false; // Physics pass-through natively so death handler triggers explicitly
        return true;
    }

    function getExitFlagBounds(platform) {
        return {
            x: platform.x + platform.w - 8,
            y: platform.y - 34,
            w: 22,
            h: 16
        };
    }

    function buildRuntimePlatforms() {
        return level.platforms.map((platform, index) => {
            const runtime = {
                ...platform,
                id: index,
                sourceId: `${level.instanceId}:${platform.id}`,
                crumbleDelay: platform.crumbleDuration || (platform.type === "crumble" ? 500 : 0),
                crumbleResetDelay: platform.type === "crumble" ? 2400 : 0,
                crumbleState: platform.type === "crumble" ? "idle" : "stable",
                crumbleTriggeredAt: 0,
                respawnAt: 0,
                phaseState: platform.type === "phase" ? (platform.phaseState || "solid") : null,
                phaseGlow: 0,
                lastReactiveAt: 0,
                reactiveMode: null
            };

            if (platform.hasSawblade) {
                runtime.sawX = platform.sawX ?? runtime.w * 0.5;
                runtime.sawSpeed = platform.sawSpeed ?? 60;
                runtime.sawSize = platform.sawSize ?? 15;
            }

            if (collectedPowerUpIds.has(`${level.instanceId}:${platform.id}`)) {
                runtime.hasPowerUp = false;
                runtime.powerUpType = null;
            }

            return runtime;
        });
    }

    function resetLevelState() {
        platforms = buildRuntimePlatforms();
        enemies = (typeof window.createEnemies === "function")
          ? window.createEnemies({ ...level, platforms })
          : [];
        teleporters = (level.teleporters || []).map((teleporter) => ({
            ...teleporter,
            cooldownUntil: 0
        }));
        portalParticles = [];
        environmentParticles = [];
    }

    function pickRandomBoss() {
        return bossPool[Math.floor(Math.random() * bossPool.length)];
    }

    function buildCampaignLevel() {
        const seed = Date.now();
        if (campaign.inBossStage && typeof generateBossLevel === "function") {
            if (!campaign.bossType) campaign.bossType = pickRandomBoss();
            return generateBossLevel(seed, campaign.bossType, world.width, world.height);
        }

        return generateLevel(seed, campaign.currentLevel, world.width, world.height);
    }

    function initLevel(options = {}) {
        const preserveAttacks = !!options.preserveAttacks;
        level = { ...buildCampaignLevel(), instanceId: ++levelInstanceId };
        player.x = level.startPos.x;
        player.y = level.startPos.y;
        player.vx = 0;
        player.vy = 0;
        player.dashTime = 0;
        player.state = "air";
        player.health = player.maxHealth;
        player.powerUps = {};
        player.dashCharges = player.maxDashCharges;
        player.dashRequested = false;
        player.trail = [];
        player.renderScaleX = 1;
        player.renderScaleY = 1;
        player.stretchVel = 0;
        player.enemyInvulnerableUntil = 0;
        player.lastTeleportAt = 0;
        player.checkpointId = null;
        player.pickupRadius = 0;
        player.supportPlatformId = null;
        collectedPowerUpIds = new Set();
        teleporterHint = null;
        if (preserveAttacks) resetAttackStatePreservingLoadout();
        else resetAttackLoadout();
        
        resetLevelState();
        checkpoint = null;

        camera.x = player.x;
        camera.y = player.y;
    }

    function resetGame() {
        lives = 3;
        gameState = "playing";
        campaign.currentLevel = 1;
        campaign.inBossStage = false;
        campaign.bossType = null;
        initLevel();
    }

    initLevel();

    function getActiveBoss() {
        for (const enemy of enemies) {
            if (enemy && enemy.isBoss && !enemy.dead) return enemy;
        }
        return null;
    }

    function advanceCampaign() {
        checkpoint = null;
        if (campaign.inBossStage) {
            gameState = "victory";
            return;
        }

        if (campaign.currentLevel < campaign.totalLevels) {
            campaign.currentLevel++;
            initLevel({ preserveAttacks: true });
            return;
        }

        campaign.inBossStage = true;
        campaign.bossType = pickRandomBoss();
        initLevel({ preserveAttacks: true });
    }

    function die() {
        lives--;
        if (lives <= 0) {
            gameState = "game_over";
            return;
        }

        const respawn = checkpoint || level.startPos;
        player.x = respawn.x;
        player.y = respawn.y;
        player.vx = 0;
        player.vy = 0;
        player.dashTime = 0;
        player.state = "air";
        player.health = player.maxHealth;
        player.powerUps = {}; // All powers vanish!
        player.dashCharges = player.maxDashCharges;
        player.dashRequested = false;
        player.trail = [];
        player.renderScaleX = 1;
        player.renderScaleY = 1;
        player.stretchVel = 0;
        player.enemyInvulnerableUntil = 0;
        player.lastTeleportAt = 0;
        player.pickupRadius = 0;
        player.supportPlatformId = null;
        teleporterHint = null;
        camera.x = player.x;
        camera.y = player.y;
        resetAttackLoadout();
        resetLevelState();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function triggerSquashStretch(type) {
        if (type === "land") {
            player.justLandedAt = Date.now();
        }
    }

    function emitPebbles(platform, intensity) {
        if (!platform.reactivePebbles) return;
        const count = Math.max(2, Math.floor((platform.pebbleCount || 3) * intensity));
        for (let i = 0; i < count; i++) {
            environmentParticles.push({
                kind: "pebble",
                x: platform.x + 10 + Math.random() * Math.max(20, platform.w - 20),
                y: platform.y - 4,
                vx: (Math.random() - 0.5) * 2.2,
                vy: -Math.random() * 2.5,
                life: 450 + Math.random() * 250,
                bornAt: Date.now(),
                size: 3 + Math.random() * 3
            });
        }
    }

    function triggerReactivePlatform(platform, mode) {
        if (!platform) return;
        platform.lastReactiveAt = Date.now();
        platform.reactiveMode = mode;
        if (mode === "land") emitPebbles(platform, 1);
        if (mode === "dash") emitPebbles(platform, 1.4);
    }

    function activateCheckpoint(platform) {
        if (!platform || !platform.isCheckpoint) return;
        checkpoint = { x: platform.x + platform.w / 2 - player.w / 2, y: platform.y - player.h };
        player.checkpointId = platform.id;
    }

    function updateVisualEffects(now, dt) {
        player.renderScaleX = 1;
        player.renderScaleY = 1;
        player.stretchVel = 0;

        portalParticles = portalParticles.filter((particle) => now - particle.bornAt < particle.life);
        environmentParticles = environmentParticles.filter((particle) => now - particle.bornAt < particle.life);

        for (const particle of portalParticles) {
            particle.x += particle.vx * dt * 60;
            particle.y += particle.vy * dt * 60;
        }

        for (const particle of environmentParticles) {
            particle.x += particle.vx * dt * 60;
            particle.y += particle.vy * dt * 60;
            particle.vy += 0.12;
        }

        for (const teleporter of teleporters) {
            if (Math.random() < 0.16) {
                for (const endpoint of [teleporter.entry, teleporter.exit]) {
                    portalParticles.push({
                        kind: "portal",
                        x: endpoint.x,
                        y: endpoint.y,
                        vx: (Math.random() - 0.5) * 0.9,
                        vy: -0.3 - Math.random() * 0.8,
                        life: 450 + Math.random() * 300,
                        bornAt: now,
                        alpha: 0.4 + Math.random() * 0.4,
                        color: teleporter.color
                    });
                }
            }
        }
    }

    function rectIntersectsCircle(rect, circle) {
        const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
        const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
        const dx = circle.x - closestX;
        const dy = circle.y - closestY;
        return (dx * dx + dy * dy) <= circle.r * circle.r;
    }

    function consumeConfirmKey() {
        clearActionState("confirm");
    }

    function handleTeleporters(now) {
        teleporterHint = null;
        if (now - player.lastTeleportAt < 180) return;

        const wantsConfirm = isActionPressed("confirm");
        for (const teleporter of teleporters) {
            if (teleporter.cooldownUntil > now) continue;
            if (!rectIntersectsCircle(player, teleporter.entry)) continue;

            teleporterHint = teleporter;
            if (!wantsConfirm) continue;

            player.x = teleporter.exit.x - player.w * 0.5;
            player.y = teleporter.exit.y - player.h * 0.5;
            // Preserve momentum on teleportation (no change to vx/vy)
            player.lastTeleportAt = now;
            teleporter.cooldownUntil = now + 500;
            consumeConfirmKey();

            for (let i = 0; i < 18; i++) {
                portalParticles.push({
                    kind: "portalBurst",
                    x: teleporter.exit.x,
                    y: teleporter.exit.y,
                    vx: (Math.random() - 0.5) * 3.8,
                    vy: (Math.random() - 0.5) * 3.8,
                    life: 380 + Math.random() * 220,
                    bornAt: now,
                    alpha: 0.7,
                    color: teleporter.color
                });
            }
            break;
        }
    }

    function updateCamera(dt) {
        const targetCamX = player.x + player.w * 0.5 - canvas.width / 2;
        const targetCamY = player.y + player.h * 0.5 - canvas.height / 2;
        const lerpFactor = player.state === "dash" ? 9.5 : 4.5;

        camera.x += (targetCamX - camera.x) * dt * lerpFactor;
        camera.y += (targetCamY - camera.y) * dt * 3.8;

        camera.x = clamp(camera.x, 0, Math.max(0, world.width - canvas.width));
        camera.y = clamp(camera.y, 0, Math.max(0, world.height - canvas.height));
    }

    function triggerCrumble(platform) {
        if (platform.type !== "crumble") return;
        if (platform.crumbleState !== "idle") return;

        platform.crumbleState = "warning";
        platform.crumbleTriggeredAt = Date.now();
        platform.respawnAt = 0;
    }

    function updateCrumblePlatforms(now) {
        for (const platform of platforms) {
            if (platform.type !== "crumble") continue;

            if (
                platform.crumbleState === "warning" &&
                now - platform.crumbleTriggeredAt >= platform.crumbleDelay
            ) {
                platform.crumbleState = "hidden";
                platform.respawnAt = now + platform.crumbleResetDelay;
            }

            if (platform.crumbleState === "hidden" && now >= platform.respawnAt) {
                platform.crumbleState = "idle";
                platform.crumbleTriggeredAt = 0;
                platform.respawnAt = 0;
            }
        }
    }

    function updatePhasePlatforms(now) {
        for (const platform of platforms) {
            if (platform.type !== "phase") continue;
            const period = platform.phasePeriod || 1800;
            const duty = platform.phaseDuty || 0.6;
            const offset = platform.phaseOffset || 0;
            const cycle = (now + offset) % period;
            platform.phaseState = cycle < period * duty ? "solid" : "hidden";
            platform.phaseGlow = 1 - Math.abs((cycle / period) * 2 - 1);
        }
    }

    function getPlatformById(id) {
        if (id == null) return null;
        for (const platform of platforms) {
            if (platform.id === id) return platform;
        }
        return null;
    }

    function applySupportPlatformEffects(dt, now) {
        if (!player.onGround) return;
        const support = getPlatformById(player.supportPlatformId);
        if (!support) return;

        if (support.type === "conveyor") {
            const shift = (support.conveyorSpeed || 0) * dt * 60;
            player.x += shift;
            if (Math.abs(shift) > 0.01) player.facing = Math.sign(shift);

            for (const p of platforms) {
                if (p.id === support.id || !isPlatformSolid(p)) continue;
                if (
                    player.x < p.x + p.w &&
                    player.x + player.w > p.x &&
                    player.y < p.y + p.h &&
                    player.y + player.h > p.y
                ) {
                    if (shift > 0) player.x = p.x - player.w;
                    else if (shift < 0) player.x = p.x + p.w;
                }
            }

            if (Math.random() < 0.08) {
                environmentParticles.push({
                    kind: "beltDust",
                    x: player.x + player.w * 0.5,
                    y: support.y - 2,
                    vx: -shift * 0.25,
                    vy: -0.6 - Math.random() * 0.5,
                    life: 220 + Math.random() * 120,
                    bornAt: now,
                    size: 2 + Math.random() * 2
                });
            }
        }
    }

    const ATTACK_DEFS = {
        slash: {
            label: "Slash",
            color: "#FFD166",
            cooldown: 260,
            activeMs: 95,
            damage: 1,
            width: 122,
            height: 74
        },
        chakram: {
            label: "Chakram",
            color: "#6EE7FF",
            cooldown: 680,
            damage: 1,
            speed: 15.5,
            size: 20,
            life: 980
        },
        burst: {
            label: "Burst",
            color: "#B98CFF",
            cooldown: 920,
            activeMs: 140,
            damage: 1,
            radius: 118
        },
        sandShuriken: {
            label: "Sand Shuriken",
            color: "#F4C97B",
            cooldown: 560,
            damage: 1,
            speed: 16.5,
            size: 16,
            life: 820
        },
        iceNeedle: {
            label: "Ice Needle",
            color: "#8FE9FF",
            cooldown: 720,
            damage: 1,
            speed: 14,
            size: 14,
            life: 940,
            pierce: 2
        },
        thornBurst: {
            label: "Thorn Burst",
            color: "#7DFF8A",
            cooldown: 840,
            activeMs: 160,
            damage: 1,
            radius: 136
        },
        forgeShot: {
            label: "Forge Shot",
            color: "#FF8A4C",
            cooldown: 860,
            damage: 2,
            speed: 12,
            size: 22,
            life: 760
        },
        reboundDisk: {
            label: "Rebound Disk",
            color: "#8AE6FF",
            cooldown: 760,
            damage: 1,
            speed: 11.5,
            size: 18,
            life: 1500,
            rebounds: 4
        }
    };

    function resetAttackLoadout() {
        player.attackRequested = false;
        player.attackCooldownUntil = 0;
        player.attackInventory = ["slash"];
        player.currentAttackIndex = 0;
        player.attackCounter = 0;
        player.attackTrail = [];
        activeAttacks = [];
        attackProjectiles = [];
    }

    function resetAttackStatePreservingLoadout() {
        player.attackRequested = false;
        player.attackCooldownUntil = 0;
        player.attackTrail = [];
        activeAttacks = [];
        attackProjectiles = [];
    }

    function getCurrentAttackType() {
        return player.attackInventory[player.currentAttackIndex] || "slash";
    }

    function unlockAttack(type) {
        if (!ATTACK_DEFS[type]) return;
        if (!player.attackInventory.includes(type)) {
            player.attackInventory.push(type);
            player.currentAttackIndex = player.attackInventory.length - 1;
        }
    }

    function cycleAttack() {
        if (player.attackInventory.length <= 1) return;
        player.currentAttackIndex = (player.currentAttackIndex + 1) % player.attackInventory.length;
    }

    function createSlashAttack(now) {
        const def = ATTACK_DEFS.slash;
        const facing = player.facing >= 0 ? 1 : -1;
        const y = player.y + player.h * 0.5 - def.height * 0.5;
        const x = facing >= 0
            ? player.x + player.w - 6
            : player.x - def.width + 6;
        activeAttacks.push({
            id: ++player.attackCounter,
            type: "slash",
            shape: "box",
            x,
            y,
            w: def.width,
            h: def.height,
            damage: def.damage,
            color: def.color,
            facing,
            bornAt: now,
            expiresAt: now + def.activeMs,
            hitIds: new Set()
        });
    }

    function createBurstAttack(now, type = "burst") {
        const def = ATTACK_DEFS[type] || ATTACK_DEFS.burst;
        activeAttacks.push({
            id: ++player.attackCounter,
            type,
            shape: "circle",
            x: player.x + player.w * 0.5,
            y: player.y + player.h * 0.5,
            r: def.radius,
            damage: def.damage,
            color: def.color,
            bornAt: now,
            expiresAt: now + def.activeMs,
            hitIds: new Set()
        });
    }

    function createChakramAttack(now) {
        const def = ATTACK_DEFS.chakram;
        const facing = player.facing >= 0 ? 1 : -1;
        const size = def.size;
        attackProjectiles.push({
            id: ++player.attackCounter,
            type: "chakram",
            x: player.x + player.w * 0.5 - size * 0.5,
            y: player.y + player.h * 0.45 - size * 0.5,
            w: size,
            h: size,
            vx: facing * def.speed,
            vy: 0,
            rotation: 0,
            color: def.color,
            damage: def.damage,
            bornAt: now,
            expiresAt: now + def.life,
            hitIds: new Set()
        });
    }

    function createProjectileAttack(now, type) {
        const def = ATTACK_DEFS[type];
        const facing = player.facing >= 0 ? 1 : -1;
        const size = def.size || 16;
        attackProjectiles.push({
            id: ++player.attackCounter,
            type,
            x: player.x + player.w * 0.5 - size * 0.5,
            y: player.y + player.h * 0.5 - size * 0.5,
            w: size,
            h: size,
            vx: facing * def.speed,
            vy: 0,
            rotation: 0,
            color: def.color,
            damage: def.damage,
            bornAt: now,
            expiresAt: now + def.life,
            pierce: def.pierce || 0,
            rebounds: def.rebounds || 0,
            hitIds: new Set()
        });
    }

    function isPhaseStepActive(now) {
        return !!(player.powerUps["phaseStep"] && player.state === "dash" && player.dashTime <= 90 && now - player.lastDashTime <= 120);
    }

    function bounceProjectileOffPlatforms(projectile, prevX, prevY) {
        let hitVertical = false;
        let hitHorizontal = false;

        for (const platform of platforms) {
            if (!isPlatformSolid(platform)) continue;
            if (
                projectile.x >= platform.x + platform.w ||
                projectile.x + projectile.w <= platform.x ||
                projectile.y >= platform.y + platform.h ||
                projectile.y + projectile.h <= platform.y
            ) {
                continue;
            }

            const overlappedFromLeft = prevX + projectile.w <= platform.x;
            const overlappedFromRight = prevX >= platform.x + platform.w;
            const overlappedFromTop = prevY + projectile.h <= platform.y;
            const overlappedFromBottom = prevY >= platform.y + platform.h;

            if (overlappedFromLeft || overlappedFromRight) hitVertical = true;
            if (overlappedFromTop || overlappedFromBottom) hitHorizontal = true;
            if (!hitVertical && !hitHorizontal) hitVertical = true;

            if (projectile.rebounds > 0) {
                if (hitVertical) projectile.vx *= -1;
                if (hitHorizontal) projectile.vy *= -1;
                projectile.rotation += Math.PI * 0.35;
                projectile.rebounds--;
                projectile.x = prevX;
                projectile.y = prevY;
            } else {
                projectile.expiresAt = 0;
            }
            return;
        }
    }

    function triggerAttack(now) {
        if (player.state === "dash") return;
        if (now < player.attackCooldownUntil) return;

        const type = getCurrentAttackType();
        const def = ATTACK_DEFS[type] || ATTACK_DEFS.slash;
        player.attackCooldownUntil = now + def.cooldown;

        if (type === "slash") createSlashAttack(now);
        else if (type === "chakram") createChakramAttack(now);
        else if (type === "burst" || type === "thornBurst") createBurstAttack(now, type);
        else if (type === "sandShuriken" || type === "iceNeedle" || type === "forgeShot" || type === "reboundDisk") createProjectileAttack(now, type);
    }

    function attackHitsEnemy(attack, enemy) {
        if (attack.shape === "circle") {
            const cx = enemy.x + enemy.w * 0.5;
            const cy = enemy.y + enemy.h * 0.5;
            const dx = cx - attack.x;
            const dy = cy - attack.y;
            const r = attack.r + Math.max(enemy.w, enemy.h) * 0.35;
            return dx * dx + dy * dy <= r * r;
        }

        return (
            attack.x < enemy.x + enemy.w &&
            attack.x + attack.w > enemy.x &&
            attack.y < enemy.y + enemy.h &&
            attack.y + attack.h > enemy.y
        );
    }

    function damageEnemy(enemy, attack, now) {
        if (!enemy || enemy.dead) return false;
        if (attack.hitIds.has(enemy.id)) return false;
        if (enemy.invulnerableUntil && now < enemy.invulnerableUntil) return false;
        if (!attackHitsEnemy(attack, enemy)) return false;

        attack.hitIds.add(enemy.id);
        enemy.hp = Math.max(0, (enemy.hp || 1) - (attack.damage || 1));
        enemy.hurtUntil = now + 120;
        enemy.invulnerableUntil = now + 130;

        if (enemy.hp <= 0) {
            enemy.dead = true;
            enemy.deadAt = now;
        }

        for (let i = 0; i < 5; i++) {
            environmentParticles.push({
                kind: "hitSpark",
                x: enemy.x + enemy.w * 0.5,
                y: enemy.y + enemy.h * 0.5,
                vx: (Math.random() - 0.5) * 3.8,
                vy: (Math.random() - 0.5) * 3.2,
                life: 180 + Math.random() * 120,
                bornAt: now,
                size: 2 + Math.random() * 2,
                color: attack.color || "#FFFFFF"
            });
        }

        return true;
    }

    function updateAttacks(dt, now) {
        if (player.attackRequested) {
            triggerAttack(now);
            player.attackRequested = false;
        }

        activeAttacks = activeAttacks.filter((attack) => attack.expiresAt > now);

        attackProjectiles = attackProjectiles.filter((projectile) => projectile.expiresAt > now);
        for (const projectile of attackProjectiles) {
            const prevX = projectile.x;
            const prevY = projectile.y;
            projectile.x += projectile.vx * dt * 60;
            projectile.y += projectile.vy * dt * 60;
            projectile.rotation += dt * 14;
            if (projectile.type === "reboundDisk") {
                bounceProjectileOffPlatforms(projectile, prevX, prevY);
            }
        }

        for (const attack of activeAttacks) {
            for (const enemy of enemies) {
                damageEnemy(enemy, attack, now);
            }
        }

        for (const projectile of attackProjectiles) {
            for (const enemy of enemies) {
                if (projectile.expiresAt <= now) break;
                const hit = damageEnemy(enemy, projectile, now);
                if (!hit) continue;
                if (projectile.type === "iceNeedle") {
                    projectile.pierce = Math.max(0, (projectile.pierce || 0) - 1);
                    if (projectile.pierce <= 0) projectile.expiresAt = now;
                } else {
                    projectile.expiresAt = now;
                }
            }
        }

        attackProjectiles = attackProjectiles.filter((projectile) => projectile.expiresAt > now);
        player.attackTrail = activeAttacks.map((attack) => ({
            type: attack.type,
            shape: attack.shape,
            color: attack.color,
            x: attack.x,
            y: attack.y,
            w: attack.w,
            h: attack.h,
            r: attack.r,
            bornAt: attack.bornAt,
            expiresAt: attack.expiresAt,
            facing: attack.facing || player.facing
        }));
    }

    function applyPlayerDamage(now, damage = 1, options = {}) {
        const lethal = !!options.lethal;
        const knockback = options.knockback !== false;

        if (!lethal && player.enemyInvulnerableUntil && now < player.enemyInvulnerableUntil) return false;

        if (!lethal) player.enemyInvulnerableUntil = now + 900;
        player.health = Math.max(0, player.health - damage);

        if (lethal || player.health <= 0) {
            player.health = player.maxHealth;
            die();
            return true;
        }

        if (knockback) {
            player.vx = -player.facing * Math.max(6, player.maxSpeed);
            player.vy = Math.min(player.vy, -6);
            player.state = "air";
        }
        return true;
    }

    function applyEnemyHit(now) {
        return applyPlayerDamage(now, 1, { knockback: true });
    }

    // INPUT
    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        keys[e.code] = true;

        if (e.code === "Escape") {
            settingsOpen = !settingsOpen;
            e.preventDefault();
            return;
        }

        if (settingsOpen) {
            e.preventDefault();
            return;
        }

        if (actionMatchesEvent("jump", e)) player.lastJumpPress = Date.now();

        if (actionMatchesEvent("dash", e)) {
            if (gameState === "playing") player.dashRequested = true;
        }

        if (!e.repeat && actionMatchesEvent("attack", e) && gameState === "playing") {
            player.attackRequested = true;
        }

        if (!e.repeat && actionMatchesEvent("swapAttack", e) && gameState === "playing") {
            cycleAttack();
        }

        if ((e.key && e.key.startsWith("Arrow")) || actionMatchesEvent("dash", e) || actionMatchesEvent("attack", e) || actionMatchesEvent("swapAttack", e) || actionMatchesEvent("confirm", e) || actionMatchesEvent("restart", e)) {
            e.preventDefault();
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
        keys[e.code] = false;

        if (actionMatchesEvent("dash", e)) {
            player.dashRequested = false;
        }

        if ((e.key && e.key.startsWith("Arrow")) || actionMatchesEvent("dash", e) || actionMatchesEvent("attack", e) || actionMatchesEvent("swapAttack", e) || actionMatchesEvent("confirm", e) || actionMatchesEvent("restart", e)) {
            e.preventDefault();
        }
    });

    canvas.addEventListener("mousedown", (e) => {
        if (!settingsOpen || !window.GameRenderer?.lastLayout?.settingsResetButton) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        const reset = window.GameRenderer.lastLayout.settingsResetButton;
        const close = window.GameRenderer.lastLayout.settingsCloseButton;
        const hit = (box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;

        if (hit(reset)) {
            window.resetPlatformerBindings();
            return;
        }
        if (hit(close)) {
            settingsOpen = false;
        }
    });

    function setState(newState) {
        if (player.state === newState) return;

        player.state = newState;

        if (newState === "dash") {
            player.dashTime = 0;
            player.dashActiveDuration = player.dashDuration;
            player.dashActiveSpeed = player.dashSpeed;
            player.onGround = false;

            // Determine dash direction from held keys, allowing diagonals except straight down.
            let dx = 0;
            let dy = 0;
            if (isActionPressed("moveLeft")) dx -= 1;
            if (isActionPressed("moveRight")) dx += 1;
            if (isActionPressed("jump") && !isActionPressed("dash")) dy -= 1;
            if (keys["ArrowDown"] || keys["KeyS"] || keys["s"] || keys["S"]) dy += 1;

            if (dx === 0 && dy > 0) dy = 0;

            // If no direction is held, dash horizontally in the facing direction.
            if (dx === 0 && dy === 0) {
                dx = player.vx >= 0 ? 1 : -1;
            }

            // Prevent a zero-length vector if inputs cancel out.
            if (dx === 0 && dy === 0) dx = player.facing || 1;

            // Normalize so diagonal dashes aren't faster
            const len = Math.sqrt(dx * dx + dy * dy);
            player.dashDirX = dx / len;
            player.dashDirY = dy / len;
            player.facing = player.dashDirX !== 0 ? Math.sign(player.dashDirX) : player.facing;

            player.lastDashTime = Date.now();
            triggerSquashStretch("dash");
        }

        if (newState === "grounded") {
            player.dashTime = 0;
        }
    }

    function update(dt) {
        if (settingsOpen) {
            return;
        }

        if (gameState === "game_over" || gameState === "victory") {
            if (isActionPressed("restart")) {
                resetGame();
                clearActionState("restart");
            }
            return;
        }

        const prevY = player.y;
        const now = Date.now();

        updateCrumblePlatforms(now);
        updatePhasePlatforms(now);
        updateVisualEffects(now, dt);

        if (typeof window.updateEnemies === "function") {
            window.updateEnemies(enemies, player, platforms, dt, now);
        }

        if (campaign.inBossStage && !getActiveBoss()) {
            advanceCampaign();
            return;
        }

        // ===== POWER-UP MANAGEMENT =====
        for (let type in player.powerUps) {
            if (now > player.powerUps[type]) delete player.powerUps[type];
        }

        // Clean up visual trails smoothly
        player.trail = player.trail.filter(t => now - t.time < 200);

        let prevH = player.h;

        player.w = player.baseW;
        player.h = player.baseH;
        player.accel = player.baseAccel;
        player.maxSpeed = player.baseMaxSpeed;
        player.jumpPower = player.baseJumpPower;
        player.airControl = player.baseAirControl;
        player.coyoteTime = player.baseCoyoteTime;
        player.jumpBufferTime = player.baseJumpBufferTime;
        player.maxDashCharges = player.baseMaxDashCharges;
        player.dashDuration = player.baseDashDuration;
        player.dashSpeed = player.baseDashSpeed;
        player.brake = player.baseBrake;
        player.maxFallSpeed = player.baseMaxFallSpeed;
        player.pickupRadius = player.basePickupRadius;
        gravity = player.baseGravity;

        if (player.powerUps["doubleDash"]) player.maxDashCharges = 2;
        if (player.powerUps["highJump"]) player.jumpPower = 25;
        if (player.powerUps["antiGravity"]) gravity = 0.15; // Moon gravity jump physics
        if (player.powerUps["superSpeed"]) player.maxSpeed = 10;
        if (player.powerUps["sandSkimmer"]) { player.maxSpeed = 9; player.accel = 3.2; }
        if (player.powerUps["glacierGrip"]) { player.airControl = 1.05; player.jumpPower = 20; }
        if (player.powerUps["vineLeap"]) { player.jumpPower = 23; player.coyoteTime = 135; player.jumpBufferTime = 125; }
        if (player.powerUps["forgeRunner"]) { player.dashDuration = 88; player.dashSpeed = 30; player.maxFallSpeed = 16; }
        if (player.powerUps["giantBox"]) { player.w = 120; player.h = 120; }
        if (player.powerUps["miniBox"]) { player.w = 25; player.h = 25; }
        if (player.powerUps["feather"]) player.maxFallSpeed = 2; // slow fall
        if (player.powerUps["icePhysics"]) player.brake = 0.02; // Slide friction
        if (player.powerUps["overcharge"]) { player.dashDuration = 95; player.dashSpeed = 31; }
        if (player.powerUps["magnet"]) player.pickupRadius = 70;

        if (player.dashCharges > player.maxDashCharges) {
            player.dashCharges = player.maxDashCharges;
        }

        if (player.h > prevH) {
            player.y -= (player.h - prevH); // Shift up to prevent floor clipping
        }

        let inputX = 0;
        if (isActionPressed("moveLeft")) inputX -= 1;
        if (isActionPressed("moveRight")) inputX += 1;

        const scale = Math.min(1, (dt || 0.016) * 60);
        const effectiveAccel = player.accel * (player.onGround ? 1 : player.airControl);

        if (
            player.dashRequested &&
            player.state !== "dash" &&
            player.dashCharges > 0
        ) {
            player.dashCharges--;
            player.dashRequested = false; // Consume request immediately
            setState("dash");
        }

        // Recharge dashes if not dashing and wait time met
        if (player.state !== "dash" && player.dashCharges < player.maxDashCharges) {
            if (now - player.lastDashTime > player.dashCooldown) {
                player.dashCharges = player.maxDashCharges;
            }
        }

        // ===== DEATH HANDLERS =====
        if (player.y > world.height + 200) {
            die();
            return; // Halt update frame
        }

        const phaseStepActive = isPhaseStepActive(now);

        let touchingSpike = false;
        if (!phaseStepActive) {
            for (let p of platforms) {
                if (p.type === "spike") {
                    if (
                        player.x < p.x + p.w &&
                        player.x + player.w > p.x &&
                        player.y < p.y + p.h &&
                        player.y + player.h > p.y
                    ) {
                        touchingSpike = true;
                        break;
                    }
                }
            }
        }
        if (touchingSpike) {
            applyPlayerDamage(now, player.maxHealth, { lethal: true, knockback: false });
            return; // Halt update frame
        }

        // ===== DASH STATE =====
        if (player.state === "dash") {
            player.dashTime += dt * 1000;

            player.vx = player.dashDirX * player.dashActiveSpeed;
            player.vy = player.dashDirY * player.dashActiveSpeed;

            const dashStep = dt * 60;
            player.x += player.vx * dashStep;
            player.y += player.vy * dashStep;

            // Generate trail ghost particle
            player.trail.push({ 
                x: player.x, 
                y: player.y, 
                w: player.w, 
                h: player.h, 
                dirX: player.dashDirX, 
                dirY: player.dashDirY,
                time: Date.now() 
            });

            // collision resolution
            for (let p of platforms) {
                if (!isPlatformSolid(p)) continue;
                
                // GHOST MECHANIC: Dash through everything except ground/ceiling
                if (player.powerUps["ghost"] && p.type !== "ground") continue;

                if (
                    player.x < p.x + p.w &&
                    player.x + player.w > p.x &&
                    player.y < p.y + p.h &&
                    player.y + player.h > p.y
                ) {
                    // horizontal resolution
                    if (player.vx > 0) player.x = p.x - player.w;
                    else if (player.vx < 0) player.x = p.x + p.w;
                    // vertical resolution
                    if (player.vy > 0) {
                        player.y = p.y - player.h;
                        player.onGround = true;
                        player.lastGrounded = Date.now();
                        triggerCrumble(p);
                        triggerReactivePlatform(p, "dash");
                    } else if (player.vy < 0) {
                        player.y = p.y + p.h;
                    }
                    player.vx = 0;
                    player.vy = 0;
                }
            }

            updateAttacks(dt, now);

            if (typeof window.checkEnemyCollisions === "function") {
                if (!phaseStepActive && window.checkEnemyCollisions(enemies, player, now)) {
                    applyEnemyHit(now);
                    return;
                }
            }

            if (player.dashTime >= player.dashActiveDuration) {
                setState(player.onGround ? "grounded" : "air");
                // Stop endless flying when upward dashing finishes
                if (player.vy < -7) player.vy = -7;
                if (Math.abs(player.vx) > player.maxSpeed) player.vx = Math.sign(player.vx) * player.maxSpeed;
            }

            handleTeleporters(now);

            return;
        }

        // ===== NORMAL MOVEMENT =====
        const targetVx = inputX * player.maxSpeed;

        if (inputX !== 0 && player.vx !== 0 && Math.sign(inputX) !== Math.sign(player.vx)) {
            const turnBrake = player.brake * 2.0 * scale;
            if (Math.abs(player.vx) <= turnBrake) player.vx = 0;
            else player.vx -= Math.sign(player.vx) * turnBrake;
        }

        if (player.vx < targetVx) {
            player.vx = Math.min(player.vx + effectiveAccel * scale, targetVx);
        } else if (player.vx > targetVx) {
            const decel = (inputX === 0) ? player.brake : effectiveAccel;
            if (player.vx - decel * scale < targetVx) player.vx = targetVx;
            else player.vx -= decel * scale;
        }

        if (!player.onGround && inputX === 0) player.vx *= 0.992;
        if (inputX === 0 && Math.abs(player.vx) < 0.05) player.vx = 0;

        player.vx = Math.max(-player.maxSpeed, Math.min(player.maxSpeed, player.vx));
        if (inputX !== 0) player.facing = inputX;

        // ===== JUMP =====
        const jumpPressedRecently =
            player.lastJumpPress && now - player.lastJumpPress <= player.jumpBufferTime;
        const jumpHeld = isActionPressed("jump");

        if (
            jumpPressedRecently &&
            (player.onGround || now - player.lastGrounded <= player.coyoteTime) &&
            now - player.lastJumpTime >= player.jumpCooldown
        ) {
            player.vy = -player.jumpPower;
            player.onGround = false;
            player.lastJumpTime = now;
            player.lastJumpPress = 0;
            setState("air");
            triggerSquashStretch("jump");
        }

        // ===== GRAVITY =====
        player.vy += gravity;
        player.vy = Math.min(player.vy, player.maxFallSpeed);
        if (!jumpHeld && player.vy < 0) {
            player.vy += gravity * 1.15;
        }

        // ===== MOVE X =====
        player.x += player.vx;

        for (let p of platforms) {
            if (!isPlatformSolid(p)) continue;
            if (
                player.x < p.x + p.w &&
                player.x + player.w > p.x &&
                player.y < p.y + p.h &&
                player.y + player.h > p.y
            ) {
                if (player.vx > 0) player.x = p.x - player.w;
                else if (player.vx < 0) player.x = p.x + p.w;
                player.vx = 0;
            }
        }

        // ===== MOVE Y =====
        player.y += player.vy;
        player.onGround = false;
        player.supportPlatformId = null;

        for (let p of platforms) {
            if (!isPlatformSolid(p)) continue;
            if (
                player.x < p.x + p.w &&
                player.x + player.w > p.x &&
                player.y < p.y + p.h &&
                player.y + player.h > p.y
            ) {
                if (player.vy > 0 && prevY + player.h <= p.y) {
                    player.y = p.y - player.h;
                    player.vy = 0;
                    player.onGround = true;
                    player.supportPlatformId = p.id;
                    player.lastGrounded = Date.now();
                    
                    if (p.type === "bounce") {
                        player.vy = -35; // Launch the player extremely high
                        player.onGround = false;
                        setState("air");
                    } else {
                        activateCheckpoint(p);
                        triggerCrumble(p);
                        triggerReactivePlatform(p, "land");
                        if (now - player.justLandedAt > 120) triggerSquashStretch("land");
                        if (p.type === "boost") {
                            const boostDir = player.facing || (player.vx >= 0 ? 1 : -1);
                            player.vx = boostDir * Math.max(Math.abs(player.vx), p.boostStrength || 8);
                        }
                        setState("grounded");
                    }
                } else if (player.vy < 0) {
                    player.y = p.y + p.h;
                    player.vy = 0;
                }
            }
        }

        applySupportPlatformEffects(dt, now);

        // ===== SAWBLADES =====
        for (let p of platforms) {
            if (p.hasSawblade) {
                p.sawX += p.sawSpeed * dt;
                if (p.sawX < 0) {
                    p.sawX = 0;
                    p.sawSpeed *= -1;
                } else if (p.sawX > p.w) {
                    p.sawX = p.w;
                    p.sawSpeed *= -1;
                }

                // Check fatal circular collision
                const sawWorldX = p.x + p.sawX;
                const sawWorldY = p.y - p.sawSize;
                const px = player.x + player.w / 2;
                const py = player.y + player.h / 2;
                const dist = Math.sqrt((sawWorldX - px) ** 2 + (sawWorldY - py) ** 2);
                
                if (!phaseStepActive && dist < p.sawSize + Math.min(player.w, player.h) / 2) {
                    applyPlayerDamage(now, player.maxHealth, { lethal: true, knockback: false });
                    return; // Halt update frame
                }
            }
        }

        if (!player.onGround && player.state === "grounded") {
            setState("air");
        }

        // ===== POWER-UP COLLECTION =====
        for (let p of platforms) {
            if (p.hasPowerUp) {
                const boxX = p.x + p.w / 2 - 15;
                const boxY = p.y - 40;
                const pad = player.pickupRadius;
                
                if (
                    player.x < boxX + 30 + pad &&
                    player.x + player.w > boxX - pad &&
                    player.y < boxY + 30 + pad &&
                    player.y + player.h > boxY - pad
                ) {
                    player.powerUps[p.powerUpType] = Date.now() + 10000;
                    if (p.sourceId != null) collectedPowerUpIds.add(p.sourceId);
                    p.hasPowerUp = false; 
                    if (p.powerUpType === 'doubleDash') player.dashCharges = player.maxDashCharges; // immediately give them
                }
            }

            if (p.hasAttackPickup) {
                const attackX = p.x + p.w / 2 - 16;
                const attackY = p.y - 78;
                if (
                    player.x < attackX + 32 &&
                    player.x + player.w > attackX &&
                    player.y < attackY + 32 &&
                    player.y + player.h > attackY
                ) {
                    unlockAttack(p.attackPickupType);
                    p.hasAttackPickup = false;
                }
            }

            if (p.hasDashRefill) {
                const refillX = p.x + p.w / 2;
                const refillY = p.y - 24;
                if (
                    player.x < refillX + 12 &&
                    player.x + player.w > refillX - 12 &&
                    player.y < refillY + 12 &&
                    player.y + player.h > refillY - 12
                ) {
                    player.dashCharges = player.maxDashCharges;
                    player.lastDashTime = 0;
                    p.hasDashRefill = false;
                }
            }
        }

        updateAttacks(dt, now);

        if (typeof window.checkEnemyCollisions === "function") {
            if (!phaseStepActive && window.checkEnemyCollisions(enemies, player, now)) {
                applyEnemyHit(now);
                return;
            }
        }

        handleTeleporters(now);

        for (let p of platforms) {
            if (p.type !== "exit") continue;
            const flag = getExitFlagBounds(p);
            if (
                player.x < flag.x + flag.w &&
                player.x + player.w > flag.x &&
                player.y < flag.y + flag.h &&
                player.y + player.h > flag.y
            ) {
                advanceCampaign();
                return;
            }
        }

        updateCamera(dt);
    }

    function draw() {
        window.GameRenderer.draw({
            ctx,
            canvas,
            player,
            platforms,
            camera,
            teleporters,
            teleporterHint,
            portalParticles,
            environmentParticles,
            enemies,
            checkpoint,
            lives,
            campaign,
            gameState,
            level,
            activeAttacks,
            attackProjectiles,
            currentAttackType: getCurrentAttackType(),
            bindingHints: {
                moveLeft: formatBindingList("moveLeft"),
                moveRight: formatBindingList("moveRight"),
                jump: formatBindingList("jump"),
                dash: formatBindingList("dash"),
                attack: formatBindingList("attack"),
                swapAttack: formatBindingList("swapAttack"),
                confirm: formatBindingList("confirm"),
                restart: formatBindingList("restart")
            },
            settingsOpen,
            now: Date.now()
        });
    }

    let lastTime = 0;
    let accumulator = 0;
    const fixedStep = 1 / 60;
    const maxFrameTime = 0.05;
    const maxSubSteps = 4;

    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min(maxFrameTime, (timestamp - lastTime) / 1000);
        lastTime = timestamp;

        accumulator += dt;
        let steps = 0;
        while (accumulator >= fixedStep && steps < maxSubSteps) {
            update(fixedStep);
            accumulator -= fixedStep;
            steps++;
        }

        if (steps === 0) update(dt);
        draw();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
};
