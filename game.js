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
        
        baseW: 50,
        baseH: 50,
        baseMaxSpeed: 5.2,
        baseJumpPower: 16.5,
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
        attackTrail: []
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

    function isPlatformSolid(platform) {
        if (platform.isBackground) return false;
        if (platform.type === "crumble" && platform.crumbleState === "hidden") return false;
        if (platform.type === "phase" && platform.phaseState === "hidden") return false;
        if (platform.type === "spike") return false; // Physics pass-through natively so death handler triggers explicitly
        return true;
    }

    function buildRuntimePlatforms() {
        return level.platforms.map((platform, index) => {
            const runtime = {
                ...platform,
                id: index,
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

    function getBossDisplayName(type) {
        if (type === "bossColossus") return "Iron Colossus";
        if (type === "bossTempest") return "Tempest Idol";
        if (type === "bossOracle") return "Phase Oracle";
        return "Unknown Boss";
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
        level = buildCampaignLevel();
        player.x = level.startPos.x;
        player.y = level.startPos.y;
        player.vx = 0;
        player.vy = 0;
        player.dashTime = 0;
        player.state = "air";
        player.powerUps = {};
        player.dashCharges = player.maxDashCharges;
        player.dashRequested = false;
        player.trail = [];
        player.renderScaleX = 1;
        player.renderScaleY = 1;
        player.stretchVel = 0;
        player.lastTeleportAt = 0;
        player.checkpointId = null;
        player.pickupRadius = 0;
        player.supportPlatformId = null;
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
        player.powerUps = {}; // All powers vanish!
        player.dashCharges = player.maxDashCharges;
        player.dashRequested = false;
        player.trail = [];
        player.renderScaleX = 1;
        player.renderScaleY = 1;
        player.stretchVel = 0;
        player.lastTeleportAt = 0;
        player.pickupRadius = 0;
        player.supportPlatformId = null;
        teleporterHint = null;
        camera.x = player.x;
        camera.y = player.y;
        resetAttackStatePreservingLoadout();
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
        keys["Enter"] = false;
        keys["KeyE"] = false;
        keys["e"] = false;
        keys["E"] = false;
    }

    function handleTeleporters(now) {
        teleporterHint = null;
        if (now - player.lastTeleportAt < 180) return;

        const wantsConfirm = !!(keys["Enter"] || keys["KeyE"]);
        for (const teleporter of teleporters) {
            if (teleporter.cooldownUntil > now) continue;
            if (!rectIntersectsCircle(player, teleporter.entry)) continue;

            teleporterHint = teleporter;
            if (!wantsConfirm) continue;

            player.x = teleporter.exit.x - player.w * 0.5;
            player.y = teleporter.exit.y - player.h * 0.5;
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
        const anchors = level?.anchors || [];
        let roomCenterX = player.x + player.w * 0.5;
        let roomCenterY = player.y + player.h * 0.5;
        let lockX = false;

        for (let i = 0; i < anchors.length - 1; i++) {
            const left = anchors[i];
            const right = anchors[i + 1];
            if (player.x + player.w * 0.5 < left.x) continue;
            if (player.x + player.w * 0.5 > right.x + right.w) continue;
            roomCenterX = (left.x + right.x + right.w) * 0.5;
            roomCenterY = (left.y + right.y) * 0.5;
            lockX = Math.abs(right.y - left.y) > 170;
            break;
        }

        const lookAhead = player.facing * (90 + Math.min(70, Math.abs(player.vx) * 10));
        const targetCamX = (lockX ? roomCenterX : player.x + player.w * 0.5 + lookAhead) - canvas.width / 2;
        const targetCamY = roomCenterY - Math.max(0, canvas.height / 2 - 120);
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

    function getThemePalette() {
        const sky = level?.sky;
        if (sky) {
            return { skyTop: sky.top, skyBottom: sky.bottom, haze: sky.haze };
        }
        return { skyTop: "#151518", skyBottom: "#4d4338", haze: "rgba(227, 203, 168, 0.08)" };
    }

    function getPowerUpColor(type) {
        if (type === "doubleDash") return "#00F0FF";
        if (type === "highJump") return "#00FF00";
        if (type === "antiGravity") return "#FF00FF";
        if (type === "superSpeed") return "#FFFF00";
        if (type === "giantBox") return "#FF0000";
        if (type === "icePhysics") return "#66FFFF";
        if (type === "ghost") return "#555555";
        if (type === "miniBox") return "#FFA500";
        if (type === "feather") return "#FFC0CB";
        if (type === "overcharge") return "#8C5BFF";
        if (type === "magnet") return "#7CFFB2";
        return "#FFFFFF";
    }

    function getPowerUpLabel(type) {
        if (type === "doubleDash") return "Double Dash";
        if (type === "highJump") return "High Jump";
        if (type === "antiGravity") return "Anti Gravity";
        if (type === "superSpeed") return "Super Speed";
        if (type === "giantBox") return "Giant Box";
        if (type === "icePhysics") return "Ice Physics";
        if (type === "ghost") return "Ghost Mode";
        if (type === "miniBox") return "Mini Box";
        if (type === "feather") return "Feather Flow";
        if (type === "overcharge") return "Overcharge";
        if (type === "magnet") return "Magnet Field";
        return type;
    }

    const ATTACK_DEFS = {
        slash: {
            label: "Slash",
            color: "#FFD166",
            cooldown: 260,
            activeMs: 95,
            damage: 1,
            width: 88,
            height: 62
        },
        chakram: {
            label: "Chakram",
            color: "#6EE7FF",
            cooldown: 680,
            damage: 1,
            speed: 12.5,
            size: 18,
            life: 720
        },
        burst: {
            label: "Burst",
            color: "#B98CFF",
            cooldown: 920,
            activeMs: 140,
            damage: 1,
            radius: 86
        }
    };

    function getAttackColor(type) {
        return ATTACK_DEFS[type]?.color || "#FFFFFF";
    }

    function getAttackLabel(type) {
        return ATTACK_DEFS[type]?.label || type;
    }

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
            ? player.x + player.w - 4
            : player.x - def.width + 4;
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

    function createBurstAttack(now) {
        const def = ATTACK_DEFS.burst;
        activeAttacks.push({
            id: ++player.attackCounter,
            type: "burst",
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

    function triggerAttack(now) {
        if (player.state === "dash") return;
        if (now < player.attackCooldownUntil) return;

        const type = getCurrentAttackType();
        const def = ATTACK_DEFS[type] || ATTACK_DEFS.slash;
        player.attackCooldownUntil = now + def.cooldown;

        if (type === "slash") createSlashAttack(now);
        else if (type === "chakram") createChakramAttack(now);
        else if (type === "burst") createBurstAttack(now);
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
            projectile.x += projectile.vx * dt * 60;
            projectile.y += projectile.vy * dt * 60;
            projectile.rotation += dt * 14;
        }

        for (const attack of activeAttacks) {
            for (const enemy of enemies) {
                damageEnemy(enemy, attack, now);
            }
        }

        for (const projectile of attackProjectiles) {
            for (const enemy of enemies) {
                const hit = damageEnemy(enemy, projectile, now);
                if (hit) projectile.expiresAt = now;
            }
        }

        attackProjectiles = attackProjectiles.filter((projectile) => projectile.expiresAt > now);
        player.attackTrail = activeAttacks.map((attack) => ({
            type: attack.type,
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

    // INPUT
    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        keys[e.code] = true;

        if (e.key === "ArrowUp") player.lastJumpPress = Date.now();

        if (e.code === "Space") {
            if (gameState === "playing") player.dashRequested = true;
        }

        if (!e.repeat && e.code === "KeyX" && gameState === "playing") {
            player.attackRequested = true;
        }

        if (!e.repeat && e.code === "KeyC" && gameState === "playing") {
            cycleAttack();
        }

        if ((e.key && e.key.startsWith("Arrow")) || e.code === "Space" || e.code === "KeyX" || e.code === "KeyC") {
            e.preventDefault();
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
        keys[e.code] = false;

        if (e.code === "Space") {
            player.dashRequested = false;
        }

        if ((e.key && e.key.startsWith("Arrow")) || e.code === "Space" || e.code === "KeyX" || e.code === "KeyC") {
            e.preventDefault();
        }
    });

    function setState(newState) {
        if (player.state === newState) return;

        player.state = newState;

        if (newState === "dash") {
            player.dashTime = 0;

            // Determine dash direction from held keys (no upward dash)
            let dx = 0;
            let dy = 0;
            if (keys["ArrowLeft"]) dx -= 1;
            if (keys["ArrowRight"]) dx += 1;
            if (keys["ArrowDown"]) dy = 1;
            if (keys["ArrowUp"]) dy = -1;

            // If no direction held (or only up), dash horizontally in facing direction
            if (dx === 0 && dy === 0) {
                dx = player.vx >= 0 ? 1 : -1;
            }

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
        if (gameState === "game_over" || gameState === "victory") {
            if (keys["Enter"] || keys[" "]) {
                resetGame();
                keys["Enter"] = false; // Prevent immediate rebinding
                keys[" "] = false;
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
        player.maxSpeed = player.baseMaxSpeed;
        player.jumpPower = player.baseJumpPower;
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
        if (player.powerUps["giantBox"]) { player.w = 120; player.h = 120; }
        if (player.powerUps["miniBox"]) { player.w = 25; player.h = 25; }
        if (player.powerUps["feather"]) player.maxFallSpeed = 2; // slow fall
        if (player.powerUps["icePhysics"]) player.brake = 0.02; // Slide friction
        if (player.powerUps["overcharge"]) { player.dashDuration = 95; player.dashSpeed = 31; }
        if (player.powerUps["magnet"]) player.pickupRadius = 70;

        if (player.h > prevH) {
            player.y -= (player.h - prevH); // Shift up to prevent floor clipping
        }

        let inputX = 0;
        if (keys["ArrowLeft"]) inputX -= 1;
        if (keys["ArrowRight"]) inputX += 1;

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

        let touchingSpike = false;
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
        if (touchingSpike) {
            die();
            return; // Halt update frame
        }

        // ===== DASH STATE =====
        if (player.state === "dash") {
            player.dashTime += dt * 1000;

            player.vx = player.dashDirX * player.dashSpeed;
            player.vy = player.dashDirY * player.dashSpeed;

            player.x += player.vx;
            player.y += player.vy;

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
                if (window.checkEnemyCollisions(enemies, player, now)) {
                    die();
                    return;
                }
            }

            if (player.dashTime >= player.dashDuration) {
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
            (player.lastJumpPress && now - player.lastJumpPress <= player.jumpBufferTime)
            || keys["ArrowUp"];
        const jumpHeld = !!keys["ArrowUp"];

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
                
                if (dist < p.sawSize + Math.min(player.w, player.h) / 2) {
                    die();
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
                    p.hasPowerUp = false; 
                    if (p.powerUpType === 'doubleDash') player.dashCharges = 2; // immediately give them
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
            if (window.checkEnemyCollisions(enemies, player, now)) {
                die();
                return;
            }
        }

        handleTeleporters(now);

        for (let p of platforms) {
            if (p.type !== "exit") continue;
            if (
                player.x < p.x + p.w &&
                player.x + player.w > p.x &&
                player.y < p.y + p.h &&
                player.y + player.h > p.y
            ) {
                advanceCampaign();
                return;
            }
        }

        updateCamera(dt);
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const palette = getThemePalette();
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, palette.skyTop);
        sky.addColorStop(0.55, palette.skyBottom);
        sky.addColorStop(1, palette.skyBottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 5; i++) {
            const glowX = ((i + 0.5) / 5) * canvas.width + Math.sin(Date.now() / 1500 + i) * 24;
            const glowY = canvas.height * (0.15 + i * 0.08);
            const glow = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, 180 + i * 24);
            glow.addColorStop(0, palette.haze);
            glow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(glowX, glowY, 180 + i * 24, 0, Math.PI * 2);
            ctx.fill();
        }

        const drawPlatforms = [...platforms].sort((a, b) => {
            if (a.isBackground === b.isBackground) return 0;
            return a.isBackground ? -1 : 1;
        });

        for (let p of drawPlatforms) {
            if (p.isHiddenScenery) continue;
            if (p.type === "crumble" && p.crumbleState === "hidden") continue;

            const parallax = p.isBackground ? 0.25 : (p.layer === "foreground" ? 0.92 : 1);
            let drawX = p.x - camera.x * parallax;
            const drawY = p.y - camera.y * parallax;

            if (p.type === "crumble" && p.crumbleState === "warning") {
                const flash = Math.floor(Date.now() / 90) % 2 === 0;
                ctx.fillStyle = flash ? "#FF4D4D" : "#FFE066";
                const segments = 4;
                const segH = p.h / segments;
                // Intensity increases as timer runs out
                const elapsed = Date.now() - p.crumbleTriggeredAt;
                const intensity = 1 + (elapsed / p.crumbleDelay) * 3;
                
                for (let s = 0; s < segments; s++) {
                    const offsetY = (Math.random() - 0.5) * intensity;
                    const offsetX = (Math.random() - 0.5) * intensity;
                    ctx.fillRect(drawX + offsetX, drawY + s * segH + offsetY, p.w, segH);
                }
                continue; // skip the solid fillRect below
            }

            if (p.type === "ghost") {
                ctx.fillStyle = p.colorHint || "rgba(100, 100, 100, 0.25)";
            } else if (p.type === "spike") {
                ctx.fillStyle = "#FF0000"; // Lethal red spikes
            } else if (p.type === "bounce") {
                ctx.fillStyle = "#00FFCC"; // Neon cyan bounce pad
            } else if (p.type === "boost") {
                ctx.fillStyle = "#2AC7A0";
            } else if (p.type === "conveyor") {
                ctx.fillStyle = p.conveyorSpeed >= 0 ? "#4C83E4" : "#7356D7";
            } else if (p.type === "phase") {
                ctx.fillStyle = p.colorHint || "#7DCCFF";
            } else if (p.type === "ground") {
                ctx.fillStyle = "#245C24";
            } else if (p.colorHint) {
                ctx.fillStyle = p.colorHint;
            } else if (p.type === "risk") {
                ctx.fillStyle = "#FF8C42";
            } else if (p.type === "crumble") {
                ctx.fillStyle = "#C7792B";
            } else if (p.type === "reward") {
                ctx.fillStyle = "#FFD23F";
            } else if (p.type === "riskReset" || p.type === "shortcut") {
                ctx.fillStyle = "#4CC9F0";
            } else if (p.type === "exit") {
                ctx.fillStyle = "#9B5DE5";
            } else if (p.type === "deadend") {
                ctx.fillStyle = "#803e46ff";
            } else if (p.type === "start") {
                ctx.fillStyle = "#4287f5";
            } else {
                ctx.fillStyle = "#1B7A1B";
            }

            const baseFill = ctx.fillStyle;

            if (!p.isBackground) {
                ctx.fillStyle = "rgba(0,0,0,0.16)";
                ctx.fillRect(drawX + 4, drawY + 5, p.w, p.h);
                ctx.fillStyle = baseFill;
            }

            if (p.type === "phase") {
                ctx.save();
                ctx.globalAlpha = p.phaseState === "hidden" ? 0.18 + (p.phaseGlow || 0) * 0.12 : 0.82 + (p.phaseGlow || 0) * 0.15;
                ctx.fillRect(drawX, drawY, p.w, p.h);
                ctx.strokeStyle = "rgba(220, 245, 255, 0.85)";
                ctx.strokeRect(drawX + 1, drawY + 1, p.w - 2, p.h - 2);
                ctx.restore();
            } else {
                ctx.fillRect(drawX, drawY, p.w, p.h);
            }

            if (!p.isBackground && p.type !== "spike") {
                ctx.fillStyle = "rgba(255,255,255,0.16)";
                ctx.fillRect(drawX, drawY, p.w, Math.min(4, p.h));
                ctx.fillStyle = "rgba(0,0,0,0.18)";
                ctx.fillRect(drawX, drawY + p.h - Math.min(4, p.h), p.w, Math.min(4, p.h));
            }

            if (p.lightGuidance) {
                const lightX = drawX + p.w * 0.5;
                const lightY = drawY - 22;
                const glow = 16 + Math.sin(Date.now() / 180 + p.id) * 3;
                const gradient = ctx.createRadialGradient(lightX, lightY, 1, lightX, lightY, glow);
                gradient.addColorStop(0, "rgba(255, 240, 180, 0.95)");
                gradient.addColorStop(1, "rgba(255, 210, 110, 0)");
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(lightX, lightY, glow, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = p.lightGuidance === "torch" ? "#7A4A21" : "#7AD97A";
                ctx.fillRect(lightX - 3, drawY - 18, 6, 18);
            }

            if (p.reactiveGrass) {
                const sway = Math.sin(Date.now() / 220 + p.id) * 1.8;
                const impact = p.lastReactiveAt ? Math.max(0, 1 - (Date.now() - p.lastReactiveAt) / 260) : 0;
                const tuftCount = p.grassTufts || 4;
                ctx.strokeStyle = "#6DCB5D";
                for (let i = 0; i < tuftCount; i++) {
                    const tuftX = drawX + 10 + (i * (p.w - 20)) / Math.max(1, tuftCount - 1);
                    const bend = sway + (p.reactiveMode === "dash" ? 8 : 4) * impact;
                    ctx.beginPath();
                    ctx.moveTo(tuftX, drawY);
                    ctx.lineTo(tuftX + bend, drawY - 10 - impact * 4);
                    ctx.stroke();
                }
            }

            if (p.reactivePebbles) {
                ctx.fillStyle = "#84735E";
                const pebbleCount = p.pebbleCount || 3;
                for (let i = 0; i < pebbleCount; i++) {
                    const pebbleX = drawX + 12 + (i * (p.w - 24)) / Math.max(1, pebbleCount - 1);
                    ctx.fillRect(pebbleX, drawY - 3, 4, 3);
                }
            }

            // Sawblade Hazard Execution
            if (p.hasSawblade) {
                const sawScreenX = drawX + p.sawX;
                const sawScreenY = drawY - p.sawSize;
                
                // Draw spinning saw blade
                ctx.save();
                ctx.translate(sawScreenX, sawScreenY);
                ctx.rotate(Date.now() / 100); // Continuous fast spin
                
                ctx.fillStyle = "#AAAAAA"; // Metal disc
                ctx.beginPath();
                ctx.arc(0, 0, p.sawSize, 0, Math.PI * 2);
                ctx.fill();

                // Draw Saw teeth
                ctx.fillStyle = "#FF0000";
                for (let i = 0; i < 6; i++) {
                    ctx.beginPath();
                    ctx.moveTo(p.sawSize - 2, -3);
                    ctx.lineTo(p.sawSize + 4, 0);
                    ctx.lineTo(p.sawSize - 2, 3);
                    ctx.fill();
                    ctx.rotate((Math.PI * 2) / 6);
                }
                
                ctx.fillStyle = "#000000"; // Center bolt
                ctx.beginPath();
                ctx.arc(0, 0, 3, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.restore();
            }

            // Scenery / Set Dressing
            if (p.hasScenery) {
               ctx.fillStyle = (p.sceneryType === "OLD_STATUE") ? "#A9A9A9" : "#D4AF37";
               // Draw a rough shape for scenery (like a little ruin or vase)
               ctx.beginPath();
               ctx.moveTo(drawX + p.w / 2, drawY);
               ctx.lineTo(drawX + p.w / 2 - 10, drawY - 25);
               ctx.lineTo(drawX + p.w / 2 + 10, drawY - 25);
               ctx.fill();
               // Circle head
               ctx.beginPath();
               ctx.arc(drawX + p.w / 2, drawY - 30, 8, 0, Math.PI * 2);
               ctx.fill();
            }

            if (p.type === "reward") {
                ctx.strokeStyle = "#FFF3B0";
                ctx.lineWidth = 2;
                ctx.strokeRect(drawX - 2, drawY - 2, p.w + 4, p.h + 4);
            }

            if (p.type === "exit") {
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(drawX + p.w - 16, drawY - 36, 8, 36);
                ctx.fillStyle = "#9B5DE5";
                ctx.fillRect(drawX + p.w - 8, drawY - 34, 22, 16);
            }

            if (p.type === "boost") {
                ctx.strokeStyle = "rgba(255,255,255,0.55)";
                ctx.lineWidth = 3;
                for (let i = 0; i < 3; i++) {
                    const stripeX = drawX + 20 + i * ((p.w - 40) / 2);
                    ctx.beginPath();
                    ctx.moveTo(stripeX - 8, drawY + p.h - 4);
                    ctx.lineTo(stripeX + 8, drawY + 4);
                    ctx.stroke();
                }
            }

            if (p.type === "conveyor") {
                ctx.strokeStyle = "rgba(255,255,255,0.55)";
                ctx.lineWidth = 2;
                const dir = p.conveyorSpeed >= 0 ? 1 : -1;
                const arrowGap = 24;
                const drift = ((Date.now() / 20) * dir) % arrowGap;
                for (let x = drawX + 14 - arrowGap; x < drawX + p.w; x += arrowGap) {
                    const ax = x + drift;
                    ctx.beginPath();
                    ctx.moveTo(ax, drawY + p.h * 0.5);
                    ctx.lineTo(ax + dir * 9, drawY + p.h * 0.5);
                    ctx.lineTo(ax + dir * 4, drawY + p.h * 0.5 - 4);
                    ctx.moveTo(ax + dir * 9, drawY + p.h * 0.5);
                    ctx.lineTo(ax + dir * 4, drawY + p.h * 0.5 + 4);
                    ctx.stroke();
                }
            }

            if (p.type === "phase" && p.phaseState !== "hidden") {
                ctx.strokeStyle = "rgba(255,255,255,0.22)";
                for (let x = 6; x < p.w - 6; x += 12) {
                    ctx.beginPath();
                    ctx.moveTo(drawX + x, drawY + 3);
                    ctx.lineTo(drawX + x + 4, drawY + p.h - 3);
                    ctx.stroke();
                }
            }

            if (p.isCheckpoint) {
                const active = player.checkpointId === p.id;
                ctx.fillStyle = active ? "#FFF2A8" : "#B7D6FF";
                ctx.fillRect(drawX + p.w - 14, drawY - 26, 6, 26);
                ctx.beginPath();
                ctx.moveTo(drawX + p.w - 8, drawY - 24);
                ctx.lineTo(drawX + p.w + 8, drawY - 18);
                ctx.lineTo(drawX + p.w - 8, drawY - 10);
                ctx.fill();
            }
            if (p.hasPowerUp) {
                const boxX = drawX + p.w / 2 - 15;
                let boxY = drawY - 40;
                const offset = Math.sin(Date.now() / 150 + p.id) * 4;
                boxY += offset;

                const powerGlow = ctx.createRadialGradient(boxX + 15, boxY + 15, 2, boxX + 15, boxY + 15, 24);
                powerGlow.addColorStop(0, `${getPowerUpColor(p.powerUpType)}EE`);
                powerGlow.addColorStop(1, "rgba(255,255,255,0)");
                ctx.fillStyle = powerGlow;
                ctx.beginPath();
                ctx.arc(boxX + 15, boxY + 15, 24, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = getPowerUpColor(p.powerUpType);

                if (Math.floor(Date.now() / 200) % 2 === 0) {
                   ctx.strokeStyle = '#FFFFFF';
                   ctx.lineWidth = 3;
                   ctx.strokeRect(boxX, boxY, 30, 30);
                }
                ctx.fillRect(boxX, boxY, 30, 30);
            }

            if (p.hasAttackPickup) {
                const pickupX = drawX + p.w / 2;
                const pickupY = drawY - 62 + Math.sin(Date.now() / 160 + p.id) * 5;
                ctx.fillStyle = getAttackColor(p.attackPickupType);
                ctx.beginPath();
                ctx.moveTo(pickupX, pickupY - 14);
                ctx.lineTo(pickupX + 14, pickupY);
                ctx.lineTo(pickupX, pickupY + 14);
                ctx.lineTo(pickupX - 14, pickupY);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = "#FFFFFF";
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            if (p.hasDashRefill) {
                const refillX = drawX + p.w / 2;
                const refillY = drawY - 24 + Math.sin(Date.now() / 160 + p.id) * 3;
                ctx.fillStyle = "#6EE7FF";
                ctx.beginPath();
                ctx.arc(refillX, refillY, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#FFFFFF";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(refillX, refillY - 7);
                ctx.lineTo(refillX, refillY + 7);
                ctx.moveTo(refillX - 7, refillY);
                ctx.lineTo(refillX + 7, refillY);
                ctx.stroke();
            }
        }

        if (typeof window.drawEnemies === "function") {
            window.drawEnemies(ctx, enemies, camera, Date.now());
        }

        if (teleporterHint) {
            const hintX = teleporterHint.entry.x - camera.x;
            const hintY = teleporterHint.entry.y - camera.y - 42;
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            ctx.fillRect(hintX - 84, hintY - 20, 168, 26);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Press Enter/E to teleport", hintX, hintY);
            ctx.restore();
        }

        for (const teleporter of teleporters) {
            for (const endpoint of [teleporter.entry, teleporter.exit]) {
                const px = endpoint.x - camera.x;
                const py = endpoint.y - camera.y;
                const radius = endpoint.r + Math.sin(Date.now() / 120) * 2;
                const gradient = ctx.createRadialGradient(px, py, 3, px, py, radius + 10);
                gradient.addColorStop(0, "rgba(255,255,255,0.95)");
                gradient.addColorStop(0.4, `${teleporter.color}CC`);
                gradient.addColorStop(1, "rgba(120,180,255,0)");
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(px, py, radius + 10, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = teleporter.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        for (const particle of portalParticles) {
            const age = (Date.now() - particle.bornAt) / particle.life;
            const alpha = (particle.alpha || 0.45) * (1 - age);
            if (alpha <= 0) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color || "#8BD3FF";
            ctx.beginPath();
            ctx.arc(particle.x - camera.x, particle.y - camera.y, particle.kind === "portalBurst" ? 3.5 : 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        for (const particle of environmentParticles) {
            const age = (Date.now() - particle.bornAt) / particle.life;
            const alpha = 1 - age;
            if (alpha <= 0) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color || "#9A8568";
            ctx.fillRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
            ctx.globalAlpha = 1;
        }

        for (const attack of player.attackTrail) {
            const age = (Date.now() - attack.bornAt) / Math.max(1, attack.expiresAt - attack.bornAt);
            const alpha = Math.max(0, 0.45 * (1 - age));
            if (alpha <= 0) continue;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = attack.color;
            ctx.lineWidth = 4;
            if (attack.type === "slash") {
                ctx.beginPath();
                const cx = attack.facing >= 0 ? attack.x - camera.x : attack.x + attack.w - camera.x;
                const cy = attack.y + attack.h * 0.5 - camera.y;
                ctx.arc(cx, cy, attack.w * 0.65, attack.facing >= 0 ? -0.9 : 2.05, attack.facing >= 0 ? 0.9 : 4.2);
                ctx.stroke();
            } else if (attack.type === "burst") {
                ctx.beginPath();
                ctx.arc(attack.x - camera.x, attack.y - camera.y, attack.r * (0.55 + age * 0.45), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        for (const projectile of attackProjectiles) {
            ctx.save();
            ctx.translate(projectile.x + projectile.w * 0.5 - camera.x, projectile.y + projectile.h * 0.5 - camera.y);
            ctx.rotate(projectile.rotation || 0);
            ctx.fillStyle = projectile.color;
            ctx.beginPath();
            ctx.moveTo(0, -projectile.h * 0.6);
            ctx.lineTo(projectile.w * 0.6, 0);
            ctx.lineTo(0, projectile.h * 0.6);
            ctx.lineTo(-projectile.w * 0.6, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Draw Ghost Trails
        player.trail.forEach(t => {
            let age = Date.now() - t.time;
            let alpha = 1.0 - (age / 150);
            if (alpha > 0) {
                ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
                ctx.fillRect(t.x - camera.x, t.y - camera.y, t.w, t.h);
            }
        });

        // Draw Player
        ctx.fillStyle = player.state === "dash" ? "cyan" : "blue";
        if (player.powerUps['giantBox']) ctx.fillStyle = "red";
        
        let screenX = player.x - camera.x;
        let screenY = player.y - camera.y;

        ctx.save();
        ctx.translate(screenX + player.w / 2, screenY + player.h / 2);

        if (player.powerUps["magnet"]) {
            ctx.strokeStyle = "rgba(124, 255, 178, 0.45)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(player.w, player.h) * 0.92 + Math.sin(Date.now() / 120) * 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (player.state === "dash") {
            ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
            
            // Add a burst impact flash at the very front edge
            ctx.fillStyle = "white";
            ctx.globalAlpha = Math.random() * 0.5 + 0.3;
            ctx.beginPath();
            ctx.arc(
                player.dashDirX >= 0 ? player.w / 2 : -player.w / 2,
                player.dashDirY >= 0 ? player.h / 2 : 0,
                Math.random() * 15 + 10,
                0, Math.PI * 2
            );
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
        }
        ctx.restore();

        const powerUpKeys = Object.keys(player.powerUps);
        const worldLabel = !campaign.inBossStage && level?.worldName ? `${level.worldName} ${level.worldTier}` : null;
        const hudExtraLines = worldLabel ? 1 : 0;
        ctx.fillStyle = "rgba(8, 12, 20, 0.62)";
        ctx.fillRect(16, 16, 310, 190 + hudExtraLines * 20 + Math.max(0, powerUpKeys.length) * 20);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(16, 16, 310, 4);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "16px Arial";
        ctx.fillText("Arrows: move / jump", 28, 42);
        ctx.fillText("Space: dash", 28, 62);
        ctx.fillText("X: attack", 28, 82);
        ctx.fillText("C: swap attack", 28, 102);
        ctx.fillText("Enter / E: teleport", 28, 122);
        if (worldLabel) {
            ctx.fillStyle = "#FFE7A3";
            ctx.fillText(worldLabel, 28, 142);
            ctx.fillStyle = "#FFFFFF";
        }
        const dashY = worldLabel ? 162 : 142;
        ctx.fillText(`Dash charges: ${player.dashCharges}`, 28, dashY);
        if (checkpoint) ctx.fillText("Checkpoint active", 28, dashY + 20);
        ctx.fillStyle = "#9AD1FF";
        ctx.fillText(
            campaign.inBossStage
                ? `Boss Stage: ${getBossDisplayName(campaign.bossType)}`
                : `Level ${campaign.currentLevel} / ${campaign.totalLevels}`,
            28,
            checkpoint ? dashY + 40 : dashY + 20
        );
        
        ctx.fillStyle = "#FF4444";
        ctx.fillText(`Lives: ${lives}`, 28, checkpoint ? dashY + 60 : dashY + 40);

        ctx.fillStyle = getAttackColor(getCurrentAttackType());
        ctx.fillText(`Attack: ${getAttackLabel(getCurrentAttackType())}`, 28, checkpoint ? dashY + 80 : dashY + 60);

        let py = checkpoint ? dashY + 100 : dashY + 80;
        for (let type of powerUpKeys) {
            const left = Math.ceil((player.powerUps[type] - Date.now()) / 1000);
            ctx.fillStyle = getPowerUpColor(type);
            ctx.fillText(`${getPowerUpLabel(type)} (${left}s)`, 28, py);
            py += 20;
        }

        const boss = getActiveBoss();
        if (campaign.inBossStage && boss) {
            const barW = Math.min(520, canvas.width * 0.45);
            const barX = (canvas.width - barW) / 2;
            const barY = 22;
            ctx.fillStyle = "rgba(10, 10, 18, 0.78)";
            ctx.fillRect(barX, barY, barW, 28);
            ctx.fillStyle = getAttackColor("burst");
            ctx.fillRect(barX + 3, barY + 3, (barW - 6) * (boss.hp / Math.max(1, boss.maxHp)), 22);
            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            ctx.strokeRect(barX, barY, barW, 28);
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.fillText(getBossDisplayName(boss.type), canvas.width / 2, barY + 20);
            ctx.textAlign = "left";
        }

        const vignette = ctx.createRadialGradient(
            canvas.width * 0.5,
            canvas.height * 0.42,
            Math.min(canvas.width, canvas.height) * 0.2,
            canvas.width * 0.5,
            canvas.height * 0.52,
            Math.max(canvas.width, canvas.height) * 0.8
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (gameState === "game_over") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = "#FF0000";
            ctx.font = "bold 64px Arial";
            ctx.textAlign = "center";
            ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "24px Arial";
            ctx.fillText("Press SPACE to generated a new level!", canvas.width / 2, canvas.height / 2 + 40);
            
            ctx.textAlign = "left"; // Reset context
        } else if (gameState === "victory") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#8CFFB8";
            ctx.font = "bold 56px Arial";
            ctx.textAlign = "center";
            ctx.fillText("YOU WIN", canvas.width / 2, canvas.height / 2 - 26);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "24px Arial";
            ctx.fillText(`Defeated ${getBossDisplayName(campaign.bossType)}`, canvas.width / 2, canvas.height / 2 + 18);
            ctx.fillText("Press SPACE to start a new run", canvas.width / 2, canvas.height / 2 + 58);
            ctx.textAlign = "left";
        }
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
