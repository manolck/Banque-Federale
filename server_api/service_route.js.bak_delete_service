const { sb, json, readBody, currentUser, hasPermission, logAction, handler, roleCodeOf } = require('./_lib');

const CAN_DELETE_SERVICE = new Set(['TECHNICIAN', 'DIRECTOR', 'DEPUTY_DIRECTOR']);
function canDeleteService(actor) {
  return CAN_DELETE_SERVICE.has(roleCodeOf(actor));
}
const { PRODUCTS } = require('./products');
const { discordUrlOk } = require('./discord_forms');
const { serviceNotice, enqueueNotice } = require('./discord_actions');

function createServiceRoute(name) {
  const product = PRODUCTS[name];
  return (req, res) => handler(req, res, async () => {
    const actor = await currentUser(req);
    if (!actor) return json(res, 401, { error: 'Non connecté' });
    if (req.method === 'GET' && !hasPermission(actor, 'bank.read')) return json(res, 403, { error: 'Accès refusé' });
    if (req.method !== 'GET' && !hasPermission(actor, 'bank.write')) return json(res, 403, { error: 'Modification refusée' });

    if (req.method === 'GET') {
      const { data, error } = await sb.from(product.collection).select('*').order('created_at', { ascending: false });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data || []);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const prepared = await product.prepare(body, actor);
      if (prepared.error) return json(res, 400, { error: prepared.error });
      const inserted = await sb.from(product.collection).insert({ ...prepared.row, created_by_username: actor.username }).select().single();
      if (inserted.error) return json(res, 500, { error: inserted.error.message });
      let saved = inserted.data;
      if (product.usesRecordId) {
        saved = { ...saved, dossier_number: saved.id };
        const rebuilt = await product.prepare({ ...body, dossier_number: saved.id }, actor);
        const row = rebuilt.row ? { ...rebuilt.row, dossier_number: saved.id, created_by_username: actor.username } : saved;
        if (row.discord_embed) {
          const marker = `Dossier ${saved.id}`;
          if (!String(row.discord_embed.title || '').includes(saved.id)) {
            row.discord_embed.title = `${row.discord_embed.title || 'Dossier'} — ${marker}`.slice(0, 256);
          }
          row.discord_text = row.discord_embed.description || '';
        }
        const updated = await sb.from(product.collection).update(row).eq('id', saved.id).select().single();
        if (updated.error) return json(res, 500, { error: updated.error.message });
        saved = updated.data;
      }
      await sb.from('pret_service_events').insert({ service: name, record_id: saved.id, event_type: 'created', actor_username: actor.username, dossier_number: saved.dossier_number || saved.contract_number || null });
      await logAction(actor, `creation_${name}`, { id: saved.id, dossier: saved.dossier_number || null });
      return json(res, 201, saved);
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: 'Dossier manquant.' });
      const current = await sb.from(product.collection).select('*').eq('id', body.id).maybeSingle();
      if (current.error) return json(res, 500, { error: current.error.message });
      if (!current.data) return json(res, 404, { error: 'Dossier introuvable.' });
      let patch = {};
      if (body.action === 'deposit' || body.action === 'withdraw') {
        if (!product.move) return json(res, 400, { error: 'Ce dossier ne reçoit pas ce mouvement.' });
        const moved = product.move(current.data, body);
        if (moved.error) return json(res, 400, { error: moved.error });
        patch = moved.row;
      } else if (body.action === 'validate_dossier') {
        if (!product.validate) return json(res, 400, { error: 'Action inconnue.' });
        const validated = product.validate(current.data);
        if (validated.error) return json(res, 400, { error: validated.error });
        patch = validated.row;
      } else if (body.action === 'early_withdrawal' || body.action === 'close_term') {
        if (!product.settle) return json(res, 400, { error: 'Action inconnue.' });
        const settled = product.settle(current.data, body.action);
        if (settled.error) return json(res, 400, { error: settled.error });
        patch = settled.row;
      } else if (body.action === 'mark_paid') {
        if (name === 'term_savings') return json(res, 400, { error: "Passez par le retrait anticipé ou la clôture à l'échéance." });
        patch = { paid: true, status: 'paye', paid_at: new Date().toISOString() };
      } else if (body.action === 'close') {
        patch = { status: 'clos', closed_at: new Date().toISOString() };
      } else if (body.action === 'pause' || body.action === 'resume') {
        if (name !== 'speculative_funds') return json(res, 400, { error: 'Action inconnue.' });
        if (body.action === 'pause') {
          if (current.data.status === 'clos' || current.data.status === 'paye') return json(res, 409, { error: 'Un dossier clôturé ne se met pas en pause.' });
          patch = { status: 'pause' };
        } else if (current.data.status !== 'pause') {
          return json(res, 409, { error: 'Ce dossier n\'est pas en pause.' });
        } else {
          patch = { status: 'ouvert' };
        }
      } else if (body.discord_url) {
        if (!discordUrlOk(body.discord_url)) return json(res, 400, { error: 'Lien Discord invalide.' });
        patch = { discord_url: body.discord_url, discord_posted_at: null };
      } else {
        return json(res, 400, { error: 'Action inconnue.' });
      }
      const embed = serviceNotice(name, body.action, { ...current.data, ...patch });
      Object.assign(patch, enqueueNotice(current.data, embed));
      const updated = await sb.from(product.collection).update(patch).eq('id', body.id).select().single();
      if (updated.error) return json(res, 500, { error: updated.error.message });
      await sb.from('pret_service_events').insert({ service: name, record_id: body.id, event_type: body.action || 'update', actor_username: actor.username });
      return json(res, 200, updated.data);
    }

    if (req.method === 'DELETE') {
      if (!canDeleteService(actor)) {
        return json(res, 403, { error: 'Suppression réservée au directeur et au directeur adjoint.' });
      }
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: 'Dossier manquant.' });
      const current = await sb.from(product.collection).select('*').eq('id', body.id).maybeSingle();
      if (current.error) return json(res, 500, { error: current.error.message });
      if (!current.data) return json(res, 404, { error: 'Dossier introuvable.' });
      const removed = await sb.from(product.collection).delete().eq('id', body.id);
      if (removed.error) return json(res, 500, { error: removed.error.message });
      await sb.from('pret_service_events').insert({
        service: name,
        record_id: body.id,
        event_type: 'deleted',
        actor_username: actor.username,
        dossier_number: current.data.dossier_number || current.data.contract_number || null
      });
      await logAction(actor, `suppression_${name}`, {
        id: body.id,
        dossier: current.data.dossier_number || null,
        client: current.data.full_name || `${current.data.prenom || ''} ${current.data.nom || ''}`.trim() || null
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Méthode non autorisée' });
  });
}

module.exports = { createServiceRoute };
