import { http, HttpResponse } from 'msw';
import { db, broadcast } from '../core/db';

export const taskHandlers = [
  http.get('/api/tasks/pending', () =>
    HttpResponse.json({ tasks: db.isolation.tasks }),
  ),

  http.post('/api/tasks/:taskId/finalize', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'FINALIZED';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/tasks/:taskId/rollback', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'ROLLED_BACK';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/tasks/:taskId/cancel', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'CANCELLED';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),

  http.post('/api/tasks/:taskId/retry', ({ params }) => {
    const taskId = String(params.taskId);
    const task = db.isolation.tasks.find(t => String(t.taskId ?? t.id) === taskId);
    if (task) task.status = 'PENDING';
    broadcast();
    return HttpResponse.json({ success: true, scheduled: true });
  }),
];

