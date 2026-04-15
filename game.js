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

        accel: 1.6,
        friction: 0.825,
        maxSpeed: 4.5,
        brake: 0.35,
        maxFallSpeed: 10,
        jumpPower: 15,
        onGround: false,

        airControl: 0.7,

        coyoteTime: 60,
        lastGrounded: 0,
        jumpBufferTime: 75,
        lastJumpPress: 0,
        jumpCooldown: 450,
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
        baseMaxSpeed: 4.5,
        baseJumpPower: 15,
        baseMaxDashCharges: 1,
        baseBrake: 0.35,
        baseGravity: 0.475,
        baseMaxFallSpeed: 10,
        
        powerUps: {},
        trail: [], // Stores visual ghost frames
        facing: 1,
        renderScaleX: 1,
        renderScaleY: 1,
        stretchVel: 0,
        justLandedAt: 0,
        lastTeleportAt: 0
    };

    let gravity = 0.475;

    const world = {
        width: 5000,
        height: 2000
    };

    let level;
    let platforms;
    let enemies = [];
    let teleporters = [];
    let teleporterHint = null;
    let portalParticles = [];
    let environmentParticles = [];
    let lives = 3;
    let gameState = "playing"; // "playing" | "game_over"

    const camera = {
        x: 0,
        y: 0
    };

    const keys = {};

    function isPlatformSolid(platform) {
        if (platform.isBackground) return false;
        if (platform.type === "crumble" && platform.crumbleState === "hidden") return false;
        if (platform.type === "spike") return false; // Physics pass-through natively so death handler triggers explicitly
        return true;
    }

    function initLevel() {
        level = generateLevel(Date.now(), 2, world.width, world.height);
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
        teleporterHint = null;
        
        platforms = level.platforms.map((platform, index) => ({
            ...platform,
            id: index,
            crumbleDelay: platform.crumbleDuration || (platform.type === "crumble" ? 500 : 0),
            crumbleResetDelay: platform.type === "crumble" ? 2400 : 0,
            crumbleState: platform.type === "crumble" ? "idle" : "stable",
            crumbleTriggeredAt: 0,
            respawnAt: 0
        }));

        // Enemies are created from per-platform spawn descriptors.
        enemies = (typeof window.createEnemies === "function")
          ? window.createEnemies({ ...level, platforms })
          : [];
        teleporters = (level.teleporters || []).map((teleporter) => ({
            ...teleporter,
            cooldownUntil: 0
        }));
        portalParticles = [];
        environmentParticles = [];

        camera.x = player.x;
        camera.y = player.y;
    }

    function resetGame() {
        lives = 3;
        gameState = "playing";
        initLevel();
    }

    initLevel();

    function die() {
        lives--;
        if (lives <= 0) {
            gameState = "game_over";
            return;
        }

        player.x = level.startPos.x;
        player.y = level.startPos.y;
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
        teleporterHint = null;
        camera.x = player.x;
        camera.y = player.y;

        // Reset enemies to their original spawn state.
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

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function triggerSquashStretch(type) {
        if (type === "jump") {
            player.renderScaleX = 0.88;
            player.renderScaleY = 1.16;
            player.stretchVel = 0.18;
        } else if (type === "land") {
            player.renderScaleX = 1.16;
            player.renderScaleY = 0.84;
            player.stretchVel = 0.24;
            player.justLandedAt = Date.now();
        } else if (type === "dash") {
            player.renderScaleX = 1.22;
            player.renderScaleY = 0.82;
            player.stretchVel = 0.16;
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

    function updateVisualEffects(now, dt) {
        const isIdle = player.onGround && player.state !== "dash" && Math.abs(player.vx) < 0.05;
        if (isIdle) {
            player.renderScaleX = 1;
            player.renderScaleY = 1;
            player.stretchVel = 0;
        }

        player.renderScaleX = lerp(player.renderScaleX, 1, Math.min(1, dt * 12 + player.stretchVel));
        player.renderScaleY = lerp(player.renderScaleY, 1, Math.min(1, dt * 12 + player.stretchVel));
        player.stretchVel = Math.max(0, player.stretchVel - dt * 0.9);

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

    // INPUT
    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        keys[e.code] = true;

        if (e.key === "ArrowUp") player.lastJumpPress = Date.now();

        if (e.code === "Space") {
            if (gameState === "playing") player.dashRequested = true;
        }

        if ((e.key && e.key.startsWith("Arrow")) || e.code === "Space") {
            e.preventDefault();
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
        keys[e.code] = false;

        if (e.code === "Space") {
            player.dashRequested = false;
        }

        if ((e.key && e.key.startsWith("Arrow")) || e.code === "Space") {
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
        if (gameState === "game_over") {
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
        updateVisualEffects(now, dt);

        if (typeof window.updateEnemies === "function") {
            window.updateEnemies(enemies, player, platforms, dt, now);
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
        player.brake = player.baseBrake;
        player.maxFallSpeed = player.baseMaxFallSpeed;
        gravity = player.baseGravity;

        if (player.powerUps["doubleDash"]) player.maxDashCharges = 2;
        if (player.powerUps["highJump"]) player.jumpPower = 25;
        if (player.powerUps["antiGravity"]) gravity = 0.15; // Moon gravity jump physics
        if (player.powerUps["superSpeed"]) player.maxSpeed = 10;
        if (player.powerUps["giantBox"]) { player.w = 120; player.h = 120; }
        if (player.powerUps["miniBox"]) { player.w = 25; player.h = 25; }
        if (player.powerUps["feather"]) player.maxFallSpeed = 2; // slow fall
        if (player.powerUps["icePhysics"]) player.brake = 0.02; // Slide friction

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

        if (typeof window.checkEnemyCollisions === "function") {
            if (window.checkEnemyCollisions(enemies, player, now)) {
                die();
                return;
            }
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

        player.vx = Math.max(-player.maxSpeed, Math.min(player.maxSpeed, player.vx));
        if (inputX !== 0) player.facing = inputX;

        // ===== JUMP =====
        const jumpPressedRecently =
            (player.lastJumpPress && now - player.lastJumpPress <= player.jumpBufferTime)
            || keys["ArrowUp"];

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
                    player.lastGrounded = Date.now();
                    
                    if (p.type === "bounce") {
                        player.vy = -35; // Launch the player extremely high
                        player.onGround = false;
                        setState("air");
                    } else {
                        triggerCrumble(p);
                        triggerReactivePlatform(p, "land");
                        if (now - player.justLandedAt > 120) triggerSquashStretch("land");
                        setState("grounded");
                    }
                } else if (player.vy < 0) {
                    player.y = p.y + p.h;
                    player.vy = 0;
                }
            }
        }

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
                
                if (
                    player.x < boxX + 30 &&
                    player.x + player.w > boxX &&
                    player.y < boxY + 30 &&
                    player.y + player.h > boxY
                ) {
                    player.powerUps[p.powerUpType] = Date.now() + 10000;
                    p.hasPowerUp = false; 
                    if (p.powerUpType === 'doubleDash') player.dashCharges = 2; // immediately give them
                }
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
                initLevel();
                return;
            }
        }

        updateCamera(dt);
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, "#08111F");
        sky.addColorStop(0.55, "#111B2D");
        sky.addColorStop(1, "#1B2638");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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
                ctx.fillStyle = "rgba(100, 100, 100, 0.25)";
            } else if (p.type === "spike") {
                ctx.fillStyle = "#FF0000"; // Lethal red spikes
            } else if (p.type === "bounce") {
                ctx.fillStyle = "#00FFCC"; // Neon cyan bounce pad
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

            ctx.fillRect(drawX, drawY, p.w, p.h);

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
            if (p.hasPowerUp) {
                const boxX = drawX + p.w / 2 - 15;
                let boxY = drawY - 40;
                const offset = Math.sin(Date.now() / 150 + p.id) * 4;
                boxY += offset;

                if (p.powerUpType === 'doubleDash') ctx.fillStyle = '#00F0FF';
                else if (p.powerUpType === 'highJump') ctx.fillStyle = '#00FF00';
                else if (p.powerUpType === 'antiGravity') ctx.fillStyle = '#FF00FF';
                else if (p.powerUpType === 'superSpeed') ctx.fillStyle = '#FFFF00';
                else if (p.powerUpType === 'giantBox') ctx.fillStyle = '#FF0000';
                else if (p.powerUpType === 'icePhysics') ctx.fillStyle = '#66FFFF'; // Visually distinct glacial blue
                else if (p.powerUpType === 'ghost') ctx.fillStyle = '#555555';
                else if (p.powerUpType === 'miniBox') ctx.fillStyle = '#FFA500';
                else if (p.powerUpType === 'feather') ctx.fillStyle = '#FFC0CB';

                if (Math.floor(Date.now() / 200) % 2 === 0) {
                   ctx.strokeStyle = '#FFFFFF';
                   ctx.lineWidth = 3;
                   ctx.strokeRect(boxX, boxY, 30, 30);
                }
                ctx.fillRect(boxX, boxY, 30, 30);
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
            ctx.fillRect(hintX - 74, hintY - 20, 148, 26);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Press Enter to teleport", hintX, hintY);
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
            ctx.fillStyle = "#9A8568";
            ctx.fillRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
            ctx.globalAlpha = 1;
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
        ctx.scale(player.renderScaleX, player.renderScaleY);

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
            ctx.fillStyle = player.facing >= 0 ? "#DFF6FF" : "#B8E8FF";
            ctx.fillRect(player.facing >= 0 ? 2 : -10, -10, 8, 8);
        }
        ctx.restore();

        const powerUpKeys = Object.keys(player.powerUps);
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(16, 16, 260, 74 + Math.max(0, powerUpKeys.length) * 20);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "16px Arial";
        ctx.fillText("Arrows: move / jump", 28, 42);
        ctx.fillText("Space: dash", 28, 62);
        ctx.fillText("Enter / E: teleport", 28, 82);
        ctx.fillText(`Dash charges: ${player.dashCharges}`, 28, 102);
        
        ctx.fillStyle = "#FF4444";
        ctx.fillText(`Lives: ${lives}`, 28, 122);

        let py = 142;
        ctx.fillStyle = "#FFD700";
        for (let type of powerUpKeys) {
            const left = Math.ceil((player.powerUps[type] - Date.now()) / 1000);
            ctx.fillText(`PowerUp: ${type} (${left}s)`, 28, py);
            py += 20;
        }

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
        }
    }

    let lastTime = 0;

    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
        lastTime = timestamp;

        update(dt);
        draw();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
};
