import { useEffect, useRef, useState } from 'react';
import { shrink } from '../../lib/photo';

/** Camera + gallery inputs with a preview URL that is revoked when replaced. */
export function usePhoto() {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return {
    camera,
    gallery,
    file,
    url,
    pick(input: HTMLInputElement) {
      const next = input.files?.[0];
      input.value = '';
      if (!next) return false;
      setFile(next);
      setUrl(URL.createObjectURL(next));
      return true;
    },
    clear() { setFile(null); setUrl(null); },
    /** Downscaled JPEG for upload; labels and reports stay legible at 2000 px. */
    blob: (max = 2000) => (file && url ? shrink(file, url, max, 0.9) : Promise.resolve(null)),
  };
}
