import { render } from 'preact';
import { App } from './App.tsx';
import { ToastHost } from './components/toast.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import './styles.css';

render(
  <LanguageProvider>
    <AuthProvider>
      <App />
      <ToastHost />
    </AuthProvider>
  </LanguageProvider>,
  document.getElementById('app')!,
);
