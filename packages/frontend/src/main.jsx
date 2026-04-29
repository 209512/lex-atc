// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from '@/App'
import { ATCProvider } from '@/contexts/ATCProvider'
import { setupStoreActions } from '@/store/atc'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Dashboard } from '@/components/layout/Dashboard'
import { L4DashboardPage } from '@/pages/L4DashboardPage'
import { L4StatusSystemPage } from '@/pages/L4StatusSystemPage'
import { L4EventDetailPage } from '@/pages/L4EventDetailPage'

setupStoreActions()

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <><Dashboard /><L4DashboardPage /></> },
      { path: 'dashboard', element: <><Dashboard /><L4DashboardPage /></> },
      { path: 'status-system', element: <><Dashboard /><L4DashboardPage /><L4StatusSystemPage /></> },
      { path: 'events/:id', element: <><Dashboard /><L4DashboardPage /><L4EventDetailPage /></> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

async function main() {
  // Start MSW in both development and production for standalone / backend-free deployment.
  // The service worker file is served from /mockServiceWorker.js (public/).
  const { worker } = await import('@/mocks/browser')
  const { startSimulation } = await import('@/mocks/db')

  await worker.start({
    onUnhandledRequest: 'warn',
    serviceWorker: { url: '/mockServiceWorker.js' },
  })

  // Kick off the in-browser agent simulation loop
  startSimulation()

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ATCProvider>
        <RouterProvider
          router={router}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        />
      </ATCProvider>
    </StrictMode>,
  )
}

main()
