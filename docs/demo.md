# Demo Scenarios

레포의 UI/운영 기능을 “짧고 재현 가능하게” 보여주기 위한 데모 시나리오 모음이다.

## 1) Peaceful Autonomous Competition (Nominal State)

- Action: 시스템을 개입 없이 실행
- Observation: 에이전트가 채굴/락 획득/로그 이벤트를 발생

![Peaceful Nominal State](../assets/1_peaceful_nominal_state.gif)

## 2) Tactical Command & Priority Bidding

- Action: 에이전트의 Priority 조작(우선권 부여)
- Observation: 큐/정책 우선순위가 반영되는 흐름을 시각적으로 확인

![Tactical Command Priority](../assets/2_tactical_command_priority.gif)

## 3) Smart Alerts & Dispute/Slashing

- Action: Slash 또는 Dispute/Escalation 실행
- Observation: dispute 제출 및 상태 변화/로그 반영

![Escalation Slashing](../assets/3_escalation_slashing.gif)

## 4) Emergency Override

- Action: Emergency Takeover 실행
- Observation: UI 경고 상태 + holder가 HUMAN-OPERATOR로 전환 + 자동 에이전트 제어 변화

![Emergency Takeover](../assets/4_emergency_takeover.gif)

## Playwright 자동 녹화

```bash
RECORD_VIDEO=true pnpm --filter frontend exec playwright test tests/e2e/record.spec.ts --project=chromium --reporter=list
```

