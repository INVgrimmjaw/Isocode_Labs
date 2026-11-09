import { useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { exportToTally, getTallyPreview, tallyFileUrl } from '../../api/desk.ts';
import { formatDateTime, formatRupees } from '../../components/format.ts';
import { DownloadIcon } from '../../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { showToast } from '../../components/toast.tsx';
import { useAsync } from '../../components/useAsync.ts';

export function TallyPage() {
  const { data, error, loading, reload } = useAsync(getTallyPreview, []);
  const [busy, setBusy] = useState(false);

  async function createFile() {
    setBusy(true);
    try {
      const batch = await exportToTally();
      window.location.assign(tallyFileUrl(batch.id));
      showToast(`${batch.label} created with ${batch.orderCount} orders`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const total = data.orders.reduce((sum, o) => sum + o.totalPaise, 0);

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
                {data.orders.length} orders · {formatRupees(total)}
              </strong>
              {data.held > 0 && (
                <p class="muted">
                  {data.held} on credit hold {data.held === 1 ? 'is' : 'are'} not included.
                </p>
              )}
            </div>
            <button type="button" class="btn btn-primary" disabled={busy} onClick={() => void createFile()}>
              <DownloadIcon size={18} />
              Create Tally file
            </button>
          </div>
          <p class="muted dnote">Exported orders cannot be exported again, so nothing is billed twice.</p>
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
                <a class="link" href={tallyFileUrl(batch.id)}>
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
