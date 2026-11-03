// The station's instructions and guide files.
import { BookOpen, X } from 'lucide-react';
import Grid from '@/components/shared/DataGrid.jsx';
import { GuideView, Panel } from '@/components/shared/FormControls.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function Guide({ s }) {
  const { guide } = s.view;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Station guide
        </span>
      }
      actions={
        <Button variant="ghost" size="sm" icon={X} onClick={s.closeGuide}>
          Hide
        </Button>
      }
    >
      <div className="space-y-3">
        {guide.files.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {guide.canShowDocument && (
              <Button variant="outline" size="sm" onClick={s.guideDocument}>
                Show document
              </Button>
            )}
            {guide.files
              .filter((o) => o.value !== '')
              .map((o) => (
                <Button key={o.value} variant={guide.file === o.value ? 'default' : 'outline'} size="sm" onClick={() => s.guideFile(o.value)}>
                  {o.text}
                </Button>
              ))}
          </div>
        )}
        {guide.instructions && <Grid c={guide.instructions} rows={guide.instructions.rows} />}
        {guide.document && <GuideView g={guide.document} />}
      </div>
    </Panel>
  );
}
