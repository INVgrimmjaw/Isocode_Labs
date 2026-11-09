import { Link, Redirect, Route, Switch, useLocation } from 'wouter-preact';
import type { SessionUser } from '../../api/types.ts';
import { ListIcon, ShopIcon, UserIcon } from '../../components/icons.tsx';
import { CartProvider } from '../../context/CartContext.tsx';
import { useT } from '../../context/LanguageContext.tsx';
import { ShopProvider } from '../../context/ShopContext.tsx';
import type { StringKey } from '../../context/strings.ts';
import { AccountPage } from './AccountPage.tsx';
import { CartPage } from './CartPage.tsx';
import { CataloguePage } from './CataloguePage.tsx';
import { OrderDetailPage } from './OrderDetailPage.tsx';
import { OrdersPage } from './OrdersPage.tsx';

const TABS: { href: string; label: StringKey; icon: typeof ShopIcon }[] = [
  { href: '/', label: 'nav.shop', icon: ShopIcon },
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
  const showTabs = location !== '/cart';

  return (
    <ShopProvider>
      <CartProvider retailerId={user.retailer?.id ?? ''}>
        <div class={`app${showTabs ? ' app-tabbed' : ''}`}>
          <Switch>
            <Route path="/">
              <CataloguePage shopName={user.retailer?.shopName ?? ''} />
            </Route>
            <Route path="/cart" component={CartPage} />
            <Route path="/orders" component={OrdersPage} />
            <Route path="/orders/:id">{(params) => <OrderDetailPage id={params.id} />}</Route>
            <Route path="/account">
              <AccountPage user={user} />
            </Route>
            <Route>
              <Redirect to="/" replace />
            </Route>
          </Switch>
          {showTabs && <TabBar />}
        </div>
      </CartProvider>
    </ShopProvider>
  );
}
