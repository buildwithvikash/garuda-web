import { useEffect, useState } from 'react';
import { api } from '@/api.js';

/** the screen's first state (/forms/spec: Page_Load already run) */
export function useSpec(path) {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/forms/spec?path=${encodeURIComponent(path)}`).then(setSpec, (e) => setError(e.message));
  }, [path]);
  return { spec, error };
}
