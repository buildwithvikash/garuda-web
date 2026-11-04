// Barcode Printer (sidebar: Settings › Barcode Printer): the label printers, or one open. Plain page on
// /api/masters/printers.
import { MapPin, Printer } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/printerform';

const sections = [
  {
    title: 'Printer', subtitle: 'The printer and how labels reach it', icon: Printer, cols: 3,
    fields: [
      { f: 'printerId', label: 'Printer ID', kind: 'key' },
      { f: 'name', label: 'Printer Name' },
      { f: 'ip', label: 'IP Address' },
      { f: 'driver', label: 'Printer Driver', kind: 'select' },
    ],
  },
  {
    title: 'Location', subtitle: 'Where the printer stands', icon: MapPin, cols: 3,
    fields: [
      { f: 'department', label: 'Department', kind: 'select' },
      { f: 'area', label: 'Area', kind: 'select' },
      { f: 'station', label: 'Station', kind: 'select' },
    ],
  },
];

export default function BarcodePrinter() {
  return <MasterScreen name="printers" title="Barcode Printer" icon={Printer} subtitle="A label printer of this business unit" sections={sections} />;
}
