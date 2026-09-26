import { Profiler, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

const e2e = import.meta.env.DEV && new URLSearchParams(location.search).has('e2e');
const commits = { n: 0 };
if (e2e) (window as unknown as { __DEWFIELD_COMMITS__: typeof commits }).__DEWFIELD_COMMITS__ = commits;

createRoot(root).render(
  <StrictMode>
    {e2e ? (
      <Profiler id="app" onRender={(_id, phase) => {
        commits.n++;
        (commits as { log?: string[] }).log?.push(`${performance.now().toFixed(0)} ${phase}`);
      }}>
        <App />
      </Profiler>
    ) : (
      <App />
    )}
  </StrictMode>,
);
