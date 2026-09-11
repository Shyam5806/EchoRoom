import { useRef, useCallback, useEffect, useMemo } from 'react';
import { SceneProvider, useSceneStore } from './state/useSceneStore';
import { generateScene } from './scene/sceneGenerationClient';
import { sceneSchema } from './scene/sceneGenerationClient';
import { spatialQA } from './scene/spatialQAClient';
import { speak, stopSpeaking } from './speech/tts';
import { AudioEngine } from './audio/AudioEngine';
import { useKeyboardControls } from './controls/useKeyboardControls';
import { useVoiceAssistant } from './speech/useVoiceAssistant';
import { useGpsTracker } from './controls/useGpsTracker';
import DescribeScreen from './ui/DescribeScreen';
import ExploreScreen from './ui/ExploreScreen';

function AppInner() {
  const { state, dispatch } = useSceneStore();
  const audioRef = useRef<AudioEngine | null>(null);

  // Ensure AudioEngine singleton
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new AudioEngine();
    }
    return audioRef.current;
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.destroy();
    };
  }, []);

  // --- Scene Generation ---
  const handleGenerate = useCallback(async (description: string) => {
    dispatch({ type: 'START_GENERATING' });
    speak('Generating your scene, please wait.');

    try {
      const result = await generateScene(description);

      if (result.error) {
        dispatch({ type: 'SET_ERROR', error: result.error });
        speak(result.error);
        return;
      }

      // Validate
      let validated;
      try {
        validated = sceneSchema.parse(result.sceneGraph);
      } catch {
        dispatch({ type: 'SET_ERROR', error: 'Invalid scene data generated. Please try rephrasing your description.' });
        speak('Invalid scene data generated. Please try rephrasing your description.');
        return;
      }

      dispatch({ type: 'SET_SCENE', sceneGraph: validated });

      // Load audio
      const audio = getAudio();
      await audio.loadScene({
        floorMaterial: validated.room.floorMaterial,
        ambientTone: validated.room.ambientTone,
        objects: validated.objects.map(obj => ({
          id: obj.id,
          label: obj.label,
          position: obj.position,
          soundCue: obj.soundCue,
        })),
      });

      // Speak scene confirmation
      const objectDescs = validated.objects
        .map(obj => `a ${obj.label}`)
        .join(', ');
      const confirmation = `Scene ready. You are in a ${validated.room.name} with ${validated.room.floorMaterial} flooring. ` +
        `The room is ${validated.room.dimensions.width} meters wide and ${validated.room.dimensions.depth} meters deep. ` +
        `It contains ${objectDescs}. ` +
        `Use W, A, S, D or arrow keys to move and turn. Press Q for what's near you, E to ask a question, R for a full recap.`;
      speak(confirmation);
      dispatch({ type: 'ANNOUNCE', message: confirmation });
    } catch (err) {
      const msg = 'Failed to generate scene. Is the backend server running on port 4000?';
      dispatch({ type: 'SET_ERROR', error: msg });
      speak(msg);
    }
  }, [dispatch, getAudio]);

  // --- Movement handlers ---
  const handleMoveForward = useCallback(() => {
    dispatch({ type: 'MOVE_FORWARD' });
    const audio = getAudio();
    audio.triggerFootstep();
    // Update listener position in audio after state update
  }, [dispatch, getAudio]);

  const handleMoveBackward = useCallback(() => {
    dispatch({ type: 'MOVE_BACKWARD' });
    const audio = getAudio();
    audio.triggerFootstep();
  }, [dispatch, getAudio]);

  const handleTurnLeft = useCallback(() => {
    dispatch({ type: 'TURN_LEFT' });
    const audio = getAudio();
    audio.triggerTurnTick();
  }, [dispatch, getAudio]);

  const handleTurnRight = useCallback(() => {
    dispatch({ type: 'TURN_RIGHT' });
    const audio = getAudio();
    audio.triggerTurnTick();
  }, [dispatch, getAudio]);

  // Sync audio listener with state changes
  useEffect(() => {
    if (state.mode === 'exploring' && audioRef.current) {
      audioRef.current.updateListener(state.listener.position, state.listener.facingAngle);
    }
  }, [state.listener.position.x, state.listener.position.z, state.listener.facingAngle, state.mode]);

  // --- Query handlers ---
  const handleQueryNearMe = useCallback(() => {
    if (!state.sceneGraph) return;
    const nearObjects = state.objectInfos
      .filter(info => info.distance <= 3)
      .sort((a, b) => a.distance - b.distance);

    let message: string;
    if (nearObjects.length === 0) {
      message = 'Nothing is near you right now. Try moving forward to explore.';
    } else {
      const descs = nearObjects.map(info =>
        `a ${info.label} about ${info.distance.toFixed(1)} meters to your ${info.relativeDirection.replace('-', ' ')}`
      );
      if (descs.length === 1) {
        message = `Near you is ${descs[0]}.`;
      } else {
        const last = descs.pop();
        message = `Near you are ${descs.join(', ')}, and ${last}.`;
      }
    }
    speak(message);
    dispatch({ type: 'ANNOUNCE', message });
  }, [state.sceneGraph, state.objectInfos, dispatch]);

  const handleRequestRecap = useCallback(() => {
    if (!state.sceneGraph) return;
    const room = state.sceneGraph.room;
    const objectDescs = state.objectInfos
      .sort((a, b) => a.distance - b.distance)
      .map(info =>
        `a ${info.label}, ${info.distance.toFixed(1)} meters to your ${info.relativeDirection.replace('-', ' ')}`
      );
    const message = `You are in a ${room.name} with ${room.floorMaterial} flooring. ` +
      `The room is ${room.dimensions.width} meters wide and ${room.dimensions.depth} meters deep. ` +
      `From your current position: ${objectDescs.join('; ')}.`;
    speak(message);
    dispatch({ type: 'ANNOUNCE', message });
  }, [state.sceneGraph, state.objectInfos, dispatch]);

  const handleFreeTextQuery = useCallback(async (question: string) => {
    if (!state.sceneGraph) return;
    speak('Thinking...');

    const result = await spatialQA({
      question,
      sceneGraph: state.sceneGraph,
      listenerPosition: state.listener.position,
      listenerFacing: state.listener.facingAngle,
      objectInfos: state.objectInfos.map(info => ({
        label: info.label,
        distance: info.distance,
        relativeDirection: info.relativeDirection,
      })),
    });

    const answer = result.answer || result.error || 'Sorry, I could not understand that question.';
    speak(answer);
    dispatch({ type: 'ANNOUNCE', message: answer });
    dispatch({ type: 'SHOW_FREE_TEXT_INPUT', show: false });
  }, [state.sceneGraph, state.listener, state.objectInfos, dispatch]);

  const handleOpenFreeTextQuery = useCallback(() => {
    dispatch({ type: 'SHOW_FREE_TEXT_INPUT', show: true });
  }, [dispatch]);

  const handleCloseFreeText = useCallback(() => {
    dispatch({ type: 'SHOW_FREE_TEXT_INPUT', show: false });
  }, [dispatch]);

  const handleNewScene = useCallback(() => {
    stopSpeaking();
    audioRef.current?.cleanup();
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  // --- GPS Movement handler ---
  const handleGpsMovement = useCallback((dx: number, dz: number) => {
    dispatch({ type: 'SET_POSITION_DELTA', dx, dz });
  }, [dispatch]);

  const handleGpsHeading = useCallback((headingAngle: number) => {
    dispatch({ type: 'SET_FACING', facingAngle: headingAngle });
  }, [dispatch]);

  const handleGpsStep = useCallback(() => {
    const audio = getAudio();
    audio.triggerFootstep();
  }, [getAudio]);

  const gpsTracker = useGpsTracker({
    onMovement: handleGpsMovement,
    onHeadingChange: handleGpsHeading,
    onStep: handleGpsStep,
    isActive: false,
  });

  // --- GPS Auto-Proximity Announcements ---
  // Track which objects have already been announced to avoid repetition
  const gpsAnnouncedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!gpsTracker.isGpsEnabled || state.mode !== 'exploring') {
      // Reset announced set when GPS is toggled off or we leave explore mode
      gpsAnnouncedRef.current.clear();
      return;
    }

    const PROXIMITY_THRESHOLD = 1.5; // meters
    const nearbyNow = state.objectInfos.filter(info => info.distance <= PROXIMITY_THRESHOLD);

    for (const info of nearbyNow) {
      const key = `${info.label}-${info.relativeDirection}`;
      if (!gpsAnnouncedRef.current.has(key)) {
        gpsAnnouncedRef.current.add(key);
        speak(`${info.label} nearby, ${info.distance.toFixed(1)} meters to your ${info.relativeDirection.replace('-', ' ')}`);
      }
    }

    // Remove from announced set if object is no longer nearby (so it can be re-announced if user returns)
    const nearbyKeys = new Set(nearbyNow.map(info => `${info.label}-${info.relativeDirection}`));
    for (const announced of gpsAnnouncedRef.current) {
      if (!nearbyKeys.has(announced)) {
        gpsAnnouncedRef.current.delete(announced);
      }
    }
  }, [gpsTracker.isGpsEnabled, state.mode, state.objectInfos]);

  // --- Voice Assistant ---
  const voiceAssistant = useVoiceAssistant({
    mode: state.mode,
    onSceneDescribed: handleGenerate,
    onQueryNearMe: handleQueryNearMe,
    onRequestRecap: handleRequestRecap,
    onMoveForward: handleMoveForward,
    onMoveBackward: handleMoveBackward,
    onTurnLeft: handleTurnLeft,
    onTurnRight: handleTurnRight,
    onNewScene: handleNewScene,
    onToggleGps: gpsTracker.toggleGps,
    onGpsOn: gpsTracker.enableGps,
    onGpsOff: gpsTracker.disableGps,
    onQueryGpsStatus: gpsTracker.speakStatus,
    onQueryLocation: gpsTracker.speakCoordinates,
    onQueryDistance: gpsTracker.speakDistance,
    onQueryHeading: gpsTracker.speakHeading,
    onResetGpsOrigin: gpsTracker.resetOrigin,
  });

  // --- Keyboard controls ---
  useKeyboardControls(state.mode === 'exploring', {
    onMoveForward: handleMoveForward,
    onMoveBackward: handleMoveBackward,
    onTurnLeft: handleTurnLeft,
    onTurnRight: handleTurnRight,
    onQueryNearMe: handleQueryNearMe,
    onOpenFreeTextQuery: handleOpenFreeTextQuery,
    onRequestRecap: handleRequestRecap,
  });

  // --- Render ---
  if (state.mode === 'describe' || state.mode === 'generating') {
    return (
      <DescribeScreen
        onSubmit={handleGenerate}
        isGenerating={state.mode === 'generating'}
        error={state.error}
        voiceAssistant={voiceAssistant}
      />
    );
  }

  if (state.mode === 'exploring' && state.sceneGraph) {
    return (
      <ExploreScreen
        sceneGraph={state.sceneGraph}
        listener={state.listener}
        objectInfos={state.objectInfos}
        announcement={state.announcement}
        showFreeTextInput={state.showFreeTextInput}
        onQueryNearMe={handleQueryNearMe}
        onRequestRecap={handleRequestRecap}
        onFreeTextQuery={handleFreeTextQuery}
        onCloseFreeText={handleCloseFreeText}
        onMoveForward={handleMoveForward}
        onMoveBackward={handleMoveBackward}
        onTurnLeft={handleTurnLeft}
        onTurnRight={handleTurnRight}
        onNewScene={handleNewScene}
        voiceAssistant={voiceAssistant}
        gpsTracker={gpsTracker}
      />
    );
  }

  return null;
}

export default function App() {
  return (
    <SceneProvider>
      <AppInner />
    </SceneProvider>
  );
}