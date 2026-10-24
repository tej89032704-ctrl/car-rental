/* Design tokens first: one palette shared by all four portals. */
import '../../../packages/shared/styles/tokens.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import FloatingKeyboard from '../../../packages/shared/src/FloatingKeyboard.jsx';
import '../../../packages/shared/styles/components.css';
import '../../../packages/shared/styles/floating-keyboard.css';
import './styles.css';
import './components.css';
/* Design layer last: this file wins over the portal's own rules. */
import '../../../packages/shared/styles/base.css';
/* Renter portal artwork, scoped under .ce so it cannot reach the auth screens. */
import './car-ent.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      /* In production this portal is served from one origin under a path
         prefix (/renter); BASE_URL is that prefix, '' in local dev. */
      basename={import.meta.env.BASE_URL.replace(/\/$/, '')}
    >
      <App />
      <FloatingKeyboard />
    </BrowserRouter>
  </React.StrictMode>,
);
