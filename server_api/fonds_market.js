const { sb, json, currentUser, hasPermission, handler } = require('./_lib');
const { money, moneyFr, dateFr, addDays, fundCapital } = require('./money');
const { letterhead } = require('./discord_forms');
const { PALIERS, TIER_OF, LIBELLES, etatInitial, tirageSemaine } = require('./fonds_engine');

const SETTING_KEY = 'fonds_market';
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let channelWarned = false;

function parisParts(date) {
  const bag = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    date: `${bag.year}-${bag.month}-${bag.day}`,
    hour,
    minute: Number(bag.minute),
    weekday: WEEKDAYS[bag.weekday]
  };
}

function upcomingFriday(date) {
  const parts = parisParts(date);
  const delta = (5 - parts.weekday + 7) % 7;
  return addDays(parts.date, delta);
}

function slotReached(date, friday) {
  const parts = parisParts(date);
  if (parts.date > friday) return true;
  if (parts.date < friday) return false;
  return parts.hour > 18 || (parts.hour === 18 && parts.minute >= 0);
}

function initialMarket(date) {
  return {
    next: upcomingFriday(date),
    etats: { I: etatInitial(), II: etatInitial(), III: etatInitial() },
    weeks: {}
  };
}

function dueFriday(state, date) {
  if (!state || !state.next) return '';
  return slotReached(date, state.next) ? state.next : '';
}

function percentFr(value) {
  const number = Number(value);
  const text = number.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${number > 0 ? '+' : ''}${text} %`;
}

function blankTotals() {
  return {
    I: { dossiers: 0, before: 0, after: 0 },
    II: { dossiers: 0, before: 0, after: 0 },
    III: { dossiers: 0, before: 0, after: 0 }
  };
}

function marketLine(row, friday) {
  return (Array.isArray(row && row.statements) ? row.statements : []).find((item) => item && item.market && item.on === friday) || null;
}

function applyFund(row, friday, results) {
  if (!row || row.status !== 'ouvert') return null;
  const nom = TIER_OF[row.tier];
  const draw = nom && results && results[nom];
  if (!draw) return null;
  if (marketLine(row, friday)) return null;
  const before = fundCapital(row);
  const after = money(Math.max(0, before * (1 + Number(draw.final) / 100)));
  const statements = (Array.isArray(row.statements) ? row.statements : []).concat([{
    on: friday,
    result_percent: draw.final,
    capital_before: before,
    capital_after: after,
    regime: draw.regime,
    regime_label: draw.label || LIBELLES[draw.regime] || draw.regime,
    market: true
  }]);
  return { capital_balance: after, statements };
}

function addTotal(totals, tier, line) {
  const nom = TIER_OF[tier];
  if (!nom || !line) return;
  const bucket = totals[nom];
  bucket.dossiers += 1;
  bucket.before = money(bucket.before + Number(line.capital_before || 0));
  bucket.after = money(bucket.after + Number(line.capital_after || 0));
}

function marketEmbed(nom, draw, total, friday, next) {
  const bucket = total || { dossiers: 0, before: 0, after: 0 };
  return letterhead({
    title: `Relevé hebdomadaire — Palier ${nom}`,
    color: Number(draw.final) >= 0 ? 0x1f8b4c : 0x8b642c,
    description: [
      `**Séance :** ${dateFr(friday)}`,
      `**Résultat :** ${percentFr(draw.final)}`,
      `**Régime :** ${draw.label || LIBELLES[draw.regime] || ''}`,
      `**Dossiers ouverts :** ${bucket.dossiers}`,
      `**Capital avant :** ${moneyFr(bucket.before)}`,
      `**Capital après :** ${moneyFr(bucket.after)}`,
      `**Prochaine séance :** ${dateFr(next)} à 18 h`
    ].join('\n'),
    footer: 'Risque de perte partielle ou totale du capital.'
  });
}

function channelId() {
  return String(process.env.DISCORD_FUNDS_CHANNEL_ID || '').trim();
}

function present(state, date) {
  const base = state && state.next ? state : initialMarket(date);
  const applied = Object.keys(base.weeks || {}).filter((key) => base.weeks[key] && base.weeks[key].applied).sort();
  const on = applied.length ? applied[applied.length - 1] : '';
  const week = on ? base.weeks[on] : null;
  const paliers = {};
  if (week && week.results) {
    for (const nom of PALIERS) {
      const item = week.results[nom] || {};
      const total = week.totals && week.totals[nom] ? week.totals[nom] : { dossiers: 0, before: 0, after: 0 };
      paliers[nom] = { result: item.final, label: item.label || '', dossiers: total.dossiers, before: total.before, after: total.after };
    }
  }
  return { next: base.next, on, hour: '18:00', timezone: 'Europe/Paris', paliers: week ? paliers : null };
}

function queueMarkets(state) {
  const channel = channelId();
  if (!channel) {
    if (!channelWarned) {
      channelWarned = true;
      console.error('DISCORD_FUNDS_CHANNEL_ID manquant : les relevés de palier restent dans le registre.');
    }
    return { items: [], dirty: false };
  }
  const now = Date.now();
  const items = [];
  let dirty = false;
  for (const week of Object.keys(state.weeks || {}).sort()) {
    const data = state.weeks[week];
    if (!data || !data.applied || !data.results) continue;
    data.posted = data.posted || {};
    data.claims = data.claims || {};
    for (const nom of PALIERS) {
      if (data.posted[nom]) continue;
      const claimed = Date.parse(data.claims[nom] || '');
      if (Number.isFinite(claimed) && now - claimed < 120000) continue;
      data.claims[nom] = new Date(now).toISOString();
      dirty = true;
      items.push({
        channel_id: channel,
        week,
        palier: nom,
        embed: marketEmbed(nom, data.results[nom], data.totals && data.totals[nom], week, state.next)
      });
    }
  }
  return { items, dirty };
}

async function loadState() {
  const { data, error } = await sb.from('pret_bank_settings').select('*').eq('setting_key', SETTING_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const value = data.setting_value;
  if (!value || typeof value !== 'object' || !value.next) return null;
  return value;
}

async function saveState(state) {
  const saved = await sb.from('pret_bank_settings').upsert({
    setting_key: SETTING_KEY,
    setting_value: state
  }, { onConflict: 'setting_key' });
  if (saved.error) throw new Error(saved.error.message);
}

async function settleFunds(funds, date) {
  const now = date instanceof Date ? date : new Date();
  let state = await loadState();
  let dirty = false;
  if (!state) {
    state = initialMarket(now);
    dirty = true;
  }
  const friday = dueFriday(state, now);
  if (friday) {
    if (!state.weeks[friday]) {
      const drawn = tirageSemaine(state.etats);
      const results = {};
      for (const nom of PALIERS) {
        results[nom] = {
          final: drawn.resultats[nom],
          regime: drawn.etats[nom].regime,
          label: drawn.details[nom].label,
          p_gain: drawn.details[nom].p_gain
        };
      }
      state.weeks[friday] = { results, applied: false, posted: {}, claims: {}, totals: null };
      state.etats = drawn.etats;
      await saveState(state);
      dirty = false;
    }
    const week = state.weeks[friday];
    if (!week.applied) {
      const totals = blankTotals();
      for (const row of funds || []) {
        const existing = marketLine(row, friday);
        if (existing) {
          addTotal(totals, row.tier, existing);
          continue;
        }
        const patch = applyFund(row, friday, week.results);
        if (!patch) continue;
        const updated = await sb.from('pret_speculative_funds').update(patch).eq('id', row.id);
        if (updated.error) throw new Error(updated.error.message);
        Object.assign(row, patch);
        addTotal(totals, row.tier, patch.statements[patch.statements.length - 1]);
      }
      week.totals = totals;
      week.applied = true;
      state.next = addDays(friday, 7);
      const signe = PALIERS.map((nom) => `${nom} ${percentFr(week.results[nom].final)}`).join(', ');
      console.log(`Séance des fonds ${friday} : ${signe}`);
      dirty = true;
    }
  }
  const queued = queueMarkets(state);
  if (dirty || queued.dirty) await saveState(state);
  return queued.items;
}

async function acknowledgeMarket(week, palier, messageId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(week || '')) || !PALIERS.includes(palier)) {
    return { status: 400, error: 'Accusé de séance incomplet.' };
  }
  const state = await loadState();
  const data = state && state.weeks && state.weeks[week];
  if (!data) return { status: 404, error: 'Séance introuvable.' };
  data.posted = { ...(data.posted || {}), [palier]: messageId || 'posted' };
  await saveState(state);
  return { ok: true };
}

async function route(req, res) {
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });
  if (!hasPermission(actor, 'bank.read')) return json(res, 403, { error: 'Accès refusé' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non autorisée' });
  const state = await loadState();
  return json(res, 200, present(state, new Date()));
}

route.settleFunds = settleFunds;
route.acknowledgeMarket = acknowledgeMarket;
route.present = present;
route.initialMarket = initialMarket;
route.dueFriday = dueFriday;
route.upcomingFriday = upcomingFriday;
route.slotReached = slotReached;
route.applyFund = applyFund;
route.marketEmbed = marketEmbed;
module.exports = route;
