import { http } from 'msw';
import { db, subscribe } from '../core/db';

export const streamHandlers = [
  http.get('/api/stream', () => {
    const encoder = new TextEncoder();
    let unsub: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const initial = {
          agents: db.agents,
          state: {
            ...db.atcState,
            logs: db.logs.slice(-100),
            governance: db.governance,
            isolation: db.isolation,
            settlement: db.settlement,
            activeAgentCount: db.agents.length,
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`));

        unsub = subscribe((payload) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            unsub?.();
            unsub = null;
          }
        });
      },
      cancel() {
        unsub?.();
        unsub = null;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }),
];

