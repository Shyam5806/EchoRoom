import { useState, useRef, useEffect } from 'react';
import { type AssistantState } from '../speech/useVoiceAssistant';

interface DescribeScreenProps {
  onSubmit: (description: string) => void;
  isGenerating: boolean;
  error: string | null;
  voiceAssistant: {
    isEnabled: boolean;
    assistantState: AssistantState;
    transcript: string;
    toggleAssistant: () => void;
    triggerListenManually: () => void;
    triggerDescribeManually: () => void;
  };
}

const EXAMPLE_DESCRIPTIONS = [
  'A kitchen with a table in the center, a fridge in the corner, a sink under the window, and a stove next to the fridge.',
  'A living room with a sofa against the wall, a table in front of it, a lamp in the corner, and a TV on the opposite wall.',
  'A bedroom with a bed against the north wall, a desk by the window, a shelf near the door, and a lamp on the desk.',
  'An office with a desk in the center, a chair behind it, a bookshelf on the left wall, and a door on the right.',
];

export default function DescribeScreen({ onSubmit, isGenerating, error, voiceAssistant }: DescribeScreenProps) {
  const [description, setDescription] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync speech transcript into description textarea
  useEffect(() => {
    if (voiceAssistant.transcript) {
      setDescription(voiceAssistant.transcript);
    }
  }, [voiceAssistant.transcript]);

  // Focus textarea on mount for immediate keyboard access
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = description.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const useExample = (idx: number) => {
    setDescription(EXAMPLE_DESCRIPTIONS[idx]);
    textareaRef.current?.focus();
  };

  return (
    <main className="describe-screen" role="main" aria-label="EchoRoom scene description">
      {/* Skip link for screen readers */}
      <a href="#scene-input" className="skip-link">Skip to scene input</a>

      <div className="describe-hero">
        <div className="logo-glow" aria-hidden="true"></div>
        <h1 className="app-title">
          <span className="title-echo">Echo</span><span className="title-room">Room</span>
        </h1>
        <p className="tagline">See a room with your ears</p>
        <p className="subtitle">
          Describe a room and explore it through spatial audio.
          <br />
          Built for blind and low-vision users.
        </p>
      </div>

      {/* Voice Assistant Panel */}
      <div
        className={`voice-assistant-card ${voiceAssistant.assistantState === 'capturing' ? 'is-capturing' : ''}`}
        role="region"
        aria-label="Hands-free Voice Assistant"
      >
        <div className="va-header">
          <div className="va-status-pill">
            <span className={`va-dot ${voiceAssistant.assistantState}`}></span>
            <span className="va-status-text">
              {voiceAssistant.assistantState === 'capturing' && '🎙️ Listening... (Speak your room details, say "Describe" or click Generate when done)'}
              {voiceAssistant.assistantState === 'standby' && '🎙️ Voice Assistant Active — Speak your room details, or say "Describe" to generate'}
              {voiceAssistant.assistantState === 'generating' && '✨ Generating scene based on your spoken description...'}
              {voiceAssistant.assistantState === 'idle' && '🎙️ Voice Assistant Paused'}
              {voiceAssistant.assistantState === 'denied' && '⚠️ Microphone permission denied — please allow mic access in browser'}
              {voiceAssistant.assistantState === 'unsupported' && '⚠️ Web Speech not supported in this browser'}
            </span>
          </div>
          <button
            type="button"
            onClick={voiceAssistant.toggleAssistant}
            className="va-toggle-btn"
            aria-label={voiceAssistant.isEnabled ? 'Deactivate Voice Assistant' : 'Activate Voice Assistant'}
          >
            {voiceAssistant.isEnabled ? 'Voice: ON' : 'Voice: OFF'}
          </button>
        </div>

        <div className="va-actions">
          <button
            type="button"
            onClick={voiceAssistant.triggerListenManually}
            className={`va-btn va-listen-btn ${voiceAssistant.assistantState === 'capturing' ? 'active' : ''}`}
            aria-label="Start voice recording now"
          >
            {voiceAssistant.assistantState === 'capturing' ? '🔴 Recording... (Tap to reset)' : '🎙️ Tap to Speak'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (description.trim()) {
                onSubmit(description.trim());
              } else {
                voiceAssistant.triggerDescribeManually();
              }
            }}
            disabled={isGenerating || (!description.trim() && !voiceAssistant.transcript.trim())}
            className="va-btn va-describe-btn"
            aria-label="Generate scene from description (or say 'describe')"
          >
            ⚡ Generate Scene ("Describe")
          </button>
        </div>
      </div>

      <div className="input-card">
        <label htmlFor="scene-input" className="input-label">
          Describe your room
        </label>
        <textarea
          ref={textareaRef}
          id="scene-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. A library with a reading table in the center, a bookshelf on the west wall, and a window on the north wall..."
          aria-describedby="input-help"
          rows={4}
          disabled={isGenerating}
          className="scene-textarea"
        />
        <p id="input-help" className="help-text">
          Speak naturally with Voice Assistant, or type here. Say "Describe" or press Enter to generate.
        </p>

        <button
          onClick={handleSubmit}
          disabled={isGenerating || description.trim().length === 0}
          className="generate-btn"
          aria-label={isGenerating ? 'Generating scene, please wait' : 'Generate the audio scene from your description'}
        >
          {isGenerating ? (
            <span className="btn-loading">
              <span className="spinner" aria-hidden="true"></span>
              Generating...
            </span>
          ) : (
            'Generate Scene'
          )}
        </button>

        {error && (
          <div className="error-message" role="alert" aria-live="assertive">
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}
      </div>

      <div className="examples-section">
        <p className="examples-label">Try an example:</p>
        <div className="examples-grid">
          {EXAMPLE_DESCRIPTIONS.map((ex, i) => (
            <button
              key={i}
              onClick={() => useExample(i)}
              className="example-btn"
              aria-label={`Use example: ${ex.substring(0, 50)}...`}
              disabled={isGenerating}
            >
              {ex.substring(0, 60)}...
            </button>
          ))}
        </div>
      </div>

      <footer className="describe-footer">
        <p>Use headphones for the best spatial audio experience. Hands-free voice assistant enabled.</p>
      </footer>

      {/* ARIA live region for dynamic announcements */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only" role="status">
        {isGenerating ? 'Generating your scene, please wait.' : ''}
        {error || ''}
      </div>
    </main>
  );
}
