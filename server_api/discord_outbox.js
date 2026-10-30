const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, handler } = require('./_lib');
const { addDays, validDate, money, moneyFr, dateFr, discordUrlOk, stateOf, stateLabel, goldsteinNext, lifeFinancials, lifeAsOf } = require('./money');
const { missionTitle, missionEmbed, letterhead, embedFromText, RECEIPT_FORUMS, receiptTitle, receiptTags } = require('./discord_forms');
const { pendingNotices } = require('./discord_actions');
const { WEEKLY_RATE } = require('./fonds_interest');
const { settleFunds, acknowledgeMarket } = require('./fonds_market');

const ACTIVE_LIFE = new Set(['active', 'payments_complete', 'placed']);

function token(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
function authorized(req) {
  const expected = String(process.env.DISCORD_AGENDA_API_KEY || '');
  const given = Buffer.from(token(req));
  const wanted = Buffer.from(expected);
  return expected.length > 0 && given.length === wanted.length && timingSafeEqual(given, wanted);
}
function dueForMission(due, bankDate) {
  return !!due && (due === addDays(bankDate, 1) || due <= bankDate);
}
function pushMission(missions, row, echeance) {
  const key = `${echeance.kind || 'due'}:${echeance.date}:${echeance.slot || ''}`;
  const posted = row.mission_keys || {};
  if (posted[key]) return;
  const state = stateOf(row.agency);
  missions.push({
    collection: echeance.collection,
    id: row.id,
    key,
    title: missionTitle(row),
    content: `@${stateLabel(row.agency)}`,
    embed: missionEmbed(row, echeance),
    state
  });
}

async function bankDate() {
  const { data, error } = await sb.from('pret_bank_settings').select('*').eq('setting_key', 'bank_date').maybeSingle();
  if (error) throw new Error(error.message);
  return data && validDate(data.setting_value) ? data.setting_value : '1904-06-26';
}

async function rows(collection) {
  const { data, error } = await sb.from(collection).select('*');
  if (error) throw new Error(error.message);
  return data || [];
}

async function rollWeekly(collection, list, bankDateValue, field) {
  for (const row of list) {
    if (row.frequency && row.frequency !== 'Hebdomadaire') continue;
    let next = row[field];
    let changed = false;
    while (next && next < bankDateValue && (row.mission_keys || {})[`due:${next}:`]) {
      next = addDays(next, 7);
      changed = true;
    }
    if (changed) {
      row[field] = next;
      await sb.from(collection).update({ [field]: next }).eq('id', row.id);
    }
  }
}

function publication(collection, row) {
  if (!row.discord_receipt || row.discord_posted_at) return null;
  const forumId = RECEIPT_FORUMS[collection];
  if (!forumId) return null;
  const embed = row.discord_embed && (row.discord_embed.description || row.discord_embed.title)
    ? row.discord_embed
    : embedFromText(row.discord_text);
  if (!embed) return null;
  const title = receiptTitle(row);
  if (!title) return null;
  return { collection, id: row.id, forum_id: forumId, title, tags: receiptTags(collection, row), embed };
}

module.exports = (req, res) => handler(req, res, async () => {
  if (!process.env.DISCORD_AGENDA_API_KEY) return json(res, 503, { error: "La clé API privée Discord n'est pas configurée." });
  if (!authorized(req)) return json(res, 401, { error: 'Clé Discord invalide.' });
  const today = await bankDate();

  if (req.method === 'GET') {
    const publications = [];
    const missions = [];
    const interest = [];
    const notices = [];
    const bundles = [
      ['pret_speculative_funds', await rows('pret_speculative_funds')],
      ['pret_pawn_loans', await rows('pret_pawn_loans')],
      ['pret_consigne_contracts', await rows('pret_consigne_contracts')],
      ['pret_term_savings', await rows('pret_term_savings')],
      ['pret_payroll_contracts', await rows('pret_payroll_contracts')],
      ['pret_goldstein_booklets', await rows('pret_goldstein_booklets')],
      ['pret_loans', await rows('pret_loans')],
      ['pret_life_insurance_contracts', await rows('pret_life_insurance_contracts')],
      ['pret_horse_credits', await rows('pret_horse_credits')]
    ];
    const byName = Object.fromEntries(bundles);

    for (const [collection, list] of bundles) {
      for (const row of list) {
        const item = publication(collection, row);
        if (item) publications.push(item);
        pendingNotices(collection, row).forEach((notice) => notices.push(notice));
      }
    }

    await rollWeekly('pret_consigne_contracts', byName.pret_consigne_contracts, today, 'next_due');
    await rollWeekly('pret_payroll_contracts', byName.pret_payroll_contracts.filter((row) => row.frequency === 'Hebdomadaire'), today, 'next_due');

    for (const row of byName.pret_loans) {
      (row.echeances || []).forEach((echeance, index) => {
        if (echeance.statut === 'paye' || !dueForMission(echeance.date, today)) return;
        pushMission(missions, { ...row, agency: row.agence || row.agency }, { collection: 'pret_loans', date: echeance.date, amount: echeance.montant, slot: index });
      });
    }
    for (const row of byName.pret_life_insurance_contracts) {
      if (['closed', 'paid_to_beneficiary', 'cancelled'].includes(row.status)) continue;
      (row.payments || []).forEach((payment) => {
        if (payment.status === 'paid' || !dueForMission(payment.date, today)) return;
        pushMission(missions, { ...row, prenom: row.subscriber_first_name, nom: row.subscriber_last_name, telegram: row.subscriber_telegram, civility: row.enrollment && row.enrollment.subscriber_civility }, { collection: 'pret_life_insurance_contracts', date: payment.date, amount: payment.amount, slot: payment.number });
      });
    }
    for (const row of [...byName.pret_pawn_loans, ...byName.pret_term_savings]) {
      if (row.paid || row.status === 'paye' || row.status === 'clos') continue;
      if (!dueForMission(row.echeance_date, today)) continue;
      const collection = byName.pret_pawn_loans.includes(row) ? 'pret_pawn_loans' : 'pret_term_savings';
      pushMission(missions, row, { collection, date: row.echeance_date, amount: row.amount_due, slot: '' });
    }
    for (const row of byName.pret_consigne_contracts) {
      if (row.status === 'clos' || !dueForMission(row.next_due, today)) continue;
      pushMission(missions, row, { collection: 'pret_consigne_contracts', date: row.next_due, amount: row.weekly_total, slot: '' });
    }
    for (const row of byName.pret_payroll_contracts) {
      if (row.frequency !== 'Hebdomadaire' || row.status === 'clos' || !dueForMission(row.next_due, today)) continue;
      pushMission(missions, { ...row, prenom: row.patron, nom: row.company_name, telegram: row.patron_telegram }, { collection: 'pret_payroll_contracts', date: row.next_due, amount: row.installment_cost, slot: '' });
    }
    for (const row of byName.pret_goldstein_booklets) {
      const due = row.next_capitalization;
      const postedKey = `capitalization:${due}:`;
      if (due && today >= due && (row.mission_keys || {})[postedKey] && Number(row.balance) > 0) {
        const credited = goldsteinNext(row.balance);
        const following = goldsteinNext(credited.nextBalance);
        const movements = [...(row.movements || []), { type: 'capitalisation', amount: credited.interest, balance: credited.nextBalance, on: today }];
        const patch = {
          balance: credited.nextBalance,
          period_interest: following.interest,
          next_balance: following.nextBalance,
          next_capitalization: addDays(due, 14),
          movements,
          status: credited.nextBalance === 0 ? 'solde' : 'ouvert'
        };
        await sb.from('pret_goldstein_booklets').update(patch).eq('id', row.id);
        Object.assign(row, patch);
      }
      if (!(Number(row.balance) > 0) || row.status === 'solde') continue;
      if (!dueForMission(row.next_capitalization, today)) continue;
      pushMission(missions, row, { collection: 'pret_goldstein_booklets', kind: 'capitalization', date: row.next_capitalization, interest: row.period_interest, nextBalance: row.next_balance, slot: '' });
    }

    let markets = [];
    try {
      markets = await settleFunds(byName.pret_speculative_funds, new Date());
    } catch (error) {
      console.error('Séance des fonds', error.message);
    }

    return json(res, 200, { bank_date: today, fonds_weekly_rate: WEEKLY_RATE, publications, missions, interest, notices, markets });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (body.kind === 'market') {
      const saved = await acknowledgeMarket(body.week, body.palier, body.message_id);
      if (saved.error) return json(res, saved.status || 400, { error: saved.error });
      return json(res, 200, { ok: true });
    }
    const current = await sb.from(body.collection).select('*').eq('id', body.id).maybeSingle();
    if (current.error) return json(res, 500, { error: current.error.message });
    if (!current.data) return json(res, 404, { error: 'Dossier introuvable.' });
    let patch = {};
    if (body.kind === 'publication') {
      patch = { discord_posted_at: new Date().toISOString(), discord_message_id: body.message_id || null };
      if (discordUrlOk(body.discord_url)) patch.discord_url = String(body.discord_url).trim();
    }
    else if (body.kind === 'mission') patch = { mission_keys: { ...(current.data.mission_keys || {}), [body.key]: body.message_id || 'posted' } };
    else if (body.kind === 'interest') patch = { last_interest_bank_date: today };
    else if (body.kind === 'notice') {
      const queued = Array.isArray(current.data.discord_notices) ? current.data.discord_notices : [];
      patch = { discord_notices: queued.filter((item) => item.id !== body.notice_id) };
    }
    if (!Object.keys(patch).length) return json(res, 400, { error: 'Accusé incomplet.' });
    const updated = await sb.from(body.collection).update(patch).eq('id', body.id);
    if (updated.error) return json(res, 500, { error: updated.error.message });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Méthode non autorisée' });
});
