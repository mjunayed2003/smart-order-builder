// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

async function boot() {
  const { worker } = await import('./mocks/browser')
  await worker.start()
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
}
boot()