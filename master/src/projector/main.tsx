/** Mount point for the projector. The component tree is in App.tsx so tests can
 *  import it without this side-effecting render. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
