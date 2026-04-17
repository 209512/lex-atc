export type StatusAxis = 'isolation' | 'settlement' | 'rollback' | 'admin';

export type StatusCode =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'WAITING_ADMIN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ABORTED'
  | 'UNKNOWN';

export type Severity = 'info' | 'warn' | 'critical';

export type AxisState = {
  axis: StatusAxis;
  code: StatusCode;
  updatedAt: string;
  message?: string;
  labelOverride?: string;
};

export type L4EntityKind = 'AGENT' | 'TASK' | 'PROPOSAL' | 'CHANNEL' | 'EVENT';

export type L4StatusSnapshot = {
  contractVersion: number;
  entityKind: L4EntityKind;
  entityId: string;
  occurredAt: string;
  states: Record<StatusAxis, AxisState>;
  meta?: Record<string, unknown>;
};

export type StatusCatalogEntry = {
  axis: StatusAxis;
  code: StatusCode;
  labelKo: string;
  definitionKo: string;
  severity: Severity;
};

export const STATUS_CONTRACT_VERSION = 1;

export const STATUS_CATALOG: StatusCatalogEntry[] = [
  {
    axis: 'isolation',
    code: 'NOT_STARTED',
    labelKo: '미시작',
    definitionKo: '격리/검증 대상 작업이 아직 생성되지 않았음.',
    severity: 'info',
  },
  {
    axis: 'isolation',
    code: 'QUEUED',
    labelKo: '대기',
    definitionKo: '격리 엔진 큐에 등록되어 실행을 기다리는 상태.',
    severity: 'info',
  },
  {
    axis: 'isolation',
    code: 'IN_PROGRESS',
    labelKo: '실행중',
    definitionKo: '샌드박스/실행 경로에서 작업이 진행중인 상태.',
    severity: 'warn',
  },
  {
    axis: 'isolation',
    code: 'WAITING_ADMIN',
    labelKo: '관리자 대기',
    definitionKo: '관리자 승인/확정(Commit)이 필요하여 멈춰있는 상태.',
    severity: 'warn',
  },
  {
    axis: 'isolation',
    code: 'SUCCEEDED',
    labelKo: '완료',
    definitionKo: '격리된 작업이 성공적으로 실행/확정된 상태.',
    severity: 'info',
  },
  {
    axis: 'isolation',
    code: 'FAILED',
    labelKo: '실패',
    definitionKo: '격리된 작업이 실패하거나 정책상 거절된 상태.',
    severity: 'critical',
  },
  {
    axis: 'isolation',
    code: 'ABORTED',
    labelKo: '중단',
    definitionKo: '사용자/관리자에 의해 취소되거나 롤백으로 중단된 상태.',
    severity: 'warn',
  },

  {
    axis: 'settlement',
    code: 'NOT_STARTED',
    labelKo: '미시작',
    definitionKo: '채널/정산 스냅샷이 아직 생성되지 않았음.',
    severity: 'info',
  },
  {
    axis: 'settlement',
    code: 'IN_PROGRESS',
    labelKo: '정산 대기',
    definitionKo: '스냅샷 생성/제출이 대기 중인 상태.',
    severity: 'warn',
  },
  {
    axis: 'settlement',
    code: 'WAITING_ADMIN',
    labelKo: '디스퓨트',
    definitionKo: '채널 디스퓨트가 열려 있어 운영자 개입이 필요한 상태.',
    severity: 'critical',
  },
  {
    axis: 'settlement',
    code: 'SUCCEEDED',
    labelKo: '스냅샷 확정',
    definitionKo: '최근 스냅샷이 제출/확정(최종화)된 것으로 간주되는 상태.',
    severity: 'info',
  },
  {
    axis: 'settlement',
    code: 'FAILED',
    labelKo: '정산 실패',
    definitionKo: '정산 제출이 거절되거나 무결성 검증에 실패한 상태.',
    severity: 'critical',
  },

  {
    axis: 'rollback',
    code: 'NOT_STARTED',
    labelKo: '미시작',
    definitionKo: '롤백이 발생하지 않았음.',
    severity: 'info',
  },
  {
    axis: 'rollback',
    code: 'IN_PROGRESS',
    labelKo: '롤백 진행',
    definitionKo: '롤백 절차가 진행 중이거나 적용 대기 상태.',
    severity: 'critical',
  },
  {
    axis: 'rollback',
    code: 'SUCCEEDED',
    labelKo: '롤백 완료',
    definitionKo: '롤백이 적용되어 상태가 되돌려진 상태.',
    severity: 'warn',
  },
  {
    axis: 'rollback',
    code: 'FAILED',
    labelKo: '롤백 실패',
    definitionKo: '롤백이 실패하거나 보상/상쇄가 실패한 상태.',
    severity: 'critical',
  },

  {
    axis: 'admin',
    code: 'NOT_STARTED',
    labelKo: '미개입',
    definitionKo: '관리자 개입이 없는 정상 운영 상태.',
    severity: 'info',
  },
  {
    axis: 'admin',
    code: 'WAITING_ADMIN',
    labelKo: '승인 대기',
    definitionKo: '승인(멀티시그) 또는 실행 권한자의 개입이 필요한 상태.',
    severity: 'warn',
  },
  {
    axis: 'admin',
    code: 'IN_PROGRESS',
    labelKo: '개입중',
    definitionKo: '오버라이드/테이크오버/정책 변경 등 고위험 개입이 진행 중인 상태.',
    severity: 'critical',
  },
  {
    axis: 'admin',
    code: 'SUCCEEDED',
    labelKo: '개입 완료',
    definitionKo: '개입이 수행되어 상태가 반영된 상태.',
    severity: 'warn',
  },
  {
    axis: 'admin',
    code: 'ABORTED',
    labelKo: '개입 취소',
    definitionKo: '개입/승인 프로세스가 취소/중단된 상태.',
    severity: 'info',
  },
  {
    axis: 'admin',
    code: 'UNKNOWN',
    labelKo: '알 수 없음',
    definitionKo: '계약에 없는 코드/필드가 수신되어 명시적으로 경고 처리된 상태.',
    severity: 'warn',
  },
];

