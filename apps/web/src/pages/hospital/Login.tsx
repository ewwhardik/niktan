import { motion } from 'motion/react';
import { Delete, Hospital } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, writeStaffToken } from '../../lib/api';
import { haptic } from '../../lib/perf';
import { Screen, TopBar } from '../../ui/Layout';
import { spring } from '../../ui/motion';

interface HospitalRow {
  id: string;
  name_hi: string;
  name_en: string;
}

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [hid, setHid] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    api.get<HospitalRow[]>('/api/queue/hospitals').then((h) => {
      setHospitals(h);
      setHid((x) => x ?? h[0]?.id ?? null);
    }).catch(() => setError(t('common.offline')));
  }, [t]);

  const submit = async (value: string) => {
    if (!hid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ token: string; role: string }>('/api/hospital/login', { hospitalId: hid, pin: value });
      writeStaffToken(r.token);
      haptic(20);
      navigate(r.role === 'admin' ? '/hospital/admin' : '/hospital/board');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? (i18n.language === 'en' ? 'Wrong PIN' : 'गलत पिन') : e instanceof ApiError && e.status === 429 ? e.message : t('common.error'));
      setShake((n) => n + 1);
      haptic([30, 40, 30]);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (k: string) => {
    if (busy) return;
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    const v = (pin + k).slice(0, 4);
    setPin(v);
    if (v.length === 4) void submit(v);
  };

  return (
    <Screen>
      <TopBar onBack={() => navigate('/')} title={t('hospital.login')} />
      <div className="mt-4 flex flex-col gap-2">
        {hospitals.map((h) => (
          <button key={h.id} onClick={() => setHid(h.id)} className={`flex min-h-14 items-center gap-3 rounded-md border px-4 text-left text-body-lg ${hid === h.id ? 'border-transparent bg-accent-soft text-accent-soft-ink' : 'border-border bg-surface'}`}>
            <Hospital size={20} aria-hidden /> {i18n.language === 'en' ? h.name_en : h.name_hi}
          </button>
        ))}
      </div>
      <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.35 }} className="mt-8 flex justify-center gap-4" aria-label={t('hospital.pin')}>
        {[0, 1, 2, 3].map((i) => (
          <motion.span key={i} animate={{ scale: pin.length > i ? 1 : 0.7, opacity: pin.length > i ? 1 : 0.35 }} transition={spring.chip} className="size-4 rounded-full bg-text" />
        ))}
      </motion.div>
      {error && <p className="mt-3 text-center text-body text-emergency-text" role="alert">{error}</p>}
      <div className="mx-auto mt-6 grid w-full max-w-xs grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <motion.button key={k} whileTap={{ scale: 0.9 }} transition={spring.tap} onClick={() => press(k)} aria-label={k === 'del' ? 'delete' : k} className="tnum flex h-16 items-center justify-center rounded-full bg-surface text-title-1 shadow-1">
              {k === 'del' ? <Delete size={22} /> : k}
            </motion.button>
          ),
        )}
      </div>
      <p className="mt-6 text-center text-caption text-text-3">Demo PINs: nurse 2468 · doctor 1357 · admin 9090</p>
    </Screen>
  );
}
