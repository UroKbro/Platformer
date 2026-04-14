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
        speed: 4,
        jumpPower: 12,
        onGround: false,
        lastJumpTime: 0,
        jumpCooldown: 500,
        airControl: 0.75
    };
    const gravity = 0.3;
    const world = {
        width: 5000,
        height: 2000
    };

    const platforms = [
        {
            x: 0,
            y: world.height - 100,
            w: world.width,
            h: 100
        },
        {
            x: 300,
            y: world.height - 200,
            w: 200,
            h: 20
        },
        {
            x: 600,
            y: world.height - 300,
            w: 200,
            h: 20
        },
        {
            x: 900,
            y: world.height - 400,
            w: 300,
            h: 20
        },
        {
            x: 1400,
            y: world.height - 500,
            w: 100,
            h: 20
        }
    ];

    const camera = {
        x: 0,
        y: 0
    };

    const keys = {};
    const margin = 150;

    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
        keys[e.key] = false;
        e.preventDefault();
    });


    function update() {
        player.vx = 0;

        if (keys["ArrowLeft"]) player.vx = -player.speed;
        if (keys["ArrowRight"]) player.vx = player.speed;


        if (keys["ArrowUp"] && player.onGround && Date.now() - player.lastJumpTime >= player.jumpCooldown) {
            player.vy = -player.jumpPower;
            player.onGround = false;
            player.lastJumpTime = Date.now();
        }

        if (!player.onGround) {
            if (keys["ArrowLeft"]) player.vx = -player.speed * player.airControl;
            if (keys["ArrowRight"]) player.vx = player.speed * player.airControl;
        }

        player.vy += gravity;


        player.x += player.vx;
        player.y += player.vy;


        player.onGround = false;

        for (let p of platforms) {
            if (
                player.x < p.x + p.w &&
                player.x + player.w > p.x &&
                player.y < p.y + p.h &&
                player.y + player.h > p.y
            ) {
                if (player.vy > 0) {
                    player.y = p.y - player.h;
                    player.vy = 0;
                    player.onGround = true;
                }
                if (player.vy < 0) {
                    player.y = p.y + p.h;
                    player.vy = 0;
                }
            }
        }
        let screenX = player.x - camera.x;
        let screenY = player.y - camera.y;

        // moving right
        if (screenX > canvas.width - margin) {
            camera.x = player.x - (canvas.width - margin);
        }

        // moving left
        if (screenX < margin) {
            camera.x = player.x - margin;
        }

        //moving down
        if (screenY > canvas.height - margin) {
            camera.y = player.y - (canvas.height - margin);
        }

        // moving up
        if (screenY < margin) {
            camera.y = player.y - margin;
        }
        camera.x = Math.max(0, Math.min(world.width - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(world.height - canvas.height, camera.y));
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // player
        ctx.fillStyle = "blue";
        ctx.fillRect(player.x - camera.x, player.y - camera.y, player.w, player.h);

        // platforms
        ctx.fillStyle = "green";
        for (let p of platforms) {
            ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, p.h);
        }
    }

    function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    loop();
};