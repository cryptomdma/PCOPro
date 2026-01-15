import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AuthProvider } from './auth';
import { LoginView } from './components/LoginView';
import { RequireAuth } from './components/RequireAuth';
import './styles.css';

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginView />} />
            <Route element={<RequireAuth />}>
              <Route path="/*" element={<App />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
