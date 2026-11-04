// Material Image Display (sidebar: Production › Material Image Display): scan a unit, see its material's image.
// Server: /api/production/image-display.
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { Step } from '@/components/shared/FormStep.jsx';
import Page from '@/components/shared/Page.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';

export const route = '/production/wrlimagedisply';

export default function ImageDisplay() {
  const [serial, setSerial] = useState('');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!busy) box.current?.focus();
  }, [busy]);

  // the image stays until the next one is found; the box is ready for the next scan either way
  const scan = async () => {
    setBusy(true);
    try {
      const r = await api(`/production/image-display/units/${encodeURIComponent(serial.trim())}`);
      setImage(r.image);
      setSerial('');
    } catch (e) {
      toast.error(e.message, { id: e.message, duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page icon={ImageIcon} title="Image Display" subtitle="Scan a unit to see its material's image">
      <div className="space-y-2">
        <Step n={1} tone="blue" icon={ScanLine} title="Unit" subtitle="Scan the barcode">
          <ScanBox ref={box} size="md" label="Scan Barcode" placeholder="Scan the unit" value={serial} onChange={setSerial} onScan={scan} busy={busy} />
        </Step>
        {image && (
          <Step n={2} tone="emerald" icon={ImageIcon} title="Image">
            <img src={image} alt="The material" className="max-h-[70vh] rounded-lg" />
          </Step>
        )}
      </div>
    </Page>
  );
}
