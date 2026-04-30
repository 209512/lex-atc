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
import { frontendConfig } from '@/config/runtime'

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
  if (frontendConfig.deployment.warnings.length) {
    console.warn('[LEX-ATC] Runtime warnings:', frontendConfig.deployment.warnings)
  }
  if (frontendConfig.deployment.invalidFatalWarningCodes?.length) {
    const level = frontendConfig.deployment.strict ? 'error' : 'warn'
    console[level]('[LEX-ATC] Invalid VITE_DEPLOYMENT_FATAL_WARNINGS codes:', frontendConfig.deployment.invalidFatalWarningCodes)
  }

  if (frontendConfig.deployment.strict && frontendConfig.deployment.fatalWarnings.length) {
    const root = document.getElementById('root')
    if (root) {
      const invalid = frontendConfig.deployment.invalidFatalWarningCodes?.length
        ? `<div style="font-size: 12px; opacity: 0.9; margin: 12px 0 6px 0;">Invalid fatal warning codes:</div>
           <ul style="font-size: 12px; opacity: 0.9; line-height: 1.6; padding-left: 18px; margin: 0 0 14px 0;">
             ${frontendConfig.deployment.invalidFatalWarningCodes.map(w => `<li>${w}</li>`).join('')}
           </ul>`
        : ''
      root.innerHTML = `
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; padding: 24px;">
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">배포 환경변수 설정 오류</div>
          <div style="font-size: 12px; opacity: 0.85; line-height: 1.6; margin-bottom: 12px;">
            현재 설정 조합은 실행을 보장할 수 없어 부팅을 중단했습니다.
          </div>
          <div style="font-size: 12px; opacity: 0.9; margin-bottom: 8px;">Detected:</div>
          <ul style="font-size: 12px; opacity: 0.9; line-height: 1.6; padding-left: 18px; margin: 0 0 14px 0;">
            ${frontendConfig.deployment.fatalWarnings.map(w => `<li>${w}</li>`).join('')}
          </ul>
          ${invalid}
          <div style="font-size: 12px; opacity: 0.85; line-height: 1.6;">
            Standalone: VITE_ENABLE_MSW=true, VITE_API_URL=/api<br/>
            Backend: VITE_ENABLE_MSW=false, VITE_API_URL=https://&lt;backend-origin&gt;/api
          </div>
        </div>
      `
    }
    return
  }

  if (frontendConfig.msw.enabled) {
    try {
      const { worker } = await import('@/mocks/browser')
      const { startSimulation } = await import('@/mocks/db')

      const base = (import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : '/'
      const swUrl = `${String(base).replace(/\/?$/, '/') }mockServiceWorker.js`

      await worker.start({
        onUnhandledRequest: 'warn',
        serviceWorker: { url: swUrl },
      })

      startSimulation()
    } catch (_e) {
      if (frontendConfig.api.isRemote) {
        window['__LEX_ATC_MSW_DISABLED__'] = true
      } else {
        const root = document.getElementById('root')
        if (root) {
          root.innerHTML = `
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; padding: 24px;">
              <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">MSW 초기화 실패</div>
              <div style="font-size: 12px; opacity: 0.8; line-height: 1.6;">
                Service Worker가 차단되었거나 mockServiceWorker.js 접근이 실패했습니다.<br/>
                Standalone 모드는 MSW가 필수입니다. 브라우저 설정/확장프로그램을 확인한 뒤 새로고침하세요.<br/>
                (백엔드 모드라면 VITE_ENABLE_MSW=false 및 VITE_API_URL을 설정하세요.)
              </div>
            </div>
          `
        }
        return
      }
    }
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ATCProvider>
        {window['__LEX_ATC_MSW_DISABLED__'] && (
          <div style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 12px',
            borderRadius: 10,
            zIndex: 9999,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 11,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15,23,42,0.85)',
            color: 'rgba(226,232,240,0.95)',
            backdropFilter: 'blur(8px)',
          }}>
            MSW disabled (fallback). Using backend API.
          </div>
        )}
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
