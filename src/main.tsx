import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { initializeNativeBootstrap } from './mobile/nativeBootstrap'
import { loadVariantSizePresets } from './lib/variantSizePresetsService'

initializeNativeBootstrap()

// Load DB-driven size presets (shoe sizes, etc.). Non-blocking: the UI renders
// immediately with hardcoded defaults and updates in place once this resolves.
void loadVariantSizePresets()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
