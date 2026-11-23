import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Landing } from './pages/Landing';
import { Consent } from './pages/Consent';
import { BasicInfo } from './pages/BasicInfo';

const ScanStep = lazy(() => import('./pages/scan/ScanStep'));
const HealthCard = lazy(() => import('./pages/HealthCard'));
const Queue = lazy(() => import('./pages/Queue'));
const Thali = lazy(() => import('./pages/Thali'));
const ServiceStatus = lazy(() => import('./pages/ServiceStatus'));
const Feedback = lazy(() => import('./pages/Feedback'));
const HospitalLogin = lazy(() => import('./pages/hospital/Login'));
const Board = lazy(() => import('./pages/hospital/Board'));
const TokenDetail = lazy(() => import('./pages/hospital/TokenDetail'));
const Admin = lazy(() => import('./pages/hospital/Admin'));

function OfflineBanner() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-text px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 text-caption text-bg"
          role="status"
        >
          <WifiOff size={16} aria-hidden /> {t('common.offline')}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const MARK = 'M1 27h7c4 0 6-2 9-5C27 11 36 1 51 1c20 0 36 16 36 37v19L61 81V40c0-10-6-16-15-16-6 0-10 3-15 9-4 4-5 7-5 10v37H1Z';

function Loader() {
  const { t } = useTranslation();
  return (
    // Same animation as the boot screen in index.html, whose <style> defines these classes.
    <div className="brand-loader" role="status" aria-label={t('common.loading')}>
      <svg className="nl" viewBox="0 0 88 82" aria-hidden>
        <defs><clipPath id="nl-clip"><path d={MARK} /></clipPath></defs>
        <g clipPath="url(#nl-clip)"><rect className="nl-fill" width="88" height="82" /></g>
        <path className="nl-trace" pathLength={100} d={MARK} />
        <path className="nl-pulse" pathLength={100} d={MARK} />
      </svg>
      <span className="nl-word">NikTan</span>
    </div>
  );
}

export function App() {
  const location = useLocation();
  // Scan steps animate among themselves inside ScanStep; give them one key so the route shell stays put.
  const key = location.pathname.startsWith('/scan') ? '/scan' : location.pathname;
  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<Loader />}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/start" element={<Consent />} />
              <Route path="/info" element={<BasicInfo />} />
              <Route path="/scan/:step" element={<ScanStep />} />
              <Route path="/card" element={<HealthCard key={location.search + location.hash} />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/thali" element={<Thali />} />
              <Route path="/status" element={<ServiceStatus />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/hospital" element={<HospitalLogin />} />
              <Route path="/hospital/board" element={<Board />} />
              <Route path="/hospital/token/:id" element={<TokenDetail />} />
              <Route path="/hospital/admin" element={<Admin />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </motion.main>
        </AnimatePresence>
      </Suspense>
    </>
  );
}
