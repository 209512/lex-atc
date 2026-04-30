import { http, HttpResponse } from 'msw';

export const authHandlers = [
  http.post('/api/auth/session', () =>
    HttpResponse.json({ success: true, mode: 'disabled' }),
  ),
  http.delete('/api/auth/session', () =>
    HttpResponse.json({ success: true }),
  ),
];

