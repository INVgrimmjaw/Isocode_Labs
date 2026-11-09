import { getVanLists } from '../../api/desk.ts';
import { formatRupees, shortName } from '../../components/format.ts';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { useAsync } from '../../components/useAsync.ts';

export function VanListPage() {
  const { data, error, loading, reload } = useAsync(getVanLists, []);

  return (
    <>
      <header class="dhead">
        <div>
          <h1 class="dtitle">Van lists</h1>
          <p class="muted">Today's orders, by route.</p>
        </div>
      </header>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.vans.length === 0 && (
        <EmptyState title="No orders to load" hint="Today's orders will be listed by route." />
      )}
      {data?.vans.map((van) => (
        <section key={van.beat} class="dvan">
          <h2 class="dsection-title">
            {van.beat}
            <span class="muted"> · {van.orderCount} orders</span>
          </h2>
          <table class="dtable">
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
