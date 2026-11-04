// Identification Tag Designs (sidebar: Settings › Tag Design): the label designs (their PRN / ZPL command), or one open,
// with a preview of the command. Plain page on /api/masters/material-tags.
import { FileCode, Image, Tag } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';
import PrnPreview from '@/components/shared/PrnPreview.jsx';

export const route = '/settings/materialtagform';

const sections = [
  {
    title: 'Tag', subtitle: 'The design and what it labels', icon: Tag, cols: 3,
    fields: [
      { f: 'tagCode', label: 'Tag Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'tagType', label: 'TagType', kind: 'select' },
    ],
  },
  {
    title: 'Prn Command', subtitle: 'The printer command, and how it prints', icon: FileCode, cols: 2,
    fields: [
      { f: 'prnCommand', label: 'Prn Command', kind: 'textarea', rows: 18 },
      { f: 'preview', kind: 'custom', render: (r) => <PrnPreview command={String(r.prnCommand ?? '')} /> },
    ],
  },
  { title: 'Tag Image', subtitle: 'A picture of the printed tag', icon: Image, fields: [{ f: 'tagImage', label: 'Tag Image', kind: 'image' }] },
];

export default function IdentificationTagDesign() {
  return <MasterScreen name="material-tags" title="Identification Tag Designs" icon={Tag} subtitle="A label design and its printer command" sections={sections} />;
}
