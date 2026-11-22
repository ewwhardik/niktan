import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  triage,
  type EyeFlags,
  type Hearing,
  type Measurement,
  type ModuleName,
  type Symptoms,
  type TriageResult,
  type Vision,
  type Vitals,
} from '@niktan/core';
import { api } from '../lib/api';
import { load, remove, save } from '../lib/storage';

export interface Profile {
  age: number;
  sex: 'female' | 'male' | 'other';
  pregnant: boolean;
}

export interface Results {
  vitals?: Vitals | null;
  eye?: EyeFlags | null;
  vision?: Vision | null;
  hearing?: Hearing | null;
  symptoms?: Symptoms | null;
}

interface ScanState {
  sessionId: string | null;
  profile: Profile | null;
  results: Results;
  /** Modules whose upload has not reached the server yet (offline or failed). */
  pending: ModuleName[];
  tokenId: string | null;
  startedAt: number | null;
}

const KEY = 'niktan.scan';
const empty: ScanState = { sessionId: null, profile: null, results: {}, pending: [], tokenId: null, startedAt: null };

interface ScanApi extends ScanState {
  begin: (profile: Profile, lang: string) => Promise<void>;
  record: <M extends ModuleName>(module: M, data: Results[M]) => void;
  skip: (module: ModuleName) => void;
  sync: () => Promise<boolean>;
  setToken: (id: string | null) => void;
  reset: () => void;
  /** Same engine as the server, so the card shows instantly and works offline. */
  localTriage: TriageResult | null;
}

const Ctx = createContext<ScanApi | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScanState>(() => load(KEY, empty));
  useEffect(() => save(KEY, state), [state]);

  const upload = useCallback(async (sessionId: string, module: ModuleName, data: unknown) => {
    try {
      await api.post(`/api/sessions/${sessionId}/measurements`, { module, data } as Measurement);
      setState((s) => ({ ...s, pending: s.pending.filter((m) => m !== module) }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const begin = useCallback(async (profile: Profile, lang: string) => {
    let sessionId: string | null = null;
    try {
      sessionId = (await api.post<{ id: string }>('/api/sessions', { ...profile, lang })).id;
    } catch {
      // Offline: the scan still runs; the session is created on the next sync.
    }
    setState({ ...empty, sessionId, profile, startedAt: Date.now() });
  }, []);

  const record = useCallback<ScanApi['record']>(
    (module, data) => {
      setState((s) => ({ ...s, results: { ...s.results, [module]: data }, pending: [...new Set([...s.pending, module])] }));
      if (data && state.sessionId) void upload(state.sessionId, module, data);
    },
    [state.sessionId, upload],
  );

  const skip = useCallback((module: ModuleName) => {
    setState((s) => ({ ...s, results: { ...s.results, [module]: null }, pending: s.pending.filter((m) => m !== module) }));
  }, []);

  const sync = useCallback(async () => {
    let { sessionId } = state;
    if (!state.profile) return false;
    if (!sessionId) {
      try {
        sessionId = (await api.post<{ id: string }>('/api/sessions', { ...state.profile, lang: document.documentElement.lang })).id;
        setState((s) => ({ ...s, sessionId, pending: Object.keys(s.results).filter((k) => s.results[k as ModuleName]) as ModuleName[] }));
      } catch {
        return false;
      }
    }
    const modules = (Object.keys(state.results) as ModuleName[]).filter((m) => state.results[m] && (state.pending.includes(m) || !state.sessionId));
    const ok = await Promise.all(modules.map((m) => upload(sessionId!, m, state.results[m])));
    return ok.every(Boolean);
  }, [state, upload]);

  const localTriage = useMemo(() => {
    if (!state.profile) return null;
    const { results: r, profile } = state;
    return triage({
      ...profile,
      vitals: r.vitals,
      eye: r.eye,
      vision: r.vision,
      hearing: r.hearing,
      symptoms: r.symptoms?.symptoms ?? [],
      redFlags: r.symptoms?.confirmed ? r.symptoms.redFlags : {},
      declinedRedFlags: r.symptoms?.declined ?? [],
    });
  }, [state]);

  const value: ScanApi = {
    ...state,
    begin,
    record,
    skip,
    sync,
    setToken: (tokenId) => setState((s) => ({ ...s, tokenId })),
    reset: () => {
      remove(KEY);
      setState(empty);
    },
    localTriage,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScan(): ScanApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScan outside ScanProvider');
  return v;
}
