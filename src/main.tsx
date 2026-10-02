import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './reference-ui.css';
import './lithos-v3.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
