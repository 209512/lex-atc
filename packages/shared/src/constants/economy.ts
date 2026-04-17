// shared/src/constants/economy.ts
export const LEX_CONSTITUTION = {
  ECONOMY: {
    INITIAL_BALANCE: 10.0,    // 신규 에이전트 초기 자금
    MIN_ESCROW: 1.0,          // 최소 보증금 (활동 자격)
    ENTRY_FEE: 0.01,          // 락 요청 시 소모 수수료
    TASK_REWARD: 0.05,        // 작업 완료 보상
    SLASH_FINE: 0.5           // 규범 위반 벌금
  },
  MINING: {
    BASE_DIFFICULTY: 4,       // 기본 해시 난이도
    PENALTY_ADD_DIFFICULTY: 2 // 위반 시 난이도 증가치
  }
};