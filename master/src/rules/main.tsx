/** Mount point for the passcode-free `/rules` page. The document itself is in
 *  RulesDoc.tsx so the console tab renders the very same component. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RulesDoc } from './RulesDoc.js';
import '../shared/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RulesDoc />
  </StrictMode>,
);
