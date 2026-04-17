// backend/src/core/PhysicsEngine.js
class PhysicsEngine {
    static CONFIG = {
        BASE_RADIUS: 5,
        RADIUS_STEP: 2.8,          
        ORBIT_SPEED: 0.0003,      
        Y_STEP: 1.5,
        Y_WOBBLE_AMPLITUDE: 0.3    
    };

    /**
     * @param {string} agentId - 로깅 및 식별용 ID
     * @param {number} seed - 위치 계산을 위한 고유 불변 인덱스 (이름 변경과 무관하게 유지)
     * @param {number} activeTime - 일시정지를 제외한 누적 활성 시간
     */
    static getOrbitPosition(agentId, seed, activeTime) {
        const timeRef = (typeof activeTime === 'number') ? activeTime : Date.now();
        const agentNum = seed || 0;
        const { BASE_RADIUS, RADIUS_STEP, ORBIT_SPEED, Y_STEP, Y_WOBBLE_AMPLITUDE } = this.CONFIG;

        const orbitLayer = agentNum % 3;
        const radius = BASE_RADIUS + (orbitLayer * RADIUS_STEP);

        const direction = (agentNum % 2 === 0) ? 1 : -1;
        const angle = (agentNum * 1.25) + (timeRef * ORBIT_SPEED * direction);

        const layerY = ((agentNum % 4) - 1.5) * Y_STEP; 
        const wobble = Math.sin(timeRef * 0.002 + agentNum) * Y_WOBBLE_AMPLITUDE;

        return [
            parseFloat((Math.cos(angle) * radius).toFixed(3)),
            parseFloat((layerY + wobble).toFixed(3)),
            parseFloat((Math.sin(angle) * radius).toFixed(3))
        ];
    }
}

module.exports = PhysicsEngine;