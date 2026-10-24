import { Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { loadPref, savePref } from '@/utils/prefs.js';

export default function MuteButton() {
  const [mute, setMute] = useState(() => loadPref('flow-mute', false));
  const toggle = () => (savePref('flow-mute', !mute), setMute(!mute));
  return <Button variant="ghost" size="sm" icon={mute ? VolumeX : Volume2} onClick={toggle} title={mute ? 'Sound off' : 'Sound on'} aria-label={mute ? 'Turn sound on' : 'Turn sound off'} />;
}
