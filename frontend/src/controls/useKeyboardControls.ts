import { useEffect, useRef, useCallback } from 'react';

/**
 * Keyboard controls hook for EchoRoom explore mode.
 *
 * Controls (active only in explore mode):
 * - Arrow Up / W: move forward one step
 * - Arrow Down / S: move backward one step
 * - Arrow Left / A: turn left
 * - Arrow Right / D: turn right
 * - Q / Space: "what's near me" quick query
 * - E: open free-text question input
 * - R: request full room recap
 *
 * Controls are disabled when a text input or textarea is focused,
 * so free-text Q&A input doesn't interfere with navigation.
 */
export function useKeyboardControls(
  isExploring: boolean,
  handlers: {
    onMoveForward: () => void;
    onMoveBackward: () => void;
    onTurnLeft: () => void;
    onTurnRight: () => void;
    onQueryNearMe: () => void;
    onOpenFreeTextQuery: () => void;
    onRequestRecap: () => void;
  }
): void {
  // Store handlers in refs to avoid stale closures
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const isExploringRef = useRef(isExploring);
  isExploringRef.current = isExploring;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (!isExploringRef.current) return;

      const key = e.key.toLowerCase();
      const h = handlersRef.current;

      switch (true) {
        case key === 'arrowup' || key === 'w':
          e.preventDefault();
          h.onMoveForward();
          break;
        case key === 'arrowdown' || key === 's':
          e.preventDefault();
          h.onMoveBackward();
          break;
        case key === 'arrowleft' || key === 'a':
          e.preventDefault();
          h.onTurnLeft();
          break;
        case key === 'arrowright' || key === 'd':
          e.preventDefault();
          h.onTurnRight();
          break;
        case key === 'q' || key === ' ':
          e.preventDefault();
          h.onQueryNearMe();
          break;
        case key === 'e':
          e.preventDefault();
          h.onOpenFreeTextQuery();
          break;
        case key === 'r':
          e.preventDefault();
          h.onRequestRecap();
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []); // Empty deps — refs handle freshness
}

export default useKeyboardControls;