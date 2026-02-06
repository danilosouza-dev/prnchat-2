import React from 'react';
import ReactDOM from 'react-dom/client';
import ExtensionPopup from './ExtensionPopup';
import './extension-styles.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ExtensionPopup />
    </React.StrictMode>
  );
}
