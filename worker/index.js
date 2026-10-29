import { Store } from './store.js';
import {
  json,
  fail,
  signToken,
  verifyToken,
  clientIp,
  bytesFromBase64
} from './util.js';

export { Store };

const PAGE_ROUTES = {
  '/': '/voter/index.html',
  '/voter': '/voter/index.html',
  '/voter/': '/voter/index.html',
  '/vote': '/voter/index.html',
  '/cms': '/cms/index.html',
  '/cms/': '/cms/index.html',
  '/admin': '/cms/index.html',
  '/scoreboard': '/scoreboard/index.html',
  '/scoreboard/': '/scoreboard/index.html',
  '/dashboard': '/scoreboard/index.html',
  '/dashboard/': '/scoreboard/index.html'
};

function store(env) {
  const id = env.STORE.idFromName('votecast');
  return env.STORE.get(id);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return {};
  }
}

async function requireAdmin(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const tokenSecret = await store(env).getSecret();
  const payload = await verifyToken(token, tokenSecret);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

async function mediaResponse(env, id) {
  const row = await store(env).getMedia(Number(id));
  if (!row) return fail('Not found', 404);
  const body = bytesFromBase64(row.data);
  return new Response(body, {
    headers: {
      'content-type': row.mime || 'application/octet-stream',
      'content-length': String(body.byteLength),
      'cache-control': 'public, max-age=31536000, immutable'
    }
  });
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization'
      }
    });
  }

  if (path === '/api/health') {
    return json({ status: 'ok', app: 'VoteCast', event: env.EVENT_NAME || 'DA-VELA HOUSE OF ART' });
  }

  const mediaMatch = /^\/api\/media\/(\d+)$/.exec(path);
  if (mediaMatch && method === 'GET') {
    return mediaResponse(env, mediaMatch[1]);
  }

  // Public voter API
  if (path === '/api/gallery' && method === 'GET') return json(await store(env).getGallery());
  if (path === '/api/vote/gallery' && method === 'GET') return json(await store(env).getGallery());
  if (path === '/api/vote/state' && method === 'GET') return json(await store(env).getState());
  if (path === '/api/vote/contestants' && method === 'GET') return json(await store(env).getPublicContestants());
  if (path === '/api/vote/me' && method === 'GET') {
    const voter = await store(env).getVoterStatus(url.searchParams.get('token') || '');
    if (!voter) return fail('Invalid session', 401);
    return json(voter);
  }
  if (path === '/api/scoreboard' && method === 'GET') return json(await store(env).getScoreboard());

  if (path === '/api/vote/register' && method === 'POST') {
    const body = await readJson(request);
    if (!body.name || !body.email || !body.telephone) return fail('Name, email and telephone are required');
    const result = await store(env).registerVoter({
      name: String(body.name).trim(),
      email: String(body.email).trim(),
      telephone: String(body.telephone).trim(),
      ip: clientIp(request)
    });
    return json(result);
  }

  if (path === '/api/vote/vote' && method === 'POST') {
    const body = await readJson(request);
    if (!body.contestant_id || !body.session_token) return fail('Missing contestant or session');
    const result = await store(env).castVote({
      token: body.session_token,
      contestantId: Number(body.contestant_id),
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') || ''
    });
    if (result.error) return fail(result.error, result.status || 400);
    return json(result);
  }

  if ((path === '/api/qr' || path === '/api/admin/qr') && method === 'GET') {
    const origin = url.origin;
    return json({ url: `${origin}/voter`, voter_url: `${origin}/voter`, qr_code: null, data_url: null });
  }

  // Admin API
  if (path === '/api/admin/login' && method === 'POST') {
    const body = await readJson(request);
    const admin = await store(env).adminLogin(body.username, body.password);
    if (!admin) return fail('Invalid credentials', 401);
    const tokenSecret = await store(env).getSecret();
    const token = await signToken({ sub: admin.username, role: admin.role || 'admin' }, tokenSecret);
    return json({ access_token: token, token_type: 'bearer', role: admin.role || 'admin' });
  }

  const isAdminRoute = path.startsWith('/api/admin/');
  if (!isAdminRoute) return fail('Not found', 404);

  const auth = await requireAdmin(request, env);
  if (!auth) return fail('Not authenticated', 401);

  const client = store(env);

  if (path === '/api/admin/contestants' && method === 'GET') {
    return json(await client.listContestants());
  }

  if (path === '/api/admin/contestants' && method === 'POST') {
    const body = await readJson(request);
    if (!body.name) return fail('Name is required');
    return json(await client.createContestant(body));
  }

  const contestantMatch = /^\/api\/admin\/contestants\/(\d+)$/.exec(path);
  if (contestantMatch) {
    const id = Number(contestantMatch[1]);
    if (method === 'PUT') {
      const body = await readJson(request);
      const result = await client.updateContestant(id, body);
      if (!result) return fail('Contestant not found', 404);
      return json(result);
    }
    if (method === 'DELETE') {
      const removed = await client.deleteContestant(id);
      if (!removed) return fail('Contestant not found', 404);
      return json({ message: 'Deleted' });
    }
  }

  if (path === '/api/admin/vote' && method === 'POST') {
    const body = await readJson(request);
    const result = await client.adminVote(
      Number(body.contestant_id),
      clientIp(request),
      request.headers.get('user-agent') || ''
    );
    if (!result) return fail('Contestant not found', 404);
    return json(result);
  }

  if (path === '/api/admin/event/control' && method === 'POST') {
    const body = await readJson(request);
    const state = await client.controlEvent(String(body.action || ''));
    return json({ message: `Action ${body.action} executed`, status: state.status, state });
  }

  if (path === '/api/admin/stats' && method === 'GET') return json(await client.getStats());
  if (path === '/api/admin/logs' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    return json(await client.getLogs(limit));
  }
  if (path === '/api/admin/voters' && method === 'GET') return json(await client.getVoters());
  if (path === '/api/admin/countdown/decrement' && method === 'POST') {
    const state = await client.decrementCountdown();
    return json({ ...state, message: `Countdown at ${state.countdown_value}s` });
  }

  return fail('Not found', 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        return fail(`Server error: ${error && error.message ? error.message : 'unknown'}`, 500);
      }
    }

    const mapped = PAGE_ROUTES[url.pathname];
  if (mapped && (request.method === 'GET' || request.method === 'HEAD')) {
    url.pathname = mapped;
    return env.ASSETS.fetch(new Request(url.toString(), request));
  }

  return env.ASSETS.fetch(request);
  }
};
