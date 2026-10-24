import { BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { GuideView, Panel } from '@/engine/FormControls.jsx';
import Grid from '@/engine/Grid.jsx';
import Station from './Station.jsx';

/** the station's instructions and guide files */
export default function Guide({ e }) {
  const { values, fire, vis, ctl } = e;
  const files = ctl('LBGuideFiles');
  return (
    <Panel
      title={<span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /> Station guide</span>}
      actions={<Button variant="ghost" size="sm" icon={X} onClick={() => fire('IMBGuideClose')}>Hide</Button>}
    >
      <div className="space-y-3">
        {files?.options?.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {!vis('RightTop') && ctl('GuideFileDisplayPanel')?.guide && <Button variant="outline" size="sm" onClick={() => fire('BtnToggleGuide')}>Show document</Button>}
            {files.options.filter((o) => o.value !== '').map((o) => (
              <Button key={o.value} variant={values.LBGuideFiles === o.value ? 'default' : 'outline'} size="sm" onClick={() => e.change('LBGuideFiles', o.value)}>{o.text}</Button>
            ))}
          </div>
        )}
        {vis('RightBottom') && values.GVInstruction?.length > 0 && <Grid c={ctl('GVInstruction')} rows={values.GVInstruction} />}
        {vis('GuideFileDisplayPanel') && ctl('GuideFileDisplayPanel')?.guide && <GuideView g={ctl('GuideFileDisplayPanel').guide} />}
      </div>
    </Panel>
  );
}
