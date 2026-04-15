# PLAN

## Correctness
- Reconcile the duplicate rendering paths. `game.js` still owns a full `draw()` pipeline while `game-render.js` also renders the scene, which is easy to drift and can hide bugs.
- Normalize enemy damage flow. `game.js` now handles player hit points, but `enemy.js` still returns a generic collision signal and some callers still treat it like a boolean-style fatal hit.
- Audit `checkEnemyCollisions` call sites for consistency. The return type changed from boolean to enemy object, so all usages should be explicit.
- Add player death UX for non-lethal hits. The new health system works, but there is no clear feedback for remaining health changes besides the HUD.
- Clamp `player.health` everywhere it can be mutated so it never drifts outside `[0, maxHealth]`.
- Reset `enemyInvulnerableUntil` and other combat state on every respawn path, checkpoint reset, and level transition.
- Ensure dash and attack states cannot overlap in unintended ways after power-up changes or level resets.
- Review the new exit-flag hitbox. It is narrower than the platform body and may be fine, but it should be validated against intended level design.

## Combat Balance
- Tune attack ranges now that `slash`, `chakram`, and `burst` were widened.
- Tune projectile lifetime and speed for `chakram` so it feels strong without trivializing enemy patterns.
- Tune `burst` radius so it is useful without becoming a screen-sized panic button.
- Add per-attack damage tuning if future enemies require different threat budgets.
- Add explicit i-frames or hit reaction VFX for player damage.

## Enemy Design
- Give each new enemy unique behavior instead of reusing generic movement helpers.
- `sandrunner` currently behaves too similarly to `pacingStalker`.
- `vineCrawler` currently behaves too similarly to `pacingStalker`.
- `iceWisp` currently behaves too similarly to `hoverer`.
- `drillDrone` needs a dedicated attack pattern and collision profile.
- Add enemy-specific collision boxes and telegraphs for the new types.
- Validate that each world has a balanced enemy mix across easy, hard, and branch paths.
- Verify new enemies never spawn on invalid platforms, hidden scenery, or reward-only routes.

## Difficulty Scaling
- Make enemy density scaling more granular than a single `enemyDensity` multiplier.
- Scale spawn composition by world tier, not just spawn probability.
- Add caps so late difficulty tiers do not overpopulate hard routes.
- Validate that difficulty scaling does not create unwinnable early levels.
- Ensure boss stages remain isolated from the new difficulty scaling rules.

## Architecture
- Remove duplicate or stale code paths left over from the rendering split.
- Consolidate HUD labels and metadata so `game.js` and `game-render.js` do not diverge.
- Normalize naming for world-type enemies and shared color tables.
- Extract combat constants into a single source of truth.
- Consider moving player combat state into a dedicated subsystem.

## Testing
- Add a targeted smoke test for dash, attack, and enemy contact state transitions.
- Add a test or scripted check for each world’s new enemy spawn table.
- Add a regression check that player damage is not instant death from a single enemy hit.
- Add a regression check that power-ups do not mutate active dash stats mid-dash.
- Add a verification pass for `game.js`, `game-render.js`, `enemy.js`, and `platforms.js` after each combat or enemy change.

## Polish
- Fix any remaining copy typos in UI strings.
- Review HUD spacing after adding health.
- Confirm mobile and small-window readability of the new HUD layout.
- Replace any placeholder visuals on the new enemies with world-specific styling if needed.
