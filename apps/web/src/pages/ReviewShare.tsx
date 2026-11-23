import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../ui/BrandMark';

/** A screen to project or print at the venue: scan to review NikTan. */
export default function ReviewShare() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const url = `${window.location.origin}/review`;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-10 text-center text-[#1d1d1f] print:py-0">
      <button onClick={() => navigate('/')} className="flex items-center gap-2.5" aria-label="NikTan">
        <BrandMark className="size-9" />
        <span className="text-title-2 font-semibold">NikTan</span>
      </button>
      <h1 className="mt-6 max-w-xl text-[clamp(2rem,5vw,3.25rem)] leading-tight font-semibold tracking-tight">{t('review.shareTitle')}</h1>
      <p className="mt-3 max-w-md text-body-lg text-[#515154]">{t('review.shareSub')}</p>
      <div className="mt-8 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(30,50,120,0.45),0_0_0_1px_rgba(17,24,39,0.06)]">
        <QRCodeSVG value={url} size={300} level="M" marginSize={0} />
      </div>
      <p className="mt-6 text-title-3 font-semibold tracking-tight">{url.replace(/^https?:\/\//, '')}</p>
      <div className="mt-8 flex gap-3 print:hidden">
        <button onClick={() => window.print()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1d1d1f] px-6 text-body font-semibold text-white">
          <Printer size={18} aria-hidden /> {t('review.print')}
        </button>
        <button onClick={() => navigate('/review')} className="inline-flex min-h-12 items-center rounded-full border border-black/10 px-6 text-body font-semibold">
          {t('review.openForm')}
        </button>
      </div>
    </main>
  );
}
