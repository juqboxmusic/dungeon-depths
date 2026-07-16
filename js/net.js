// ============================================================
//  NET — thin PeerJS wrapper (host-authoritative rooms)
//  The host's browser is the source of truth; guests connect
//  directly to it over WebRTC (PeerJS's free cloud handles the
//  handshake — no server of our own, works from static hosting).
// ============================================================

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export function makeRoomCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
const peerId = (code) => `ddepths-${code.toUpperCase()}-host`;

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.conns = new Map();   // host: peerId -> DataConnection
    this.hostConn = null;     // guest: connection to host
    this.onMessage = null;    // (msg, fromConnId) => void
    this.onPeerJoin = null;   // host: (connId) => void
    this.onPeerLeave = null;  // (connId) => void
    this.onDisconnected = null; // guest: lost the host
  }

  _newPeer(id) {
    // PeerJS is loaded globally from the CDN <script> tag
    return new window.Peer(id, { debug: 1 });
  }

  /** Host a room. Resolves with the room code once registered. */
  host() {
    return new Promise((resolve, reject) => {
      const code = makeRoomCode();
      const peer = this._newPeer(peerId(code));
      const timer = setTimeout(() => reject(new Error('Could not reach the connection service.')), 12000);
      peer.on('open', () => {
        clearTimeout(timer);
        this.peer = peer;
        this.isHost = true;
        this.code = code;
        peer.on('connection', (conn) => {
          conn.on('open', () => {
            this.conns.set(conn.peer, conn);
            this.onPeerJoin?.(conn.peer);
          });
          conn.on('data', (msg) => this.onMessage?.(msg, conn.peer));
          conn.on('close', () => {
            this.conns.delete(conn.peer);
            this.onPeerLeave?.(conn.peer);
          });
        });
        resolve(code);
      });
      peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  }

  /** Join a room by code. Resolves once connected to the host. */
  join(code) {
    return new Promise((resolve, reject) => {
      const peer = this._newPeer(undefined); // random id
      const timer = setTimeout(() => reject(new Error('Room not found — check the code.')), 15000);
      peer.on('open', () => {
        const conn = peer.connect(peerId(code), { reliable: true });
        conn.on('open', () => {
          clearTimeout(timer);
          this.peer = peer;
          this.isHost = false;
          this.code = code.toUpperCase();
          this.hostConn = conn;
          conn.on('data', (msg) => this.onMessage?.(msg, 'host'));
          conn.on('close', () => this.onDisconnected?.());
          resolve();
        });
        conn.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  }

  /** Guest → host. */
  send(msg) {
    this.hostConn?.send(msg);
  }

  /** Host → every guest (or a specific one). */
  broadcast(msg, onlyConnId = null) {
    if (onlyConnId) { this.conns.get(onlyConnId)?.send(msg); return; }
    for (const c of this.conns.values()) c.send(msg);
  }

  leave() {
    try { this.peer?.destroy(); } catch { /* already gone */ }
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
    this.isHost = false;
    this.code = null;
  }
}
