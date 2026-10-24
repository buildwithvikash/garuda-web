// Shown for a route the server does not list for this user, or that does not exist.
import { Home, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyState from '@/components/shared/EmptyState.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function ScreenNotAvailable({ pathname }) {
  return (
    <Page icon={SearchX} title="Screen not available" width="narrow">
      <EmptyState
        icon={SearchX}
        title="This screen is not available"
        description={`There is no screen at ${pathname}, or your role cannot open it. Use the menu or Ctrl+K to find a screen.`}
      >
        <Button asChild>
          <Link to="/start">
            <Home /> Back to home
          </Link>
        </Button>
      </EmptyState>
    </Page>
  );
}
