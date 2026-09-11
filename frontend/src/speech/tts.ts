let currentlySpeaking = false;
let speakingWatchdogTimer: any = null;

export function speak(text: string): void {
  if (typeof window === 'undefined') return;

  // Clear any active watchdog
  if (speakingWatchdogTimer) {
    clearTimeout(speakingWatchdogTimer);
    speakingWatchdogTimer = null;
  }

  // Cancel any queued or in-progress speech to prevent overlapping announcements
  window.speechSynthesis.cancel();
  currentlySpeaking = false;

  if (!text || text.trim().length === 0) return;

  const utterance = new SpeechSynthesisUtterance(text);

  // Try to find a high-quality English voice
  const voices = window.speechSynthesis.getVoices();
  let preferredVoice: SpeechSynthesisVoice | null = null;

  // Priority 1: Google UK English Female (highest quality on Chrome)
  for (const voice of voices) {
    if (voice.name && voice.lang.startsWith('en') && voice.name.includes('Google') && voice.name.includes('UK')) {
      preferredVoice = voice;
      break;
    }
  }

  // Priority 2: Any Google English voice
  if (!preferredVoice) {
    for (const voice of voices) {
      if (voice.name && voice.lang.startsWith('en') && voice.name.includes('Google')) {
        preferredVoice = voice;
        break;
      }
    }
  }

  // Priority 3: Microsoft online English voice (high quality on Edge/Windows)
  if (!preferredVoice) {
    for (const voice of voices) {
      if (voice.name && voice.lang.startsWith('en') && voice.name.includes('Microsoft') && voice.name.includes('Online')) {
        preferredVoice = voice;
        break;
      }
    }
  }

  // Priority 4: Any English voice
  if (!preferredVoice) {
    for (const voice of voices) {
      if (voice.lang && voice.lang.startsWith('en')) {
        preferredVoice = voice;
        break;
      }
    }
  }

  // Fallback: use first available voice
  const selectedVoice = preferredVoice || voices[0];
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 0.8;

  utterance.onstart = () => {
    currentlySpeaking = true;
  };

  utterance.onend = () => {
    currentlySpeaking = false;
    if (speakingWatchdogTimer) {
      clearTimeout(speakingWatchdogTimer);
      speakingWatchdogTimer = null;
    }
  };

  utterance.onerror = () => {
    currentlySpeaking = false;
    if (speakingWatchdogTimer) {
      clearTimeout(speakingWatchdogTimer);
      speakingWatchdogTimer = null;
    }
  };

  // Watchdog timer in case Chrome fails to fire onend
  const wordCount = text.trim().split(/\s+/).length;
  const estimatedDurationMs = Math.max(1500, Math.min(15000, wordCount * 450 + 1000));
  speakingWatchdogTimer = setTimeout(() => {
    currentlySpeaking = false;
  }, estimatedDurationMs);

  currentlySpeaking = true;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  currentlySpeaking = false;
  if (speakingWatchdogTimer) {
    clearTimeout(speakingWatchdogTimer);
    speakingWatchdogTimer = null;
  }
  window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined') return false;
  return currentlySpeaking && window.speechSynthesis.speaking;
}