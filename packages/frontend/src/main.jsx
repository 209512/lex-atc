import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from '@/App'
import { ATCProvider } from '@/contexts/ATCProvider'
import { setupStoreActions } from '@/store/atc'
import { useATCStore } from '@/store/atc'
import { useUIStore } from '@/store/ui'
import { atcApi } from '@/contexts/atcApi'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Dashboard } from '@/components/layout/Dashboard'
import { L4DashboardPage } from '@/pages/L4DashboardPage'
import { L4StatusSystemPage } from '@/pages/L4StatusSystemPage'
import { L4EventDetailPage } from '@/pages/L4EventDetailPage'
import { frontendConfig } from '@/config/runtime'
import { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } from '@lex-atc/shared'

setupStoreActions()

const setupDocHighlight = () => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('doc') !== '1') return

  const hl = String(params.get('hl') || '')
  const ids = hl.split(',').map(s => s.trim()).filter(Boolean)

  document.documentElement.dataset.lexAtcDoc = '1'
  const root = document.getElementById('root') || document.body

  const escapeCss = (s) => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s)
    return s.replace(/["\\]/g, '\\$&')
  }

  const apply = () => {
    const highlighted = root.querySelectorAll('[data-doc-highlight="1"]')
    for (const el of highlighted) el.removeAttribute('data-doc-highlight')
    for (const id of ids) {
      const safe = escapeCss(id)
      const targets = root.querySelectorAll(`[data-testid="${safe}"]`)
      for (const el of targets) el.setAttribute('data-doc-highlight', '1')
    }
  }

  apply()
  let scheduled = false
  const scheduleApply = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      apply()
    })
  }

  const observer = new MutationObserver(() => scheduleApply())
  observer.observe(root, { subtree: true, childList: true })
  window.addEventListener('popstate', apply)
}

const runDocScenario = async () => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('doc') !== '1') return
  const scenario = String(params.get('scenario') || '')
  if (!scenario) return

  const ui = useUIStore.getState()
  ui.updateUIPreferences({ viewMode: 'operator' })
  ui.updateFloatingPanel('terminal', { isOpen: true, isCollapsed: false })
  ui.updateFloatingPanel('l4', { isOpen: true, isCollapsed: false })
  ui.bringToFront('terminal')

  const atc = useATCStore.getState()
  const agentUuid = atc.agents?.[0]?.uuid
  if (!agentUuid) return

  if (scenario === 'dispute-repeat') {
    ui.updateTerminalPreferences({ filter: 'DISPUTE', domainFilter: 'SETTLEMENT' })
    await atcApi.openDispute({ actorUuid: agentUuid, targetNonce: 7, reason: 'DOC_DISPUTE_REPEAT_1' })
    await atcApi.openDispute({ actorUuid: agentUuid, targetNonce: 8, reason: 'DOC_DISPUTE_REPEAT_2' })
    return
  }

  if (scenario === 'sandbox-denials') {
    ui.updateTerminalPreferences({ filter: 'SANDBOX', domainFilter: 'ISOLATION' })
    for (let i = 0; i < 25; i++) {
      atc.addLog('SANDBOX_BINARY_NOT_ALLOWED', 'error', 'SYSTEM', {
        domain: LOG_DOMAINS.ISOLATION,
        stage: LOG_STAGES.FAILED,
        actionKey: LOG_ACTIONS.TASK_FINALIZE,
        reason: 'SANDBOX_BINARY_NOT_ALLOWED',
      })
    }
    return
  }

  if (scenario === 'settlement-retry') {
    ui.updateTerminalPreferences({ filter: 'SETTLEMENT', domainFilter: 'SETTLEMENT' })
    atc.addLog('SETTLEMENT_SLASH_FAILED: API_SERVER_ERROR', 'error', 'SYSTEM', {
      domain: LOG_DOMAINS.SETTLEMENT,
      stage: LOG_STAGES.FAILED,
      actionKey: LOG_ACTIONS.SETTLEMENT_SLASH,
    })
    await new Promise((r) => setTimeout(r, 150))
    atc.addLog('SETTLEMENT_SLASH_RETRYING', 'warn', 'SYSTEM', {
      domain: LOG_DOMAINS.SETTLEMENT,
      stage: LOG_STAGES.REQUEST,
      actionKey: LOG_ACTIONS.SETTLEMENT_SLASH,
    })
    await atcApi.slashSettlement('', agentUuid, 'DOC_SETTLEMENT_RETRY')
  }
}

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
  const boot = window['__LEX_ATC__'] || (window['__LEX_ATC__'] = {})
  boot.deployment = { mode: frontendConfig.deployment.mode, strict: Boolean(frontendConfig.deployment.strict) }
  boot.msw = { enabled: Boolean(frontendConfig.msw.enabled), ready: false, swUrl: null, disabledFallback: Boolean(window['__LEX_ATC_MSW_DISABLED__']) }
  document.documentElement.dataset.lexAtcMode = String(frontendConfig.deployment.mode || '')
  setupDocHighlight()

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

      boot.msw = { ...boot.msw, ready: true, swUrl }
      document.documentElement.dataset.lexAtcMswReady = '1'
      startSimulation()
      await runDocScenario()
    } catch (_e) {
      if (frontendConfig.api.isRemote) {
        window['__LEX_ATC_MSW_DISABLED__'] = true
        boot.msw = { ...boot.msw, enabled: false, ready: false, disabledFallback: true }
        document.documentElement.dataset.lexAtcMswReady = '0'
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
  } else {
    boot.msw = { ...boot.msw, enabled: false, ready: false }
    document.documentElement.dataset.lexAtcMswReady = '0'
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
