import { useState, useEffect, useRef, useCallback } from 'react';
import { speak, isSpeaking, stopSpeaking } from './tts';

// Polyfill type for SpeechRecognition
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface VoiceAssistantProps {
  mode: 'describe' | 'generating' | 'exploring';
  onSceneDescribed?: (description: string) => void;
  onQueryNearMe?: () => void;
  onRequestRecap?: () => void;
  onMoveForward?: () => void;
  onMoveBackward?: () => void;
  onTurnLeft?: () => void;
  onTurnRight?: () => void;
  onNewScene?: () => void;
  onToggleGps?: () => void;
  onGpsOn?: () => void;
  onGpsOff?: () => void;
  onQueryGpsStatus?: () => void;
  onQueryLocation?: () => void;
  onQueryDistance?: () => void;
  onQueryHeading?: () => void;
  onResetGpsOrigin?: () => void;
  onTranscriptChange?: (text: string) => void;
}

export type AssistantState = 'idle' | 'standby' | 'capturing' | 'generating' | 'unsupported' | 'denied';

// ============================================================================
// Phonetic & Acoustic Fuzzy Matching Utilities
// ============================================================================

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function phoneticSkeleton(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/ph/g, 'f')
    .replace(/gh/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/wh/g, 'w')
    .replace(/wr/g, 'r')
    .replace(/kn/g, 'n')
    .replace(/dg/g, 'j')
    .replace(/[dt]/g, 't')
    .replace(/[bp]/g, 'p')
    .replace(/[sz]/g, 's')
    .replace(/[kg]/g, 'k')
    .replace(/[aeiouy]+/g, '')
    .trim();
}

/**
 * Checks if any transcript in the given candidate list acoustically or fuzzily
 * matches any target phrase.
 */
function matchesIntent(transcripts: string[], phrases: string[]): boolean {
  for (const raw of transcripts) {
    const text = raw.toLowerCase().trim();
    if (!text) continue;

    for (const phrase of phrases) {
      const target = phrase.toLowerCase().trim();
      // 1. Direct substring match
      if (text.includes(target)) return true;

      // 2. Tokenized word comparison
      const textWords = text.split(/\s+/);
      const targetWords = target.split(/\s+/);

      if (targetWords.length === 1) {
        for (const w of textWords) {
          if (w === target) return true;
          const maxDist = target.length <= 4 ? 1 : 2;
          if (Math.abs(w.length - target.length) <= maxDist && levenshtein(w, target) <= maxDist) {
            return true;
          }
          if (target.length >= 3 && phoneticSkeleton(w) === phoneticSkeleton(target)) {
            return true;
          }
        }
      } else {
        // Multi-word phrase sliding window
        if (textWords.length >= targetWords.length) {
          for (let i = 0; i <= textWords.length - targetWords.length; i++) {
            const windowPhrase = textWords.slice(i, i + targetWords.length).join(' ');
            const maxDist = target.length <= 6 ? 1 : 2;
            if (levenshtein(windowPhrase, target) <= maxDist) {
              return true;
            }
            if (phoneticSkeleton(windowPhrase) === phoneticSkeleton(target)) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

// Intent dictionaries with acoustic variants
const INTENTS = {
  LISTEN: ['listen', 'liston', 'lessen', 'lisen', 'litsen', 'start listening', 'echo listen', 'hey echo', 'start describing'],
  DESCRIBE: ['describe', 'discribe', 'the scribe', 'generate', 'generate scene', 'finish', 'finish scene', 'build room', 'create room', 'done'],
  STOP_SPEECH: ['stop', 'quiet', 'silence', 'shut up', 'mute'],
  // GPS Commands
  GPS_ON: ['gps on', 'gbs on', 'jps on', 'jeep yes on', 'cheap yes on', 'turn on gps', 'start gps', 'enable gps', 'activate gps', 'start tracking', 'turn on location', 'enable location'],
  GPS_OFF: ['gps off', 'gbs off', 'jps off', 'turn off gps', 'stop gps', 'disable gps', 'deactivate gps', 'stop tracking', 'turn off location', 'disable location'],
  GPS_STATUS: ['gps status', 'is gps on', 'check gps', 'location status', 'satellite status', 'gps state'],
  QUERY_LOCATION: ['where am i', 'what is my location', 'my location', 'my coordinates', 'gps coordinates', 'current position'],
  QUERY_DISTANCE: ['how far have i walked', 'distance walked', 'how far did i walk', 'total distance', 'distance moved', 'meters walked'],
  QUERY_HEADING: ['which way am i facing', 'what direction', 'my heading', 'compass heading', 'compass direction', 'facing direction'],
  RESET_GPS: ['reset gps', 'reset origin', 'recalibrate gps', 'set origin', 'zero gps'],
  // Spatial & Exploration Commands
  QUERY_NEAR_ME: ['near me', 'what is near', 'what is near me', 'what is close', 'what is around', 'around me', 'what do you see', 'look around', 'scan room'],
  RECAP: ['recap', 'repeat', 'summary', 'summarize', 'describe room', 'describe scene', 'tell me the room', 'room recap'],
  FORWARD: ['forward', 'forwards', 'for word', 'four word', 'go forward', 'move forward', 'step forward', 'ahead', 'straight'],
  BACKWARD: ['backward', 'backwards', 'back', 'step back', 'move back', 'go back', 'reverse'],
  TURN_LEFT: ['turn left', 'turning left', 'go left', 'look left', 'step left', 'rotate left', 'face left'],
  TURN_RIGHT: ['turn right', 'turning right', 'go right', 'look right', 'step right', 'rotate right', 'face right'],
  NEW_SCENE: ['new scene', 'new seen', 'reset scene', 'reset room', 'start over', 'clear scene', 'clear room'],
};

export function useVoiceAssistant({
  mode,
  onSceneDescribed,
  onQueryNearMe,
  onRequestRecap,
  onMoveForward,
  onMoveBackward,
  onTurnLeft,
  onTurnRight,
  onNewScene,
  onToggleGps,
  onGpsOn,
  onGpsOff,
  onQueryGpsStatus,
  onQueryLocation,
  onQueryDistance,
  onQueryHeading,
  onResetGpsOrigin,
  onTranscriptChange,
}: VoiceAssistantProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [lastAnnouncement, setLastAnnouncement] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const isEnabledRef = useRef<boolean>(true);
  isEnabledRef.current = isEnabled;

  const assistantStateRef = useRef<AssistantState>('idle');
  assistantStateRef.current = assistantState;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const capturedTextRef = useRef<string>('');
  const isRestartingRef = useRef<boolean>(false);
  const lastCommandTimeRef = useRef<{ [command: string]: number }>({});

  // Command execution with debouncing for sub-150ms instantaneous responsiveness
  const canExecuteCommand = useCallback((cmd: string, cooldownMs = 800): boolean => {
    const now = Date.now();
    const last = lastCommandTimeRef.current[cmd] || 0;
    if (now - last < cooldownMs) return false;
    lastCommandTimeRef.current[cmd] = now;
    return true;
  }, []);

  // Keep callback refs fresh
  const callbacksRef = useRef({
    onSceneDescribed,
    onQueryNearMe,
    onRequestRecap,
    onMoveForward,
    onMoveBackward,
    onTurnLeft,
    onTurnRight,
    onNewScene,
    onToggleGps,
    onGpsOn,
    onGpsOff,
    onQueryGpsStatus,
    onQueryLocation,
    onQueryDistance,
    onQueryHeading,
    onResetGpsOrigin,
    onTranscriptChange,
  });
  callbacksRef.current = {
    onSceneDescribed,
    onQueryNearMe,
    onRequestRecap,
    onMoveForward,
    onMoveBackward,
    onTurnLeft,
    onTurnRight,
    onNewScene,
    onToggleGps,
    onGpsOn,
    onGpsOff,
    onQueryGpsStatus,
    onQueryLocation,
    onQueryDistance,
    onQueryHeading,
    onResetGpsOrigin,
    onTranscriptChange,
  };

  // Helper to announce both through speech and state
  const announce = useCallback((text: string) => {
    setLastAnnouncement(text);
    speak(text);
  }, []);

  const transcriptRef = useRef<string>('');
  transcriptRef.current = transcript;

  // Process incoming speech text based on state and mode
  const handleSpeechResult = useCallback((transcripts: string[], isFinal: boolean) => {
    if (!transcripts || transcripts.length === 0) return;
    const currentMode = modeRef.current;
    const currentState = assistantStateRef.current;
    const primaryText = transcripts[0];

    // If speech synthesis is speaking and the user speaks, immediately stop TTS
    // so the user's voice takes priority and isn't muted
    if (isSpeaking()) {
      stopSpeaking();
      if (matchesIntent(transcripts, INTENTS.STOP_SPEECH)) {
        return;
      }
    }

    // ========================================================
    // DESCRIBE MODE: Actively capture room description
    // ========================================================
    if (currentMode === 'describe') {
      // 1. Check if user wants to generate/submit the scene ("describe", "generate", "create", "done", "finish")
      if (matchesIntent(transcripts, INTENTS.DESCRIBE)) {
        let cleanText = capturedTextRef.current || transcriptRef.current;
        // Strip trailing describe words
        cleanText = cleanText
          .replace(/\b(describe|discribe|the scribe|generate|create|build room|finish|done)\b.*$/i, '')
          .trim();

        // Also check if primaryText has content prior to the describe trigger
        const segmentBefore = primaryText
          .replace(/\b(describe|discribe|the scribe|generate|create|build room|finish|done)\b.*$/i, '')
          .trim();
        if (segmentBefore && !cleanText.toLowerCase().includes(segmentBefore.toLowerCase())) {
          cleanText = `${cleanText} ${segmentBefore}`.trim();
        }

        if (cleanText.length >= 3) {
          setAssistantState('generating');
          announce('Scene described. Generating your room now.');
          callbacksRef.current.onSceneDescribed?.(cleanText);
        } else {
          announce('Please say what objects are in the room first.');
        }
        return;
      }

      // 2. Check if user says "clear" or "start over"
      if (matchesIntent(transcripts, ['clear', 'start over', 'reset description', 'erase'])) {
        capturedTextRef.current = '';
        setTranscript('');
        callbacksRef.current.onTranscriptChange?.('');
        setAssistantState('capturing');
        announce('Description cleared. Please speak your room description.');
        return;
      }

      // 3. Any spoken words are captured into the scene description!
      setAssistantState('capturing');
      if (isFinal) {
        // Strip initial "listen" if user used it as wake word
        const stripped = primaryText.replace(/^(listen|echo listen|start listening)\s*/i, '').trim();
        if (stripped.length > 0) {
          const newText = capturedTextRef.current ? `${capturedTextRef.current} ${stripped}` : stripped;
          capturedTextRef.current = newText;
          setTranscript(newText);
          callbacksRef.current.onTranscriptChange?.(newText);
        }
      } else {
        // Real-time interim preview
        const stripped = primaryText.replace(/^(listen|echo listen|start listening)\s*/i, '').trim();
        const preview = capturedTextRef.current ? `${capturedTextRef.current} ${stripped}` : stripped;
        setTranscript(preview);
        callbacksRef.current.onTranscriptChange?.(preview);
      }
      return;
    }

    // ========================================================
    // EXPLORING / STANDBY MODE: Voice commands & controls
    // ========================================================
    if (currentState === 'standby' || currentState === 'idle' || currentMode === 'exploring') {
      // GPS Voice Commands
      if (matchesIntent(transcripts, INTENTS.GPS_ON)) {
        if (canExecuteCommand('gps_on', 1000)) {
          callbacksRef.current.onGpsOn?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.GPS_OFF)) {
        if (canExecuteCommand('gps_off', 1000)) {
          callbacksRef.current.onGpsOff?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.GPS_STATUS)) {
        if (canExecuteCommand('gps_status', 1200)) {
          callbacksRef.current.onQueryGpsStatus?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.QUERY_LOCATION)) {
        if (canExecuteCommand('query_location', 1200)) {
          callbacksRef.current.onQueryLocation?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.QUERY_DISTANCE)) {
        if (canExecuteCommand('query_distance', 1200)) {
          callbacksRef.current.onQueryDistance?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.QUERY_HEADING)) {
        if (canExecuteCommand('query_heading', 1200)) {
          callbacksRef.current.onQueryHeading?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.RESET_GPS)) {
        if (canExecuteCommand('reset_gps', 1200)) {
          callbacksRef.current.onResetGpsOrigin?.();
        }
        return;
      }

      // Spatial Movement & Navigation Commands
      if (matchesIntent(transcripts, INTENTS.QUERY_NEAR_ME)) {
        if (canExecuteCommand('near_me', 1000)) {
          callbacksRef.current.onQueryNearMe?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.RECAP)) {
        if (canExecuteCommand('recap', 1200)) {
          callbacksRef.current.onRequestRecap?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.FORWARD)) {
        if (canExecuteCommand('forward', 600)) {
          callbacksRef.current.onMoveForward?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.BACKWARD)) {
        if (canExecuteCommand('backward', 600)) {
          callbacksRef.current.onMoveBackward?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.TURN_LEFT)) {
        if (canExecuteCommand('turn_left', 600)) {
          callbacksRef.current.onTurnLeft?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.TURN_RIGHT)) {
        if (canExecuteCommand('turn_right', 600)) {
          callbacksRef.current.onTurnRight?.();
        }
        return;
      }
      if (matchesIntent(transcripts, INTENTS.NEW_SCENE)) {
        if (canExecuteCommand('new_scene', 1500)) {
          callbacksRef.current.onNewScene?.();
        }
        return;
      }
    }
  }, [announce, canExecuteCommand]);

  const handleSpeechResultRef = useRef(handleSpeechResult);
  handleSpeechResultRef.current = handleSpeechResult;

  // Initialize and maintain Web Speech Recognition with multi-alternative extraction
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setAssistantState('unsupported');
      return;
    }

    let recognition: any = null;
    let isCancelled = false;

    const startRecognition = () => {
      if (isCancelled || !isEnabledRef.current) return;

      try {
        recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.continuous = true;
        recognition.interimResults = true;
        // Use user's local browser language for optimal acoustic recognition
        recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        recognition.maxAlternatives = 5;

        recognition.onstart = () => {
          if (modeRef.current === 'describe') {
            setAssistantState('capturing');
          } else if (assistantStateRef.current === 'idle') {
            setAssistantState('standby');
          }
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const finalTranscripts: string[] = [];
          const interimTranscripts: string[] = [];

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            for (let alt = 0; alt < res.length; alt++) {
              const text = res[alt]?.transcript;
              if (text) {
                if (res.isFinal) {
                  finalTranscripts.push(text);
                } else {
                  interimTranscripts.push(text);
                }
              }
            }
          }

          if (finalTranscripts.length > 0) {
            handleSpeechResultRef.current(finalTranscripts, true);
          } else if (interimTranscripts.length > 0) {
            handleSpeechResultRef.current(interimTranscripts, false);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (event.error === 'not-allowed') {
            setAssistantState('denied');
          } else if (event.error === 'aborted') {
            // Normal during restart or tab blur, ignore
          } else if (event.error !== 'no-speech') {
            console.warn('Voice Assistant Speech Recognition event:', event.error);
          }
        };

        recognition.onend = () => {
          if (isCancelled || !isEnabledRef.current) return;
          // Auto-restart continuous listening unless disabled or generating
          if (!isRestartingRef.current && assistantStateRef.current !== 'generating') {
            isRestartingRef.current = true;
            setTimeout(() => {
              isRestartingRef.current = false;
              if (!isCancelled && isEnabledRef.current && assistantStateRef.current !== 'generating') {
                try {
                  recognition.start();
                } catch { }
              }
            }, 200);
          }
        };

        recognition.start();
      } catch (err) {
        console.warn('Could not start SpeechRecognition:', err);
      }
    };

    startRecognition();

    return () => {
      isCancelled = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch { }
      }
    };
  }, []);

  // Sync state when mode changes and restart recognition if needed
  useEffect(() => {
    if (mode === 'describe') {
      setAssistantState('capturing');
      capturedTextRef.current = '';
      setTranscript('');
    } else if (mode === 'generating') {
      setAssistantState('generating');
    } else if (mode === 'exploring') {
      setAssistantState('standby');
    }

    if (mode !== 'generating' && isEnabledRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch { }
    }
  }, [mode]);

  // Manual Trigger helpers
  const triggerListenManually = useCallback(() => {
    stopSpeaking();
    setAssistantState('capturing');
    capturedTextRef.current = '';
    setTranscript('');
    callbacksRef.current.onTranscriptChange?.('');

    // Ensure recognition is running upon direct user interaction
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch { }
    }
  }, []);

  const triggerDescribeManually = useCallback(() => {
    const text = capturedTextRef.current.trim() || transcript.trim();
    if (text.length > 0) {
      setAssistantState('generating');
      announce('Generating scene based on your description.');
      callbacksRef.current.onSceneDescribed?.(text);
    } else {
      announce('Please say a description first.');
    }
  }, [transcript, announce]);

  const toggleAssistant = useCallback(() => {
    setIsEnabled(prev => {
      const next = !prev;
      if (!next) {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch { }
        }
        setAssistantState('idle');
        announce('Voice assistant deactivated.');
      } else {
        if (modeRef.current === 'describe') {
          setAssistantState('capturing');
        } else {
          setAssistantState('standby');
        }
        announce('Voice assistant activated.');
        try { recognitionRef.current?.start(); } catch { }
      }
      return next;
    });
  }, [announce]);

  return {
    isEnabled,
    assistantState,
    transcript,
    lastAnnouncement,
    toggleAssistant,
    triggerListenManually,
    triggerDescribeManually,
    setAssistantState,
  };
}

export default useVoiceAssistant;

