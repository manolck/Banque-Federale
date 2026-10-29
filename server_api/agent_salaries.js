const { sb, json, readBody, currentUser, hasPermission, logAction, handler } = require('./_lib');

// Réservé aux rôles qui détiennent users.read / users.write :
// Technicien du Registre, Directeur et Directeur adjoint.
const COLLECTION = 'pret_agent_salaries';

function clean(body) {
  const text = (value, max = 120) => String(value == null ? '' : value).trim().slice(0, max);
  const salary = Number(String(body.salary == null ? '' : body.salary).replace(',', '.'));
  return {
    agent_number: text(body.agent_number, 40),
    last_name: text(body.last_name),
    first_name: text(body.first_name),
    role_label: text(body.role_label),
    bank_account: text(body.bank_account, 60),
    salary: Number.isFinite(salary) ? Math.round(salary * 100) / 100 : NaN
  };
}

function problem(row) {
  if (!row.agent_number) return 'Numéro d’identification manquant.';
  if (!row.last_name) return 'Nom manquant.';
  if (!row.first_name) return 'Prénom manquant.';
  if (!row.bank_account) return 'Compte bancaire manquant.';
  if (!Number.isFinite(row.salary) || row.salary < 0) return 'Salaire invalide.';
  return '';
}

module.exports = (req, res) => handler(req, res, async () => {
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });
  if (req.method === 'GET' && !hasPermission(actor, 'users.read')) return json(res, 403, { error: 'Accès refusé' });
  if (req.method !== 'GET' && !hasPermission(actor, 'users.write')) return json(res, 403, { error: 'Modification refusée' });

  if (req.method === 'GET') {
    const { data, error } = await sb.from(COLLECTION).select('*').order('created_at', { ascending: true });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data || []);
  }

  if (req.method === 'POST') {
    const row = clean(await readBody(req));
    const issue = problem(row);
    if (issue) return json(res, 400, { error: issue });
    const { data, error } = await sb.from(COLLECTION).insert({
      ...row, paid: false, paid_at: null, created_by_username: actor.username
    }).select().single();
    if (error) return json(res, 500, { error: error.message });
    await logAction(actor, 'ajout_salaire_agent', { id: data.id, agent_number: row.agent_number });
    return json(res, 201, data);
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    if (!body.id) return json(res, 400, { error: 'Agent manquant.' });
    const current = await sb.from(COLLECTION).select('*').eq('id', body.id).maybeSingle();
    if (current.error) return json(res, 500, { error: current.error.message });
    if (!current.data) return json(res, 404, { error: 'Agent introuvable.' });

    let patch;
    if (body.action === 'mark_paid') {
      patch = { paid: true, paid_at: new Date().toISOString(), paid_by_username: actor.username };
    } else if (body.action === 'mark_unpaid') {
      patch = { paid: false, paid_at: null, paid_by_username: null };
    } else {
      patch = clean({ ...current.data, ...body });
      const issue = problem(patch);
      if (issue) return json(res, 400, { error: issue });
    }
    const { data, error } = await sb.from(COLLECTION).update(patch).eq('id', body.id).select().single();
    if (error) return json(res, 500, { error: error.message });
    await logAction(actor, body.action ? `salaire_agent_${body.action}` : 'modification_salaire_agent', { id: body.id, agent_number: data.agent_number });
    return json(res, 200, data);
  }

  if (req.method === 'DELETE') {
    const { id } = await readBody(req);
    if (!id) return json(res, 400, { error: 'Agent manquant.' });
    const current = await sb.from(COLLECTION).select('*').eq('id', id).maybeSingle();
    if (current.error) return json(res, 500, { error: current.error.message });
    if (!current.data) return json(res, 404, { error: 'Agent introuvable.' });
    const { error } = await sb.from(COLLECTION).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    await logAction(actor, 'suppression_salaire_agent', { id, agent_number: current.data.agent_number });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Méthode non autorisée' });
});
