import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import type { InactiveRetailer, TallyBatchView, TallyPreview, VanListResponse } from '#shared/api';
import { formatRupees } from '#shared/money';
import { DownloadIcon, PhoneIcon, PrintIcon } from '../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../components/states.tsx';
import { showToast } from '../components/toast.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { formatDate, formatDateTime, shortName } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { refreshCounts } from './DeskApp.tsx';

const batchFileUrl = (id: string) => `/api/desk/tally/batches/${id}/file`;

export function DeskTallyScreen() {
  const { data, error, loading, reload } = useAsync(() => api<TallyPreview>('/api/desk/tally'), []);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const selected = data?.orders.filter((o) => !excluded.has(o.id)) ?? [];
  const selectedTotal = selected.reduce((sum, o) => sum + o.totalPaise, 0);

  function toggle(id: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportSelected() {
    setBusy(true);
    try {
      const batch = await api<TallyBatchView>('/api/desk/tally/batches', {
        body: { orderIds: selected.map((o) => o.id) },
      });
      window.location.assign(batchFileUrl(batch.id));
      showToast(`${batch.label} created with ${batch.orderCount} orders`);
      setExcluded(new Set());
      refreshCounts();
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <header class="dhead">
        <h1 class="dtitle">Tally export</h1>
      </header>

      {data.orders.length === 0 ? (
        <EmptyState title="Nothing to export" hint="Orders ready for billing will appear here." />
      ) : (
        <>
          <table class="dtable">
            <thead>
              <tr>
                <th aria-label="Include" />
                <th>Order</th>
                <th>Shop</th>
                <th class="num">Items</th>
                <th class="num">Total</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id}>
                  <td data-label="Include">
                    <input
                      type="checkbox"
                      class="dcheck"
                      aria-label={`Include ${order.label}`}
                      checked={!excluded.has(order.id)}
                      onChange={() => toggle(order.id)}
                    />
                  </td>
                  <td data-label="Order">
                    <Link href={`/desk/orders/${order.id}`} class="dtable-key">
                      {order.label}
                    </Link>
                  </td>
                  <td data-label="Shop">{order.retailer.shopName}</td>
                  <td data-label="Items" class="num">
                    {order.lineCount}
                  </td>
                  <td data-label="Total" class="num strong">
                    {formatRupees(order.totalPaise)}
                  </td>
                  <td data-label="Placed" class="muted">
                    {formatDateTime(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div class="dexport">
            <div>
              <strong>
                {selected.length} orders · {formatRupees(selectedTotal)}
              </strong>
              {data.held > 0 && (
                <p class="muted">
                  {data.held} on credit hold {data.held === 1 ? 'is' : 'are'} not included.
                </p>
              )}
            </div>
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy || selected.length === 0}
              onClick={() => void exportSelected()}
            >
              <DownloadIcon size={18} />
              Create Tally file
            </button>
          </div>
          <p class="muted dnote">
            Exported orders move to Tally and cannot be exported again, so nothing is billed twice.
          </p>
        </>
      )}

      {data.batches.length > 0 && (
        <section class="dsection">
          <h2 class="dsection-title">Earlier files</h2>
          <ul class="rows">
            {data.batches.map((batch) => (
              <li key={batch.id} class="row">
                <span class="row-main">
                  <strong>{batch.label}</strong>
                  <span class="muted">
                    {formatDateTime(batch.createdAt)} · {batch.orderCount} orders · {formatRupees(batch.totalPaise)}
                  </span>
                </span>
                <a class="link" href={batchFileUrl(batch.id)}>
                  Download XML
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function DeskVansScreen() {
  const [date, setDate] = useState('');
  const { data, error, loading, reload } = useAsync(
    () => api<VanListResponse>(`/api/desk/van-lists${date ? `?date=${date}` : ''}`),
    [date],
  );

  useEffect(() => {
    if (data && !date) setDate(data.date);
  }, [data, date]);

  return (
    <>
      <header class="dhead">
        <h1 class="dtitle">Van lists</h1>
        <div class="dhead-tools">
          <input
            class="input ddate"
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
          />
          <button type="button" class="btn btn-quiet" onClick={() => window.print()}>
            <PrintIcon size={18} />
            Print
          </button>
        </div>
      </header>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.vans.length === 0 && (
        <EmptyState title="No orders to load" hint="Orders placed on this date will be listed by route." />
      )}
      {data?.vans.map((van) => (
        <section key={van.beat} class="dvan">
          <h2 class="dsection-title">
            {van.beat}
            <span class="muted"> · {van.orderCount} orders</span>
          </h2>
          <table class="dtable dtable-lines">
            <thead>
              <tr>
                <th>Item</th>
                <th class="num">Cases</th>
                <th class="num">Free</th>
                <th class="num">Loose pcs</th>
              </tr>
            </thead>
            <tbody>
              {van.lines.map((line) => (
                <tr key={line.skuCode}>
                  <td data-label="Item">
                    {shortName(line.skuName)}
                    <span class="muted dtable-sub">{line.skuCode}</span>
                  </td>
                  <td data-label="Cases" class="num strong">
                    {line.cases}
                  </td>
                  <td data-label="Free" class="num">
                    {line.freeCases || '–'}
                  </td>
                  <td data-label="Loose pcs" class="num">
                    {line.pieces || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 class="dvan-drops">Drops</h3>
          <ul class="dvan-list">
            {van.drops.map((drop) => (
              <li key={drop.orderLabel}>
                <span>
                  {drop.shopName} <span class="muted">{drop.area}</span>
                </span>
                <span class="muted">
                  {drop.orderLabel} · {formatRupees(drop.totalPaise)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function DeskQuietScreen() {
  const { data, error, loading, reload } = useAsync(
    () => api<InactiveRetailer[]>('/api/desk/retailers/inactive'),
    [],
  );

  return (
    <>
      <header class="dhead">
        <div>
          <h1 class="dtitle">Quiet shops</h1>
          <p class="muted">No order in 14 days, longest silence first.</p>
        </div>
      </header>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState title="Every shop has ordered recently" hint="Shops with no order in 14 days appear here." />
      )}
      {data && data.length > 0 && (
        <table class="dtable">
          <thead>
            <tr>
              <th>Shop</th>
              <th>Route</th>
              <th>Last order</th>
              <th class="num">Days</th>
              <th class="num">Last value</th>
              <th aria-label="Call" />
            </tr>
          </thead>
          <tbody>
            {data.map((shop) => (
              <tr key={shop.id}>
                <td data-label="Shop">
                  {shop.shopName}
                  <span class="muted dtable-sub">
                    {shop.ownerName} · {shop.area}
                  </span>
                </td>
                <td data-label="Route" class="muted">
                  {shop.beat}
                </td>
                <td data-label="Last order">{shop.lastOrderAt ? formatDate(shop.lastOrderAt) : 'Never ordered'}</td>
                <td data-label="Days" class="num strong">
                  {shop.daysSince ?? '–'}
                </td>
                <td data-label="Last value" class="num">
                  {shop.lastOrderPaise !== null ? formatRupees(shop.lastOrderPaise) : '–'}
                </td>
                <td data-label="Call">
                  <a class="link dcall" href={`tel:+91${shop.phone}`}>
                    <PhoneIcon size={16} />
                    Call
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
