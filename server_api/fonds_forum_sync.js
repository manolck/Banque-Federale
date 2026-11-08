const { timingSafeEqual } = require('node:crypto');
const { sb, json, readBody, currentUser, hasPermission, handler } = require('./_lib');
const { discordUrlOk } = require('./money');

const FUNDS = 'pret_speculative_funds';
const PROPOSALS = 'pret_fund_sync';
const SCAN_KEY = 'fonds_forum_last_scan';
const REQUEST_KEY = 'fonds_forum_scan_requested';
const DISABLED = { error: 'La synchro forum des fonds spéculatifs est désactivée.' };

/** Relie le fil Discord existant au dossier (avis / versements). */
async function linkFundThread(fund, threadUrl) {
  if (!fund || !fund.id || !discordUrlOk(threadUrl) || discordUrlOk(fund.discord_url)) return null;
  const patch = {
    discord_url: String(threadUrl).trim(),
    discord_posted_at: fund.discord_posted_at || new Date().toISOString()
  };
  const saved = await sb.from(FUNDS).update(patch).eq('id', fund.id);
  if (saved.error) throw new Error(saved.error.message);
  Object.assign(fund, patch);
  return patch;
}

/** Retrouve un thread_url déjà vu lors d’une synchro forum. */
async function findStoredThreadUrl(fund) {
  if (!fund) return '';
  const number = String(fund.dossier_number || '').trim();
  if (!number) return '';
  const { data, error } = await sb.from(PROPOSALS).select('thread_url').eq('dossier_number', number).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    if (discordUrlOk(row.thread_url)) return String(row.thread_url).trim();
  }
  return '';
}

async function ensureFundDiscordUrl(fund) {
  if (!fund || discordUrlOk(fund.discord_url)) return fund;
  const url = await findStoredThreadUrl(fund);
  if (!url) return fund;
  await linkFundThread(fund, url);
  return fund;
}

function botAuthorized(req) {
  const header = String(req.headers.authorization || '');
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
  const wanted = Buffer.from(String(process.env.DISCORD_AGENDA_API_KEY || ''));
  return wanted.length > 0 && given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function readSetting(key) {
  const { data, error } = await sb.from('pret_bank_settings').select('*').eq('setting_key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.setting_value : '';
}

async function route(req, res) {
  return handler(req, res, async () => {
    // Lecture forum / ajout auto : désactivés (les dossiers se mettent à jour via UI + tirage marché).
    if (botAuthorized(req)) {
      if (req.method === 'GET') {
        return json(res, 200, {
          requested: false,
          last_scan: await readSetting(SCAN_KEY) || null,
          disabled: true
        });
      }
      if (req.method === 'POST') {
        return json(res, 200, {
          threads: 0,
          ignored: 0,
          created: 0,
          resolved: 0,
          pending: 0,
          linked: 0,
          applied: 0,
          disabled: true
        });
      }
      return json(res, 405, { error: 'Méthode non autorisée' });
    }
    const actor = await currentUser(req);
    if (!actor) return json(res, 401, { error: 'Non connecté' });
    if (req.method === 'GET') {
      if (!hasPermission(actor, 'bank.read')) return json(res, 403, { error: 'Accès refusé' });
      return json(res, 200, {
        proposals: [],
        last_scan: await readSetting(SCAN_KEY) || null,
        requested: !!(await readSetting(REQUEST_KEY)),
        disabled: true
      });
    }
    if (req.method !== 'PUT') return json(res, 405, { error: 'Méthode non autorisée' });
    if (!hasPermission(actor, 'bank.write')) return json(res, 403, { error: 'Modification refusée' });
    return json(res, 410, DISABLED);
  });
}

module.exports = Object.assign(route, { ensureFundDiscordUrl, linkFundThread, findStoredThreadUrl });
