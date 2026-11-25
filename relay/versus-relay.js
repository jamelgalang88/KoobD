// Versus Mode's live relay: passes each player's movement (and a "something
// happened, check now" nudge) straight to the other player in the same match,
// over a WebSocket, so the two screens stay within a few hundredths of a
// second of each other. It decides nothing: letters, hearts, answers, rounds
// and winners stay with versus_api.php (PHP), which also checks every move.
//
// Plain Node (no packages). ws:// on 8090, wss:// on 8091 with KoobD's local
// https certificate (docker/certs, made by docker/apache/start.sh), for pages
// opened over https.
//
// A player joins with a pass from versus_api.php ("lobby.user.side.expiry.
// signature", signed with the shared secret in docker/certs/relay-secret,
// which this relay makes on its first start).
//
// Messages (JSON text frames):
//   player -> relay   {t:'hello', token}           join the match
//                     {t:'m', s:[[stamp,x,y,f,m,g,vy], ...]}   movement (stamp:
//                                                    the server's clock, as the player knows it)
//                     {t:'e', k}                    nudge: check the game now
//                     {t:'p', c}                    ping (c: the player's clock)
//   relay -> player   {t:'ok', peer, at}            joined; is the other here?
//                     {t:'peer', on}                the other came or went
//                     {t:'m', at, s}                their movement (at: when it arrived)
//                     {t:'e', k}                    their nudge
//                     {t:'P', c, at}                pong (at: the relay's clock)
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CERTS = process.env.KOOBD_CERTS || '/certs';
const SECRET_FILE = path.join(CERTS, 'relay-secret');
const PORT = Number(process.env.RELAY_PORT || 8090);
const TLS_PORT = Number(process.env.RELAY_TLS_PORT || 8091);
const MAX_FRAME = 4096;            // bytes: movement messages are tiny
const MAX_PER_SECOND = 60;         // messages a player may send each second
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function secret() {
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o644 });
    console.log('relay: made a new secret');
  }
  // Readable by the web server (www-data), which signs the passes; the folder is never served.
  try { fs.chmodSync(SECRET_FILE, 0o644); } catch (error) { /* read-only: leave it */ }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}
let SECRET = secret();
fs.watchFile(SECRET_FILE, { interval: 5000 }, () => { try { SECRET = secret(); } catch (error) { /* keep the old one */ } });

// "lobby.user.side.expiry.signature" -> { lobby, user, side } or null.
function checkPass(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 5) return null;
  const [lobby, user, side, expiry, signature] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${lobby}.${user}.${side}.${expiry}`).digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;
  if (!['host', 'guest'].includes(side) || Number(expiry) * 1000 < Date.now()) return null;
  return { lobby: Number(lobby), user: Number(user), side };
}

// --- WebSocket frames (RFC 6455), just what the relay needs ---------------------------------------
function frame(opcode, payload = Buffer.alloc(0)) {
  const length = payload.length;
  let head;
  if (length < 126) head = Buffer.from([0x80 | opcode, length]);
  else if (length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(length), 2); }
  return Buffer.concat([head, payload]);
}
function send(client, message) {
  if (!client || client.closed) return;
  try { client.socket.write(frame(0x1, Buffer.from(JSON.stringify(message)))); } catch (error) { drop(client); }
}

const rooms = new Map();   // lobby -> { host, guest }
function drop(client, code = 1000) {
  if (client.closed) return;
  client.closed = true;
  try { client.socket.end(frame(0x8, Buffer.from([code >> 8, code & 255]))); } catch (error) { /* gone */ }
  client.socket.destroy();
  if (client.lobby) {
    const room = rooms.get(client.lobby);
    if (room && room[client.side] === client) {
      room[client.side] = null;
      send(room[client.side === 'host' ? 'guest' : 'host'], { t: 'peer', on: false });
      if (!room.host && !room.guest) rooms.delete(client.lobby);
    }
  }
}

function onMessage(client, text) {
  let message;
  try { message = JSON.parse(text); } catch (error) { return; }
  if (!message || typeof message !== 'object') return;
  if (message.t === 'p') { send(client, { t: 'P', c: Number(message.c) || 0, at: Date.now() }); return; }
  if (message.t === 'hello') {
    const pass = checkPass(message.token);
    if (!pass) { send(client, { t: 'no' }); drop(client, 4001); return; }
    Object.assign(client, pass);
    const room = rooms.get(pass.lobby) || { host: null, guest: null };
    rooms.set(pass.lobby, room);
    if (room[pass.side] && room[pass.side] !== client) drop(room[pass.side], 4000);   // the same player, again
    room[pass.side] = client;
    const other = room[pass.side === 'host' ? 'guest' : 'host'];
    send(client, { t: 'ok', peer: Boolean(other), at: Date.now() });
    send(other, { t: 'peer', on: true });
    return;
  }
  if (!client.lobby) return;
  const room = rooms.get(client.lobby);
  const other = room && room[client.side === 'host' ? 'guest' : 'host'];
  if (message.t === 'm' && Array.isArray(message.s)) {
    // Only well-formed samples, a few at a time.
    const samples = message.s.slice(-8).filter((s) => Array.isArray(s) && s.length === 7 && s.every((v) => typeof v === 'number' && Number.isFinite(v)));
    if (samples.length) send(other, { t: 'm', at: Date.now(), s: samples });
  } else if (message.t === 'e') {
    send(other, { t: 'e', k: String(message.k || '').slice(0, 16) });
  }
}

function onUpgrade(request, socket) {
  const key = request.headers['sec-websocket-key'];
  if (!key || String(request.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);   // send each small message at once
  const client = { socket, buffer: Buffer.alloc(0), closed: false, lobby: 0, side: '', user: 0, count: 0, second: 0, alive: true };
  // Not joined within 10 seconds: closed.
  const helloTimer = setTimeout(() => { if (!client.lobby) drop(client, 4001); }, 10000);
  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    if (client.buffer.length > MAX_FRAME * 4) { drop(client, 1009); return; }
    while (client.buffer.length >= 2) {
      const b0 = client.buffer[0];
      const b1 = client.buffer[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;
      if (length === 126) { if (client.buffer.length < 4) return; length = client.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { drop(client, 1009); return; }
      if (!masked || length > MAX_FRAME) { drop(client, 1002); return; }
      if (client.buffer.length < offset + 4 + length) return;
      const mask = client.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(client.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3];
      client.buffer = client.buffer.subarray(offset + 4 + length);
      if (opcode === 0x8) { drop(client); return; }
      if (opcode === 0x9) { try { socket.write(frame(0xA, payload)); } catch (error) { /* gone */ } continue; }
      if (opcode === 0xA) { client.alive = true; continue; }
      if (opcode !== 0x1) continue;
      // A player sending far too much is slowed down (extra messages dropped).
      const second = Math.floor(Date.now() / 1000);
      if (second !== client.second) { client.second = second; client.count = 0; }
      client.count += 1;
      if (client.count > MAX_PER_SECOND) continue;
      client.alive = true;
      onMessage(client, payload.toString('utf8'));
    }
  });
  socket.on('close', () => { clearTimeout(helloTimer); drop(client); });
  socket.on('error', () => drop(client));
  sockets.add(client);
  socket.on('close', () => sockets.delete(client));
}

// Dead connections (a phone that went to sleep) are closed after ~40 seconds.
const sockets = new Set();
setInterval(() => {
  sockets.forEach((client) => {
    if (!client.alive) { drop(client, 1001); return; }
    client.alive = false;
    try { client.socket.write(frame(0x9)); } catch (error) { drop(client); }
  });
}, 20000);

function answerPlain(request, response) {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('KoobD Versus relay\n');
}
const plain = http.createServer(answerPlain);
plain.on('upgrade', onUpgrade);
plain.listen(PORT, () => console.log(`relay: ws on ${PORT}`));

// wss for pages opened over https (the certificate is reloaded when it changes).
const keyFile = path.join(CERTS, 'koobd-server.key');
const certFile = path.join(CERTS, 'koobd-server.crt');
if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  const secure = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, answerPlain);
  secure.on('upgrade', onUpgrade);
  secure.listen(TLS_PORT, () => console.log(`relay: wss on ${TLS_PORT}`));
  fs.watchFile(certFile, { interval: 60000 }, () => {
    try { secure.setSecureContext({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }); } catch (error) { /* keep the old one */ }
  });
} else {
  console.log('relay: no https certificate yet, wss is off');
}
