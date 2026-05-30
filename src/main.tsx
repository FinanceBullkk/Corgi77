import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initMonitoring, captureError } from './lib/monitoring';
import './styles.css';

initMonitoring();

window.addEventListener('unhandledrejection', (event) => {
  captureError(event.reason, { operation: 'unhandledRejection' });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
