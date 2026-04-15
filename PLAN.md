# Platformer Stability Roadmap

## Goal

Bring the current game to a consistent, fair, and durable state before adding more mechanics.

This roadmap focuses on three things:
- generated levels must match real player capabilities
- runtime systems must reset and interact consistently
- feature metadata must reflect actual in-game behavior

## Priority To-Do List

### 1. Fix Level State Reset Consistency

- Rebuild or fully reset level-stateful objects on death, not just enemies.
- Ensure retries restore a fair state for:
  - crumble platforms
  - collected power-ups
  - dash refills
  - temporary pickups
  - teleporter cooldowns and usage state
- Decide checkpoint behavior explicitly:
  - either checkpoints preserve collected resources since activation
  - or checkpoints restore the world to a checkpoint snapshot
- Remove cases where the player respawns weaker into a partially exhausted level.

Why:
- Right now death/respawn can leave the world partially consumed while the player loses abilities, which creates unfair retries and possible soft-locks.

### 2. Make Generator Reachability Match Real Runtime Physics

- Audit all movement math so player reach is not frame-rate dependent.
- Convert movement, gravity, dash travel, and enemy movement to a consistent `dt` model or a fixed-step update.
- Re-tune `platforms.js` reachability assumptions once runtime physics are consistent.
- Re-validate gap sizes for:
  - normal jumps
  - jump + dash
  - giant/mini player forms
  - boosted launches

Why:
- The generator currently assumes a stable movement envelope, but actual runtime movement varies enough to make some generated spaces unfair or inconsistent.

### 3. Repair Path Metadata Mismatches

- Ensure all path-edge labels reflect real validation rules.
- Fix branch and route metadata where `dash_required`, `dash_optional`, or shortcut tags are emitted without matching verification.
- Fix final anchor connection metadata so forced-dash edges are not reported as normal jumps.
- Re-check every inserted rescue platform and verify the route after rescue insertion.

Why:
- The level graph currently says one thing in several places while the runtime and generator logic actually allow or require something else.

### 4. Tighten Platform Spacing and Rescue Logic

- Add a full post-generation pass that verifies every critical route segment end-to-end.
- Detect and repair:
  - impossible follow-up jumps after rescue insertion
  - stacked hazards with no recovery platform
  - tiny landing zones immediately after high-speed traversal
  - overlaps between hazards, enemies, boosts, checkpoints, and pickups
- Add minimum safe landing rules after:
  - dash gates
  - teleport exits
  - bounce pads
  - boosts

Why:
- Some individual edges are repaired locally, but there is not yet a robust global fairness pass for the completed route.

### 5. Bring Crumble Platform Behavior In Line With Its Metadata

- Decide whether crumble platforms are:
  - contact-triggered
  - dash-triggered
  - durability-based
- Remove unused crumble metadata if it is not part of the design.
- If dash-triggered crumble stays, implement that logic in runtime instead of treating all crumble platforms the same.
- Tune warning and respawn timing so the mechanic stays readable.

Why:
- The generator assigns richer crumble behavior than the runtime actually supports.

### 6. Fix Teleporter Safety and Placement Edge Cases

- Only place teleporter exits on verified safe platforms.
- Exclude exit targets that contain or are too close to:
  - enemies
  - sawblades
  - spikes
  - boosts or bounce pads
  - unstable crumble states
- Correct exit placement so the player spawns cleanly on top of the destination platform.
- Verify momentum preservation does not create immediate death on exit.
- Add a fallback if no safe exit platform exists.

Why:
- Teleporters should feel like smart loopbacks, not random punishment or clipping hazards.

### 7. Fix Checkpoint and Respawn Robustness

- Store checkpoint data relative to platform identity, not just raw player coordinates.
- Recompute respawn position from the target platform and current player size.
- Validate respawn placement for base, giant, and mini forms.
- Ensure checkpoints never point to removed, hidden, or invalid surfaces.

Why:
- Current checkpoint positions can go stale and become incorrect after size changes or world-state changes.

### 8. Fix Size-Change Collision Edge Cases

- Rework giant/mini transitions so both width and height changes are collision-safe.
- Center width changes correctly and validate the new bounds against walls and ceilings.
- Prevent teleport, checkpoint, or pickup interactions from placing resized players inside geometry.
- Add explicit handling for hazard overlap during resize.

Why:
- Size-changing power-ups currently only compensate vertically, which can produce wall overlap and unstable collision results.

### 9. Clean Up Enemy-System Inconsistencies

- Remove unsupported enemy spawn types or implement them fully.
- Ensure dead enemies are actually non-interactive:
  - stop updating
  - stop colliding
  - stop rendering
- Verify enemy reset behavior matches level reset behavior.
- Re-check enemy placement so hazards and enemies do not combine into unreadable traps.

Why:
- The current enemy pipeline can silently drop unsupported spawns and keep defeated enemies active.

### 10. Add Automated Validation Hooks

- Add a generator validation pass that can be run repeatedly across many seeds.
- Log failures for:
  - unreachable critical paths
  - unsafe teleporter exits
  - overlapping hazard clusters
  - invalid checkpoint platforms
  - enemy spawn incompatibilities
- Add a small deterministic debug mode so broken seeds can be reproduced.

Why:
- Manual playtesting alone will miss seed-specific failures and edge-case interactions.

## Testing Checklist

- Retry after death on a level with used power-ups, dash refills, and crumble platforms.
- Activate a checkpoint while giant or mini, then die and verify clean respawn.
- Enter and exit every teleporter type while moving slowly, dashing, and while enlarged.
- Run seeds with multiple hard-path dash gates and confirm all are beatable.
- Verify enemy collisions after enemy death/removal.
- Test on different frame rates and window sizes.

## Improvements To Explore After Fixes

These are not blockers. They should wait until the stability and fairness work above is complete.

### Feature Backlog

- Add seed-based validation reports and a simple in-game seed display.
- Improve level readability with subtle route signposting for safe path vs hard path.
- Add more branch-specific rewards so optional exploration feels more meaningful.
- Add one or two new hazard-platform hybrids only after validation is solid.
  - examples: one-way drop platforms, delayed collapses, short moving lifts
- Add lightweight encounter composition rules so enemies and hazards combine fairly.
- Improve checkpoint feedback with a clearer but still minimal activation cue.
- Add difficulty tuning rules based on route density instead of random chance alone.
- Add a generator scorecard for:
  - fairness
  - route variety
  - hazard rhythm
  - reward density
- Add replay/debug tools for broken seeds and player death heatmaps.

## Working Order

1. Fix reset consistency.
2. Fix physics consistency.
3. Fix path metadata and rescue validation.
4. Fix teleporter/checkpoint/size edge cases.
5. Fix enemy-system inconsistencies.
6. Add automated validation.
7. Resume feature work from the backlog.
