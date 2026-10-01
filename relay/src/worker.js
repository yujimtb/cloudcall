import { DurableObject } from 'cloudflare:workers';
import { connect } from 'cloudflare:sockets';

const ROOM_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const ROLES = new Set(['host', 'phone']);
const TUNNEL_TARGETS = new Set(['dhtproxy.jami.net:443', 'ns.jami.net:443', 'turn.jami.net:3478']);

export class Room extends DurableObject {
  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role');
    for (const old of this.ctx.getWebSockets(role)) old.close(4000, 'replaced');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  peerOf(ws) {
    return this.ctx.getTags(ws)[0] === 'host' ? 'phone' : 'host';
  }

  broadcastPresence(closing) {
    const open = (role) => this.ctx.getWebSockets(role).some((ws) => ws !== closing);
    const present = { host: open('host'), phone: open('phone') };
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue;
      try { ws.send(JSON.stringify({ type: 'presence', ...present })); } catch {}
    }
  }

  webSocketMessage(ws, message) {
    for (const peer of this.ctx.getWebSockets(this.peerOf(ws))) {
      try { peer.send(message); } catch {}
    }
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'closed'); } catch {}
    this.broadcastPresence(ws);
  }

  webSocketError(ws) {
    this.broadcastPresence(ws);
  }
}

export class Tunnel extends DurableObject {
  async fetch(request) {
    const [hostname, port] = new URL(request.url).searchParams.get('target').split(':');
    const socket = connect({ hostname, port: Number(port) });
    const writer = socket.writable.getWriter();
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try { server.close(1000, 'closed'); } catch {}
      socket.close().catch(() => {});
    };
    server.addEventListener('message', (event) => {
      const data = typeof event.data === 'string' ? new TextEncoder().encode(event.data) : new Uint8Array(event.data);
      writer.write(data).catch(close);
    });
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    socket.readable.pipeTo(new WritableStream({ write: (chunk) => server.send(chunk) })).catch(() => {}).finally(close);
    return new Response(null, { status: 101, webSocket: client });
  }
}

async function secretMatches(env, given) {
  if (!env.TUNNEL_SECRET || !given) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([given, env.TUNNEL_SECRET].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function tunnel(request, env, secret, target) {
  if (!(await secretMatches(env, secret))) return new Response('forbidden', { status: 403 });
  if (!TUNNEL_TARGETS.has(target)) return new Response('target not allowed', { status: 403 });
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
  const url = new URL(request.url);
  url.search = `?target=${target}`;
  return env.TUNNELS.get(env.TUNNELS.idFromName('egress')).fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, kind, room, target] = url.pathname.split('/');
    if (kind === 'tunnel') return tunnel(request, env, room, target);
    if (kind === 'ws') {
      if (!ROOM_PATTERN.test(room ?? '')) return new Response('bad room', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      if (!ROLES.has(url.searchParams.get('role'))) return new Response('bad role', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
