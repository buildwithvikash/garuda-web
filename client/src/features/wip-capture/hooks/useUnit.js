import { useEffect, useState } from 'react';
import { api } from '@/api.js';
import { route as PATH } from '../constants.js';

/** the scanned unit's route and cabinet (read only); refetched after every event while the serial stays scanned */
export function useUnit(label, tick) {
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!label) return void setUnit(null);
    let live = true;
    api(`/forms/unit?path=${encodeURIComponent(PATH)}&label=${encodeURIComponent(label)}`).then(
      (d) => live && setUnit(d),
      () => live && setUnit(null),
    );
    return () => {
      live = false;
    };
  }, [label, tick]);
  return unit;
}
