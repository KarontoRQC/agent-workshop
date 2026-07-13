import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { printConsoleBranding } from './lib/consoleBranding.ts';
import './index.css';

printConsoleBranding();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
