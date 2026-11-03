const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, handler } = require('./_lib');
const { addDays, validDate, money, moneyFr, dateFr, discordUrlOk, stateOf, stateLabel, goldsteinNext, lifeFinancials, lifeAsOf, lifePaymentsComplete, lifeLastPaidOn, asRpDay, rpToday } = require('./money');
const { missionTitle, missionEmbed, letterhead, embedFromText, receiptForumId, receiptTitle, receiptTags, lifeInterestEmbed } = require('./discord_forms');
const { serviceNotice, enqueueNotice, claimNotices, deliveryLocked, claimExpired } = require('./discord_actions');
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
  const day = asRpDay(due);
  const today = asRpDay(bankDate);
  return !!day && validDate(day) && (day === addDays(today, 1) || day <= today);
}
function missionBlocked(row) {
  const status = String(row.status || '').toLowerCase().trim();
  if (['pause', 'clos', 'paye', 'solde', 'closed', 'cancelled', 'paid_to_beneficiary'].includes(status)) return true;
  const recovery = String(row.recouvrement_status || 'aucun')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return !!recovery && recovery !== 'aucun';
}
function pushMission(missions, row, echeance) {
  if (missionBlocked(row)) return;
  const day = asRpDay(echeance.date);
  const key = `${echeance.kind || 'due'}:${day || echeance.date}:${echeance.slot || ''}`;
  const posted = row.mission_keys || {};
  if (deliveryLocked(posted[key])) return;
  const state = stateOf(row.agency);
  missions.push({
    collection: echeance.collection,
    id: row.id,
    key,
    title: missionTitle(row, { ...echeance, date: day || echeance.date }),
    content: `@${stateLabel(row.agency)}`,
    embed: missionEmbed(row, { ...echeance, date: day || echeance.date }),
    state
  });
}

async function claimPublication(collection, row) {
  if (!row.discord_receipt || row.discord_posted_at) return null;
  if (row.discord_claim_at && !claimExpired(row.discord_claim_at)) return null;
  const item = publication(collection, row);
  if (!item) return null;
  const at = new Date().toISOString();
  const saved = await sb.from(collection).update({ discord_claim_at: at }).eq('id', row.id);
  if (saved.error) throw new Error(saved.error.message);
  row.discord_claim_at = at;
  return item;
}

async function claimMissionKeys(items) {
  const claimed = [];
  const byRow = new Map();
  for (const item of items) {
    const mapKey = `${item.collection}:${item.id}`;
    if (!byRow.has(mapKey)) byRow.set(mapKey, { collection: item.collection, id: item.id, keys: {}, items: [] });
    byRow.get(mapKey).items.push(item);
  }
  for (const group of byRow.values()) {
    const current = await sb.from(group.collection).select('mission_keys').eq('id', group.id).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const keys = { ...((current.data && current.data.mission_keys) || {}) };
    let changed = false;
    for (const item of group.items) {
      if (deliveryLocked(keys[item.key])) continue;
      keys[item.key] = `claim:${new Date().toISOString()}`;
      changed = true;
      claimed.push(item);
    }
    if (changed) {
      const saved = await sb.from(group.collection).update({ mission_keys: keys }).eq('id', group.id);
      if (saved.error) throw new Error(saved.error.message);
    }
  }
  return claimed;
}

async function claimInterestKeys(items) {
  const claimed = [];
  const byRow = new Map();
  for (const item of items) {
    const mapKey = `${item.collection}:${item.id}`;
    if (!byRow.has(mapKey)) byRow.set(mapKey, { collection: item.collection, id: item.id, items: [] });
    byRow.get(mapKey).items.push(item);
  }
  for (const group of byRow.values()) {
    const current = await sb.from(group.collection).select('interest_keys').eq('id', group.id).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const keys = { ...((current.data && current.data.interest_keys) || {}) };
    let changed = false;
    for (const item of group.items) {
      if (deliveryLocked(keys[item.key])) continue;
      keys[item.key] = `claim:${new Date().toISOString()}`;
      changed = true;
      claimed.push(item);
    }
    if (changed) {
      const saved = await sb.from(group.collection).update({ interest_keys: keys }).eq('id', group.id);
      if (saved.error) throw new Error(saved.error.message);
    }
  }
  return claimed;
}

async function takeNotices(collection, row) {
  if (collection === 'pret_speculative_funds') {
    const { ensureFundDiscordUrl } = require('./fonds_forum_sync');
    await ensureFundDiscordUrl(row);
  }
  const { notices, rowPatch } = claimNotices(row);
  if (!rowPatch) return [];
  const saved = await sb.from(collection).update(rowPatch).eq('id', row.id);
  if (saved.error) throw new Error(saved.error.message);
  Object.assign(row, rowPatch);
  return notices.map((item) => ({ collection, id: row.id, ...item }));
}

async function bankDate() {
  // Horloge des automatisations = jour civil courant, projeté en calendrier RP (1904…).
  const today = rpToday();
  try {
    await sb.from('pret_bank_settings').upsert({
      setting_key: 'bank_date',
      setting_value: today,
      updated_at: new Date().toISOString()
    }, { onConflict: 'setting_key' });
  } catch (error) {
    console.error('Synchronisation date bancaire', error.message || error);
  }
  return today;
}

async function rows(collection) {
  const { data, error } = await sb.from(collection).select('*');
  if (error) throw new Error(error.message);
  return data || [];
}

async function rollWeekly(collection, list, bankDateValue, field, options = {}) {
  const needMission = options.needMission !== false;
  const today = asRpDay(bankDateValue);
  for (const row of list) {
    if (row.frequency && row.frequency !== 'Hebdomadaire') continue;
    let next = asRpDay(row[field]);
    if (!next) continue;
    let changed = next !== row[field];
    while (
      next
      && next < today
      && (!needMission || (row.mission_keys || {})[`due:${next}:`] || (row.mission_keys || {})[`due:${row[field]}:`])
    ) {
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
  const forumId = receiptForumId(collection);
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
    const url = new URL(req.url || '/', 'http://localhost');
    // realtime = souscriptions + avis au clic (poll fréquent)
    // daily    = missions / intérêts / Goldstein / saisie (16 h Paris)
    // market   = séance fonds (18 h Paris)
    // all      = tout (debug)
    const job = String(url.searchParams.get('job') || 'realtime').trim().toLowerCase();
    const wantRealtime = job === 'realtime' || job === 'all';
    const wantDaily = job === 'daily' || job === 'all';
    const wantMarket = job === 'market' || job === 'all';

    const publications = [];
    const missions = [];
    const interest = [];
    const notices = [];
    let markets = [];

    if (wantMarket && !wantDaily && !wantRealtime) {
      try {
        markets = await settleFunds(await rows('pret_speculative_funds'), new Date());
      } catch (error) {
        console.error('Séance des fonds', error.message);
      }
      return json(res, 200, {
        bank_date: today,
        job: 'market',
        fonds_weekly_rate: WEEKLY_RATE,
        publications,
        missions,
        interest,
        notices,
        markets
      });
    }

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

    if (wantDaily) {
      // Prêt sur gage : à l'échéance, le bien devient propriété de la banque.
      for (const row of byName.pret_pawn_loans) {
        if (row.paid || row.status === 'paye' || row.status === 'clos') continue;
        const echeance = asRpDay(row.echeance_date);
        if (!echeance || echeance > today) continue;
        const keys = row.mission_keys || {};
        const seizeKey = `seize:${echeance}`;
        if (deliveryLocked(keys[seizeKey])) continue;
        const embed = serviceNotice('pawn_loans', 'seize', { ...row, echeance_date: echeance });
        const patch = {
          status: 'clos',
          closed_at: new Date().toISOString(),
          mission_keys: { ...keys, [seizeKey]: 'queued' },
          ...enqueueNotice(row, embed)
        };
        const saved = await sb.from('pret_pawn_loans').update(patch).eq('id', row.id);
        if (saved.error) throw new Error(saved.error.message);
        Object.assign(row, patch);
      }

      await rollWeekly(
        'pret_consigne_contracts',
        byName.pret_consigne_contracts.filter((row) => !row.dossier_offered),
        today,
        'next_due'
      );
      await rollWeekly(
        'pret_consigne_contracts',
        byName.pret_consigne_contracts.filter((row) => row.dossier_offered && row.status !== 'clos'),
        today,
        'next_due',
        { needMission: false }
      );
      await rollWeekly(
        'pret_payroll_contracts',
        byName.pret_payroll_contracts.filter((row) => row.frequency === 'Hebdomadaire' && row.status !== 'clos'),
        today,
        'next_due',
        { needMission: false }
      );

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
        if (row.status === 'clos' || row.dossier_offered || !dueForMission(row.next_due, today)) continue;
        pushMission(missions, row, { collection: 'pret_consigne_contracts', date: row.next_due, amount: row.weekly_total, slot: '' });
      }

      for (const row of byName.pret_goldstein_booklets) {
        if (row.status === 'solde' || !(Number(row.balance) > 0)) continue;
        let due = asRpDay(row.next_capitalization);
        if (!(due && today >= due)) continue;
        let working = { ...row };
        let patch = null;
        while (due && today >= due && Number(working.balance) > 0 && working.status !== 'solde') {
          const before = money(working.balance);
          const credited = goldsteinNext(before);
          const following = goldsteinNext(credited.nextBalance);
          const movements = [...(working.movements || []), {
            type: 'capitalisation',
            amount: credited.interest,
            balance_before: before,
            balance: credited.nextBalance,
            on: due
          }];
          patch = {
            balance: credited.nextBalance,
            period_interest: following.interest,
            next_balance: following.nextBalance,
            next_capitalization: addDays(due, 14),
            movements,
            status: credited.nextBalance === 0 ? 'solde' : 'ouvert'
          };
          Object.assign(patch, enqueueNotice(working, serviceNotice('goldstein_booklets', 'capitalize', { ...working, ...patch })));
          working = { ...working, ...patch };
          due = patch.next_capitalization;
        }
        if (!patch) continue;
        await sb.from('pret_goldstein_booklets').update(patch).eq('id', row.id);
        Object.assign(row, patch);
      }

      for (const row of byName.pret_life_insurance_contracts) {
        const paidCount = (Array.isArray(row.payments) ? row.payments : []).filter((payment) => payment && payment.status === 'paid').length;
        if (!lifePaymentsComplete(row) || paidCount < 8 || !discordUrlOk(row.discord_url)) continue;
        const lastPaid = lifeLastPaidOn(row);
        if (!lastPaid) continue;
        const posted = row.interest_keys || {};
        let on = addDays(lastPaid, 7);
        const freeze = lifeAsOf(row, new Date());
        const freezeDay = asRpDay(freeze);
        const until = freezeDay < today ? freezeDay : today;
        while (on && on <= until) {
          const key = `placement:${on}`;
          if (!deliveryLocked(posted[key])) {
            const current = lifeFinancials(row.payments, on);
            interest.push({
              collection: 'pret_life_insurance_contracts',
              id: row.id,
              key,
              on,
              discord_url: row.discord_url,
              embed: lifeInterestEmbed(row, {
                on,
                balance: current.balance,
                principal: current.principal,
                interest: current.interest,
                week_interest: current.last_interest
              })
            });
          }
          on = addDays(on, 7);
        }
      }

      const claimedMissions = await claimMissionKeys(missions);
      missions.length = 0;
      missions.push(...claimedMissions);
      const claimedInterest = await claimInterestKeys(interest);
      interest.length = 0;
      interest.push(...claimedInterest);
    }

    // Souscriptions + avis : temps réel (clic) ; aussi en fin de daily pour les avis nés des auto (Goldstein / saisie).
    if (wantRealtime || wantDaily) {
      for (const [collection, list] of bundles) {
        for (const row of list) {
          if (wantRealtime) {
            const item = await claimPublication(collection, row);
            if (item) publications.push(item);
          }
          const taken = await takeNotices(collection, row);
          taken.forEach((notice) => notices.push(notice));
        }
      }
    }

    if (wantMarket) {
      try {
        markets = await settleFunds(byName.pret_speculative_funds, new Date());
      } catch (error) {
        console.error('Séance des fonds', error.message);
      }
    }

    return json(res, 200, {
      bank_date: today,
      job,
      fonds_weekly_rate: WEEKLY_RATE,
      publications,
      missions,
      interest,
      notices,
      markets
    });
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
      patch = {
        discord_posted_at: new Date().toISOString(),
        discord_message_id: body.message_id || null,
        discord_claim_at: null
      };
      if (discordUrlOk(body.discord_url)) patch.discord_url = String(body.discord_url).trim();
    }
    else if (body.kind === 'mission') patch = { mission_keys: { ...(current.data.mission_keys || {}), [body.key]: body.message_id || 'posted' } };
    else if (body.kind === 'interest') {
      const key = String(body.key || '').trim();
      patch = {
        last_interest_on: validDate(body.on) ? body.on : today,
        last_interest_bank_date: today
      };
      if (key) patch.interest_keys = { ...(current.data.interest_keys || {}), [key]: body.message_id || 'posted' };
    }
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
