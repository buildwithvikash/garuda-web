// Production Order (sidebar: Production › Production Order): the saved orders, or one order open.
//   ProductionOrder/List.jsx         the saved orders
//   ProductionOrder/Form.jsx         one order (new or saved)
//   ProductionOrder/useOrderForm.js  the form's state and server calls
//   ProductionOrder/ordersApi.js     /api/production/orders
import { useState } from 'react';
import toast from 'react-hot-toast';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import OrderForm from './ProductionOrder/Form.jsx';
import OrderList from './ProductionOrder/List.jsx';

export const route = '/production/productionorderform';

/** ?record=<prodNo> | new in the URL: a refresh reopens that form */
const initialView = () => {
  const r = openedRecord();
  return r ? { kind: 'form', prodNo: r === 'new' ? null : r } : { kind: 'list' };
};

export default function ProductionOrder() {
  const [view, setView] = useState(initialView);
  const [seq, setSeq] = useState(0); // a fresh form each time one is shown
  const remember = useRememberView();

  const show = (v) => {
    setSeq((n) => n + 1);
    setView(v);
    remember(v.kind === 'form' ? { kind: 'form', mode: v.prodNo ? 'edit' : 'new', key: v.prodNo } : v);
  };
  const newOrder = () => show({ kind: 'form', prodNo: null });

  if (view.kind === 'list') return <OrderList onOpen={(prodNo) => show({ kind: 'form', prodNo })} onNew={newOrder} />;
  return (
    <OrderForm
      key={seq}
      prodNo={view.prodNo}
      onBack={() => show({ kind: 'list' })}
      // after Save / Update the screen starts a new order, as the original did
      onSaved={(message) => {
        toast.success(message);
        newOrder();
      }}
    />
  );
}
