import { listInactiveRetailers } from '../../api/desk.ts';
import { formatDate, formatRupees } from '../../components/format.ts';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { useAsync } from '../../components/useAsync.ts';

export function QuietShopsPage() {
  const { data, error, loading, reload } = useAsync(listInactiveRetailers, []);

  return (
    <>
      <header class="dhead">
        <div>
          <h1 class="dtitle">No order in 14 days</h1>
          <p class="muted">Longest silence first.</p>
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
              <th>Phone</th>
              <th>Last order</th>
              <th class="num">Days</th>
              <th class="num">Last value</th>
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
                <td data-label="Phone">{shop.phone}</td>
                <td data-label="Last order">{shop.lastOrderAt ? formatDate(shop.lastOrderAt) : 'Never ordered'}</td>
                <td data-label="Days" class="num strong">
                  {shop.daysSince ?? '–'}
                </td>
                <td data-label="Last value" class="num">
                  {shop.lastOrderPaise !== null ? formatRupees(shop.lastOrderPaise) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
