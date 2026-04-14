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
        trail: [] // Stores visual ghost frames
    };

    let gravity = 0.475;

    const world = {
        width: 5000,
        height: 2000
    };

    const level = generateLevel(Date.now(), 2, world.width, world.height);
    player.x = level.startPos.x;
    player.y = level.startPos.y;

    const platforms = level.platforms.map((platform, index) => ({
        ...platform,
        id: index,
        crumbleDelay: platform.crumbleDuration || (platform.type === "crumble" ? 500 : 0),
        crumbleResetDelay: platform.type === "crumble" ? 2400 : 0,
        crumbleState: platform.type === "crumble" ? "idle" : "stable",
        crumbleTriggeredAt: 0,
        respawnAt: 0
    }));

    const camera = {
        x: 0,
        y: 0
    };

    const keys = {};
    const margin = 150;

    function isPlatformSolid(platform) {
        if (platform.isBackground) return false;
        if (platform.type === "crumble" && platform.crumbleState === "hidden") return false;
        return true;
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

        if (e.key === "ArrowUp") player.lastJumpPress = Date.now();

        if (e.code === "Space") {
            player.dashRequested = true;
        }

        if ((e.key && e.key.startsWith("Arrow")) || e.code === "Space") {
            e.preventDefault();
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;

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

            player.lastDashTime = Date.now();
        }

        if (newState === "grounded") {
            player.dashTime = 0;
        }
    }

    function update(dt) {
        const prevY = player.y;
        const now = Date.now();

        updateCrumblePlatforms(now);

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
                    triggerCrumble(p);
                    setState("grounded");
                } else if (player.vy < 0) {
                    player.y = p.y + p.h;
                    player.vy = 0;
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

        // ===== CAMERA SMOOTHING =====
        const targetCamX = player.x + player.w / 2 - canvas.width / 2;
        const targetCamY = player.y + player.h / 2 - Math.max(0, canvas.height / 2 - 150); // slight offset to see below
        
        const lerpFactor = player.state === "dash" ? 12.0 : 6.0; // Snap faster during dashes
        camera.x += (targetCamX - camera.x) * dt * lerpFactor;
        camera.y += (targetCamY - camera.y) * dt * lerpFactor;

        camera.x = Math.max(0, Math.min(world.width - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(world.height - canvas.height, camera.y));
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let p of platforms) {
            if (p.type === "crumble" && p.crumbleState === "hidden") continue;

            let drawX = p.x - camera.x;
            const drawY = p.y - camera.y;

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
                else if (p.powerUpType === 'icePhysics') ctx.fillStyle = '#FFFFFF';
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

        // Draw Ghost Trails
        player.trail.forEach(t => {
            let age = Date.now() - t.time;
            let alpha = 1.0 - (age / 150);
            if (alpha > 0) {
                ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
                ctx.fillRect(t.x - camera.x, t.y - camera.y, t.w, t.h);
            }
        });

        // Draw Player (strict square without deformations)
        ctx.fillStyle = player.state === "dash" ? "cyan" : "blue";
        if (player.powerUps['giantBox']) ctx.fillStyle = "red";
        
        let screenX = player.x - camera.x;
        let screenY = player.y - camera.y;

        if (player.state === "dash") {
            ctx.fillRect(screenX, screenY, player.w, player.h);
            
            // Add a burst impact flash at the very front edge
            ctx.fillStyle = "white";
            ctx.globalAlpha = Math.random() * 0.5 + 0.3;
            ctx.beginPath();
            ctx.arc(
                screenX + (player.dashDirX >= 0 ? player.w : 0),
                screenY + (player.dashDirY >= 0 ? player.h : player.h / 2),
                Math.random() * 15 + 10,
                0, Math.PI * 2
            );
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillRect(screenX, screenY, player.w, player.h);
        }

        const powerUpKeys = Object.keys(player.powerUps);
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(16, 16, 260, 74 + Math.max(0, powerUpKeys.length) * 20);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "16px Arial";
        ctx.fillText("Arrows: move / jump", 28, 42);
        ctx.fillText("Space: dash", 28, 62);
        ctx.fillText(`Dash charges: ${player.dashCharges}`, 28, 82);
        
        let py = 102;
        ctx.fillStyle = "#FFD700";
        for (let type of powerUpKeys) {
            const left = Math.ceil((player.powerUps[type] - Date.now()) / 1000);
            ctx.fillText(`PowerUp: ${type} (${left}s)`, 28, py);
            py += 20;
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
