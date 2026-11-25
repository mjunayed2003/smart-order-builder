// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

async function boot() {
  const { worker } = await import('./mocks/browser')
  await worker.start()
  const { chaos } = await import('./mocks/serverState')
  Object.assign(window, { chaos })
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
}
boot()