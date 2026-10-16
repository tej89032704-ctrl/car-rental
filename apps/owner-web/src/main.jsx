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
/* Shared PIT LANE layer: still carries the portal's structural rules. */
import '../../../packages/shared/styles/base.css';
/* OwnerHub layer last, so mint/Fraunces wins wherever the two disagree. The
   reference's own three sheets are folded into this file in their original
   order, keeping the cascade faithful to the source. */
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <FloatingKeyboard />
    </BrowserRouter>
  </React.StrictMode>,
);
