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
