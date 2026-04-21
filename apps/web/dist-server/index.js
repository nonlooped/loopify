import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocketServer } from 'ws';
import { loadWebEnv } from './env.js';
import { clearSessionCookie, createSessionCookie, readSessionUserId, } from './session.js';
import { MusicUpstream } from './upstream.js';
const env = loadWebEnv();
const upstream = new MusicUpstream(env);
upstream.connect();
const app = new Hono();
app.use('*', cors({
    origin: env.publicBaseUrl,
    credentials: true,
}));
app.get('/health', (c) => c.json({ ok: true }));
app.get('/auth/discord', (c) => {
    const state = crypto.randomUUID();
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', env.discordClientId);
    url.searchParams.set('redirect_uri', env.discordRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', state);
    c.header('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    return c.redirect(url.toString());
});
function parseCookie(header, name) {
    if (!header) {
        return undefined;
    }
    const m = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}
app.get('/auth/discord/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const cookieState = parseCookie(c.req.header('cookie'), 'oauth_state');
    if (!code || !state || state !== cookieState) {
        return c.text('Invalid OAuth state', 400);
    }
    const body = new URLSearchParams({
        client_id: env.discordClientId,
        client_secret: env.discordClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.discordRedirectUri,
    });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!tokenRes.ok) {
        return c.text('Token exchange failed', 400);
    }
    const tokens = (await tokenRes.json());
    const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!meRes.ok) {
        return c.text('User fetch failed', 400);
    }
    const me = (await meRes.json());
    const sessionCookie = await createSessionCookie(env, me.id);
    c.header('Set-Cookie', sessionCookie);
    c.header('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Max-Age=0', {
        append: true,
    });
    return c.redirect(`${env.publicBaseUrl}/`);
});
app.get('/auth/logout', (c) => {
    c.header('Set-Cookie', clearSessionCookie());
    return c.redirect(`${env.publicBaseUrl}/login`);
});
async function requireUser(c) {
    const userId = await readSessionUserId(env, c.req.header('cookie'));
    return userId;
}
function apiSubpath(path) {
    return path.replace(/^\/api/, '') || '/';
}
async function checkGuildAccess(guildId, userId) {
    const r = await upstream.upstreamFetch(`/api/access/${encodeURIComponent(guildId)}/${encodeURIComponent(userId)}`);
    if (!r.ok) {
        return false;
    }
    const j = (await r.json());
    return j.allowed;
}
app.get('/api/me', async (c) => {
    const userId = await requireUser(c);
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    return c.json({ userId });
});
app.get('/api/players', async (c) => {
    const userId = await requireUser(c);
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const r = await upstream.upstreamFetch('/api/players');
    if (!r.ok) {
        return new Response(r.body, { status: r.status });
    }
    const j = (await r.json());
    const filtered = [];
    for (const p of j.players) {
        if (await checkGuildAccess(p.guildId, userId)) {
            filtered.push(p);
        }
    }
    return c.json({ players: filtered });
});
app.get('/api/controller', async (c) => {
    const userId = await requireUser(c);
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const lookupRes = await upstream.upstreamFetch(`/api/access/lookup/${encodeURIComponent(userId)}`);
    if (!lookupRes.ok) {
        return new Response(lookupRes.body, { status: lookupRes.status });
    }
    const lookup = (await lookupRes.json());
    if (!lookup.guildId) {
        return c.json({ player: null });
    }
    const playerRes = await upstream.upstreamFetch(`/api/players/${encodeURIComponent(lookup.guildId)}`);
    if (playerRes.status === 404) {
        return c.json({ player: null });
    }
    if (!playerRes.ok) {
        return new Response(playerRes.body, { status: playerRes.status });
    }
    const body = (await playerRes.json());
    return c.json({ player: body.player });
});
app.all('/api/*', async (c) => {
    const userId = await requireUser(c);
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    const path = c.req.path;
    const sub = apiSubpath(path);
    const method = c.req.method;
    const guildMatch = sub.match(/^\/players\/([^/]+)/);
    const guildId = guildMatch?.[1];
    const needsAccess = guildId &&
        !sub.includes('/search') &&
        (method !== 'GET' || /^\/players\/[^/]+$/.test(sub));
    if (needsAccess && !(await checkGuildAccess(guildId, userId))) {
        return c.json({ error: 'Join the same voice channel as the bot.' }, 403);
    }
    const url = new URL(c.req.url);
    const target = `${env.musicServerUrl}/api${sub}${url.search}`;
    const body = method === 'GET' || method === 'HEAD'
        ? undefined
        : await c.req.arrayBuffer();
    const res = await fetch(target, {
        method,
        headers: {
            Authorization: `Bearer ${env.internalToken}`,
            ...(method !== 'GET' && method !== 'HEAD'
                ? { 'Content-Type': c.req.header('content-type') ?? 'application/json' }
                : {}),
        },
        body,
    });
    return new Response(res.body, {
        status: res.status,
        headers: res.headers,
    });
});
const __dirname = dirname(fileURLToPath(import.meta.url));
const staticRoot = join(__dirname, '../dist/client');
if (process.env.NODE_ENV === 'production') {
    app.use('/*', serveStatic({
        root: staticRoot,
    }));
    app.get('*', (c) => {
        try {
            const html = readFileSync(join(staticRoot, 'index.html'), 'utf8');
            return c.html(html);
        }
        catch {
            return c.text('Not found', 404);
        }
    });
}
const server = serve({
    fetch: app.fetch,
    port: env.port,
    hostname: '0.0.0.0',
}, () => {
    console.info(`web controller listening on ${env.port}`);
});
const browserSockets = new Set();
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
    browserSockets.add(ws);
    ws.on('close', () => browserSockets.delete(ws));
});
upstream.onEvent((ev) => {
    const msg = JSON.stringify({ type: 'serverEvent', event: ev });
    for (const ws of browserSockets) {
        if (ws.readyState === 1) {
            ws.send(msg);
        }
    }
});
server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? 'localhost';
    const url = new URL(request.url ?? '/', `http://${host}`);
    if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
    else {
        socket.destroy();
    }
});
