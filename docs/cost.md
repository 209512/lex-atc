# Cost & Deployment Options (Overview)

프로덕션 배포 비용은 “어떤 모드를 운영하느냐”에 따라 극적으로 달라진다.

## 1) Frontend Only (Standalone Simulation)

- Vercel/Cloudflare Pages 같은 정적 호스팅으로 운영 가능
- 백엔드/DB/Redis/Hazelcast/ML/On-chain 실행을 요구하지 않음
- 목적: 데모, 시뮬레이션, UI 검증

## 2) Backend Mode (Runtime)

백엔드 운영 시 아래 컴포넌트가 비용/운영 복잡도를 결정한다.

- Backend API 런타임(Compute)
- Postgres / Redis / Hazelcast(또는 대체 인프라)
- 모니터링(Grafana/Prometheus)
- ML watcher(선택)
- Solana/Irys(선택, mainnet 사용 시 수수료 발생 가능)

정확한 비용은 트래픽/HA 요구사항/데이터 보존 전략에 따라 달라진다.

