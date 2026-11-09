import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import type { OrderDetail, OrderLineView, OrderStatus, OrderSummary } from '#shared/api';
import { formatPercent, formatRupees, formatRupeesExact } from '#shared/money';
import { BackIcon, GiftIcon, SearchIcon } from '../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../components/states.tsx';
import { showToast } from '../components/toast.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { formatDateTime, shortName } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { refreshCounts } from './DeskApp.tsx';

export const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
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

export function SourceLabel({ source }: { source: OrderSummary['source'] }) {
  return <span class="muted">{source === 'AI_CAPTURE' ? 'Message' : 'App'}</span>;
}

export function DeskOrdersScreen() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<OrderStatus | ''>('CREDIT_HOLD');
  const [search, setSearch] = useState('');

  const params = new URLSearchParams();
  if (filter && !search) params.set('status', filter);
  if (search) params.set('q', search);
  const query = params.toString();

  const { data, error, loading, reload } = useAsync(
    () => api<OrderSummary[]>(`/api/desk/orders?${query}`),
    [query],
  );

  return (
    <>
      <header class="dhead">
        <h1 class="dtitle">Orders</h1>
        <label class="search dsearch">
          <SearchIcon size={18} />
          <input
            type="search"
            placeholder="Shop or order number"
            aria-label="Search orders"
            value={search}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </label>
      </header>

      {!search && (
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
      )}

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          title={search ? `No orders match “${search}”` : `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} orders`}
          hint={filter === 'CREDIT_HOLD' && !search ? 'Orders over a credit limit wait here.' : undefined}
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
                <td data-label="Source">
                  <SourceLabel source={order.source} />
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

function quantity(line: OrderLineView): string {
  return [line.cases > 0 ? `${line.cases} cs` : '', line.pieces > 0 ? `${line.pieces} pcs` : '']
    .filter(Boolean)
    .join(' + ');
}

function CreditPanel({ order }: { order: OrderDetail }) {
  const credit = order.credit;
  if (!credit) return null;
  return (
    <section class="dpanel">
      <h2 class="dpanel-title">Credit</h2>
      <dl class="totals totals-flat">
        <div>
          <dt>Limit</dt>
          <dd>{formatRupees(credit.limitPaise)}</dd>
        </div>
        <div>
          <dt>Unpaid in Tally</dt>
          <dd>{formatRupees(credit.outstandingPaise)}</dd>
        </div>
        <div>
          <dt>Open orders</dt>
          <dd>{formatRupees(credit.openOrdersPaise)}</dd>
        </div>
        <div class="totals-final">
          <dt>Available</dt>
          <dd>{formatRupees(credit.availablePaise)}</dd>
        </div>
      </dl>
      {order.status === 'CREDIT_HOLD' && order.overLimitPaise !== null && (
        <p class="notice notice-warn">Over the limit by {formatRupees(order.overLimitPaise)}</p>
      )}
    </section>
  );
}

export function DeskOrderScreen({ id }: { id: string }) {
  const { data: order, error, loading, reload, setData } = useAsync(
    () => api<OrderDetail>(`/api/desk/orders/${id}`),
    [id],
  );
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function act(path: string, body?: unknown) {
    setBusy(true);
    try {
      setData(await api<OrderDetail>(`/api/desk/orders/${id}/${path}`, { method: 'POST', body }));
      setRejecting(false);
      refreshCounts();
    } catch (err) {
      showToast(errorMessage(err));
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) return <Loading />;
  if (error && !order) return <ErrorState message={error.message} onRetry={reload} />;
  if (!order) return null;

  const canReject = order.status === 'CREDIT_HOLD' || order.status === 'READY';

  return (
    <>
      <header class="dhead">
        <div class="dhead-back">
          <Link href="/desk" class="icon-btn" aria-label="Back to orders">
            <BackIcon />
          </Link>
          <h1 class="dtitle">{order.label}</h1>
          <StatusTag status={order.status} />
        </div>
      </header>

      <div class="dcolumns">
        <div>
          <p class="dsub">
            <strong>{order.retailer.shopName}</strong> · {order.retailer.beat}
          </p>

          <table class="dtable dtable-lines">
            <thead>
              <tr>
                <th>Item</th>
                <th class="num">Qty</th>
                <th class="num">Rate/pc</th>
                <th class="num">GST</th>
                <th class="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.skuId}>
                  <td data-label="Item">
                    {shortName(line.skuName)}
                    <span class="muted dtable-sub">{line.skuCode}</span>
                    {line.freeCases > 0 && (
                      <span class="line-gain">
                        <GiftIcon size={15} /> {line.freeCases} free
                      </span>
                    )}
                    {line.discountPaise > 0 && (
                      <span class="line-gain">
                        {line.schemeLabel} · −{formatRupees(line.discountPaise)}
                      </span>
                    )}
                  </td>
                  <td data-label="Qty" class="num">
                    {quantity(line)}
                  </td>
                  <td data-label="Rate/pc" class="num">
                    {formatRupees(line.unitPricePaise)}
                  </td>
                  <td data-label="GST" class="num">
                    {formatPercent(line.gstBps)}
                  </td>
                  <td data-label="Value" class="num strong">
                    {formatRupees(line.taxablePaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl class="totals dtotals">
            <div>
              <dt>Goods value</dt>
              <dd>{formatRupeesExact(order.grossPaise)}</dd>
            </div>
            {order.discountPaise > 0 && (
              <div class="totals-gain">
                <dt>Scheme discount</dt>
                <dd>−{formatRupeesExact(order.discountPaise)}</dd>
              </div>
            )}
            {order.discountPaise > 0 && (
              <div>
                <dt>Taxable value</dt>
                <dd>{formatRupeesExact(order.taxablePaise)}</dd>
              </div>
            )}
            <div>
              <dt>GST</dt>
              <dd>{formatRupeesExact(order.gstPaise)}</dd>
            </div>
            <div class="totals-final">
              <dt>Total including GST</dt>
              <dd>{formatRupeesExact(order.totalPaise)}</dd>
            </div>
          </dl>
        </div>

        <aside class="dcol-side">
          <CreditPanel order={order} />

          {canReject && !rejecting && (
            <section class="dpanel dactions">
              {order.status === 'CREDIT_HOLD' && (
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  disabled={busy}
                  onClick={() => void act('release')}
                >
                  Release hold
                </button>
              )}
              <button
                type="button"
                class="btn btn-quiet btn-block"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                Reject order
              </button>
            </section>
          )}

          {rejecting && (
            <form
              class="dpanel stack"
              onSubmit={(e) => {
                e.preventDefault();
                void act('reject', { reason });
              }}
            >
              <label class="field">
                <span class="field-label">Why is this order rejected?</span>
                <textarea
                  class="input textarea"
                  rows={3}
                  value={reason}
                  required
                  minLength={3}
                  maxLength={300}
                  onInput={(e) => setReason(e.currentTarget.value)}
                />
              </label>
              <button class="btn btn-primary btn-block" disabled={busy || reason.trim().length < 3}>
                Reject and return stock
              </button>
              <button type="button" class="link link-quiet" onClick={() => setRejecting(false)}>
                Keep the order
              </button>
            </form>
          )}

          {order.rejectedReason && (
            <section class="dpanel">
              <h2 class="dpanel-title">Reason for rejection</h2>
              <p>{order.rejectedReason}</p>
            </section>
          )}

          <section class="dpanel">
            <h2 class="dpanel-title">History</h2>
            <ol class="dtimeline">
              <li>
                Placed from {order.source === 'AI_CAPTURE' ? 'a message' : 'the app'}
                <span class="muted">{formatDateTime(order.createdAt)}</span>
              </li>
              {order.events.map((event) => (
                <li key={event.at + event.action}>
                  {event.action}
                  {event.detail && order.status !== 'REJECTED' && ` · ${event.detail}`}
                  <span class="muted">
                    {event.actorName} · {formatDateTime(event.at)}
                  </span>
                </li>
              ))}
            </ol>
            {order.captureId && (
              <Link href={`/desk/inbox/${order.captureId}`} class="link">
                See the original message
              </Link>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
