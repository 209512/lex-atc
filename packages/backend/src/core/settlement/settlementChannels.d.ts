export declare function channelIdForAgent(agentUuid: string): string;
export declare function ensureChannel(engine: any, agent: any): Promise<string>;
export declare function onTaskExecuted(engine: any, task: any, execResult: any): Promise<any>;
export declare function flushPending(engine: any): Promise<any>;

