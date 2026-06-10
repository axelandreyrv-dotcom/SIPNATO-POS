import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-brand-gray-dark flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-brand-navy dark:text-white">SIPNATO POS</h1>
        <p className="text-slate-500 dark:text-slate-400">Sistema iniciando…</p>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root no encontrado en el DOM');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
