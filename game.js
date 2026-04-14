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
        dashDuration: 120,
        dashCooldown: 1200, // Time to recharge ALL charges
        lastDashTime: 0,
        dashCharges: 1,
        maxDashCharges: 1,
        dashSpeed: 12,
        dashDirX: 1,
        dashDirY: 0
    };

    const gravity = 0.475;

    const world = {
        width: 5000,
        height: 2000
    };

    const platforms = createPlatforms(world);

    const camera = {
        x: 0,
        y: 0
    };

    const keys = {};
    const margin = 150;

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

            // collision resolution
            for (let p of platforms) {
                if (p.isBackground) continue;
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
                    } else if (player.vy < 0) {
                        player.y = p.y + p.h;
                    }
                    player.vx = 0;
                    player.vy = 0;
                }
            }

            if (player.dashTime >= player.dashDuration) {
                setState(player.onGround ? "grounded" : "air");
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

        let screenX = player.x - camera.x;
        let screenY = player.y - camera.y;

        if (screenX > canvas.width - margin)
            camera.x = player.x - (canvas.width - margin);
        if (screenX < margin)
            camera.x = player.x - margin;

        if (screenY > canvas.height - margin)
            camera.y = player.y - (canvas.height - margin);
        if (screenY < margin)
            camera.y = player.y - margin;

        camera.x = Math.max(0, Math.min(world.width - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(world.height - canvas.height, camera.y));
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = player.state === "dash" ? "cyan" : "blue";
        ctx.fillRect(player.x - camera.x, player.y - camera.y, player.w, player.h);

        for (let p of platforms) {
            if (p.isBackground) {
                ctx.fillStyle = "rgba(100, 100, 100, 0.25)"; // Ghostly background color
            } else if (p.type === 'risk') {
                ctx.fillStyle = "#FF6B35";  // orange — risk pips
            } else if (p.type === 'deadend') {
                ctx.fillStyle = "#803e46ff";  // muted maroon — dead-ends
            } else {
                ctx.fillStyle = "#1B7A1B";  // forest green — standard + ground
            }
            ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, p.h);
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