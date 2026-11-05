import { useSyncExternalStore } from 'react';

export const ROUTES = [
  { id: 'configure', label: 'Configure' },
  { id: 'explore', label: 'Explore' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'about', label: 'About' },
];

const parse = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.some((r) => r.id === id) ? id : 'configure';
};

function subscribe(callback) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

/** Current page id, from the URL hash. */
export const useRoute = () => useSyncExternalStore(subscribe, parse);

export function navigate(id) {
  window.location.hash = `/${id}`;
}
