import { useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { getOrder, rejectOrder, releaseHold } from '../../api/desk.ts';
import type { OrderDetail, OrderLineView } from '../../api/types.ts';
import { formatPercent, formatRupees, formatRupeesExact, shortName } from '../../components/format.ts';
import { BackIcon, GiftIcon } from '../../components/icons.tsx';
import { ErrorState, Loading } from '../../components/states.tsx';
import { showToast } from '../../components/toast.tsx';
import { useAsync } from '../../components/useAsync.ts';
import { StatusTag } from './DeskOrdersPage.tsx';

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

export function DeskOrderPage({ id }: { id: string }) {
  const { data: order, error, loading, reload, setData } = useAsync(() => getOrder(id), [id]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function act(action: () => Promise<OrderDetail>) {
    setBusy(true);
    try {
      setData(await action());
      setRejecting(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Something went wrong.');
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

          <table class="dtable">
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
              <>
                <div class="totals-gain">
                  <dt>Scheme discount</dt>
                  <dd>−{formatRupeesExact(order.discountPaise)}</dd>
                </div>
                <div>
                  <dt>Taxable value</dt>
                  <dd>{formatRupeesExact(order.taxablePaise)}</dd>
                </div>
              </>
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
            <section class="dactions">
              {order.status === 'CREDIT_HOLD' && (
                <button
                  type="button"
                  class="btn btn-primary btn-block"
                  disabled={busy}
                  onClick={() => void act(() => releaseHold(id))}
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
                void act(() => rejectOrder(id, reason));
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
        </aside>
      </div>
    </>
  );
}
