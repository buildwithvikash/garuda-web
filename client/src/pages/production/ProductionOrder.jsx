// Production Order
// Sidebar: Production › Production Order. Its own API: /api/production/orders (features/production-orders).
import { ClipboardList, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shared';
import { Button } from '@/components/ui/button.jsx';
import OrderForm from '@/features/production-orders/OrderForm.jsx';
import OrderList from '@/features/production-orders/OrderList.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/production/productionorderform';

export default function ProductionOrder() {
  // ?order=<PRODNo> open, ?order=new a new one, none: the list (so a refresh or a shared link keeps the place)
  const [params, setParams] = useSearchParams();
  const open = params.get('order');
  const show = (value) => setParams(value ? { order: value } : {});
  return (
    <Page
      icon={ClipboardList}
      title="Production Order"
      subtitle={open ? 'Product, quantity and service requests of one order' : 'Saved orders — click one to open it'}
      actions={!open && <Button size="sm" icon={Plus} onClick={() => show('new')}>Add new</Button>}
    >
      {open ? (
        <OrderForm key={open} prodNo={open === 'new' ? null : open} onBack={() => show(null)} onSaved={(prodNo) => show(prodNo)} />
      ) : (
        <OrderList onOpen={show} />
      )}
    </Page>
  );
}
