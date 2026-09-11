/**
 * AudioEngine — Spatial audio engine for EchoRoom.
 *
 * Architecture:
 * - audioContext.listener is the virtual listener (position + orientation)
 * - Each scene object: OscillatorNode → GainNode → PannerNode(HRTF) → destination
 * - Ambient audio: OscillatorNode → GainNode → destination (non-spatial)
 * - Footsteps: short burst OscillatorNode → GainNode → destination (non-spatial, at listener)
 */

export type FloorMaterial = 'wood' | 'tile' | 'carpet' | 'concrete' | 'grass' | 'other';
export type AmbientTone = 'kitchen' | 'living_room' | 'outdoor' | 'office' | 'bedroom' | 'generic';
export type SoundCue = 'table' | 'window' | 'appliance' | 'furniture' | 'door' | 'generic';

export interface SceneObjectAudio {
  id: string;
  label: string;
  position: { x: number; z: number };
  soundCue: SoundCue;
}

export interface SceneAudioConfig {
  floorMaterial: FloorMaterial;
  ambientTone: AmbientTone;
  objects: SceneObjectAudio[];
}

// Frequency map for object sound cues — subtle, non-fatiguing tones
const SOUND_CUE_FREQUENCIES: Record<SoundCue, { freq: number; type: OscillatorType }> = {
  table:     { freq: 220,  type: 'sine' },
  window:    { freq: 330,  type: 'sine' },
  appliance: { freq: 165,  type: 'triangle' },
  furniture: { freq: 196,  type: 'sine' },
  door:      { freq: 147,  type: 'square' },
  generic:   { freq: 262,  type: 'sine' },
};

// Ambient frequencies per room type
const AMBIENT_FREQUENCIES: Record<AmbientTone, { freq: number; type: OscillatorType; gain: number }> = {
  kitchen:     { freq: 120, type: 'sine',     gain: 0.015 },
  living_room: { freq: 80,  type: 'sine',     gain: 0.010 },
  outdoor:     { freq: 55,  type: 'triangle', gain: 0.012 },
  office:      { freq: 100, type: 'sine',     gain: 0.010 },
  bedroom:     { freq: 65,  type: 'sine',     gain: 0.008 },
  generic:     { freq: 90,  type: 'sine',     gain: 0.010 },
};

// Footstep sound parameters per floor material
const FOOTSTEP_PARAMS: Record<FloorMaterial, { freq: number; type: OscillatorType; duration: number; gain: number }> = {
  wood:     { freq: 180, type: 'triangle', duration: 0.08, gain: 0.06 },
  tile:     { freq: 250, type: 'square',   duration: 0.05, gain: 0.05 },
  carpet:   { freq: 100, type: 'sine',     duration: 0.12, gain: 0.03 },
  concrete: { freq: 200, type: 'square',   duration: 0.06, gain: 0.06 },
  grass:    { freq: 80,  type: 'sine',     duration: 0.15, gain: 0.025 },
  other:    { freq: 150, type: 'triangle', duration: 0.08, gain: 0.04 },
};

interface ObjectAudioNode {
  panner: PannerNode;
  oscillator: OscillatorNode;
  gain: GainNode;
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private ambientOscillator: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private objectNodes: Map<string, ObjectAudioNode> = new Map();
  private floorMaterial: FloorMaterial = 'wood';
  private isRunning: boolean = false;

  /**
   * Resume the AudioContext (must be called from a user gesture handler).
   */
  async resume(): Promise<void> {
    if (!this.audioContext) {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx() as AudioContext;
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Load and play a complete scene. Cleans up any previous scene first.
   */
  async loadScene(config: SceneAudioConfig): Promise<void> {
    // Ensure context is ready
    await this.resume();
    if (!this.audioContext) return;

    // Clean up previous scene
    this.cleanup();

    this.floorMaterial = config.floorMaterial;

    // --- Ambient audio (non-spatial, direct to destination) ---
    const ambientParams = AMBIENT_FREQUENCIES[config.ambientTone] || AMBIENT_FREQUENCIES.generic;
    this.ambientGain = this.audioContext.createGain();
    this.ambientGain.gain.value = ambientParams.gain;
    this.ambientGain.connect(this.audioContext.destination);

    this.ambientOscillator = this.audioContext.createOscillator();
    this.ambientOscillator.frequency.value = ambientParams.freq;
    this.ambientOscillator.type = ambientParams.type;
    this.ambientOscillator.connect(this.ambientGain);
    this.ambientOscillator.start();

    // --- Per-object spatial audio ---
    for (const obj of config.objects) {
      const cueParams = SOUND_CUE_FREQUENCIES[obj.soundCue] || SOUND_CUE_FREQUENCIES.generic;

      // PannerNode — HRTF for spatial audio
      const panner = this.audioContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 50;
      panner.rolloffFactor = 1.5;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.coneOuterGain = 1;

      // Set object position (y=0 for ground plane, use x and z)
      panner.positionX.setValueAtTime(obj.position.x, this.audioContext.currentTime);
      panner.positionY.setValueAtTime(0, this.audioContext.currentTime);
      panner.positionZ.setValueAtTime(obj.position.z, this.audioContext.currentTime);

      panner.connect(this.audioContext.destination);

      // Gain — very quiet, non-fatiguing
      const gain = this.audioContext.createGain();
      gain.gain.value = 0.025;
      gain.connect(panner);

      // Oscillator — continuous subtle tone
      const oscillator = this.audioContext.createOscillator();
      oscillator.frequency.value = cueParams.freq;
      oscillator.type = cueParams.type;
      oscillator.connect(gain);
      oscillator.start();

      this.objectNodes.set(obj.id, { panner, oscillator, gain });
    }

    // Set initial listener position at origin, facing +x
    this.updateListener({ x: 0, z: 0 }, 0);

    this.isRunning = true;
  }

  /**
   * Update the virtual listener's position and orientation.
   * Uses audioContext.listener (the AudioListener), NOT a PannerNode.
   */
  updateListener(position: { x: number; z: number }, facingAngle: number): void {
    if (!this.audioContext) return;

    const listener = this.audioContext.listener;
    const t = this.audioContext.currentTime;

    // Position
    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, t);
      listener.positionY.setValueAtTime(0, t);
      listener.positionZ.setValueAtTime(position.z, t);
    } else {
      // Legacy fallback
      (listener as any).setPosition(position.x, 0, position.z);
    }

    // Orientation: forward vector from facing angle, up vector is (0, 1, 0)
    const forwardX = Math.cos(facingAngle);
    const forwardZ = Math.sin(facingAngle);

    if (listener.forwardX) {
      listener.forwardX.setValueAtTime(forwardX, t);
      listener.forwardY.setValueAtTime(0, t);
      listener.forwardZ.setValueAtTime(forwardZ, t);
      listener.upX.setValueAtTime(0, t);
      listener.upY.setValueAtTime(1, t);
      listener.upZ.setValueAtTime(0, t);
    } else {
      // Legacy fallback
      (listener as any).setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
    }
  }

  /**
   * Trigger a footstep sound. Non-spatial (plays at listener position = direct to destination).
   */
  triggerFootstep(): void {
    if (!this.audioContext) return;

    const params = FOOTSTEP_PARAMS[this.floorMaterial] || FOOTSTEP_PARAMS.other;
    const now = this.audioContext.currentTime;

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    oscillator.frequency.value = params.freq;
    oscillator.type = params.type;

    // Quick attack, fast decay — a "tap" sound
    gain.gain.setValueAtTime(params.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + params.duration);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + params.duration + 0.01);
  }

  /**
   * Play a short directional ping from a specific position (e.g., when user asks "where is X").
   */
  pingObject(objectId: string): void {
    if (!this.audioContext) return;
    const node = this.objectNodes.get(objectId);
    if (!node) return;

    const now = this.audioContext.currentTime;
    // Briefly boost the object's volume
    node.gain.gain.setValueAtTime(0.15, now);
    node.gain.gain.exponentialRampToValueAtTime(0.025, now + 0.5);
  }

  /**
   * Clean up all audio nodes.
   */
  cleanup(): void {
    if (this.ambientOscillator) {
      try { this.ambientOscillator.stop(); } catch {}
      this.ambientOscillator.disconnect();
      this.ambientOscillator = null;
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }

    this.objectNodes.forEach(({ oscillator, gain, panner }) => {
      try { oscillator.stop(); } catch {}
      oscillator.disconnect();
      gain.disconnect();
      panner.disconnect();
    });
    this.objectNodes.clear();

    this.isRunning = false;
  }

  /**
   * Full teardown including AudioContext.
   */
  destroy(): void {
    this.cleanup();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  get running(): boolean {
    return this.isRunning;
  }
}

export default AudioEngine;