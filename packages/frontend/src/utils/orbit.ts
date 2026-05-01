export const PHYSICS = {
  BASE_RADIUS: 5,
  RADIUS_STEP: 2.8,
  ORBIT_SPEED: 0.0003,
  Y_STEP: 1.5,
  Y_WOBBLE: 0.3,
};

export const getOrbitPosition = (seed: number, activeTime: number): [number, number, number] => {
  const { BASE_RADIUS, RADIUS_STEP, ORBIT_SPEED, Y_STEP, Y_WOBBLE } = PHYSICS;
  const orbitLayer = seed % 3;
  const radius = BASE_RADIUS + orbitLayer * RADIUS_STEP;
  const direction = seed % 2 === 0 ? 1 : -1;
  const angle = seed * 1.25 + activeTime * ORBIT_SPEED * direction;
  const layerY = ((seed % 4) - 1.5) * Y_STEP;
  const wobble = Math.sin(activeTime * 0.002 + seed) * Y_WOBBLE;
  return [
    parseFloat((Math.cos(angle) * radius).toFixed(3)),
    parseFloat((layerY + wobble).toFixed(3)),
    parseFloat((Math.sin(angle) * radius).toFixed(3)),
  ];
};

