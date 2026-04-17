// backend/src/core/ReputationEngine.js
const { LEX_CONSTITUTION } = require('@lex-atc/shared');

/**
 * ATC Reputation Engine
 * 에이전트의 신뢰도(Reputation)를 계산하는 핵심 엔진
 * 공식: R = (성공률 * 0.5) + (예치금 비중 * 0.3) - (지연시간 패널티 * 0.2)
 */
class ReputationEngine {
    constructor() {
        // 가중치 설정: 성공률(50%), 보증금(30%), 지연시간(20% 감점 요인)
        this.weights = { success: 0.5, deposit: 0.3, latency: 0.2 };
    }

    /**
     * 에이전트의 현재 계정 정보와 통계 데이터를 기반으로 평판 점수 산출
     * @param {Object} account - 에이전트 계정 정보 (escrow 등)
     * @param {Object} stats - 에이전트 활동 통계 (성공 횟수, 지연시간 등)
     */
    calculate(account, stats) {
        const { escrow } = account;
        const { successCount, totalTasks, avgAiLatency } = stats;

        // 1. Success Rate (S): 성공률 (0~100점)
        // 활동 기록이 없을 경우 기본 신뢰도 70점 부여
        const S = totalTasks > 0 ? (successCount / totalTasks) * 100 : 70;

        // 2. Deposit Score (D): 최소 보증금 대비 예치금 비중 (최대 100점)
        // 헌법(CONSTITUTION)에 정의된 최소 보증금 기준
        const D = Math.min((escrow / LEX_CONSTITUTION.ECONOMY.MIN_ESCROW) * 10, 100);

        // 3. Latency Penalty (L): 지연시간 감점 (최대 100점)
        // 기준점 2000ms를 초과할 때부터 50ms당 1점씩 감점
        const L = Math.max(0, Math.min((avgAiLatency - 2000) / 50, 100));

        // 최종 평판 점수(R) 계산
        const R = (S * this.weights.success) + 
                  (D * this.weights.deposit) - 
                  (L * this.weights.latency);

        // 결과값 보정: 최소 5점 ~ 최대 100점 범위 유지
        return Math.max(5, Math.min(100, R));
    }
}

module.exports = new ReputationEngine();