const dgram = require('node:dgram');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const tls = require('node:tls');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');

const env = Object.fromEntries(
  fs.readFileSync(process.env.CLOUDCALL_ENV || `${__dirname}/../private/call.env`, 'utf8').split('\n').filter(Boolean).map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
const base = env.RELAY_URL.replace(/^http/, 'ws');
const DHT_PORT = Number(process.env.DHT_PORT || 18481);
const NS_PORT = Number(process.env.NS_PORT || 18482);
const TURN_PORT = Number(process.env.TURN_PORT || 3478);
const log = (...args) => console.log(new Date().toISOString(), ...args);

const openTunnel = (target) => new WebSocket(`${base}/tunnel/${env.TUNNEL_SECRET}/${target}`, { agent, perMessageDeflate: false });

function httpsForward(port, host) {
  http.createServer((request, response) => {
    const upstream = http.request({
      host,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host },
      createConnection: () => tls.connect({ socket: WebSocket.createWebSocketStream(openTunnel(`${host}:443`)), servername: host }),
    }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers);
      response.flushHeaders();
      reply.pipe(response);
    });
    upstream.on('error', (error) => {
      log(`${host} tunnel error`, request.method, request.url, error.message);
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  }).listen(port, '127.0.0.1', () => log(`${host} forward on 127.0.0.1:${port}`));
}

httpsForward(DHT_PORT, 'dhtproxy.jami.net');
httpsForward(NS_PORT, 'ns.jami.net');

net.createServer((client) => {
  const stream = WebSocket.createWebSocketStream(openTunnel('turn.jami.net:3478'));
  log('TURN (TCP) connection');
  client.pipe(stream).pipe(client);
  const end = () => { client.destroy(); stream.destroy(); };
  client.on('error', end);
  stream.on('error', (error) => { log('TURN (TCP) tunnel error', error.message); end(); });
  client.on('close', end);
  stream.on('close', end);
}).listen(TURN_PORT, '127.0.0.1', () => log(`TURN (TCP) forward on 127.0.0.1:${TURN_PORT}`));

const udp = dgram.createSocket('udp4');
const sessions = new Map();

function turnSession(address, port) {
  const key = `${address}:${port}`;
  let session = sessions.get(key);
  if (session) return session;
  const ws = openTunnel('turn.jami.net:3478');
  session = { ws, pending: [], buffer: Buffer.alloc(0) };
  sessions.set(key, session);
  log('TURN session open for', key);
  ws.on('open', () => session.pending.splice(0).forEach((data) => ws.send(data)));
  ws.on('message', (data) => {
    session.buffer = Buffer.concat([session.buffer, data]);
    for (;;) {
      const buffer = session.buffer;
      if (buffer.length < 4) break;
      const length = buffer.readUInt16BE(2);
      const isChannelData = (buffer[0] & 0xc0) === 0x40;
      const size = isChannelData ? 4 + length : 20 + length;
      const consumed = isChannelData ? (size + 3) & ~3 : size;
      if (buffer.length < consumed) break;
      udp.send(buffer.subarray(0, size), port, address);
      session.buffer = buffer.subarray(consumed);
    }
  });
  const end = () => {
    if (sessions.get(key) === session) sessions.delete(key);
    log('TURN session closed for', key);
  };
  ws.on('close', end);
  ws.on('error', (error) => { log('TURN tunnel error', error.message); end(); });
  return session;
}

udp.on('message', (message, remote) => {
  const session = turnSession(remote.address, remote.port);
  let data = message;
  if ((message[0] & 0xc0) === 0x40 && message.length % 4) data = Buffer.concat([message, Buffer.alloc(4 - (message.length % 4))]);
  if (session.ws.readyState === WebSocket.OPEN) session.ws.send(data);
  else session.pending.push(data);
});
udp.bind(TURN_PORT, '127.0.0.1', () => log(`TURN (UDP) adapter on 127.0.0.1:${TURN_PORT}`));
