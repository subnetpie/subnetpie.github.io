const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
});

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '';
  const allowOrigin = allowed === '*' || origin === allowed ? (allowed === '*' ? '*' : origin) : '';
  return allowOrigin ? {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-headers': 'authorization, content-type, if-match, x-filename, x-sha256',
    'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
    'access-control-expose-headers': 'etag'
  } : {};
}

function authorized(request, env) {
  if(!env.SYNC_TOKEN) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${env.SYNC_TOKEN}`;
}

function cleanId(value) {
  if(!/^[A-Za-z0-9._-]{1,128}$/.test(value || '')) throw new Error('invalid id');
  return value;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getProfile(env, id) {
  return env.DB.prepare('SELECT profile_id, revision, profile_json, updated_at FROM profiles WHERE profile_id=?')
    .bind(id).first();
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if(url.pathname === '/api/health') return json({ ok: true, service: 'appleii-profile-api' }, 200, cors);
    if(!url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404, cors);
    if(!authorized(request, env)) return json({ error: 'unauthorized' }, 401, cors);

    try {
      let m;

      m = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if(m) {
        const id = cleanId(decodeURIComponent(m[1]));
        if(request.method === 'GET') {
          const row = await getProfile(env, id);
          if(!row) return json({ error: 'profile not found' }, 404, cors);
          return json({
            profileId: row.profile_id,
            revision: row.revision,
            updatedAt: row.updated_at,
            profile: JSON.parse(row.profile_json)
          }, 200, { ...cors, etag: `"${row.revision}"` });
        }
        if(request.method === 'PUT') {
          const body = await request.json();
          const profile = body?.profile ?? body;
          if(!profile || typeof profile !== 'object') return json({ error: 'profile object required' }, 400, cors);
          const current = await getProfile(env, id);
          const expected = request.headers.get('if-match');
          if(current && expected && expected !== `"${current.revision}"`)
            return json({ error: 'revision conflict', revision: current.revision }, 409, cors);
          const revision = (current?.revision || 0) + 1;
          await env.DB.prepare(`INSERT INTO profiles(profile_id,revision,profile_json,updated_at)
            VALUES(?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(profile_id) DO UPDATE SET revision=excluded.revision, profile_json=excluded.profile_json, updated_at=CURRENT_TIMESTAMP`)
            .bind(id, revision, JSON.stringify(profile)).run();
          return json({ ok: true, profileId: id, revision }, 200, { ...cors, etag: `"${revision}"` });
        }
      }

      m = url.pathname.match(/^\/api\/disks\/([^/]+)$/);
      if(m) {
        const diskId = cleanId(decodeURIComponent(m[1]));
        if(request.method === 'GET') {
          const object = await env.DISKS.get(`disks/${diskId}/base`);
          if(!object) return json({ error: 'disk not found' }, 404, cors);
          const headers = new Headers(cors);
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
          headers.set('cache-control', 'private, max-age=0, must-revalidate');
          return new Response(object.body, { headers });
        }
        if(request.method === 'PUT') {
          const data = await request.arrayBuffer();
          if(!data.byteLength) return json({ error: 'empty disk image' }, 400, cors);
          const filename = request.headers.get('x-filename') || diskId;
          const contentType = request.headers.get('content-type') || 'application/octet-stream';
          const digest = request.headers.get('x-sha256') || await sha256Hex(data);
          await env.DISKS.put(`disks/${diskId}/base`, data, { httpMetadata: { contentType } });
          await env.DB.prepare(`INSERT INTO disks(disk_id,filename,content_type,byte_length,sha256,updated_at)
            VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(disk_id) DO UPDATE SET filename=excluded.filename, content_type=excluded.content_type,
              byte_length=excluded.byte_length, sha256=excluded.sha256, updated_at=CURRENT_TIMESTAMP`)
            .bind(diskId, filename, contentType, data.byteLength, digest).run();
          return json({ ok: true, diskId, filename, byteLength: data.byteLength, sha256: digest }, 200, cors);
        }
      }

      m = url.pathname.match(/^\/api\/profiles\/([^/]+)\/drives\/([^/]+)\/disk$/);
      if(m) {
        const profileId = cleanId(decodeURIComponent(m[1]));
        const driveId = cleanId(decodeURIComponent(m[2]));
        if(request.method === 'PUT') {
          const { diskId } = await request.json();
          cleanId(diskId);
          const profile = await getProfile(env, profileId);
          if(!profile) return json({ error: 'profile not found' }, 404, cors);
          const disk = await env.DB.prepare('SELECT disk_id FROM disks WHERE disk_id=?').bind(diskId).first();
          if(!disk) return json({ error: 'disk not found' }, 404, cors);
          await env.DB.prepare(`INSERT INTO profile_disks(profile_id,drive_id,disk_id,overlay_revision)
            VALUES(?,?,?,0)
            ON CONFLICT(profile_id,drive_id) DO UPDATE SET disk_id=excluded.disk_id, overlay_revision=0`)
            .bind(profileId, driveId, diskId).run();
          return json({ ok: true, profileId, driveId, diskId }, 200, cors);
        }
        if(request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM profile_disks WHERE profile_id=? AND drive_id=?').bind(profileId, driveId).run();
          return json({ ok: true }, 200, cors);
        }
      }

      m = url.pathname.match(/^\/api\/profiles\/([^/]+)\/drives\/([^/]+)\/blocks\/([0-9]+)$/);
      if(m) {
        const profileId = cleanId(decodeURIComponent(m[1]));
        const driveId = cleanId(decodeURIComponent(m[2]));
        const block = Number(m[3]);
        if(!Number.isSafeInteger(block) || block < 0) return json({ error: 'invalid block number' }, 400, cors);
        const key = `profiles/${profileId}/overlays/${driveId}/${block}`;
        if(request.method === 'GET') {
          const object = await env.DISKS.get(key);
          if(!object) return json({ error: 'block not found' }, 404, cors);
          return new Response(object.body, { headers: { ...cors, 'content-type': 'application/octet-stream' } });
        }
        if(request.method === 'PUT') {
          const data = await request.arrayBuffer();
          if(data.byteLength !== 512) return json({ error: 'overlay block must be exactly 512 bytes' }, 400, cors);
          const row = await env.DB.prepare('SELECT overlay_revision FROM profile_disks WHERE profile_id=? AND drive_id=?')
            .bind(profileId, driveId).first();
          if(!row) return json({ error: 'drive has no mounted cloud disk' }, 409, cors);
          const revision = Number(row.overlay_revision || 0) + 1;
          await env.DISKS.put(key, data, { httpMetadata: { contentType: 'application/octet-stream' } });
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO overlay_blocks(profile_id,drive_id,block_number,revision,r2_key,updated_at)
              VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
              ON CONFLICT(profile_id,drive_id,block_number) DO UPDATE SET revision=excluded.revision,r2_key=excluded.r2_key,updated_at=CURRENT_TIMESTAMP`)
              .bind(profileId, driveId, block, revision, key),
            env.DB.prepare('UPDATE profile_disks SET overlay_revision=? WHERE profile_id=? AND drive_id=?')
              .bind(revision, profileId, driveId)
          ]);
          return json({ ok: true, revision, block }, 200, cors);
        }
      }

      m = url.pathname.match(/^\/api\/profiles\/([^/]+)\/drives\/([^/]+)\/overlay$/);
      if(m && request.method === 'GET') {
        const profileId = cleanId(decodeURIComponent(m[1]));
        const driveId = cleanId(decodeURIComponent(m[2]));
        const rows = await env.DB.prepare('SELECT block_number,revision FROM overlay_blocks WHERE profile_id=? AND drive_id=? ORDER BY block_number')
          .bind(profileId, driveId).all();
        return json({ profileId, driveId, blocks: rows.results || [] }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch(error) {
      console.error(error);
      return json({ error: error?.message || 'server error' }, 500, cors);
    }
  }
};
