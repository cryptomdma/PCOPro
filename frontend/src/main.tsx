import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AuthProvider } from './auth';
import { LoginView } from './components/LoginView';
import { RequireAuth } from './components/RequireAuth';
import { ThemeProvider } from './components/ui/theme';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import './styles.css';

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <ErrorBoundary>
                <Routes>
                  <Route path="/login" element={<LoginView />} />
                  <Route element={<RequireAuth />}>
                    <Route path="/*" element={<App />} />
                  </Route>
                </Routes>
              </ErrorBoundary>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
