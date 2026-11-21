import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyStoredTheme } from './utils/theme.js'

// Apply the saved theme before the first paint so the auth/profile screens open
// in the same theme as the chat app instead of flashing light.
applyStoredTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
