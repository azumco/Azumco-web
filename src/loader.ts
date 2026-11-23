// Bridge to the logo-reveal loader that lives in index.html (it paints before
// this bundle loads). The app only says "ready" and, in the team portal,
// shows a short message under the logo while the server wakes up.

interface AzLoader {
  ready: () => void;
  message: (text: string) => void;
  replay?: () => void;
}

const api = (): AzLoader | undefined => (window as unknown as { __azLoader?: AzLoader }).__azLoader;

/** The page has rendered: hide the loader (after its reveal, if it is showing). */
export const loaderReady = () => api()?.ready();

/** Small text under the logo (e.g. "Waking up the server…"); '' clears it. */
export const loaderMessage = (text: string) => api()?.message(text);

// Development builds only: window.__azLoader.replay() or ?loader replays it.
if (import.meta.env.DEV) (window as unknown as { azReplayLoader?: () => void }).azReplayLoader = () => api()?.replay?.();
