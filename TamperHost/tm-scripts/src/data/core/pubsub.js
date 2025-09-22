// src/data/core/pubsub.js
export class Bus {
    constructor(name = 'lt-data') { this.ch = ('BroadcastChannel' in self) ? new BroadcastChannel(name) : null; }
    publish(msg) { this.ch?.postMessage(msg); }
    subscribe(fn) { if (!this.ch) return () => { }; const h = (e) => fn(e.data); this.ch.addEventListener('message', h); return () => this.ch.removeEventListener('message', h); }
}
