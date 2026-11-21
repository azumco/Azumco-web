// A minimal client router for /team/*, in the same spirit as main.tsx:
// read the pathname, render a matching page. No router dependency.

import { useEffect, useState } from 'react';

const EVENT = 'team:navigate';

export function navigate(to: string) {
  if (to === window.location.pathname) return;
  window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/team');
  useEffect(() => {
    const update = () => setPath(window.location.pathname.replace(/\/+$/, '') || '/team');
    window.addEventListener('popstate', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return path;
}
