import { z } from 'zod';

// Scene generation system prompt for Call #1
export const SCENE_GENERATION_SYSTEM_PROMPT = `You are a spatial scene generator for a blind/low-vision audio navigation app. Generate a strict JSON scene graph from the user's free-text description.

Schema: ${JSON.stringify({
  room: {
    name: '',
    dimensions: { width: 0, depth: 0 },
    floorMaterial: 'wood' as const,
    ambientTone: 'kitchen' as const,
  },
  objects: [] as const,
}, null, 2)}`

// Rules:
// - Room dimensions between 2m and 15m per side
// - 4-12 objects per room
// - Object positions must be within room bounds and must not overlap
// - Use a 2D ground-plane coordinate system (x, z)
// - height (y) is not needed for this MVP
// - soundCue must be from the fixed enum: table | window | appliance | furniture | door | generic
// - floorMaterial must be from the fixed enum: wood | tile | carpet | concrete | grass | other
// - ambientTone must be from the fixed enum: kitchen | living_room | outdoor | office | bedroom | generic`;

// Zod validation schema for scene graph output
export const sceneSchema = z.object({
  room: z.object({
    name: z.string(),
    dimensions: z.object({ width: z.number(), depth: z.number() }),
    floorMaterial: z.enum(['wood', 'tile', 'carpet', 'concrete', 'grass', 'other']),
    ambientTone: z.enum(['kitchen', 'living_room', 'outdoor', 'office', 'bedroom', 'generic']),
  }),
  objects: z.array(z.object({
    id: z.string(),
    label: z.string(),
    position: z.object({ x: z.number(), z: z.number() }),
    size: z.object({ width: z.number(), depth: z.number(), height: z.number() }),
    soundCue: z.enum(['table', 'window', 'appliance', 'furniture', 'door', 'generic']),
    material: z.string().optional(),
  })),
});

// Overlap detection helper
export function detectOverlaps(objects) {
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const dx = objects[i].position.x - objects[j].position.x;
      const dz = objects[i].position.z - objects[j].position.z;
      const minDist = (objects[i].size.width + objects[j].size.width) / 2 + 1;
      if (Math.abs(dx) < minDist && Math.abs(dz) < minDist) {
        return { hasOverlap: true, objects: [i, j] };
      }
    }
  }
  return { hasOverlap: false };
}

export default sceneSchema;