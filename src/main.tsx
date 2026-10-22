import { createRoot } from 'react-dom/client';
import { App } from './App';
if(import.meta.env.VITE_VISUAL_QA==='1') {
  void import('./visual-qa').then(({VisualQa})=>createRoot(document.getElementById('root')!).render(<VisualQa/>));
} else {
  createRoot(document.getElementById('root')!).render(<App/>);
}
