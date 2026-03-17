import { Hono } from 'hono';
import type { AppContext } from '@/types';

import profileRoutes from '@/routes/profile.routes.ts';
import yearRoutes from '@/routes/years.routes.ts';

const app = new Hono<AppContext>();

app.get('/', (c) => c.text('Deno + Hono is working!'));

app.route('/profile', profileRoutes);

app.route('/year', yearRoutes);

Deno.serve({ port: 8080 }, app.fetch);
