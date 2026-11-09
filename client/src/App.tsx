import { useEffect } from 'preact/hooks';
import { LoginScreen } from './auth/LoginScreen.tsx';
import { ToastHost } from './components/toast.tsx';
import { lazyScreen } from './lib/lazy.tsx';
import { revalidateSession, session } from './lib/session.ts';

// The first download is only what sign-in needs, and retailers on 3G never download the desk.
const loadRetailerApp = () => import('./retailer/RetailerApp.tsx').then((m) => m.RetailerApp);
const RetailerApp = lazyScreen(loadRetailerApp);
const DeskApp = lazyScreen(() => import('./desk/DeskApp.tsx').then((m) => m.DeskApp));

export function App() {
  const user = session.use();

  useEffect(revalidateSession, []);

  useEffect(() => {
    // Fetched while the shopkeeper waits for their code, so the shop opens at once after it.
    if (!user) void loadRetailerApp().catch(() => {});
  }, [user]);

  return (
    <>
      {!user ? <LoginScreen /> : user.role === 'DESK' ? <DeskApp /> : <RetailerApp user={user} />}
      <ToastHost />
    </>
  );
}
