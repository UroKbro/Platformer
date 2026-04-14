// platforms.js
function createPlatforms(world) {
  return [
    { x: 0, y: world.height - 100, w: world.width, h: 100 },
    { x: 300, y: world.height - 200, w: 200, h: 20 },
    { x: 600, y: world.height - 300, w: 200, h: 20 },
    { x: 900, y: world.height - 400, w: 300, h: 20 },
    { x: 1400, y: world.height - 500, w: 100, h: 45 },
    { x: 1000, y: world.height - 600, w: 150, h: 10 },
    { x: 500, y: world.height - 500, w: 150, h: 15 },
    { x: 165, y: world.height - 625, w: 75, h: 35 },
    { x: 600, y: world.height - 800, w: 100, h: 40 },
    { x: 275, y: world.height - 800, w: 200, h: 20 }
  ];
}