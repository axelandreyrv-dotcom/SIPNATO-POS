import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.js';

export class PlatformDO extends DurableObject<Env> {
  override async fetch(_request: Request): Promise<Response> {
    return new Response('No implementado', { status: 501 });
  }
}
