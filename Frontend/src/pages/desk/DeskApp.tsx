import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact';
import { useAuth } from '../../context/AuthContext.tsx';
import { DeskOrderPage } from './DeskOrderPage.tsx';
import { DeskOrdersPage } from './DeskOrdersPage.tsx';
import { MessageReviewPage } from './MessageReviewPage.tsx';
import { MessagesPage } from './MessagesPage.tsx';
import { QuietShopsPage } from './QuietShopsPage.tsx';
import { TallyPage } from './TallyPage.tsx';
import { VanListPage } from './VanListPage.tsx';

function NavItem({ href, label }: { href: string; label: string }) {
  const [location] = useLocation();
  const active =
    href === '/desk' ? location === '/desk' || location.startsWith('/desk/orders') : location.startsWith(href);
  return (
    <Link href={href} class={`dnav-item${active ? ' dnav-active' : ''}`} aria-current={active ? 'page' : undefined}>
      {label}
    </Link>
  );
}

export function DeskApp() {
  const { user, signOut } = useAuth();
  const [location] = useLocation();

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
          <NavItem href="/desk" label="Orders" />
          <NavItem href="/desk/messages" label="Messages" />
          <NavItem href="/desk/tally" label="Tally export" />
          <NavItem href="/desk/vans" label="Van lists" />
          <NavItem href="/desk/inactive" label="No recent orders" />
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
          <Route path="/desk" component={DeskOrdersPage} />
          <Route path="/desk/orders/:id">{(params) => <DeskOrderPage id={params.id} />}</Route>
          <Route path="/desk/messages" component={MessagesPage} />
          <Route path="/desk/messages/:id">{(params) => <MessageReviewPage id={params.id} />}</Route>
          <Route path="/desk/tally" component={TallyPage} />
          <Route path="/desk/vans" component={VanListPage} />
          <Route path="/desk/inactive" component={QuietShopsPage} />
          <Route>
            <Redirect to="/desk" replace />
          </Route>
        </Switch>
      </div>
    </div>
  );
}
