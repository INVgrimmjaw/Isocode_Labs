import { useEffect } from 'preact/hooks';
import { lazyPage } from './components/lazyPage.tsx';
import { useAuth } from './context/AuthContext.tsx';
import { LoginPage } from './pages/LoginPage.tsx';

// The first download is only what sign-in needs, and retailers on 3G never download the desk.
const loadRetailerApp = () => import('./pages/retailer/RetailerApp.tsx').then((m) => m.RetailerApp);
const RetailerApp = lazyPage(loadRetailerApp);
const DeskApp = lazyPage(() => import('./pages/desk/DeskApp.tsx').then((m) => m.DeskApp));

export function App() {
  const { user } = useAuth();

  useEffect(() => {
    // Fetched while the shopkeeper waits for their code, so the shop opens at once after it.
    if (!user) void loadRetailerApp().catch(() => {});
  }, [user]);

  if (!user) return <LoginPage />;
  return user.role === 'DESK' ? <DeskApp /> : <RetailerApp user={user} />;
}
