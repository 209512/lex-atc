import type { MockDB } from './types';

const setPauseReason = (db: MockDB, uuid: string, reason: 'admin' | 'globalStop', enabled: boolean) => {
  const meta = db.agentMetas[uuid];
  if (!meta) return;
  const wasPaused = meta.pauseReasons.admin || meta.pauseReasons.globalStop;
  meta.pauseReasons[reason] = enabled;
  const isPausedNow = meta.pauseReasons.admin || meta.pauseReasons.globalStop;
  const now = Date.now();
  if (!wasPaused && isPausedNow && !meta.pausedAt) meta.pausedAt = now;
  if (wasPaused && !isPausedNow && meta.pausedAt) {
    meta.totalPausedMs += now - meta.pausedAt;
    meta.pausedAt = null;
  }
};

export const setGlobalStop = (db: MockDB, enable: boolean) => {
  db.atcState.globalStop = Boolean(enable);
  for (const a of db.agents) setPauseReason(db, a.uuid, 'globalStop', Boolean(enable));
};

export const setAdminPause = (db: MockDB, uuid: string, pause: boolean) => {
  setPauseReason(db, uuid, 'admin', Boolean(pause));
};

