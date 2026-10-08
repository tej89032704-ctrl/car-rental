/* Design tokens first: one palette shared by all four portals. */
import '../../../packages/shared/styles/tokens.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import FloatingKeyboard from '../../../packages/shared/src/FloatingKeyboard.jsx';
import './styles.css';
import '../../../packages/shared/styles/components.css';
import '../../../packages/shared/styles/floating-keyboard.css';
import './components.css';
/* Design layer last: this file wins over the portal's own rules. */
import '../../../packages/shared/styles/base.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <FloatingKeyboard />
    </BrowserRouter>
  </React.StrictMode>,
);
