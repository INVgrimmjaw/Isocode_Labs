import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { listOrders } from '../../api/desk.ts';
import type { OrderStatus } from '../../api/types.ts';
import { formatDateTime, formatRupees } from '../../components/format.ts';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { useAsync } from '../../components/useAsync.ts';

const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  CREDIT_HOLD: { label: 'Credit hold', tone: 'tag-warn' },
  READY: { label: 'Ready', tone: 'tag-accent' },
  EXPORTED: { label: 'In Tally', tone: 'tag-muted' },
  REJECTED: { label: 'Rejected', tone: 'tag-danger' },
};

const FILTERS: { value: OrderStatus | ''; label: string }[] = [
  { value: 'CREDIT_HOLD', label: 'Credit hold' },
  { value: 'READY', label: 'Ready' },
  { value: 'EXPORTED', label: 'In Tally' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
];

export function StatusTag({ status }: { status: OrderStatus }) {
  return <span class={`tag ${STATUS[status].tone}`}>{STATUS[status].label}</span>;
}

export function DeskOrdersPage() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<OrderStatus | ''>('CREDIT_HOLD');
  const { data, error, loading, reload } = useAsync(() => listOrders(filter), [filter]);

  return (
    <>
      <header class="dhead">
        <h1 class="dtitle">Orders</h1>
      </header>

      <div class="dfilters" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            class="chip"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          title={`No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} orders`}
          hint={filter === 'CREDIT_HOLD' ? 'Orders over a credit limit wait here.' : undefined}
        />
      )}
      {data && data.length > 0 && (
        <table class="dtable">
          <thead>
            <tr>
              <th>Order</th>
              <th>Shop</th>
              <th>Source</th>
              <th class="num">Items</th>
              <th class="num">Total</th>
              <th>Status</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((order) => (
              <tr key={order.id} class="dtable-link" onClick={() => navigate(`/desk/orders/${order.id}`)}>
                <td data-label="Order">
                  <Link href={`/desk/orders/${order.id}`} class="dtable-key">
                    {order.label}
                  </Link>
                </td>
                <td data-label="Shop">
                  {order.retailer.shopName}
                  <span class="muted dtable-sub">{order.retailer.area}</span>
                </td>
                <td data-label="Source" class="muted">
                  {order.source === 'AI_CAPTURE' ? 'Message' : 'App'}
                </td>
                <td data-label="Items" class="num">
                  {order.lineCount}
                  {order.freeCases > 0 && <span class="muted"> +{order.freeCases} free</span>}
                </td>
                <td data-label="Total" class="num strong">
                  {formatRupees(order.totalPaise)}
                </td>
                <td data-label="Status">
                  <StatusTag status={order.status} />
                </td>
                <td data-label="Placed" class="muted">
                  {formatDateTime(order.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
