// Namohills backend — Cloudflare Pages _worker.js (drag & drop upload) + D1 database.
// Secrets needed: ADMIN_USER, ADMIN_PASS, ADMIN_SECRET (see README.md)
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const S = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
const digits = v => String(v || '').replace(/\D/g, '');
const rid = p => p + Date.now().toString().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
const BOOK_TYPES = ['room', 'dining', 'turf', 'garden', 'pool'];
const PREFIX = { room: 'NR', dining: 'ND', turf: 'NT', garden: 'NG', pool: 'NP' };
const BOOK_STATUS = ['Confirmed', 'Checked In', 'Checked Out'];
const CLIENT_STATUS = ['New', 'Contacted', 'Done'];

const enc = new TextEncoder();
async function sign(env, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env.ADMIN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
async function isAdmin(req, env) {
  if (!env.ADMIN_SECRET) return false;
  const t = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await sign(env, exp));
}

async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const m = request.method;
  const db = env.DB;
  let body = {};
  if (m === 'POST' || m === 'PATCH') { try { body = await request.json(); } catch (e) { return J({ error: 'Invalid request' }, 400); } }
  try {
    /* ---------- public ---------- */
    if (p[0] === 'bookings' && m === 'POST') {
      const type = S(body.type);
      const name = S(body.name, 100), phone = S(body.phone, 20), email = S(body.email, 120);
      const total = Math.round(Number(body.total));
      if (!BOOK_TYPES.includes(type)) return J({ error: 'Invalid booking type' }, 400);
      if (!name || digits(phone).length < 10) return J({ error: 'Name and valid mobile number required' }, 400);
      if (!S(body.item) || !S(body.checkin) || !(total > 0)) return J({ error: 'Incomplete booking' }, 400);
      const id = rid(PREFIX[type]);
      await db.prepare('INSERT INTO bookings (id,type,name,phone,email,item,itemId,checkin,checkout,slotTime,guests,nights,total,status,paymentMethod,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, type, name, phone, email, S(body.item), S(body.itemId, 60), S(body.checkin, 20), S(body.checkout, 20), S(body.slotTime, 40), S(body.guests, 40),
          Math.max(1, parseInt(body.nights) || 1), total, 'Confirmed', S(body.paymentMethod, 20), new Date().toISOString()).run();
      return J({ id });
    }
    if (p[0] === 'track' && m === 'GET') {
      const ph = digits(url.searchParams.get('phone')).slice(-10);
      if (ph.length < 10) return J({ bookings: [] });
      const r = await db.prepare("SELECT id,type,name,item,checkin,checkout,slotTime,guests,total,status FROM bookings WHERE substr(replace(replace(replace(phone,' ',''),'-',''),'+',''),-10)=? ORDER BY createdAt").bind(ph).all();
      return J({ bookings: r.results });
    }
    if (p[0] === 'clients' && m === 'POST') {
      const name = S(body.name, 100), phone = S(body.phone, 20);
      if (!name || digits(phone).length < 10 || !S(body.purpose) || !S(body.fromDate)) return J({ error: 'Required details missing' }, 400);
      const id = rid('NC');
      const f = ['whatsapp', 'email', 'city', 'address', 'idType', 'idNumber', 'purpose', 'guests', 'fromDate', 'toDate', 'time', 'rooms', 'notes', 'source'].map(k => S(body[k], k === 'notes' || k === 'address' ? 1000 : 120));
      await db.prepare('INSERT INTO clients (id,name,phone,whatsapp,email,city,address,idType,idNumber,purpose,guests,fromDate,toDate,time,rooms,notes,source,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, name, phone, ...f, 'New', new Date().toISOString()).run();
      return J({ id });
    }
    if (p[0] === 'room-status' && m === 'GET') {
      const r = await db.prepare('SELECT roomId,status FROM room_status').all();
      return J({ status: Object.fromEntries(r.results.map(x => [x.roomId, x.status])) });
    }

    /* ---------- admin ---------- */
    if (p[0] === 'admin' && p[1] === 'login' && m === 'POST') {
      const ok = env.ADMIN_USER && env.ADMIN_PASS && env.ADMIN_SECRET && same(S(body.user), env.ADMIN_USER) && same(S(body.pass), env.ADMIN_PASS);
      if (!ok) { await new Promise(r => setTimeout(r, 700)); return J({ error: 'Invalid username or password.' }, 401); }
      const exp = String(Date.now() + 12 * 3600 * 1000);
      return J({ token: exp + '.' + await sign(env, exp) });
    }
    if (p[0] === 'admin') {
      if (!(await isAdmin(request, env))) return J({ error: 'Unauthorized' }, 401);
      const [, res, id] = p;
      if (res === 'bookings') {
        if (m === 'GET') return J({ bookings: (await db.prepare('SELECT * FROM bookings ORDER BY createdAt').all()).results });
        if (m === 'PATCH' && BOOK_STATUS.includes(body.status)) { await db.prepare('UPDATE bookings SET status=? WHERE id=?').bind(body.status, id).run(); return J({ ok: true }); }
        if (m === 'DELETE') { await db.prepare('DELETE FROM bookings WHERE id=?').bind(id).run(); return J({ ok: true }); }
      }
      if (res === 'clients') {
        if (m === 'GET') return J({ clients: (await db.prepare('SELECT * FROM clients ORDER BY createdAt').all()).results });
        if (m === 'PATCH' && CLIENT_STATUS.includes(body.status)) { await db.prepare('UPDATE clients SET status=? WHERE id=?').bind(body.status, id).run(); return J({ ok: true }); }
        if (m === 'DELETE') { await db.prepare('DELETE FROM clients WHERE id=?').bind(id).run(); return J({ ok: true }); }
      }
      if (res === 'room-status' && m === 'POST' && ['Available', 'Maintenance'].includes(body.status)) {
        await db.prepare('INSERT INTO room_status (roomId,status) VALUES (?,?) ON CONFLICT(roomId) DO UPDATE SET status=excluded.status').bind(S(body.roomId, 60), body.status).run();
        return J({ ok: true });
      }
    }
    return J({ error: 'Not found' }, 404);
  } catch (e) {
    return J({ error: 'Server error' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return onRequest({ request, env });
    if (pathname === '/schema.sql') return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
