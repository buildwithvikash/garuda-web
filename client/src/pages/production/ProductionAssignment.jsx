// Production Assignment
// Sidebar: Production › Production Assignment. Its own API: /api/production/assignments (features/production-assignment).
import { Printer } from 'lucide-react';
import { Page } from '@/components/shared';
import AssignmentForm from '@/features/production-assignment/AssignmentForm.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/production/productionassignmentform';

export default function ProductionAssignment() {
  return (
    <Page icon={Printer} title="Production Assignment" subtitle="Start a production order at its first stage and print the job cards">
      <AssignmentForm />
    </Page>
  );
}
