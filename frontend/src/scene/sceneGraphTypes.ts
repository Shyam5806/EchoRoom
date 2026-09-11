import { z } from 'zod';

export interface Vec2 {
  x: number;
  z: number;
}

export interface RoomInfo {
  name: string;
  dimensions: { width: number; depth: number };
  floorMaterial: 'wood' | 'tile' | 'carpet' | 'concrete' | 'grass' | 'other';
  ambientTone: 'kitchen' | 'living_room' | 'outdoor' | 'office' | 'bedroom' | 'generic';
}

export interface SceneObject {
  id: string;
  label: string;
  position: Vec2;
  size: { width: number; depth: number; height: number };
  soundCue: 'table' | 'window' | 'appliance' | 'furniture' | 'door' | 'generic';
  material?: string;
}

export interface SceneGraph {
  room: RoomInfo;
  objects: SceneObject[];
}

export interface ListenerState {
  position: Vec2;
  facingAngle: number; // radians
}

export interface ObjectInfo {
  label: string;
  distance: number;
  relativeDirection: 'front' | 'front-left' | 'left' | 'back-left' | 'back' | 'back-right' | 'right' | 'front-right';
}