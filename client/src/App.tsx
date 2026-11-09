import { useEffect } from 'preact/hooks';
import { LoginScreen } from './auth/LoginScreen.tsx';
import { ToastHost } from './components/toast.tsx';
import { lazyScreen } from './lib/lazy.tsx';
import { revalidateSession, session } from './lib/session.ts';
import { RetailerApp } from './retailer/RetailerApp.tsx';

// Retailers on 3G never download the desk.
const DeskApp = lazyScreen(() => import('./desk/DeskApp.tsx').then((m) => m.DeskApp));

export function App() {
  const user = session.use();

  useEffect(revalidateSession, []);

  return (
    <>
      {!user ? <LoginScreen /> : user.role === 'DESK' ? <DeskApp /> : <RetailerApp user={user} />}
      <ToastHost />
    </>
  );
}
