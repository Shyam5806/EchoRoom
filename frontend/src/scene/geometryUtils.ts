export interface Vec2 {
  x: number;
  z: number;
}

export interface ListenerState {
  position: Vec2;
  facingAngle: number; // radians, 0 = +x direction, pi/2 = +z, etc.
}

export interface ObjectInfo {
  label: string;
  distance: number;
  relativeDirection: 'front' | 'front-left' | 'left' | 'back-left' | 'back' | 'back-right' | 'right' | 'front-right';
}

/**
 * Compute the distance between two 2D points.
 */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Compute the relative direction of an object from a listener's perspective.
 * Bucket angles into 8 compass-like directions.
 */
export function relativeDirection(
  listener: ListenerState,
  objectPos: Vec2
): 'front' | 'front-left' | 'left' | 'back-left' | 'back' | 'back-right' | 'right' | 'front-right' {
  // Vector from listener to object
  const dx = objectPos.x - listener.position.x;
  const dz = objectPos.z - listener.position.z;

  // Angle of the object relative to listener's facing direction
  // atan2 gives angle from +x, we need relative to facing
  const objectAngle = Math.atan2(dz, dx); // angle of object from +x
  const relativeAngle = objectAngle - listener.facingAngle;

  // Normalize to [-pi, pi]
  let normalized = relativeAngle;
  while (normalized > Math.PI) normalized -= 2 * Math.PI;
  while (normalized < -Math.PI) normalized += 2 * Math.PI;

  // Bucket into 8 directions
  // 0: front (|angle| < 22.5°), front-left (22.5-67.5), left (67.5-112.5), etc.
  const eighth = Math.PI / 8; // 22.5 degrees
  if (normalized > -eighth && normalized < eighth) {
    return 'front';
  } else if (normalized > eighth && normalized < 3 * eighth) {
    return 'front-right';
  } else if (normalized > 3 * eighth && normalized < 5 * eighth) {
    return 'right';
  } else if (normalized > 5 * eighth && normalized < 7 * eighth) {
    return 'back-right';
  } else if (normalized > 7 * eighth || normalized < -7 * eighth) {
    return 'back';
  } else if (normalized < -eighth && normalized > -3 * eighth) {
    return 'front-left';
  } else if (normalized < -3 * eighth && normalized > -5 * eighth) {
    return 'left';
  } else if (normalized < -5 * eighth && normalized > -7 * eighth) {
    return 'back-left';
  }

  // Fallback (shouldn't reach)
  return 'front';
}

/**
 * Compute all object info given listener state and object positions.
 */
export function computeObjectInfo(
  listener: ListenerState,
  objects: { position: Vec2; label: string }[]
): ObjectInfo[] {
  return objects.map(({ position, label }) => ({
    label,
    distance: distance(listener.position, position),
    relativeDirection: relativeDirection(listener, position),
  }));
}

/**
 * Simple bucket for "what's near me" - objects within a certain distance threshold.
 */
export const NEAR_DISTANCE_THRESHOLD = 3; // meters

export function isNear(listener: ListenerState, objects: { position: Vec2; label: string }[], threshold: number = NEAR_DISTANCE_THRESHOLD): { label: string; distance: number }[] {
  const results: { label: string; distance: number }[] = [];
  for (const obj of objects) {
    const d = distance(listener.position, obj.position);
    if (d <= threshold) {
      results.push({ label: obj.label, distance: Math.round(d * 10) / 10 });
    }
  }
  return results;
}