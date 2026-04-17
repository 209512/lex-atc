# 🛰️ lex-atc Frontend

This is the React + Vite frontend for the **lex-atc** system, providing a real-time 3D WebGL HUD and operations dashboard to monitor agent competition, distributed locks, and settlement transactions.

## 🚀 Getting Started

### Prerequisites
Make sure the backend and infrastructure (Docker Compose) are running before starting the frontend, as it relies on the backend API and SSE stream.

### Installation

```bash
pnpm install
```

### Running Locally

```bash
pnpm dev
```

The application will be available at:
- **Local Dev Server:** `http://127.0.0.1:5173`

### Environment Variables (`.env`)

The frontend relies on the following environment variables (which can be set in `.env.local` or through the system environment):

| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | Backend API base URL used by the frontend (recommended for local SSE). | `http://127.0.0.1:3000/api` |
| `VITE_PROXY_TARGET` | Backend origin used by the Vite `/api` proxy during development (optional). | `http://127.0.0.1:3000` |

*Note: Vite proxies requests starting with `/api` to `VITE_PROXY_TARGET`, but SSE is more stable when `VITE_API_URL` points directly to the backend.*

## 🧪 Testing (Playwright E2E)

This project uses Playwright for End-to-End testing. The tests expect the frontend to be served on port `5180` (Preview mode) and the backend on port `3000`.

```bash
# Run all E2E tests
pnpm test:e2e

# Open Playwright UI for interactive testing
pnpm test:e2e --ui
```

## 🏗️ Architecture & Technologies
- **Framework:** React 18 + Vite
- **3D Rendering:** Three.js (`@react-three/fiber`, `@react-three/drei`)
- **Styling:** Tailwind CSS + Lucide React
- **State & Data:** Context API + Server-Sent Events (SSE) for real-time updates
