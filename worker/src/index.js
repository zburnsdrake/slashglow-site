// Cloudflare entry point: wires handler.js to a single Durable Object that
// keeps the daily counters (strongly consistent, so the global cap holds).
import { DurableObject } from 'cloudflare:workers';
import catalog from '../../catalog.json' with { type: 'json' };
import { handle, today } from './handler.js';
import { LimiterCore } from './limiter.js';

export class Limiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL)');
    this.core = new LimiterCore({
      get: key => sql.exec('SELECT n FROM counters WHERE key = ?', key).toArray()[0]?.n ?? 0,
      set: (key, day, n) => sql.exec('INSERT INTO counters (key, day, n) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET n = excluded.n, day = excluded.day', key, day, n),
      purgeBefore: day => sql.exec('DELETE FROM counters WHERE day < ?', day)
    });
    this.lastPurge = '';
  }
  purgeOld(day) {
    if (this.lastPurge === day) return;
    const yesterday = today(Date.parse(day) - 864e5);
    this.core.purge(yesterday); // keep today and yesterday only
    this.lastPurge = day;
  }
  async take(args) { this.purgeOld(args.day); return this.core.take(args); }
  async addTokens(args) { return this.core.addTokens(args); }
  async status(args) { return this.core.status(args); }
}

export default {
  async fetch(request, env) {
    const limiter = env.LIMITER.get(env.LIMITER.idFromName('global'));
    try {
      return await handle(request, env, { limiter, catalog, fetch: (...a) => fetch(...a), now: () => Date.now() });
    } catch {
      // Never log request bodies: they hold what visitors typed.
      return new Response(JSON.stringify({ error: 'server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
};
