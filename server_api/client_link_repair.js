const { sb, json, readBody, currentUser, hasPermission, logAction, handler, roleCodeOf } = require('./_lib');

const CAN_REPAIR = new Set(['TECHNICIAN', 'DIRECTOR', 'DEPUTY_DIRECTOR']);

function canRepair(actor) {
  return CAN_REPAIR.has(roleCodeOf(actor));
}

function text(value) {
  return String(value ?? '').trim();
}

function personKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitName(full) {
  const parts = text(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { prenom: '', nom: parts[0] };
  return { prenom: parts.slice(0, -1).join(' '), nom: parts[parts.length - 1] };
}

function personPayload(prenom, nom, extra = {}) {
  const first = text(prenom);
  const last = text(nom);
  if (!last && !first) return null;
  return {
    kind: 'personne',
    prenom: first,
    nom: last || first,
    telegram: text(extra.telegram),
    adresse: text(extra.adresse || extra.address),
    civilite: text(extra.civilite || extra.civility),
    date_naissance: text(extra.date_naissance || extra.birth_date),
    nationalite: text(extra.nationalite || extra.nationality),
    profession: text(extra.profession),
    entreprise: text(extra.entreprise || extra.company_name),
    salaire_hebdomadaire: text(extra.salaire_hebdomadaire)
  };
}

function companyPayload(name, extra = {}) {
  const nom = text(name);
  if (!nom) return null;
  return {
    kind: 'entreprise',
    prenom: '',
    nom,
    entreprise: nom,
    telegram: text(extra.telegram || extra.patron_telegram),
    adresse: text(extra.adresse || extra.address)
  };
}

function displayName(payload) {
  if (!payload) return '';
  if (payload.kind === 'entreprise') return payload.nom;
  return `${payload.prenom || ''} ${payload.nom || ''}`.replace(/\s+/g, ' ').trim();
}

function matchKeys(payload) {
  if (!payload) return [];
  if (payload.kind === 'entreprise') {
    const key = personKey(payload.nom || payload.entreprise);
    return key ? [key] : [];
  }
  const full = personKey(`${payload.prenom || ''} ${payload.nom || ''}`);
  const swapped = personKey(`${payload.nom || ''} ${payload.prenom || ''}`);
  return [...new Set([full, swapped].filter(Boolean))];
}

const SOURCES = [
  {
    collection: 'pret_loans',
    service: 'Prêt',
    ref: (row) => row.loan_id || row.id,
    links: [{
      field: 'client_id',
      role: 'emprunteur',
      propose: (row) => personPayload(row.prenom, row.nom, row)
    }]
  },
  {
    collection: 'pret_life_insurance_contracts',
    service: 'Assurance-vie',
    ref: (row) => row.contract_number || row.id,
    links: [
      {
        field: 'subscriber_client_id',
        role: 'souscripteur',
        propose: (row) => personPayload(row.subscriber_first_name, row.subscriber_last_name, {
          telegram: row.subscriber_telegram,
          civilite: row.enrollment && row.enrollment.subscriber_civility
        })
      },
      {
        field: 'beneficiary_client_id',
        role: 'bénéficiaire',
        propose: (row) => personPayload(row.beneficiary_first_name, row.beneficiary_last_name, {
          telegram: row.beneficiary_telegram,
          civilite: row.enrollment && row.enrollment.beneficiary_civility
        })
      }
    ]
  },
  {
    collection: 'pret_horse_credits',
    service: 'Crédit hippique',
    ref: (row) => row.dossier_id || row.id,
    links: [{
      field: 'client_id',
      role: 'client',
      propose: (row) => personPayload(row.client_prenom, row.client_nom, row)
    }]
  },
  {
    collection: 'pret_speculative_funds',
    service: 'Fonds spéculatifs',
    ref: (row) => row.dossier_number || row.id,
    links: [
      {
        field: 'client_id',
        role: 'souscripteur',
        propose: (row) => {
          const split = splitName(row.full_name);
          return split ? personPayload(split.prenom, split.nom, {
            telegram: row.telegram,
            adresse: row.address,
            civilite: row.civility,
            date_naissance: row.birth_date,
            nationalite: row.nationality
          }) : null;
        }
      },
      {
        field: 'for_client_id',
        role: 'compte tiers',
        propose: (row) => {
          if (row.own_account !== false) return null;
          const split = splitName(row.for_full_name);
          return split ? personPayload(split.prenom, split.nom, { telegram: row.for_telegram }) : null;
        }
      }
    ]
  },
  {
    collection: 'pret_pawn_loans',
    service: 'Prêt sur gage',
    ref: (row) => row.dossier_number || row.id,
    links: [{
      field: 'client_id',
      role: 'client',
      propose: (row) => personPayload(row.prenom, row.nom, {
        telegram: row.telegram,
        adresse: row.address,
        civilite: row.civility,
        date_naissance: row.birth_date,
        nationalite: row.nationality
      })
    }]
  },
  {
    collection: 'pret_consigne_contracts',
    service: 'Consigne',
    ref: (row) => row.dossier_number || row.id,
    links: [{
      field: 'client_id',
      role: 'client',
      propose: (row) => personPayload(row.prenom, row.nom, {
        telegram: row.telegram,
        adresse: row.address,
        civilite: row.civility,
        date_naissance: row.birth_date,
        nationalite: row.nationality
      })
    }]
  },
  {
    collection: 'pret_term_savings',
    service: 'Épargne à terme',
    ref: (row) => row.dossier_number || row.id,
    links: [{
      field: 'client_id',
      role: 'client',
      propose: (row) => personPayload(row.prenom, row.nom, {
        telegram: row.telegram,
        adresse: row.address,
        civilite: row.civility,
        date_naissance: row.birth_date,
        nationalite: row.nationality
      })
    }]
  },
  {
    collection: 'pret_payroll_contracts',
    service: 'Gestion de paie',
    ref: (row) => row.dossier_number || row.id,
    links: [{
      field: 'client_id',
      role: 'entreprise',
      propose: (row) => {
        const company = companyPayload(row.company_name, {
          telegram: row.patron_telegram,
          adresse: row.address
        });
        if (company) return company;
        const split = splitName(row.patron);
        return split ? personPayload(split.prenom, split.nom, {
          telegram: row.patron_telegram,
          adresse: row.address,
          entreprise: row.company_name
        }) : null;
      }
    }]
  },
  {
    collection: 'pret_goldstein_booklets',
    service: 'Livret Goldstein',
    ref: (row) => row.dossier_number || row.id,
    links: [{
      field: 'client_id',
      role: 'client',
      propose: (row) => personPayload(row.prenom, row.nom, {
        telegram: row.telegram,
        adresse: row.address,
        civilite: row.civility,
        date_naissance: row.birth_date,
        nationalite: row.nationality
      })
    }]
  }
];

async function loadClients() {
  const { data, error } = await sb.from('pret_clients').select('*');
  if (error) throw new Error(error.message);
  return data || [];
}

function indexClients(list) {
  const byId = new Map();
  const byKey = new Map();
  for (const client of list) {
    byId.set(String(client.id), client);
    const payload = client.kind === 'entreprise'
      ? { kind: 'entreprise', nom: client.nom || client.entreprise, entreprise: client.entreprise || client.nom }
      : { kind: 'personne', prenom: client.prenom, nom: client.nom };
    for (const key of matchKeys(payload)) {
      if (!byKey.has(key)) byKey.set(key, client);
    }
  }
  return { byId, byKey };
}

function nextLegacyId(clients) {
  let max = 0;
  for (const row of clients) {
    const value = Number(row.legacy_id);
    if (Number.isInteger(value) && value > max) max = value;
  }
  return max + 1;
}

async function scanMissing() {
  const clients = await loadClients();
  const { byId, byKey } = indexClients(clients);
  const missing = [];
  let scanned = 0;

  for (const source of SOURCES) {
    const { data, error } = await sb.from(source.collection).select('*');
    if (error) throw new Error(`${source.collection}: ${error.message}`);
    for (const row of data || []) {
      scanned += 1;
      for (const link of source.links) {
        const proposed = link.propose(row);
        if (!proposed) continue;
        const currentId = text(row[link.field]);
        if (currentId && byId.has(currentId)) continue;
        const keys = matchKeys(proposed);
        const matched = keys.map((key) => byKey.get(key)).find(Boolean) || null;
        missing.push({
          key: `${source.collection}:${row.id}:${link.field}`,
          collection: source.collection,
          service: source.service,
          id: row.id,
          ref: String(source.ref(row) || row.id),
          field: link.field,
          role: link.role,
          current_client_id: currentId || null,
          orphan_id: currentId && !byId.has(currentId) ? currentId : null,
          proposed,
          display_name: displayName(proposed),
          match_id: matched ? matched.id : null,
          match_name: matched
            ? (matched.kind === 'entreprise' ? (matched.nom || matched.entreprise) : `${matched.prenom || ''} ${matched.nom || ''}`.trim())
            : null,
          action: matched ? 'link' : 'create'
        });
      }
    }
  }

  return {
    scanned,
    clients: clients.length,
    missing,
    create: missing.filter((item) => item.action === 'create').length,
    link: missing.filter((item) => item.action === 'link').length
  };
}

async function applyMissing(items, actor) {
  const clients = await loadClients();
  const index = indexClients(clients);
  let nextNumber = nextLegacyId(clients);
  const results = { linked: 0, created: 0, skipped: 0, errors: [] };
  const wanted = Array.isArray(items) && items.length
    ? new Set(items.map((item) => item.key || `${item.collection}:${item.id}:${item.field}`))
    : null;
  const report = await scanMissing();
  const queue = report.missing.filter((item) => !wanted || wanted.has(item.key));

  for (const item of queue) {
    try {
      let clientId = item.match_id;
      if (!clientId) {
        const keys = matchKeys(item.proposed);
        const again = keys.map((key) => index.byKey.get(key)).find(Boolean);
        if (again) clientId = again.id;
      }
      if (!clientId) {
        const payload = {
          ...item.proposed,
          legacy_id: nextNumber,
          created_at: new Date().toISOString()
        };
        nextNumber += 1;
        const inserted = await sb.from('pret_clients').insert(payload).select().single();
        if (inserted.error) throw new Error(inserted.error.message);
        clientId = inserted.data.id;
        clients.push(inserted.data);
        index.byId.set(String(clientId), inserted.data);
        for (const key of matchKeys(item.proposed)) {
          if (!index.byKey.has(key)) index.byKey.set(key, inserted.data);
        }
        results.created += 1;
      } else {
        results.linked += 1;
      }
      const saved = await sb.from(item.collection).update({ [item.field]: clientId }).eq('id', item.id);
      if (saved.error) throw new Error(saved.error.message);
    } catch (error) {
      results.skipped += 1;
      results.errors.push({ key: item.key, error: error.message || String(error) });
    }
  }

  await logAction(actor, 'reparation_fiches_clients', {
    linked: results.linked,
    created: results.created,
    skipped: results.skipped,
    total: queue.length
  });
  return results;
}

module.exports = Object.assign((req, res) => handler(req, res, async () => {
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });
  if (!canRepair(actor)) {
    return json(res, 403, { error: 'Outil réservé au directeur, au directeur adjoint et au technicien.' });
  }
  if (!hasPermission(actor, 'bank.read')) return json(res, 403, { error: 'Accès refusé' });

  if (req.method === 'GET') {
    return json(res, 200, await scanMissing());
  }

  if (req.method === 'PUT') {
    if (!hasPermission(actor, 'bank.write')) return json(res, 403, { error: 'Modification refusée' });
    const body = await readBody(req);
    if (body.action !== 'apply') return json(res, 400, { error: 'Action inconnue.' });
    const result = await applyMissing(body.items, actor);
    return json(res, 200, result);
  }

  return json(res, 405, { error: 'Méthode non autorisée' });
}), { scanMissing, applyMissing, SOURCES });
