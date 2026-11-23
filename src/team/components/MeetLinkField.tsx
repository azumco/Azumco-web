// A founder's reusable Google Meet link: validated as they type, saved with
// the given request. Used on the Calendar page (your own) and in Settings
// (the super admin, for any founder).

import { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import { MEET_LINK_ERROR, MEET_LINK_HELP, normalizeMeetLink } from '../../../shared/meet';
import { useAction } from '../hooks';
import { Button, ErrorText, Field } from '../ui';

export default function MeetLinkField({ value, onSave, label = 'Google Meet link' }: { value: string; onSave: (link: string) => Promise<unknown>; label?: string }) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => setText(value), [value]);
  const clean = normalizeMeetLink(text);
  const invalid = text.trim() !== '' && clean === null;
  const save = async () => {
    if (clean === null) return;
    if ((await run(() => onSave(clean))) !== undefined) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };
  return (
    <div>
      <div className="flex items-end gap-2">
        <Field label={label} type="url" inputMode="url" autoComplete="off" placeholder="https://meet.google.com/abc-defg-hij" value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1" />
        <Button size="sm" variant="secondary" busy={busy} disabled={invalid || (clean ?? '') === value} onClick={save}>{saved ? 'Saved' : 'Save'}</Button>
      </div>
      {invalid ? <p className="mt-1.5 text-xs text-warn">{MEET_LINK_ERROR}</p> : (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-fg-3"><Video className="mt-0.5 h-3.5 w-3.5 shrink-0" />{MEET_LINK_HELP}</p>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </div>
  );
}
