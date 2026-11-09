import { useEffect } from 'preact/hooks';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact';
import type { SessionUser } from '#shared/api';
import { ListIcon, PenIcon, ShopIcon, UserIcon } from '../components/icons.tsx';
import { useT, type StringKey } from '../lib/i18n.ts';
import { lazyScreen } from '../lib/lazy.tsx';
import { loadCart } from './cart.ts';
import { CartScreen } from './CartScreen.tsx';
import { CatalogueScreen } from './CatalogueScreen.tsx';
import { refreshHome } from './home.ts';
import { OrderDetailScreen, OrdersScreen } from './OrdersScreens.tsx';

// The first screen must load fast on 3G, so everything else follows when it is opened.
const AccountScreen = lazyScreen(() => import('./AccountScreen.tsx').then((m) => m.AccountScreen));
const QuickOrderScreen = lazyScreen(() => import('./QuickOrder.tsx').then((m) => m.QuickOrderScreen));
const CaptureReviewScreen = lazyScreen(() => import('./QuickOrder.tsx').then((m) => m.CaptureReviewScreen));

const TABS: { href: string; label: StringKey; icon: typeof ShopIcon }[] = [
  { href: '/', label: 'nav.shop', icon: ShopIcon },
  { href: '/quick', label: 'nav.quick', icon: PenIcon },
  { href: '/orders', label: 'nav.orders', icon: ListIcon },
  { href: '/account', label: 'nav.account', icon: UserIcon },
];

function TabBar() {
  const t = useT();
  const [location] = useLocation();
  return (
    <nav class="tabs" aria-label="Main">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? location === '/' : location.startsWith(href);
        return (
          <Link key={href} href={href} class={`tab${active ? ' tab-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon />
            <span>{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function RetailerApp({ user }: { user: SessionUser }) {
  const [location] = useLocation();
  const retailerId = user.retailer?.id;

  useEffect(() => {
    if (!retailerId) return;
    loadCart(retailerId);
    void refreshHome(retailerId);
  }, [retailerId]);

  const showTabs = location !== '/cart' && !location.startsWith('/quick/');

  return (
    <div class={`app${showTabs ? ' app-tabbed' : ''}`}>
      <Switch>
        <Route path="/">
          <CatalogueScreen shopName={user.retailer?.shopName ?? ''} />
        </Route>
        <Route path="/cart" component={CartScreen} />
        <Route path="/quick">
          <QuickOrderScreen />
        </Route>
        <Route path="/quick/:id">{(params) => <CaptureReviewScreen id={params.id} />}</Route>
        <Route path="/orders" component={OrdersScreen} />
        <Route path="/orders/:id">{(params) => <OrderDetailScreen id={params.id} />}</Route>
        <Route path="/account">
          <AccountScreen user={user} />
        </Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
      {showTabs && <TabBar />}
    </div>
  );
}
