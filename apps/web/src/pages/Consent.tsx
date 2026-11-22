import { motion } from 'motion/react';
import { Ban, CloudUpload, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { riseChild, staggerParent } from '../ui/motion';

export function Consent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rows = [
    { icon: Smartphone, title: t('consent.onDevice'), body: t('consent.onDeviceList'), tone: 'text-routine-text' },
    { icon: CloudUpload, title: t('consent.uploaded'), body: t('consent.uploadedList'), tone: 'text-accent-text' },
    { icon: Ban, title: t('consent.notStored'), body: t('consent.notStoredList'), tone: 'text-emergency-text' },
  ];
  return (
    <Screen>
      <TopBar onBack={() => navigate('/')} />
      <motion.div variants={staggerParent} initial="hidden" animate="show" className="flex flex-1 flex-col">
        <motion.h1 variants={riseChild} className="mt-4 text-title-1 font-semibold">
          {t('consent.title')}
        </motion.h1>
        <p className="mt-3 text-body-lg text-text-2">{t('consent.purpose')}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map(({ icon: Icon, title, body, tone }) => (
            <motion.li key={title} variants={riseChild} className="flex gap-4 rounded-lg bg-surface p-4 shadow-1">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-md bg-sunken ${tone}`}>
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-title-3 font-semibold">{title}</p>
                <p className="mt-0.5 text-body text-text-2">{body}</p>
              </div>
            </motion.li>
          ))}
        </ul>
        <motion.p variants={riseChild} className="mt-5 text-body text-text-3">
          {t('consent.retention')}
        </motion.p>
      </motion.div>
      <Dock>
        <Button onClick={() => navigate('/info', { state: { consented: true } })}>{t('consent.agree')}</Button>
      </Dock>
    </Screen>
  );
}
