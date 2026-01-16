import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { QueryAuthProvider } from './contexts/QueryAuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryAuthProvider>
      <App />
    </QueryAuthProvider>
  </StrictMode>,
)
