import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { SceneGraph } from '../scene/sceneGraphTypes';
import { computeObjectInfo, type ObjectInfo, type ListenerState } from '../scene/geometryUtils';

// ============================================================
// State shape
// ============================================================
export interface AppState {
  mode: 'describe' | 'generating' | 'exploring';
  sceneGraph: SceneGraph | null;
  listener: ListenerState;
  objectInfos: ObjectInfo[];
  error: string | null;
  announcement: string; // for ARIA live region
  showFreeTextInput: boolean;
}

const INITIAL_STATE: AppState = {
  mode: 'describe',
  sceneGraph: null,
  listener: { position: { x: 0, z: 0 }, facingAngle: 0 },
  objectInfos: [],
  error: null,
  announcement: '',
  showFreeTextInput: false,
};

// ============================================================
// Constants
// ============================================================
export const STEP_SIZE = 0.5; // meters per step
export const TURN_ANGLE = Math.PI / 8; // 22.5 degrees

// ============================================================
// Actions
// ============================================================
export type AppAction =
  | { type: 'START_GENERATING' }
  | { type: 'SET_SCENE'; sceneGraph: SceneGraph }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'MOVE_FORWARD' }
  | { type: 'MOVE_BACKWARD' }
  | { type: 'TURN_LEFT' }
  | { type: 'TURN_RIGHT' }
  | { type: 'SET_POSITION_DELTA'; dx: number; dz: number }
  | { type: 'SET_FACING'; facingAngle: number }
  | { type: 'ANNOUNCE'; message: string }
  | { type: 'SHOW_FREE_TEXT_INPUT'; show: boolean }
  | { type: 'RESET' };

// ============================================================
// Reducer
// ============================================================
function recomputeObjectInfos(listener: ListenerState, sceneGraph: SceneGraph | null): ObjectInfo[] {
  if (!sceneGraph) return [];
  return computeObjectInfo(
    listener,
    sceneGraph.objects.map(obj => ({ position: obj.position, label: obj.label }))
  );
}

function clampPosition(
  pos: { x: number; z: number },
  sceneGraph: SceneGraph | null
): { x: number; z: number } {
  if (!sceneGraph) return pos;
  const halfW = sceneGraph.room.dimensions.width / 2;
  const halfD = sceneGraph.room.dimensions.depth / 2;
  const margin = 0.2;
  return {
    x: Math.max(-halfW + margin, Math.min(halfW - margin, pos.x)),
    z: Math.max(-halfD + margin, Math.min(halfD - margin, pos.z)),
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_GENERATING':
      return {
        ...state,
        mode: 'generating',
        error: null,
        announcement: 'Generating your scene, please wait...',
      };

    case 'SET_SCENE': {
      const listener: ListenerState = { position: { x: 0, z: 0 }, facingAngle: 0 };
      const objectInfos = recomputeObjectInfos(listener, action.sceneGraph);
      return {
        ...state,
        mode: 'exploring',
        sceneGraph: action.sceneGraph,
        listener,
        objectInfos,
        error: null,
        announcement: '',
        showFreeTextInput: false,
      };
    }

    case 'SET_ERROR':
      return {
        ...state,
        mode: 'describe',
        error: action.error,
        announcement: action.error,
      };

    case 'MOVE_FORWARD': {
      if (!state.sceneGraph) return state;
      const { x, z } = state.listener.position;
      const angle = state.listener.facingAngle;
      const newPos = clampPosition(
        { x: x + Math.cos(angle) * STEP_SIZE, z: z + Math.sin(angle) * STEP_SIZE },
        state.sceneGraph
      );
      const newListener = { ...state.listener, position: newPos };
      return {
        ...state,
        listener: newListener,
        objectInfos: recomputeObjectInfos(newListener, state.sceneGraph),
      };
    }

    case 'MOVE_BACKWARD': {
      if (!state.sceneGraph) return state;
      const { x, z } = state.listener.position;
      const angle = state.listener.facingAngle;
      const newPos = clampPosition(
        { x: x - Math.cos(angle) * STEP_SIZE, z: z - Math.sin(angle) * STEP_SIZE },
        state.sceneGraph
      );
      const newListener = { ...state.listener, position: newPos };
      return {
        ...state,
        listener: newListener,
        objectInfos: recomputeObjectInfos(newListener, state.sceneGraph),
      };
    }

    case 'TURN_LEFT': {
      const newAngle = state.listener.facingAngle - TURN_ANGLE;
      const newListener = { ...state.listener, facingAngle: newAngle };
      return {
        ...state,
        listener: newListener,
        objectInfos: recomputeObjectInfos(newListener, state.sceneGraph),
      };
    }

    case 'TURN_RIGHT': {
      const newAngle = state.listener.facingAngle + TURN_ANGLE;
      const newListener = { ...state.listener, facingAngle: newAngle };
      return {
        ...state,
        listener: newListener,
        objectInfos: recomputeObjectInfos(newListener, state.sceneGraph),
      };
    }

    case 'SET_POSITION_DELTA': {
      if (!state.sceneGraph) return state;
      const newPos = clampPosition(
        { x: state.listener.position.x + action.dx, z: state.listener.position.z + action.dz },
        state.sceneGraph
      );
      const newListener = { ...state.listener, position: newPos };
      return {
        ...state,
        listener: newListener,
        objectInfos: recomputeObjectInfos(newListener, state.sceneGraph),
      };
    }

    case 'SET_FACING': {
      const newListener = { ...state.listener, facingAngle: action.facingAngle };
      return {
        ...state,
        listener: newListener,
        objectInfos: recomputeObjectInfos(newListener, state.sceneGraph),
      };
    }

    case 'ANNOUNCE':
      return { ...state, announcement: action.message };

    case 'SHOW_FREE_TEXT_INPUT':
      return { ...state, showFreeTextInput: action.show };

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================
const SceneContext = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null);

export function SceneProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  return (
    <SceneContext.Provider value={{ state, dispatch }}>
      {children}
    </SceneContext.Provider>
  );
}

export function useSceneStore() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useSceneStore must be used within SceneProvider');
  return ctx;
}

export default useSceneStore;
