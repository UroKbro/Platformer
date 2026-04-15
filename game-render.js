(function () {
    const ATTACK_META = {
        slash: { label: "Slash", color: "#FFD166" },
        chakram: { label: "Chakram", color: "#6EE7FF" },
        burst: { label: "Burst", color: "#B98CFF" },
        sandShuriken: { label: "Sand Shuriken", color: "#F4C97B" },
        iceNeedle: { label: "Ice Needle", color: "#8FE9FF" },
        thornBurst: { label: "Thorn Burst", color: "#7DFF8A" },
        forgeShot: { label: "Forge Shot", color: "#FF8A4C" }
    };

    const POWER_UP_META = {
        doubleDash: { label: "Double Dash", color: "#00F0FF" },
        highJump: { label: "High Jump", color: "#00FF00" },
        antiGravity: { label: "Anti Gravity", color: "#FF00FF" },
        superSpeed: { label: "Super Speed", color: "#FFFF00" },
        giantBox: { label: "Giant Box", color: "#FF0000" },
        icePhysics: { label: "Ice Physics", color: "#66FFFF" },
        ghost: { label: "Ghost Mode", color: "#555555" },
        miniBox: { label: "Mini Box", color: "#FFA500" },
        feather: { label: "Feather Flow", color: "#FFC0CB" },
        overcharge: { label: "Overcharge", color: "#8C5BFF" },
        magnet: { label: "Magnet Field", color: "#7CFFB2" },
        sandSkimmer: { label: "Sand Skimmer", color: "#E9B96E" },
        glacierGrip: { label: "Glacier Grip", color: "#9EEBFF" },
        vineLeap: { label: "Vine Leap", color: "#8DFF9A" },
        forgeRunner: { label: "Forge Runner", color: "#FF9A66" }
    };

    function getThemePalette(level) {
        const sky = level?.sky;
        if (sky) {
            return { skyTop: sky.top, skyBottom: sky.bottom, haze: sky.haze };
        }

        return { skyTop: "#151518", skyBottom: "#4d4338", haze: "rgba(227, 203, 168, 0.08)" };
    }

    function getPowerUpColor(type) {
        return POWER_UP_META[type]?.color || "#FFFFFF";
    }

    function getPowerUpLabel(type) {
        return POWER_UP_META[type]?.label || type;
    }

    function getAttackColor(type) {
        return ATTACK_META[type]?.color || "#FFFFFF";
    }

    function getAttackLabel(type) {
        return ATTACK_META[type]?.label || type;
    }

    function getBossDisplayName(type) {
        if (type === "bossColossus") return "Iron Colossus";
        if (type === "bossTempest") return "Tempest Idol";
        if (type === "bossOracle") return "Phase Oracle";
        return "Unknown Boss";
    }

    function draw(state) {
        const {
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
            currentAttackType,
            now = Date.now()
        } = state;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const palette = getThemePalette(level);
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, palette.skyTop);
        sky.addColorStop(0.55, palette.skyBottom);
        sky.addColorStop(1, palette.skyBottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 5; i++) {
            const glowX = ((i + 0.5) / 5) * canvas.width + Math.sin(now / 1500 + i) * 24;
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

        for (const p of drawPlatforms) {
            if (p.isHiddenScenery) continue;
            if (p.type === "crumble" && p.crumbleState === "hidden") continue;

            const parallax = p.isBackground ? 0.25 : (p.layer === "foreground" ? 0.92 : 1);
            let drawX = p.x - camera.x * parallax;
            const drawY = p.y - camera.y * parallax;

            if (p.type === "crumble" && p.crumbleState === "warning") {
                const flash = Math.floor(now / 90) % 2 === 0;
                ctx.fillStyle = flash ? "#FF4D4D" : "#FFE066";
                const segments = 4;
                const segH = p.h / segments;
                const elapsed = now - p.crumbleTriggeredAt;
                const intensity = 1 + (elapsed / p.crumbleDelay) * 3;

                for (let s = 0; s < segments; s++) {
                    const offsetY = (Math.random() - 0.5) * intensity;
                    const offsetX = (Math.random() - 0.5) * intensity;
                    ctx.fillRect(drawX + offsetX, drawY + s * segH + offsetY, p.w, segH);
                }
                continue;
            }

            if (p.type === "ghost") {
                ctx.fillStyle = p.colorHint || "rgba(100, 100, 100, 0.25)";
            } else if (p.type === "spike") {
                ctx.fillStyle = "#FF0000";
            } else if (p.type === "bounce") {
                ctx.fillStyle = "#00FFCC";
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
                const glow = 16 + Math.sin(now / 180 + p.id) * 3;
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
                const sway = Math.sin(now / 220 + p.id) * 1.8;
                const impact = p.lastReactiveAt ? Math.max(0, 1 - (now - p.lastReactiveAt) / 260) : 0;
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

            if (p.hasSawblade) {
                const sawScreenX = drawX + p.sawX;
                const sawScreenY = drawY - p.sawSize;

                ctx.save();
                ctx.translate(sawScreenX, sawScreenY);
                ctx.rotate(now / 100);

                ctx.fillStyle = "#AAAAAA";
                ctx.beginPath();
                ctx.arc(0, 0, p.sawSize, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "#FF0000";
                for (let i = 0; i < 6; i++) {
                    ctx.beginPath();
                    ctx.moveTo(p.sawSize - 2, -3);
                    ctx.lineTo(p.sawSize + 4, 0);
                    ctx.lineTo(p.sawSize - 2, 3);
                    ctx.fill();
                    ctx.rotate((Math.PI * 2) / 6);
                }

                ctx.fillStyle = "#000000";
                ctx.beginPath();
                ctx.arc(0, 0, 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }

            if (p.hasScenery) {
                ctx.fillStyle = (p.sceneryType === "OLD_STATUE") ? "#A9A9A9" : "#D4AF37";
                ctx.beginPath();
                ctx.moveTo(drawX + p.w / 2, drawY);
                ctx.lineTo(drawX + p.w / 2 - 10, drawY - 25);
                ctx.lineTo(drawX + p.w / 2 + 10, drawY - 25);
                ctx.fill();
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
                const drift = ((now / 20) * dir) % arrowGap;
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
                const offset = Math.sin(now / 150 + p.id) * 4;
                boxY += offset;

                const powerGlow = ctx.createRadialGradient(boxX + 15, boxY + 15, 2, boxX + 15, boxY + 15, 24);
                powerGlow.addColorStop(0, `${getPowerUpColor(p.powerUpType)}EE`);
                powerGlow.addColorStop(1, "rgba(255,255,255,0)");
                ctx.fillStyle = powerGlow;
                ctx.beginPath();
                ctx.arc(boxX + 15, boxY + 15, 24, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = getPowerUpColor(p.powerUpType);

                if (Math.floor(now / 200) % 2 === 0) {
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 3;
                    ctx.strokeRect(boxX, boxY, 30, 30);
                }
                ctx.fillRect(boxX, boxY, 30, 30);
            }

            if (p.hasAttackPickup) {
                const pickupX = drawX + p.w / 2;
                const pickupY = drawY - 62 + Math.sin(now / 160 + p.id) * 5;
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
                const refillY = drawY - 24 + Math.sin(now / 160 + p.id) * 3;
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
            window.drawEnemies(ctx, enemies, camera, now);
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
                const radius = endpoint.r + Math.sin(now / 120) * 2;
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
            const age = (now - particle.bornAt) / particle.life;
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
            const age = (now - particle.bornAt) / particle.life;
            const alpha = 1 - age;
            if (alpha <= 0) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color || "#9A8568";
            ctx.fillRect(particle.x - camera.x, particle.y - camera.y, particle.size, particle.size);
            ctx.globalAlpha = 1;
        }

        for (const attack of player.attackTrail) {
            const age = (now - attack.bornAt) / Math.max(1, attack.expiresAt - attack.bornAt);
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
            } else if (attack.shape === "circle" || attack.r) {
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

        player.trail.forEach((t) => {
            const age = now - t.time;
            const alpha = 1.0 - (age / 150);
            if (alpha > 0) {
                ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
                ctx.fillRect(t.x - camera.x, t.y - camera.y, t.w, t.h);
            }
        });

        ctx.fillStyle = player.state === "dash" ? "cyan" : "blue";
        if (player.powerUps["giantBox"]) ctx.fillStyle = "red";

        const screenX = player.x - camera.x;
        const screenY = player.y - camera.y;

        ctx.save();
        ctx.translate(screenX + player.w / 2, screenY + player.h / 2);

        if (player.powerUps["magnet"]) {
            ctx.strokeStyle = "rgba(124, 255, 178, 0.45)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(player.w, player.h) * 0.92 + Math.sin(now / 120) * 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (player.state === "dash") {
            ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);

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
        const hudStats = [
            { label: "Health", value: `${player.health} / ${player.maxHealth}`, color: "#FF8C8C" },
            { label: "Dash", value: `${player.dashCharges}`, color: "#6EE7FF" },
            {
                label: campaign.inBossStage ? "Boss Stage" : "Level",
                value: campaign.inBossStage ? getBossDisplayName(campaign.bossType) : `${campaign.currentLevel} / ${campaign.totalLevels}`,
                color: "#9AD1FF"
            },
            { label: "Lives", value: `${lives}`, color: "#FF7B7B" },
            { label: "Attack", value: getAttackLabel(currentAttackType), color: getAttackColor(currentAttackType) }
        ];
        if (checkpoint) {
            hudStats.splice(1, 0, { label: "Checkpoint", value: "Active", color: "#FFF2A8" });
        }

        const hudHeight = 222 + (worldLabel ? 28 : 0) + Math.max(0, powerUpKeys.length) * 24;
        const hudX = 16;
        const hudY = 16;
        const hudW = 336;

        const hudGlow = ctx.createLinearGradient(hudX, hudY, hudX + hudW, hudY + hudHeight);
        hudGlow.addColorStop(0, "rgba(20, 28, 46, 0.9)");
        hudGlow.addColorStop(1, "rgba(6, 10, 18, 0.82)");
        ctx.fillStyle = hudGlow;
        ctx.fillRect(hudX, hudY, hudW, hudHeight);
        ctx.strokeStyle = "rgba(173, 216, 255, 0.22)";
        ctx.lineWidth = 2;
        ctx.strokeRect(hudX, hudY, hudW, hudHeight);

        const accent = ctx.createLinearGradient(hudX, hudY, hudX + hudW, hudY);
        accent.addColorStop(0, "#6EE7FF");
        accent.addColorStop(0.55, "#9B5DE5");
        accent.addColorStop(1, "#FFE08A");
        ctx.fillStyle = accent;
        ctx.fillRect(hudX, hudY, hudW, 5);

        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 8;

        ctx.fillStyle = "#F5FBFF";
        ctx.font = "bold 18px Arial";
        ctx.fillText("Traversal Kit", 28, 38);

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(220, 235, 255, 0.72)";
        ctx.font = "13px Arial";
        ctx.fillText("Arrows move/jump  •  Space dash  •  X attack", 28, 60);
        ctx.fillText("C swap attack  •  Enter / E teleport", 28, 80);

        let infoY = 108;
        if (worldLabel) {
            ctx.fillStyle = "#FFE7A3";
            ctx.font = "bold 15px Arial";
            ctx.fillText(worldLabel, 28, infoY);
            infoY += 28;
        }

        for (const stat of hudStats) {
            ctx.fillStyle = "rgba(255,255,255,0.07)";
            ctx.fillRect(24, infoY - 11, hudW - 48, 22);
            ctx.fillStyle = "rgba(210, 226, 245, 0.78)";
            ctx.font = "12px Arial";
            ctx.fillText(stat.label.toUpperCase(), 34, infoY);
            ctx.fillStyle = stat.color;
            ctx.font = "bold 15px Arial";
            ctx.fillText(stat.value, 126, infoY);
            infoY += 26;
        }

        let py = infoY + 10;
        for (const type of powerUpKeys) {
            const left = Math.ceil((player.powerUps[type] - now) / 1000);
            ctx.fillStyle = "rgba(255,255,255,0.07)";
            ctx.fillRect(24, py - 11, hudW - 48, 22);
            ctx.fillStyle = getPowerUpColor(type);
            ctx.font = "bold 14px Arial";
            ctx.fillText(`${getPowerUpLabel(type)} (${left}s)`, 34, py);
            py += 24;
        }
        ctx.textBaseline = "alphabetic";
        ctx.shadowBlur = 0;

        const boss = enemies.find((enemy) => enemy && enemy.isBoss && !enemy.dead) || null;
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
            ctx.fillText("Press SPACE to generate a new level!", canvas.width / 2, canvas.height / 2 + 40);

            ctx.textAlign = "left";
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

    window.GameRenderer = {
        draw,
        getThemePalette,
        getPowerUpColor,
        getPowerUpLabel,
        getAttackColor,
        getAttackLabel,
        getBossDisplayName
    };
})();
