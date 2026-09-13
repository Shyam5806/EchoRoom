import { SceneGraph } from '../scene/sceneGraphTypes';

export interface SpatialQARequest {
  question: string;
  sceneGraph: SceneGraph;
  listenerPosition: { x: number; z: number };
  listenerFacing: number;
  objectInfos: { label: string; distance: number; relativeDirection: string }[];
}

/**
 * Call the backend spatial Q&A endpoint.
 * Sends the question, scene graph, listener state, and pre-computed object info.
 * The backend answers using only the provided context — never invents objects.
 */
export async function spatialQA(request: SpatialQARequest): Promise<{ answer?: string; error?: string }> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/spatial-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: request.question,
        sceneGraph: request.sceneGraph,
        listenerPosition: request.listenerPosition,
        listenerFacing: request.listenerFacing,
        objectInfos: request.objectInfos,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Server error: ${errorText}` };
    }

    const data = await response.json();
    return { answer: data.answer || undefined };
  } catch (err) {
    return { error: 'Failed to connect to the server. Is the backend running?' };
  }
}

export default spatialQA;
