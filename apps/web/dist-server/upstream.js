import { serverEventPushSchema } from '@loopify/protocol';
import WebSocket from 'ws';
/** Single outbound WS to loopify `apps/server` /web — fans events to handlers */
export class MusicUpstream {
    env;
    handlers = new Set();
    reconnect = null;
    constructor(env) {
        this.env = env;
    }
    connect() {
        const base = this.env.musicServerUrl.replace(/^http/, 'ws');
        const url = `${base}/web`;
        const ws = new WebSocket(url);
        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'webHello',
                token: this.env.internalToken,
            }));
        });
        ws.on('message', (raw) => {
            try {
                const data = JSON.parse(String(raw));
                const parsed = serverEventPushSchema.safeParse(data);
                if (!parsed.success) {
                    return;
                }
                const ev = parsed.data.event;
                for (const h of this.handlers) {
                    h(ev);
                }
            }
            catch {
                /* ignore */
            }
        });
        ws.on('close', () => {
            if (!this.reconnect) {
                this.reconnect = setTimeout(() => {
                    this.reconnect = null;
                    this.connect();
                }, 3000);
            }
        });
    }
    onEvent(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    upstreamFetch(path, init) {
        return fetch(`${this.env.musicServerUrl}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.env.internalToken}`,
                'Content-Type': 'application/json',
                ...init?.headers,
            },
        });
    }
}
