# TO-DO

## Pending
- Implement "Level Generator Rework" as outlined in `LEVEL_PLAN.md` (Phase A/B)
- Add Squash and Stretch to player movement for better "Game Feel"
- Implement Dash Echoes (Ghost Trails) during dash movement
- Add Camera Interpolation (Lerping) for smoother camera movement
- Implement momentum-preserving teleporters

## Completed
- Fixed platform solidity so hidden/disabled scenery and blocker cleanup platforms no longer collide.
- Kept the settings/bindings overlay live and clickable, with a reset path inside the game.
- Updated restart and teleport prompts to use the active binding table.
- Prevented overgrowth vine crawlers from being excluded by branch-role spawning rules.
- Fixed jump buffering so holding jump no longer auto-retriggers forever.
- Reset grounded state on dash start and made dash movement time-based.
- Passed live binding labels into the HUD instead of hardcoding key names.
- Treated hidden scenery as visual-only and improved scenery readability.
- Prevented enemy spawning from hidden or disabled surfaces unless explicitly intended.
- Added `validateGeneratedLevel()` for smoke-testing generated maps.
