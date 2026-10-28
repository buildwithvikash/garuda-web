// A page's open form in its URL (?record=<key>, or ?record=new), so a refresh (or a copied link) reopens that form
// instead of the list. The pages call rememberView from their show(), and read openedRecord() once the screen loads.
import { useSearchParams } from 'react-router-dom';

const PARAM = 'record';

/** the record the URL names: a key, 'new', or null (the list) */
export const openedRecord = () => new URLSearchParams(window.location.search).get(PARAM);

/** (view) => the URL updated to it, in place (no new history entry); a view is { kind, mode, key } */
export function useRememberView() {
  const [, setParams] = useSearchParams();
  return (v) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v.kind === 'form') next.set(PARAM, v.mode === 'edit' && v.key != null && v.key !== '' ? String(v.key) : 'new');
        else next.delete(PARAM);
        return next;
      },
      { replace: true },
    );
}
