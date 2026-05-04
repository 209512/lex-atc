# 데모 시나리오

레포의 UI/운영 기능을 “짧고 재현 가능하게” 보여주기 위한 데모 시나리오 모음이다.

## 1) 평시 자동 경쟁(정상 상태)

- 행동: 시스템을 개입 없이 실행
- 관찰: 에이전트가 채굴/락 획득/로그 이벤트를 발생

![평시 자동 경쟁(정상 상태)](../assets/1_peaceful_nominal_state.gif)

## 2) 전술 명령 및 우선권(프라이어리티) 부여

- 행동: 에이전트의 Priority 조작(우선권 부여)
- 관찰: 큐/정책 우선순위가 반영되는 흐름을 시각적으로 확인

![전술 명령 및 우선권 부여](../assets/2_tactical_command_priority.gif)

## 3) 알림 및 디스퓨트/슬래싱

- 행동: Slash 또는 Dispute/Escalation 실행
- 관찰: dispute 제출 및 상태 변화/로그 반영

![디스퓨트/슬래싱](../assets/3_escalation_slashing.gif)

## 4) 긴급 오버라이드

- 행동: Emergency Takeover 실행
- 관찰: UI 경고 상태 + holder가 HUMAN-OPERATOR로 전환 + 자동 에이전트 제어 변화

![긴급 오버라이드](../assets/4_emergency_takeover.gif)

## Playwright 자동 녹화

```bash
RECORD_VIDEO=true pnpm --filter frontend exec playwright test tests/e2e/record.spec.ts --project=chromium --reporter=list
```
