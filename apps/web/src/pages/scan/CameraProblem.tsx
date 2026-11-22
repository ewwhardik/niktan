import { motion } from 'motion/react';
import { CameraOff, Lock, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CameraError } from '../../cv/camera';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { spring } from '../../ui/motion';

const COPY: Record<CameraError, { hi: string; en: string }> = {
  denied: {
    hi: 'कैमरे की अनुमति नहीं मिली। ब्राउज़र के पता-बार में 🔒 पर टैप करें → कैमरा → अनुमति दें, फिर दोबारा कोशिश करें।',
    en: 'Camera permission was blocked. Tap the 🔒 in the address bar → Camera → Allow, then try again.',
  },
  unavailable: { hi: 'इस फ़ोन पर कैमरा नहीं मिला। यह स्टेप छोड़ दें।', en: 'No camera found on this device. Skip this step.' },
  insecure: { hi: 'कैमरा सिर्फ़ सुरक्षित (https) लिंक पर चलता है।', en: 'The camera only works on a secure (https) link.' },
  unknown: { hi: 'कैमरा शुरू नहीं हो पाया। दूसरे ऐप बंद करके फिर कोशिश करें।', en: 'The camera could not start. Close other apps using it and try again.' },
};

export function CameraProblem({ error, onRetry, onSkip }: { error: CameraError; onRetry: () => void; onSkip: () => void }) {
  const { t, i18n } = useTranslation();
  const Icon = error === 'denied' ? Lock : CameraOff;
  return (
    <div className="flex flex-1 flex-col">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.reveal} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-seetoday-tint text-seetoday-ink">
          <Icon size={30} strokeWidth={1.5} aria-hidden />
        </span>
        <p className="max-w-xs text-body-lg text-text-2">{i18n.language === 'en' ? COPY[error].en : COPY[error].hi}</p>
      </motion.div>
      <Dock>
        {error !== 'unavailable' && (
          <Button icon={RefreshCw} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
        <LinkButton onClick={onSkip}>{t('common.skip')}</LinkButton>
      </Dock>
    </div>
  );
}
