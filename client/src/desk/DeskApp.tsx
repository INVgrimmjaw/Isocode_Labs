import { useEffect } from 'preact/hooks';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact';
import type { DeskCounts } from '#shared/api';
import { api } from '../lib/api.ts';
import { locale } from '../lib/i18n.ts';
import { session, signOut } from '../lib/session.ts';
import { createStore } from '../lib/store.ts';
import { DeskCaptureScreen, DeskInboxScreen } from './DeskInbox.tsx';
import { DeskOrderScreen, DeskOrdersScreen } from './DeskOrders.tsx';
import { DeskQuietScreen, DeskTallyScreen, DeskVansScreen } from './DeskTools.tsx';
import './desk.css';

const counts = createStore<DeskCounts | null>(null);

/** Called after any desk action, so the badges in the sidebar stay true. */
export function refreshCounts() {
  api<DeskCounts>('/api/desk/counts')
    .then(counts.set)
    .catch(() => {});
}

function NavItem({ href, label, badge }: { href: string; label: string; badge?: number }) {
  const [location] = useLocation();
  const active = href === '/desk' ? location === '/desk' || location.startsWith('/desk/orders') : location.startsWith(href);
  return (
    <Link href={href} class={`dnav-item${active ? ' dnav-active' : ''}`} aria-current={active ? 'page' : undefined}>
      <span>{label}</span>
      {badge ? <span class="dnav-badge">{badge}</span> : null}
    </Link>
  );
}

export function DeskApp() {
  const user = session.use();
  const current = counts.use();
  const [location] = useLocation();

  useEffect(() => {
    // The desk is English only, and this leaves a Hindi preference on the device untouched.
    const previous = locale.get();
    locale.set('en');
    refreshCounts();
    return () => locale.set(previous);
  }, []);

  if (!location.startsWith('/desk')) return <Redirect to="/desk" replace />;

  return (
    <div class="desk">
      <aside class="dside">
        <div class="dside-top">
          <Link href="/desk" class="wordmark">
            Peti
          </Link>
          <span class="dside-role">Order desk</span>
        </div>
        <nav class="dnav" aria-label="Order desk">
          <NavItem href="/desk" label="Orders" badge={current?.creditHold} />
          <NavItem href="/desk/inbox" label="Messages" badge={current?.captures} />
          <NavItem href="/desk/tally" label="Tally export" badge={current?.ready} />
          <NavItem href="/desk/vans" label="Van lists" />
          <NavItem href="/desk/quiet" label="Quiet shops" badge={current?.inactive} />
        </nav>
        <div class="dside-foot">
          <span class="muted">{user?.name}</span>
          <button type="button" class="link link-quiet" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <div class="dmain">
        <Switch>
          <Route path="/desk" component={DeskOrdersScreen} />
          <Route path="/desk/orders/:id">{(params) => <DeskOrderScreen id={params.id} />}</Route>
          <Route path="/desk/inbox" component={DeskInboxScreen} />
          <Route path="/desk/inbox/:id">{(params) => <DeskCaptureScreen id={params.id} />}</Route>
          <Route path="/desk/tally" component={DeskTallyScreen} />
          <Route path="/desk/vans" component={DeskVansScreen} />
          <Route path="/desk/quiet" component={DeskQuietScreen} />
          <Route>
            <Redirect to="/desk" replace />
          </Route>
        </Switch>
      </div>
    </div>
  );
}
