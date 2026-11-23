import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  triage,
  type EyeFlags,
  type Hearing,
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

export const SCREENING_STEPS = [
  { route: 'face', module: 'vitals' },
  { route: 'eye', module: 'eye' },
  { route: 'vision', module: 'vision' },
  { route: 'hearing', module: 'hearing' },
  { route: 'symptoms', module: 'symptoms' },
] as const;
export type ScreeningStep = (typeof SCREENING_STEPS)[number]['route'];

/**
 * Quick covers what triage needs (pulse, eyes, symptoms) in about three minutes; full adds the
 * vision and hearing tests. Either can add the skipped tests later from the Health Card.
 */
export type Plan = 'quick' | 'full';
const QUICK: readonly ScreeningStep[] = ['face', 'eye', 'symptoms'];
export function stepsFor(plan: Plan): (typeof SCREENING_STEPS)[number][] {
  return SCREENING_STEPS.filter((s) => plan === 'full' || QUICK.includes(s.route));
}
/** Typical minutes per step, for "about N min" hints. */
export const STEP_MINUTES: Record<ScreeningStep, number> = { face: 1, eye: 0.7, vision: 2, hearing: 3, symptoms: 1 };
export const planMinutes = (plan: Plan) => Math.max(1, Math.round(stepsFor(plan).reduce((m, s) => m + STEP_MINUTES[s.route], 0)));

interface ScanState {
  sessionId: string | null;
  profile: Profile | null;
  results: Results;
  /** Modules whose upload has not reached the server yet (offline or failed). */
  pending: ModuleName[];
  tokenId: string | null;
  startedAt: number | null;
  /** Older saved scans have no plan; they ran all five steps. */
  plan?: Plan;
  creation?: { key: string; lang: string };
}

const KEY = 'niktan.scan';
const empty: ScanState = { sessionId: null, profile: null, results: {}, pending: [], tokenId: null, startedAt: null };

function newCreation(lang: string): NonNullable<ScanState['creation']> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return { key: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''), lang };
}

interface ScanApi extends ScanState {
  plan: Plan;
  begin: (profile: Profile, lang: string, plan?: Plan) => Promise<void>;
  setPlan: (plan: Plan) => void;
  record: <M extends ModuleName>(module: M, data: Results[M]) => void;
  skip: (module: ModuleName) => void;
  sync: () => Promise<string | null>;
  deleteScan: () => Promise<void>;
  setToken: (id: string | null) => void;
  /** Same engine as the server, so the card shows instantly and works offline. */
  localTriage: TriageResult | null;
}

const Ctx = createContext<ScanApi | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScanState>(() => {
    const saved = load(KEY, empty);
    if (!saved?.profile) return empty;
    if (!saved.startedAt || Date.now() - saved.startedAt > 30 * 86400_000) {
      remove(KEY);
      return empty;
    }
    // Legacy share URLs contained the owner ID. Re-sync the local copy under a new owner ID.
    if (saved.sessionId?.startsWith('s_')) {
      return { ...saved, sessionId: null, tokenId: null, pending: Object.keys(saved.results) as ModuleName[] };
    }
    return saved;
  });
  const latest = useRef(state);
  const inFlight = useRef<Promise<string | null> | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);

  const update = useCallback((next: ScanState) => {
    latest.current = next;
    if (next.profile) save(KEY, next);
    else remove(KEY);
    setState(next);
  }, []);

  const sync = useCallback((): Promise<string | null> => {
    if (saving.current || !latest.current.profile || !navigator.onLine) return Promise.resolve(null);
    if (inFlight.current) return inFlight.current;
    const version = generation.current;
    const current = () => version === generation.current;
    const run = async () => {
      const controller = new AbortController();
      const deadline = window.setTimeout(() => controller.abort(), 12_000);
      try {
        let { sessionId } = latest.current;
        if (!sessionId) {
          const draft = latest.current;
          const creation = draft.creation ?? newCreation(load('niktan.lang', 'en'));
          if (!draft.creation) update({ ...draft, creation });
          const res = await api.post<{ id: string }>(
            '/api/sessions', { ...draft.profile, lang: creation.lang, creationKey: creation.key }, controller.signal,
          );
          if (!current()) return null;
          sessionId = res.id;
          update({ ...latest.current, sessionId, creation: undefined });
        }
        // Serial writes preserve retake order, including a skip while a previous POST is pending.
        while (current() && latest.current.pending.length) {
          const module = latest.current.pending[0]!;
          const data = latest.current.results[module];
          const path = `/api/sessions/${sessionId}/measurements`;
          if (data) await api.post(path, { module, data }, controller.signal);
          else await api.del(`${path}/${module}`, controller.signal);
          if (current() && latest.current.results[module] === data) {
            update({ ...latest.current, pending: latest.current.pending.filter((m) => m !== module) });
          }
        }
        return current() ? sessionId : null;
      } catch {
        return null;
      } finally {
        clearTimeout(deadline);
      }
    };
    const task = run().finally(() => {
      if (inFlight.current === task) inFlight.current = null;
    });
    inFlight.current = task;
    return task;
  }, [update]);

  useEffect(() => {
    const onReconnect = () => { void sync(); };
    window.addEventListener('online', onReconnect);
    return () => window.removeEventListener('online', onReconnect);
  }, [sync]);

  const begin = useCallback(async (profile: Profile, lang: string, plan: Plan = 'quick') => {
    if (inFlight.current) await inFlight.current;
    generation.current++;
    update({ ...empty, profile, plan, startedAt: Date.now(), creation: newCreation(lang) });
  }, [update]);

  const setPlan = useCallback((plan: Plan) => update({ ...latest.current, plan }), [update]);

  const record = useCallback<ScanApi['record']>((module, data) => {
    const s = latest.current;
    const pending = [...new Set([...s.pending, module])];
    update({ ...s, results: { ...s.results, [module]: data }, pending });
    void sync();
  }, [sync, update]);

  const skip = useCallback((module: ModuleName) => {
    const s = latest.current;
    if (s.results[module] || s.pending.includes(module)) record(module, null);
    else update({ ...s, results: { ...s.results, [module]: null } });
  }, [record, update]);

  const deleteScan = useCallback(async () => {
    saving.current = true;
    try {
      if (inFlight.current) await inFlight.current;
      const id = latest.current.sessionId;
      if (id) await api.del(`/api/sessions/${id}`);
      generation.current++;
      update(empty);
    } finally {
      saving.current = false;
    }
  }, [update]);

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
    plan: state.plan ?? 'full',
    begin,
    setPlan,
    record,
    skip,
    sync,
    deleteScan,
    setToken: (tokenId) => update({ ...latest.current, tokenId }),
    localTriage,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScan(): ScanApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScan outside ScanProvider');
  return v;
}
