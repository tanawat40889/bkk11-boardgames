// Realtime rooms over public MQTT-over-WebSocket brokers (no backend needed).
// Topics: <ROOT><room>/pub (host → all, retained) · /in (players → host) · /p/<pid> (host → one player, retained)
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
];
const ROOT = 'bkk11bg/v1/';

function open(url) {
  return new Promise((res, rej) => {
    const c = mqtt.connect(url, {
      clientId: 'bg' + Math.random().toString(36).slice(2, 12),
      connectTimeout: 5000, reconnectPeriod: 1500, keepalive: 20, clean: true,
    });
    let done = false;
    const fail = e => { if (done) return; done = true; clearTimeout(t); c.end(true); rej(e); };
    const t = setTimeout(() => fail(new Error('timeout')), 6000);
    c.once('connect', () => { if (done) return; done = true; clearTimeout(t); res(c); });
    c.on('error', fail);
  });
}

function peek(c, room, ms) {
  return new Promise(res => {
    const topic = ROOT + room + '/pub';
    let done = false;
    const fin = v => {
      if (done) return;
      done = true;
      c.removeListener('message', on);
      c.unsubscribe(topic);
      res(v);
    };
    const on = (tp, b) => {
      if (tp !== topic) return;
      const s = b.toString();
      try { fin(s ? JSON.parse(s) : null); } catch { fin(null); }
    };
    c.on('message', on);
    c.subscribe(topic, { qos: 1 });
    setTimeout(() => fin(null), ms);
  });
}

export class Room {
  constructor(c, room, bi) {
    this.c = c; this.room = room; this.bi = bi; this.base = ROOT + room + '/'; this.h = {};
    this.online = true;
    c.on('message', (t, b) => {
      if (!t.startsWith(this.base)) return;
      const f = this.h[t.slice(this.base.length)];
      if (!f) return;
      const s = b.toString();
      let v = null;
      if (s) try { v = JSON.parse(s); } catch { return; }
      try { f(v); } catch (e) { console.error(e); }
    });
    c.on('offline', () => { this.online = false; this.onStatus?.(false); });
    c.on('close', () => { if (this.online) { this.online = false; this.onStatus?.(false); } });
    c.on('connect', () => { this.online = true; this.onStatus?.(true); });
  }
  sub(k, f) { this.h[k] = f; this.c.subscribe(this.base + k, { qos: 1 }); }
  send(k, v, retain = false) { this.c.publish(this.base + k, v == null ? '' : JSON.stringify(v), { qos: 1, retain }); }
  kick() { if (!this.c.connected) this.c.reconnect(); }
  end() { this.c.end(); }
}

const free = v => !v || v.closed;

export async function create(gen) {
  let last;
  for (let i = 0; i < BROKERS.length; i++) {
    let c;
    try { c = await open(BROKERS[i]); } catch (e) { last = e; continue; }
    for (let k = 0; k < 5; k++) {
      const room = gen();
      if (free(await peek(c, room, 1200))) return new Room(c, room, i);
    }
    c.end(true);
  }
  throw last || new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
}

// Find which broker holds the room (host's retained /pub is the marker).
export async function join(room, pref) {
  const order = BROKERS.map((_, i) => i);
  if (pref != null && order.includes(pref)) order.sort((a, b) => (a === pref ? -1 : b === pref ? 1 : 0));
  let reached = 0;
  for (const i of order) {
    let c;
    try { c = await open(BROKERS[i]); reached++; } catch { continue; }
    const v = await peek(c, room, 2500);
    if (!free(v)) return { room: new Room(c, room, i), pub: v };
    c.end(true);
  }
  if (!reached) throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ตรวจสอบอินเทอร์เน็ต');
  return null;
}

export async function reopen(room, bi) {
  const order = [bi, ...BROKERS.map((_, i) => i).filter(i => i !== bi)];
  for (const i of order) {
    try { return new Room(await open(BROKERS[i]), room, i); } catch {}
  }
  throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
}
