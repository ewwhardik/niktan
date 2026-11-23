import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource-variable/noto-serif-devanagari/wght.css';
import './styles/app.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { perfTier, trackKeyboardInset } from './lib/perf';
import { ScanProvider } from './state/scan';
import { runBoot } from './lib/boot';
import i18n from './i18n';

document.documentElement.dataset.perf = perfTier;
document.documentElement.lang = i18n.language === 'en' ? 'en' : 'hi';
trackKeyboardInset();
runBoot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ScanProvider>
          <App />
        </ScanProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
