import { SceneGraph } from '../scene/sceneGraphTypes';
import { z } from 'zod';

export interface GenerateSceneResponse {
  sceneGraph?: SceneGraph;
  error?: string;
}

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

export async function generateScene(description: string): Promise<GenerateSceneResponse> {
  const response = await fetch('http://localhost:4000/api/generate-scene', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { error: `Server error: ${errorText}` };
  }

  const data = await response.json();
  // data might have sceneGraph directly or be wrapped
  return { sceneGraph: data.sceneGraph || data, error: undefined };
}

export async function spatialQA(
  question: string,
  sceneGraph: SceneGraph,
  listenerPosition: { x: number; z: number },
  listenerFacing: number,
  objectInfos: { label: string; distance: number; relativeDirection: string }[]
): Promise<{ answer?: string; error?: string }> {
  const response = await fetch('http://localhost:4000/api/spatial-qa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      sceneGraph,
      listenerPosition,
      listenerFacing,
      objectInfos,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { error: `Server error: ${errorText}` };
  }

  const data = await response.json();
  return { answer: data.answer || undefined, error: undefined };
}

export default { generateScene, spatialQA };