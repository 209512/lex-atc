export type SettlementRepo = {
  getDispute: (idempotencyKey: string) => Promise<any>;
  insertDispute: (row: any) => Promise<any>;
  upsertChannel: (row: any) => Promise<any>;
  getChannel: (channelId: string) => Promise<any>;
  getChannelSnapshot: (channelId: string, nonce: number) => Promise<any>;
  insertChannelSnapshot: (snapshot: any) => Promise<any>;
  updateSnapshotOnchainStatus: (row: any) => Promise<any>;
};

export declare function createSettlementRepo(deps?: { db?: any }): SettlementRepo;

