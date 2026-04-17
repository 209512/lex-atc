// shared/src/constants/logConfig.ts
export const LOG_CONFIG = {
  levels: {
    critical: { emoji: '🚨', color: '#FF0000', tag: '[CRIT]', label: 'CRITICAL' }, // 긴급 상황
    error:    { emoji: '❌', color: '#F97316', tag: '[ERR ]', label: 'ERROR' },    // 일반 오류
    reward:   { emoji: '💰', color: '#FFD700', tag: '[CASH]', label: 'REWARD' },   // 수익 (골드)
    warn:     { emoji: '⚠️', color: '#F59E0B', tag: '[WARN]', label: 'WARNING' },  // 주의/우선권
    lock:     { emoji: '🔒', color: '#00FF9D', tag: '[LOCK]', label: 'RESOURCE' }, // 자원 점유
    success:  { emoji: '✅', color: '#34D399', tag: '[ OK ]', label: 'SUCCESS' },  // 작업 성공
    system:   { emoji: '⚙️', color: '#A855F7', tag: '[SYS ]', label: 'SYSTEM' },   // 구조 변경
    policy:   { emoji: '⚖️', color: '#3B82F6', tag: '[PLC ]', label: 'POLICY' },   // 정책/순서
    info:     { emoji: '🔹', color: '#94A3B8', tag: '[INFO]', label: 'INFO' },     // 일반 정보
  }
};