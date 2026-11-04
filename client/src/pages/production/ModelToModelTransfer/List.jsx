// Model To Model Transfer: the history (table ModelToModel), read only, with a search on one column.
import RecordsList from '@/components/shared/RecordsList.jsx';
import { transfersApi } from './transfersApi.js';

const source = { list: transfersApi.history, columns: transfersApi.historyColumns, values: transfersApi.historyValues };

export default function TransferHistory() {
  return <RecordsList tableId="/production/modeltomodeltransferform" exportName="model-to-model-transfer" source={source} />;
}
