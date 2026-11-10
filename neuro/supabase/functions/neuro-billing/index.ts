import { createHandler } from './core.js';
Deno.serve(createHandler({ env: (name: string) => Deno.env.get(name) }));
