import '@fontsource-variable/geist';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './app';
import { createQueryClient } from './lib/query-client';
import { routes } from './routes';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);
