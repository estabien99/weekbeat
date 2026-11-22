import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useState } from 'react';
import type { Id, Profile } from '../core/index.ts';
import { db } from './db.ts';

const KEY = 'weekbeat.activeProfile';

function readSaved(): Id | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Which person this device is showing; remembered per device, falls back to the first profile. */
export function useActiveProfile(): {
  profiles: Profile[] | undefined;
  active: Profile | undefined;
  select: (id: Id) => void;
} {
  const [saved, setSaved] = useState<Id | null>(readSaved);
  // Household order (who was added first), not storage order.
  const profiles = useLiveQuery(async () => {
    const [all, household] = await Promise.all([db.profiles.toArray(), db.households.toCollection().first()]);
    const order = household?.memberIds ?? [];
    return all.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, []);
  const active = profiles?.find((p) => p.id === saved) ?? profiles?.[0];
  const select = useCallback((id: Id) => {
    setSaved(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* per-device convenience only */
    }
  }, []);
  return { profiles, active, select };
}
