import { useState, useRef, useEffect, useCallback } from 'react';
import { type ObjectInfo } from '../scene/geometryUtils';
import { type SceneGraph } from '../scene/sceneGraphTypes';
import { type GpsLocation, type GpsStatus } from '../controls/useGpsTracker';
import DebugCanvas from './DebugCanvas';

interface ExploreScreenProps {
  sceneGraph: SceneGraph;
  listener: { position: { x: number; z: number }; facingAngle: number };
  objectInfos: ObjectInfo[];
  announcement: string;
  showFreeTextInput: boolean;
  onQueryNearMe: () => void;
  onRequestRecap: () => void;
  onFreeTextQuery: (question: string) => void;
  onCloseFreeText: () => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onTurnLeft: () => void;
  onTurnRight: () => void;
  onNewScene: () => void;
  voiceAssistant?: {
    isEnabled: boolean;
    assistantState: string;
    toggleAssistant: () => void;
  };
  gpsTracker?: {
    isGpsEnabled: boolean;
    gpsStatus: GpsStatus;
    currentCoords: GpsLocation | null;
    totalDistanceMoved: number;
    toggleGps: () => void;
    resetOrigin: () => void;
  };
}

function facingToCompass(angle: number): string {
  // Normalize to [0, 2π]
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  const deg = (a * 180) / Math.PI;

  if (deg < 22.5 || deg >= 337.5) return 'East';
  if (deg < 67.5) return 'South-East';
  if (deg < 112.5) return 'South';
  if (deg < 157.5) return 'South-West';
  if (deg < 202.5) return 'West';
  if (deg < 247.5) return 'North-West';
  if (deg < 292.5) return 'North';
  return 'North-East';
}

export default function ExploreScreen({
  sceneGraph,
  listener,
  objectInfos,
  announcement,
  showFreeTextInput,
  onQueryNearMe,
  onRequestRecap,
  onFreeTextQuery,
  onCloseFreeText,
  onMoveForward,
  onMoveBackward,
  onTurnLeft,
  onTurnRight,
  onNewScene,
  voiceAssistant,
  gpsTracker,
}: ExploreScreenProps) {
  const [freeText, setFreeText] = useState('');
  const freeTextRef = useRef<HTMLInputElement>(null);

  // Focus free-text input when shown
  useEffect(() => {
    if (showFreeTextInput) {
      freeTextRef.current?.focus();
    }
  }, [showFreeTextInput]);

  const handleFreeTextSubmit = () => {
    const trimmed = freeText.trim();
    if (trimmed.length > 0) {
      onFreeTextQuery(trimmed);
      setFreeText('');
    }
  };

  const handleFreeTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFreeTextSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCloseFreeText();
    }
  };

  // Sort objects by distance for display
  const sortedInfos = [...objectInfos].sort((a, b) => a.distance - b.distance);

  return (
    <main className="explore-screen" role="main" aria-label="EchoRoom explore mode">
      {/* Header */}
      <header className="explore-header">
        <div className="explore-title-group">
          <h1 className="explore-title">
            <span className="title-echo">Echo</span><span className="title-room">Room</span>
            <span className="mode-badge">Exploring</span>
          </h1>
          {voiceAssistant?.isEnabled && (
            <div className="voice-status-pill" role="status" aria-label="Voice commands active">
              <span className="va-dot standby"></span>
              <span>🎙️ Voice Active ("Near me", "Recap", "Forward", "Listen")</span>
            </div>
          )}
        </div>
        <div className="explore-header-actions">
          {gpsTracker && (
            <button
              onClick={gpsTracker.toggleGps}
              className={`gps-toggle-btn ${gpsTracker.isGpsEnabled ? 'active' : ''}`}
              aria-label={gpsTracker.isGpsEnabled ? 'Disable GPS movement tracking' : 'Enable real-world GPS movement tracking'}
            >
              📍 GPS: {gpsTracker.isGpsEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          <button onClick={onNewScene} className="new-scene-btn" aria-label="Describe a new scene">
            New Scene
          </button>
        </div>
      </header>

      {/* GPS Movement Panel (when active) */}
      {gpsTracker?.isGpsEnabled && (
        <div className="gps-banner-card" role="region" aria-label="GPS Movement Tracking">
          <div className="gps-banner-header">
            <span className="gps-icon">📍</span>
            <span className="gps-banner-title">
              Real-World GPS Movement Tracking {gpsTracker.gpsStatus === 'active' ? '🟢 Active' : gpsTracker.gpsStatus === 'acquiring' ? '🟡 Acquiring...' : '⚪'}
            </span>
            <button onClick={gpsTracker.resetOrigin} className="gps-reset-btn" aria-label="Reset GPS reference to current spot">
              Reset Center
            </button>
          </div>
          <div className="gps-stats-grid">
            <div className="gps-stat-item">
              <span className="stat-label">Accuracy:</span>
              <span className="stat-value">{gpsTracker.currentCoords ? `±${gpsTracker.currentCoords.accuracy}m` : 'Measuring...'}</span>
            </div>
            <div className="gps-stat-item">
              <span className="stat-label">Distance Walked:</span>
              <span className="stat-value">{gpsTracker.totalDistanceMoved.toFixed(1)} m</span>
            </div>
            <div className="gps-stat-item">
              <span className="stat-label">Coords:</span>
              <span className="stat-value">
                {gpsTracker.currentCoords
                  ? `${gpsTracker.currentCoords.latitude.toFixed(5)}, ${gpsTracker.currentCoords.longitude.toFixed(5)}`
                  : 'Acquiring...'}
              </span>
            </div>
          </div>
          <p className="gps-help-hint">
            As you walk in the real world with your device, your position and footsteps in the 3D room will update automatically!
          </p>
        </div>
      )}

      {/* Controls help */}
      <div className="controls-help" role="region" aria-label="Controls guide">
        <div className="controls-grid">
          <div className="control-item"><kbd>W</kbd><kbd>↑</kbd> Forward</div>
          <div className="control-item"><kbd>S</kbd><kbd>↓</kbd> Backward</div>
          <div className="control-item"><kbd>A</kbd><kbd>←</kbd> Turn Left</div>
          <div className="control-item"><kbd>D</kbd><kbd>→</kbd> Turn Right</div>
          <div className="control-item"><kbd>Q</kbd><kbd>Space</kbd> Near Me</div>
          <div className="control-item"><kbd>E</kbd> Ask Question</div>
          <div className="control-item"><kbd>R</kbd> Full Recap</div>
        </div>
      </div>

      {/* Status bar */}
      <div className="status-bar" role="status" aria-label="Listener position">
        <div className="status-position">
          Position: ({listener.position.x.toFixed(1)}, {listener.position.z.toFixed(1)})
        </div>
        <div className="status-facing">
          Facing: {facingToCompass(listener.facingAngle)}
        </div>
        <div className="status-room">
          {sceneGraph.room.name} ({sceneGraph.room.dimensions.width}m × {sceneGraph.room.dimensions.depth}m)
        </div>
      </div>

      {/* Main content area */}
      <div className="explore-content">
        {/* Debug canvas */}
        <div className="canvas-panel">
          <DebugCanvas
            sceneGraph={sceneGraph}
            listener={listener}
          />
          <p className="canvas-note" aria-hidden="true">
            Debug view — not required for use
          </p>
        </div>

        {/* Info panel */}
        <div className="info-panel">
          {/* Action buttons */}
          <div className="action-buttons" role="toolbar" aria-label="Exploration actions">
            <button onClick={onMoveForward} className="action-btn move-btn" aria-label="Move forward">
              ↑ Forward
            </button>
            <div className="action-row">
              <button onClick={onTurnLeft} className="action-btn turn-btn" aria-label="Turn left">
                ← Turn
              </button>
              <button onClick={onMoveBackward} className="action-btn move-btn" aria-label="Move backward">
                ↓ Back
              </button>
              <button onClick={onTurnRight} className="action-btn turn-btn" aria-label="Turn right">
                Turn →
              </button>
            </div>
            <div className="action-row query-row">
              <button onClick={onQueryNearMe} className="action-btn query-btn" aria-label="What is near me?">
                What's Near Me?
              </button>
              <button onClick={onRequestRecap} className="action-btn recap-btn" aria-label="Full room recap">
                Full Recap
              </button>
            </div>
          </div>

          {/* Free-text query */}
          {showFreeTextInput && (
            <div className="free-text-panel" role="dialog" aria-label="Ask a spatial question">
              <label htmlFor="free-text-input" className="free-text-label">
                Ask a question about the space:
              </label>
              <div className="free-text-row">
                <input
                  ref={freeTextRef}
                  id="free-text-input"
                  type="text"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  onKeyDown={handleFreeTextKeyDown}
                  placeholder="e.g. Where is the table? What's to my left?"
                  className="free-text-input"
                  aria-describedby="free-text-help"
                />
                <button onClick={handleFreeTextSubmit} className="action-btn query-btn" aria-label="Submit question">
                  Ask
                </button>
              </div>
              <p id="free-text-help" className="help-text">
                Press Enter to ask, Escape to close
              </p>
            </div>
          )}

          {/* Objects list */}
          <div className="objects-panel" role="region" aria-label="Objects in the room">
            <h2 className="panel-heading">Nearby Objects</h2>
            {sortedInfos.length === 0 ? (
              <p className="empty-note">No objects detected.</p>
            ) : (
              <ul className="objects-list">
                {sortedInfos.map((info, i) => (
                  <li
                    key={i}
                    className={`object-item ${info.distance <= 1.5 ? 'very-near' : info.distance <= 3 ? 'near' : 'far'}`}
                    aria-label={`${info.label}, ${info.distance.toFixed(1)} meters, ${info.relativeDirection.replace('-', ' ')}`}
                  >
                    <span className="obj-label">{info.label}</span>
                    <span className="obj-distance">{info.distance.toFixed(1)}m</span>
                    <span className="obj-direction">{info.relativeDirection.replace('-', ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ARIA live region for announcements */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>
    </main>
  );
}
