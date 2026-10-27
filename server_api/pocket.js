const fs = require('fs');
const path = require('path');

const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database', 'pocketbase_collections.json'), 'utf8'));
const COLLECTIONS = SCHEMA.collections;
const ensured = new Set();
let clientPromise = null;

function pocketUrl() {
  return process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
}

function friendly(error) {
  const message = error && error.message ? error.message : String(error || 'erreur');
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|Failed to authenticate/i.test(message)) {
    return `PocketBase indisponible (${pocketUrl()}). ${message}`;
  }
  return message;
}

async function client() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const PocketBase = require('pocketbase/cjs');
      const pb = new PocketBase(pocketUrl());
      pb.autoCancellation(false);
      const email = process.env.POCKETBASE_ADMIN_EMAIL || '';
      const password = process.env.POCKETBASE_ADMIN_PASSWORD || '';
      if (!email || !password) {
        throw new Error('POCKETBASE_ADMIN_EMAIL et POCKETBASE_ADMIN_PASSWORD sont requis.');
      }
      try {
        await pb.collection('_superusers').authWithPassword(email, password);
      } catch (first) {
        if (!pb.admins || !pb.admins.authWithPassword) throw new Error(friendly(first));
        try {
          await pb.admins.authWithPassword(email, password);
        } catch (second) {
          throw new Error(friendly(second));
        }
      }
      return pb;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

async function ensure(name) {
  if (ensured.has(name)) return;
  const pb = await client();
  try {
    await pb.collections.getOne(name);
    ensured.add(name);
    return;
  } catch (error) {
    const missing = /wasn't found|not found|404/i.test(error && error.message || '');
    if (!missing) throw new Error(friendly(error));
  }
  const body = {
    name,
    type: 'base',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [{ name: 'row', type: 'json', required: false }]
  };
  try {
    await pb.collections.create(body);
  } catch (error) {
    try {
      await pb.collections.create({
        name,
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        schema: [{ name: 'row', type: 'json', required: false }]
      });
    } catch (second) {
      if (!/already|duplicate/i.test(second.message || '')) throw new Error(friendly(second));
    }
  }
  ensured.add(name);
}

async function ensureCollections() {
  for (const name of COLLECTIONS) await ensure(name);
}

function materialize(record) {
  let row = record && record.row;
  if (typeof row === 'string') {
    try { row = JSON.parse(row); } catch (error) { row = {}; }
  }
  if (!row || typeof row !== 'object' || Array.isArray(row)) row = {};
  return {
    ...row,
    id: record.id,
    created_at: row.created_at || record.created,
    updated_at: row.updated_at || record.updated
  };
}

function same(left, right) {
  return String(left ?? '') === String(right ?? '');
}

function match(row, filter) {
  const left = filter.field === 'id' ? row.id : row[filter.field];
  if (filter.op === 'eq') return same(left, filter.value);
  if (filter.op === 'neq') return !same(left, filter.value);
  if (filter.op === 'gte') return String(left ?? '') >= String(filter.value ?? '');
  if (filter.op === 'lte') return String(left ?? '') <= String(filter.value ?? '');
  if (filter.op === 'ilike') {
    const pattern = String(filter.value ?? '');
    if (pattern.includes('%')) {
      const expression = '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$';
      return new RegExp(expression, 'i').test(String(left ?? ''));
    }
    return String(left ?? '').toLocaleLowerCase('fr') === pattern.toLocaleLowerCase('fr');
  }
  if (filter.op === 'not' && filter.notOp === 'is') {
    return left !== null && left !== undefined && left !== '';
  }
  return true;
}

function sortRows(rows, orders) {
  const copy = rows.slice();
  copy.sort((a, b) => {
    for (const order of orders) {
      const left = a[order.field];
      const right = b[order.field];
      if (left == null && right == null) continue;
      if (left == null) return order.ascending ? -1 : 1;
      if (right == null) return order.ascending ? 1 : -1;
      const compared = String(left).localeCompare(String(right), 'fr', { numeric: true });
      if (compared) return order.ascending ? compared : -compared;
    }
    return 0;
  });
  return copy;
}

async function allRows(name) {
  const pb = await client();
  await ensure(name);
  const records = await pb.collection(name).getFullList({ batch: 200, requestKey: null });
  return records.map(materialize);
}

async function writeRow(name, id, row) {
  const pb = await client();
  const stored = { ...row };
  delete stored.id;
  const record = id
    ? await pb.collection(name).update(id, { row: stored }, { requestKey: null })
    : await pb.collection(name).create({ row: stored }, { requestKey: null });
  return materialize(record);
}

function shape(rows, state) {
  if (state.head) return { data: null, error: null, count: rows.length };
  let data = rows;
  if (state.limit != null) data = data.slice(0, state.limit);
  if (state.single || state.maybe) {
    if (data.length > 1) return { data: null, error: { message: 'Plusieurs lignes trouvées.' }, count: data.length };
    if (!data.length) {
      return state.maybe
        ? { data: null, error: null, count: 0 }
        : { data: null, error: { message: 'Aucune ligne trouvée.' }, count: 0 };
    }
    return { data: data[0], error: null, count: 1 };
  }
  return { data, error: null, count: data.length };
}

async function execute(state) {
  try {
    const current = await allRows(state.collection);
    const filtered = sortRows(current.filter((row) => state.filters.every((filter) => match(row, filter))), state.orders);

    if (state.op === 'insert') {
      const items = Array.isArray(state.payload) ? state.payload : [state.payload];
      const created = [];
      for (const item of items) {
        const row = { ...(item || {}) };
        if (!row.created_at) row.created_at = new Date().toISOString();
        created.push(await writeRow(state.collection, null, row));
      }
      return shape(Array.isArray(state.payload) ? created : created.slice(0, 1), state);
    }

    if (state.op === 'upsert') {
      const items = Array.isArray(state.payload) ? state.payload : [state.payload];
      const saved = [];
      for (const item of items) {
        const row = { ...(item || {}) };
        const key = state.onConflict || 'id';
        const found = key === 'id' && row.id
          ? current.find((existing) => same(existing.id, row.id))
          : current.find((existing) => same(existing[key], row[key]));
        if (!found && !row.created_at) row.created_at = new Date().toISOString();
        row.updated_at = new Date().toISOString();
        const merged = found ? { ...found, ...row, id: found.id } : row;
        saved.push(await writeRow(state.collection, found ? found.id : null, merged));
      }
      return shape(Array.isArray(state.payload) ? saved : saved.slice(0, 1), state);
    }

    if (state.op === 'update') {
      if (!state.filters.length) return { data: null, error: { message: 'Mise à jour sans filtre refusée.' }, count: 0 };
      const saved = [];
      for (const existing of filtered) {
        const merged = { ...existing, ...(state.payload || {}), updated_at: new Date().toISOString(), id: existing.id };
        saved.push(await writeRow(state.collection, existing.id, merged));
      }
      return shape(saved, state);
    }

    if (state.op === 'delete') {
      if (!state.filters.length) return { data: null, error: { message: 'Suppression sans filtre refusée.' }, count: 0 };
      const pb = await client();
      for (const existing of filtered) {
        await pb.collection(state.collection).delete(existing.id, { requestKey: null });
      }
      return shape(filtered, state);
    }

    return shape(filtered, state);
  } catch (error) {
    return { data: null, error: { message: friendly(error) }, count: null };
  }
}

function from(collection) {
  const state = {
    collection,
    filters: [],
    orders: [],
    limit: null,
    op: 'select',
    payload: null,
    head: false,
    single: false,
    maybe: false,
    onConflict: null,
    promise: null
  };
  const api = {
    select(columns, options) {
      state.head = !!(options && options.head);
      return api;
    },
    eq(field, value) { state.filters.push({ op: 'eq', field, value }); return api; },
    neq(field, value) { state.filters.push({ op: 'neq', field, value }); return api; },
    gte(field, value) { state.filters.push({ op: 'gte', field, value }); return api; },
    lte(field, value) { state.filters.push({ op: 'lte', field, value }); return api; },
    ilike(field, value) { state.filters.push({ op: 'ilike', field, value }); return api; },
    not(field, operator, value) { state.filters.push({ op: 'not', field, notOp: operator, value }); return api; },
    order(field, options) { state.orders.push({ field, ascending: !options || options.ascending !== false }); return api; },
    limit(count) { state.limit = count; return api; },
    insert(payload) { state.op = 'insert'; state.payload = payload; return api; },
    update(payload) { state.op = 'update'; state.payload = payload; return api; },
    delete() { state.op = 'delete'; return api; },
    upsert(payload, options) { state.op = 'upsert'; state.payload = payload; state.onConflict = options && options.onConflict; return api; },
    single() { state.single = true; return api; },
    maybeSingle() { state.maybe = true; return api; },
    then(resolve, reject) {
      if (!state.promise) state.promise = execute(state);
      return state.promise.then(resolve, reject);
    }
  };
  return api;
}

const sb = {
  from,
  storage: {
    from() {
      return {
        async upload(filePath, buffer, options) {
          const existing = await from('pret_storage').select('*').eq('path', filePath);
          if (existing.error) return { data: null, error: existing.error };
          if ((existing.data || []).length && !(options && options.upsert)) {
            return { data: null, error: { message: 'Ce fichier existe déjà.' } };
          }
          const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
          const payload = {
            path: filePath,
            mime: options && options.contentType || 'application/octet-stream',
            content_base64: body.toString('base64')
          };
          const saved = (existing.data || []).length
            ? await from('pret_storage').update(payload).eq('id', existing.data[0].id).select().single()
            : await from('pret_storage').insert(payload).select().single();
          return saved.error ? { data: null, error: saved.error } : { data: { path: filePath }, error: null };
        },
        async remove(paths) {
          for (const filePath of paths || []) {
            const found = await from('pret_storage').select('*').eq('path', filePath);
            for (const row of found.data || []) await from('pret_storage').delete().eq('id', row.id);
          }
          return { data: null, error: null };
        },
        async createSignedUrl(filePath) {
          return { data: { signedUrl: '/api/stored_file?path=' + encodeURIComponent(filePath) }, error: null };
        }
      };
    }
  }
};

module.exports = { sb, ensureCollections, COLLECTIONS };
