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

/** Turn PeerJS's terse errors into something a player can act on. */
function friendlyError(e) {
  switch (e?.type) {
    case 'peer-unavailable':
      return new Error('Room not found — check the code, and make sure the host still has the game open on screen.');
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return new Error('Could not reach the connection service — check your internet and try again.');
    case 'browser-incompatible':
      return new Error('This browser does not support online play.');
    default:
      return e instanceof Error ? e : new Error(String(e?.message || e || 'Connection failed.'));
  }
}

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
        clearTimeout(this._reconT); // reconnect succeeded — stop retrying
        this.peer = peer;
        this.isHost = true;
        this.code = code;
        resolve(code);
      });
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
      // The signalling socket dies silently when a tablet locks its screen or
      // backgrounds the browser. Players already in the game keep playing
      // (their traffic is peer-to-peer), but NEW players can't find the room
      // until we re-register — so reconnect relentlessly.
      peer.on('disconnected', () => this._keepRegistered(peer));
      this._visHandler = () => {
        if (!document.hidden && peer.disconnected && !peer.destroyed) peer.reconnect();
      };
      document.addEventListener('visibilitychange', this._visHandler);
      peer.on('error', (e) => {
        clearTimeout(timer);
        if (!this.peer) { try { peer.destroy(); } catch { /* already gone */ } } // failed before opening
        reject(friendlyError(e));
      });
    });
  }

  _keepRegistered(peer) {
    if (peer.destroyed) return;
    try { peer.reconnect(); } catch { /* not reconnectable right now */ }
    clearTimeout(this._reconT);
    this._reconT = setTimeout(() => {
      if (!peer.destroyed && peer.disconnected) this._keepRegistered(peer);
    }, 3000);
  }

  /** Join a room by code. Resolves once connected to the host.
   *  Retries a few times — the host may be mid-reconnect after its
   *  tablet screen was locked. */
  join(code) {
    return new Promise((resolve, reject) => {
      const peer = this._newPeer(undefined); // random id
      let attempts = 0;
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { peer.destroy(); } catch { /* already gone */ }
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error('Could not reach the room — try again.')), 25000);
      const tryConnect = () => {
        if (settled) return;
        const conn = peer.connect(peerId(code), { reliable: true });
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.peer = peer;
          this.isHost = false;
          this.code = code.toUpperCase();
          this.hostConn = conn;
          conn.on('data', (msg) => this.onMessage?.(msg, 'host'));
          conn.on('close', () => this.onDisconnected?.());
          resolve();
        });
      };
      peer.on('open', tryConnect);
      peer.on('error', (e) => {
        if (settled) return;
        if (e.type === 'peer-unavailable' && ++attempts < 4) {
          setTimeout(tryConnect, 2500); // give the host a moment to re-register
        } else {
          fail(friendlyError(e));
        }
      });
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
    clearTimeout(this._reconT);
    if (this._visHandler) {
      document.removeEventListener('visibilitychange', this._visHandler);
      this._visHandler = null;
    }
    try { this.peer?.destroy(); } catch { /* already gone */ }
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
    this.isHost = false;
    this.code = null;
  }
}
