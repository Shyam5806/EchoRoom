import { useState, useEffect, useRef, useCallback } from 'react';
import { speak } from '../speech/tts';

export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
}

interface UseGpsTrackerProps {
  onMovement?: (deltaMetersX: number, deltaMetersZ: number) => void;
  onHeadingChange?: (headingAngleRadians: number) => void;
  onStep?: () => void;
  isActive?: boolean;
}

export type GpsStatus = 'disabled' | 'acquiring' | 'active' | 'denied' | 'unavailable';

/**
 * Converts delta latitude and longitude to metric displacements in meters.
 * dx: East-West displacement (meters)
 * dz: North-South displacement (meters)
 */
function coordsToMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { dx: number; dz: number } {
  const EARTH_RADIUS = 6378137; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const meanLat = (((lat1 + lat2) / 2) * Math.PI) / 180;

  const dx = dLon * Math.cos(meanLat) * EARTH_RADIUS;
  const dz = -dLat * EARTH_RADIUS; // Negative because North is -z in 3D audio space

  return { dx, dz };
}

function degreesToCardinal(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    'North', 'North-East', 'East', 'South-East',
    'South', 'South-West', 'West', 'North-West'
  ];
  const index = Math.round(normalized / 45) % 8;
  return `${directions[index]}, ${Math.round(normalized)} degrees`;
}

// Maximum acceptable GPS accuracy in meters. Readings worse than this are discarded.
const MAX_ACCEPTABLE_ACCURACY = 20;

// Maximum realistic walking speed in meters/second. Any implied movement faster
// than this between two readings is treated as a GPS glitch, not real motion.
const MAX_REALISTIC_SPEED_MPS = 3;

// Minimum displacement (meters) required to register as an actual navigation step.
const MIN_STEP_DISTANCE = 0.4;

// Distance accumulated (meters) before triggering a footstep audio cue.
const FOOTSTEP_TRIGGER_DISTANCE = 0.5;

export function useGpsTracker({
  onMovement,
  onHeadingChange,
  onStep,
  isActive = false,
}: UseGpsTrackerProps) {
  const [isGpsEnabled, setIsGpsEnabled] = useState<boolean>(isActive);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('disabled');
  const [currentCoords, setCurrentCoords] = useState<GpsLocation | null>(null);
  const [originCoords, setOriginCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [totalDistanceMoved, setTotalDistanceMoved] = useState<number>(0);

  const watchIdRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const accumulatedStepDistanceRef = useRef<number>(0);
  const lastCompassHeadingRef = useRef<number | null>(null);

  const callbacksRef = useRef({ onMovement, onHeadingChange, onStep });
  callbacksRef.current = { onMovement, onHeadingChange, onStep };

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsStatus('disabled');
  }, []);

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('unavailable');
      speak('GPS geolocation is not supported on this device.');
      return;
    }

    setGpsStatus('acquiring');
    speak('Acquiring GPS signal. Please allow location access.');

    lastCoordsRef.current = null;
    lastTimestampRef.current = null;
    accumulatedStepDistanceRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        const timestamp = position.timestamp;

        // Reject low-accuracy readings outright — these are the primary cause
        // of sudden position "jumps" and should never update state at all.
        if (accuracy > MAX_ACCEPTABLE_ACCURACY) {
          return;
        }

        setCurrentCoords({
          latitude,
          longitude,
          accuracy: Math.round(accuracy),
          heading,
          speed: speed ? Math.round(speed * 10) / 10 : null,
        });

        // Set initial origin if not set
        if (!lastCoordsRef.current) {
          setOriginCoords({ latitude, longitude });
          lastCoordsRef.current = { latitude, longitude };
          lastTimestampRef.current = timestamp;
          setGpsStatus('active');
          speak(`GPS active. Accuracy within ${Math.round(accuracy)} meters. Movement tracking enabled.`);
          return;
        }

        // Calculate delta from previous reading
        const { dx, dz } = coordsToMeters(
          lastCoordsRef.current.latitude,
          lastCoordsRef.current.longitude,
          latitude,
          longitude
        );

        const stepDist = Math.sqrt(dx * dx + dz * dz);
        const elapsedSec = (timestamp - (lastTimestampRef.current ?? timestamp)) / 1000;
        const impliedSpeed = elapsedSec > 0 ? stepDist / elapsedSec : 0;

        // Reject jumps implying faster-than-walking speed — these are GPS
        // glitches (satellite/wifi handoff, multipath reflection indoors), not real motion.
        const isRealisticMovement = impliedSpeed <= MAX_REALISTIC_SPEED_MPS;

        // Filter out GPS jitter if displacement is below accuracy threshold
        // (require at least MIN_STEP_DISTANCE meters movement to trigger navigation step)
        if (stepDist >= MIN_STEP_DISTANCE && isRealisticMovement) {
          lastCoordsRef.current = { latitude, longitude };
          lastTimestampRef.current = timestamp;
          setTotalDistanceMoved(prev => Math.round((prev + stepDist) * 10) / 10);

          // Trigger movement delta
          callbacksRef.current.onMovement?.(dx, dz);

          // Accumulate for audio footsteps
          accumulatedStepDistanceRef.current += stepDist;
          if (accumulatedStepDistanceRef.current >= FOOTSTEP_TRIGGER_DISTANCE) {
            callbacksRef.current.onStep?.();
            accumulatedStepDistanceRef.current = 0;
          }
        } else if (stepDist >= MIN_STEP_DISTANCE && !isRealisticMovement) {
          // Glitch reading: update the timestamp reference so a single bad
          // sample doesn't inflate the "implied speed" of the *next* reading too,
          // but deliberately do NOT update lastCoordsRef, so the bad position
          // is discarded rather than becoming the new baseline.
          lastTimestampRef.current = timestamp;
        }

        // Update heading if available
        if (heading !== null && !isNaN(heading)) {
          lastCompassHeadingRef.current = heading;
          // Convert compass degrees (0° = North, 90° = East, clockwise)
          // to audio-engine radians (0 rad = +X = East, counter-clockwise)
          // North (0°) → -π/2, East (90°) → 0, South (180°) → π/2, West (270°) → π
          const rad = (Math.PI / 2) - (heading * Math.PI) / 180;
          callbacksRef.current.onHeadingChange?.(rad);
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus('denied');
          speak('Location permission was denied. Please allow location access to use GPS tracking.');
        } else {
          setGpsStatus('unavailable');
          speak('Unable to acquire GPS position.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  }, []);

  // Listen to device orientation for compass heading when walking on mobile
  useEffect(() => {
    if (!isGpsEnabled) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading for iOS, alpha for Android
      const compass = (e as any).webkitCompassHeading || (e.alpha !== null ? 360 - e.alpha : null);
      if (compass !== null && !isNaN(compass)) {
        lastCompassHeadingRef.current = compass;
        // Convert compass degrees to audio-engine radians (same conversion as GPS heading)
        const rad = (Math.PI / 2) - (compass * Math.PI) / 180;
        callbacksRef.current.onHeadingChange?.(rad);
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation);
      return () => window.removeEventListener('deviceorientation', handleOrientation);
    }
  }, [isGpsEnabled]);

  // Manage watchPosition lifecycle based on isGpsEnabled
  useEffect(() => {
    if (isGpsEnabled) {
      startTracking();
    } else {
      stopTracking();
    }
    return () => stopTracking();
  }, [isGpsEnabled, startTracking, stopTracking]);

  const enableGps = useCallback(() => {
    setIsGpsEnabled(prev => {
      if (prev) {
        speak('GPS is already active.');
        return true;
      }
      return true;
    });
  }, []);

  const disableGps = useCallback(() => {
    setIsGpsEnabled(prev => {
      if (!prev) {
        speak('GPS is already turned off.');
        return false;
      }
      speak('GPS tracking turned off.');
      return false;
    });
  }, []);

  const toggleGps = useCallback(() => {
    setIsGpsEnabled(prev => {
      const next = !prev;
      if (!next) {
        speak('GPS tracking turned off.');
      }
      return next;
    });
  }, []);

  const speakStatus = useCallback(() => {
    if (!isGpsEnabled) {
      speak('GPS tracking is currently turned off. Say "GPS on" or "turn on GPS" to enable.');
      return;
    }
    if (gpsStatus === 'active' && currentCoords) {
      speak(`GPS is active. Accuracy is within ${currentCoords.accuracy} meters. Speed is ${currentCoords.speed !== null ? `${currentCoords.speed} meters per second` : 'stationary'}.`);
    } else if (gpsStatus === 'acquiring') {
      speak('GPS is acquiring satellite signal. Please wait a moment.');
    } else if (gpsStatus === 'denied') {
      speak('GPS permission was denied in your browser settings.');
    } else {
      speak(`GPS status is ${gpsStatus}.`);
    }
  }, [isGpsEnabled, gpsStatus, currentCoords]);

  const speakCoordinates = useCallback(() => {
    if (!isGpsEnabled) {
      speak('GPS is not enabled. Say "GPS on" to turn on location tracking.');
      return;
    }
    if (!currentCoords) {
      speak('GPS location is still acquiring. Please wait a moment.');
      return;
    }
    speak(`Your coordinates are latitude ${currentCoords.latitude.toFixed(5)}, longitude ${currentCoords.longitude.toFixed(5)}, accuracy ${currentCoords.accuracy} meters.`);
  }, [isGpsEnabled, currentCoords]);

  const speakDistance = useCallback(() => {
    speak(`You have walked approximately ${totalDistanceMoved.toFixed(1)} meters.`);
  }, [totalDistanceMoved]);

  const speakHeading = useCallback(() => {
    if (lastCompassHeadingRef.current !== null) {
      const cardinal = degreesToCardinal(lastCompassHeadingRef.current);
      speak(`You are facing ${cardinal}.`);
    } else {
      speak('Compass heading is not available on this device.');
    }
  }, []);

  const resetOrigin = useCallback(() => {
    if (currentCoords) {
      setOriginCoords({ latitude: currentCoords.latitude, longitude: currentCoords.longitude });
      lastCoordsRef.current = { latitude: currentCoords.latitude, longitude: currentCoords.longitude };
      lastTimestampRef.current = Date.now();
      setTotalDistanceMoved(0);
      speak('GPS origin reset to your current physical position.');
    } else {
      speak('Cannot reset origin: current GPS position is not acquired.');
    }
  }, [currentCoords]);

  return {
    isGpsEnabled,
    gpsStatus,
    currentCoords,
    originCoords,
    totalDistanceMoved,
    toggleGps,
    enableGps,
    disableGps,
    speakStatus,
    speakCoordinates,
    speakDistance,
    speakHeading,
    resetOrigin,
  };
}

export default useGpsTracker;