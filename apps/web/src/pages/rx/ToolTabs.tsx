import { motion } from 'motion/react';
import { FileText, FlaskConical, PiggyBank } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

export type Tool = 'rx' | 'saver' | 'lab';
export const TOOLS: { id: Tool; icon: typeof FileText }[] = [
  { id: 'rx', icon: FileText },
  { id: 'saver', icon: PiggyBank },
  { id: 'lab', icon: FlaskConical },
];

export function useTool(): [Tool, (t: Tool) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tool');
  const tool: Tool = raw === 'saver' || raw === 'lab' ? raw : 'rx';
  return [tool, (next) => setParams(next === 'rx' ? {} : { tool: next }, { replace: true })];
}

/** Segmented control: the three paper tools share one page, each opens on its own. */
export function ToolTabs() {
  const { t } = useTranslation();
  const [tool, setTool] = useTool();
  return (
    <div role="tablist" aria-label={t('tools.label')} className="grid grid-cols-3 gap-1 rounded-full bg-sunken p-1">
      {TOOLS.map(({ id, icon: Icon }) => {
        const active = id === tool;
        return (
          <button key={id} role="tab" aria-selected={active} onClick={() => setTool(id)}
            className={`relative inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2 text-label font-medium transition-colors ${active ? 'text-text' : 'text-text-2 hover:text-text'}`}>
            {active && <motion.span layoutId="rx-tool-pill" className="absolute inset-0 rounded-full bg-surface shadow-1 ring-1 ring-border" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            <Icon size={15} className="relative hidden shrink-0 sm:block" aria-hidden />
            <span className="relative truncate sm:hidden">{t(`tools.short.${id}`)}</span>
            <span className="relative hidden truncate sm:inline">{t(`tools.${id}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
