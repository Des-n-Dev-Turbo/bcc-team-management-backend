import { Hono } from 'hono';
import { AppContext } from '@/types/context.ts';

const app = new Hono<AppContext>();

app.get('/', (c) => c.text('Deno + Hono is working!'));

Deno.serve({ port: 8080 }, app.fetch);
