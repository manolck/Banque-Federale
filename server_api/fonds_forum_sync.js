const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');
const { parseThread, diffFund, proposalSignature, applyProposal } = require('./fonds_forum');

const FUNDS = 'pret_speculative_funds';
const PROPOSALS = 'pret_fund_sync';
const SCAN_KEY = 'fonds_forum_last_scan';
const REQUEST_KEY = 'fonds_forum_scan_requested';
const MAX_THREADS = 60;

function botAuthorized(req) {
  const header = String(req.headers.authorization || '');
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
  const wanted = Buffer.from(String(process.env.DISCORD_AGENDA_API_KEY || ''));
  return wanted.length > 0 && given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function setting(key, value) {
  const saved = await sb.from('pret_bank_settings').upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' });
  if (saved.error) throw new Error(saved.error.message);
}
async function readSetting(key) {
  const { data, error } = await sb.from('pret_bank_settings').select('*').eq('setting_key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.setting_value : '';
}

// Réception d'un lot de fils lus par le bot : compare au registre, ne modifie aucun dossier.
async function scan(body) {
  const threads = Array.isArray(body.threads) ? body.threads.slice(0, MAX_THREADS) : [];
  const funds = await sb.from(FUNDS).select('*');
  if (funds.error) throw new Error(funds.error.message);
  const byNumber = new Map((funds.data || []).map((fund) => [String(fund.dossier_number), fund]));
  const existing = await sb.from(PROPOSALS).select('*');
  if (existing.error) throw new Error(existing.error.message);
  const rows = existing.data || [];
  const known = new Map(rows.map((row) => [row.sig, row]));
  const stats = { threads: threads.length, ignored: 0, created: 0, resolved: 0, pending: 0 };

  for (const thread of threads) {
    const parsed = parseThread(thread);
    if (!parsed.dossier_number) { stats.ignored += 1; continue; }
    const fund = byNumber.get(parsed.dossier_number);
    const wanted = [];
    if (!fund) {
      wanted.push({ sig: `unknown|${parsed.dossier_number}|${parsed.thread_id}`, fund_id: '', kind: 'unknown_dossier', payload: { name: parsed.name } });
    } else {
      for (const item of diffFund(fund, parsed).proposals) {
        wanted.push({ sig: proposalSignature(fund, item), fund_id: String(fund.id), kind: item.kind, payload: item });
      }
    }
    const sigs = new Set(wanted.map((item) => item.sig));
    for (const item of wanted) {
      if (known.has(item.sig)) continue;
      const inserted = await sb.from(PROPOSALS).insert({
        sig: item.sig, fund_id: item.fund_id, dossier_number: parsed.dossier_number,
        full_name: fund ? fund.full_name : '', kind: item.kind, payload: item.payload,
        thread_url: parsed.thread_url, thread_name: parsed.name, status: 'pending'
      }).select().single();
      if (inserted.error) throw new Error(inserted.error.message);
      known.set(item.sig, inserted.data);
      stats.created += 1;
    }
    // Une proposition en attente qui n'est plus un écart (forum ou dossier corrigé) disparaît d'elle-même.
    for (const row of rows) {
      if (row.dossier_number !== parsed.dossier_number || row.status !== 'pending' || sigs.has(row.sig)) continue;
      const removed = await sb.from(PROPOSALS).delete().eq('id', row.id);
      if (removed.error) throw new Error(removed.error.message);
      known.delete(row.sig);
      stats.resolved += 1;
    }
  }
  stats.pending = [...known.values()].filter((row) => row.status === 'pending').length;
  if (body.last) {
    await setting(SCAN_KEY, new Date().toISOString());
    await setting(REQUEST_KEY, '');
  }
  return stats;
}

async function applyOne(actor, id) {
  const found = await sb.from(PROPOSALS).select('*').eq('id', id).maybeSingle();
  if (found.error) return { status: 500, error: found.error.message };
  const proposal = found.data;
  if (!proposal) return { status: 404, error: 'Proposition introuvable.' };
  if (proposal.status !== 'pending') return { status: 409, error: 'Cette proposition est déjà traitée.' };
  if (proposal.kind === 'unknown_dossier') return { status: 400, error: 'Dossier introuvable dans le registre : rien à appliquer.' };
  const fund = await sb.from(FUNDS).select('*').eq('id', proposal.fund_id).maybeSingle();
  if (fund.error) return { status: 500, error: fund.error.message };
  if (!fund.data) return { status: 404, error: 'Dossier introuvable.' };
  const built = applyProposal(fund.data, proposal.payload || {});
  if (built.error) return { status: 409, error: built.error };
  const updated = await sb.from(FUNDS).update(built.patch).eq('id', fund.data.id);
  if (updated.error) return { status: 500, error: updated.error.message };
  const closed = await sb.from(PROPOSALS).update({ status: 'applied', resolved_by_username: actor.username, resolved_at: new Date().toISOString() }).eq('id', proposal.id);
  if (closed.error) return { status: 500, error: closed.error.message };
  await logAction(actor, 'synchro_forum_fonds', { dossier: proposal.dossier_number, kind: proposal.kind, patch: built.patch.status || { capital_balance: built.patch.capital_balance } });
  return { status: 200 };
}

module.exports = (req, res) => handler(req, res, async () => {
  if (botAuthorized(req)) {
    if (req.method === 'GET') return json(res, 200, { requested: !!(await readSetting(REQUEST_KEY)), last_scan: await readSetting(SCAN_KEY) || null });
    if (req.method === 'POST') return json(res, 200, await scan(await readBody(req)));
    return json(res, 405, { error: 'Méthode non autorisée' });
  }
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });
  if (req.method === 'GET') {
    if (!hasPermission(actor, 'bank.read')) return json(res, 403, { error: 'Accès refusé' });
    const { data, error } = await sb.from(PROPOSALS).select('*').eq('status', 'pending').order('created_at', { ascending: true });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { proposals: data || [], last_scan: await readSetting(SCAN_KEY) || null, requested: !!(await readSetting(REQUEST_KEY)) });
  }
  if (req.method !== 'PUT') return json(res, 405, { error: 'Méthode non autorisée' });
  if (!hasPermission(actor, 'bank.write')) return json(res, 403, { error: 'Modification refusée' });
  const body = await readBody(req);
  if (body.action === 'request_scan') {
    await setting(REQUEST_KEY, new Date().toISOString());
    return json(res, 200, { ok: true });
  }
  if (body.action === 'reject') {
    const closed = await sb.from(PROPOSALS).update({ status: 'rejected', resolved_by_username: actor.username, resolved_at: new Date().toISOString() }).eq('id', body.id);
    if (closed.error) return json(res, 500, { error: closed.error.message });
    await logAction(actor, 'synchro_forum_fonds_refus', { id: body.id });
    return json(res, 200, { ok: true });
  }
  if (body.action === 'apply') {
    const done = await applyOne(actor, body.id);
    return json(res, done.status, done.error ? { error: done.error } : { ok: true });
  }
  return json(res, 400, { error: 'Action inconnue.' });
});