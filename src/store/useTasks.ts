import { useEffect, useReducer, useRef } from 'react';
import type { AppState } from '../types';
import { loadState, saveState } from './storage';
import { tasksReducer, type Action } from './tasksReducer';

const SAVE_DEBOUNCE_MS = 200;

/**
 * App state backed by localStorage. Writes are debounced so a burst of edits
 * (typing in the notes field) doesn't serialize the whole store on every keystroke.
 */
export function useTasks(): [AppState, React.Dispatch<Action>] {
  const [state, dispatch] = useReducer(tasksReducer, undefined, loadState);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => saveState(state), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  // A debounced write can still be pending when the tab closes; flush it.
  useEffect(() => {
    const flush = () => saveState(state);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [state]);

  return [state, dispatch];
}
