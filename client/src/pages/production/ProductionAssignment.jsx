// Production Assignment (sidebar: Production › Production Assignment): start an order at its first stage and print
// the job cards. No list of saved records (the original screen had none).
//   ProductionAssignment/Form.jsx            the screen
//   ProductionAssignment/useAssignment.js    its state and server calls
//   ProductionAssignment/assignmentsApi.js   /api/production/assignments
import AssignmentForm from './ProductionAssignment/Form.jsx';

export const route = '/production/productionassignmentform';

export default function ProductionAssignment() {
  return <AssignmentForm />;
}
