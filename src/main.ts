import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('Deno + Hono is working!'));

Deno.serve({ port: 8080 }, app.fetch);
