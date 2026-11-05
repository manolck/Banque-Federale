const { sb, json, readBody, currentUser, logAction, handler, roleCodeOf } = require('./_lib');
const { money, moneyFr, dateFr, discordUrlOk } = require('./money');
const { enqueueNotice } = require('./discord_actions');
const { letterhead } = require('./discord_forms');

const COLLECTION = 'pret_fund_payouts';
const CAN_MANAGE = new Set(['DIRECTOR', 'DEPUTY_DIRECTOR']);
const PAYOUT_CHANNEL_ID = String(process.env.DISCORD_FUND_PAYOUT_CHANNEL_ID || '1560709954371846324').trim();

function canManage(actor) {
  return CAN_MANAGE.has(roleCodeOf(actor));
}

function payoutDiscordUrl() {
  const guild = String(process.env.DISCORD_GUILD_ID || '').trim();
  if (!guild || !PAYOUT_CHANNEL_ID) return '';
  return `https://discord.com/channels/${guild}/${PAYOUT_CHANNEL_ID}`;
}

function line(label, value) {
  return `**${label} :** ${value ?? '—'}`;
}

function clientNameOf(fund) {
  return String(fund.full_name || `${fund.prenom || ''} ${fund.nom || ''}`.trim() || 'Client').trim();
}

function payoutEmbed(row) {
  return letterhead({
    title: `Remboursement fonds — ${row.client_name} — Dossier ${row.dossier_number}`.slice(0, 256),
    description: [
      line('Client', row.client_name),
      line('Dossier', row.dossier_number),
      line('Banquier', row.banker_username),
      line('Compte à créditer', row.bank_account || '—'),
      line('Somme à verser', moneyFr(row.amount_net)),
      line('Intérêts banque', moneyFr(row.bank_fee)),
      line('Date du retrait', dateFr(row.withdrawal_on) || row.withdrawal_on || '—')
    ].join('\n'),
    footer: 'File des remboursements — direction',
    color: 0xf0c300
  });
}

async function recordWithdrawal(fund, withdrawal, actor) {
  if (!fund || !withdrawal || !(money(withdrawal.net != null ? withdrawal.net : withdrawal.amount) > 0)) {
    return null;
  }
  const discord_url = payoutDiscordUrl();
  const row = {
    fund_id: fund.id,
    dossier_number: String(fund.dossier_number || fund.id || '').trim(),
    client_id: fund.client_id || null,
    client_name: clientNameOf(fund),
    banker_username: String((actor && actor.username) || fund.created_by_username || '—').trim(),
    bank_account: String(fund.bank_id || '').trim(),
    amount_gross: money(withdrawal.amount),
    amount_net: money(withdrawal.net != null ? withdrawal.net : withdrawal.amount),
    bank_fee: money(withdrawal.tax || 0),
    profit: money(withdrawal.profit || 0),
    withdrawal_on: withdrawal.on || '',
    status: 'open',
    archived: false,
    archived_at: null,
    archived_by_username: null,
    discord_url,
    discord_notices: [],
    discord_posted_at: null,
    created_at: new Date().toISOString()
  };
  if (discordUrlOk(discord_url)) {
    Object.assign(row, enqueueNotice(row, payoutEmbed(row)));
  }
  const inserted = await sb.from(COLLECTION).insert(row).select().single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data;
}

module.exports = Object.assign((req, res) => handler(req, res, async () => {
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });
  if (!canManage(actor)) {
    return json(res, 403, { error: 'Page réservée au directeur et au directeur adjoint.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await sb.from(COLLECTION).select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data || []);
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    if (!body.id) return json(res, 400, { error: 'Demande manquante.' });
    const current = await sb.from(COLLECTION).select('*').eq('id', body.id).maybeSingle();
    if (current.error) return json(res, 500, { error: current.error.message });
    if (!current.data) return json(res, 404, { error: 'Demande introuvable.' });

    let patch;
    if (body.action === 'archive') {
      patch = {
        status: 'archived',
        archived: true,
        archived_at: new Date().toISOString(),
        archived_by_username: actor.username
      };
    } else if (body.action === 'unarchive') {
      patch = {
        status: 'open',
        archived: false,
        archived_at: null,
        archived_by_username: null
      };
    } else {
      return json(res, 400, { error: 'Action inconnue.' });
    }

    const { data, error } = await sb.from(COLLECTION).update(patch).eq('id', body.id).select().single();
    if (error) return json(res, 500, { error: error.message });
    await logAction(actor, `remboursement_fonds_${body.action}`, {
      id: body.id,
      dossier: data.dossier_number,
      client: data.client_name
    });
    return json(res, 200, data);
  }

  return json(res, 405, { error: 'Méthode non autorisée' });
}), { recordWithdrawal, payoutDiscordUrl, canManage, COLLECTION });
