import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './AppRouter';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './theme/theme.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AppRouter /></StrictMode>);
