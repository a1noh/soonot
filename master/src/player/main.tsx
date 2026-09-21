/** Mount point for the bingo player card. The component tree lives in App.tsx
 *  so it can be imported by tests without this side-effecting render. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
