'use client';

import { Suspense } from 'react';
import { OrdersBoard } from '@/components/store/orders-board';

// useSearchParams (abre o pedido de ?id=) exige um Suspense acima.
export default function PedidosPage() {
  return (
    <Suspense fallback={null}>
      <OrdersBoard />
    </Suspense>
  );
}
