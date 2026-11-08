const { sb, json, currentUser, hasPermission, handler } = require('./_lib');
const { money, marketDateFr, addDays, fundCapital } = require('./money');
const { PALIERS, TIER_OF, LIBELLES, CONFIG, etatInitial, tirageSemaine, issueSemaine } = require('./fonds_engine');
const { serviceNotice, enqueueNotice } = require('./discord_actions');
const { ensureFundDiscordUrl } = require('./fonds_forum_sync');

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

function upcomingSunday(date) {
  const parts = parisParts(date);
  const delta = (0 - parts.weekday + 7) % 7;
  return addDays(parts.date, delta);
}

function hourReached(date, sunday, hour) {
  const parts = parisParts(date);
  if (parts.date > sunday) return true;
  if (parts.date < sunday) return false;
  return parts.hour > hour || (parts.hour === hour && parts.minute >= 0);
}

/** Tirage des taux : dimanche 18 h Paris. */
function slotReached(date, sunday) {
  return hourReached(date, sunday, 18);
}

/** Application comptes + édition Discord : 1 h après le tirage (19 h Paris). */
function publishReached(date, sunday) {
  return hourReached(date, sunday, 19);
}

function initialMarket(date) {
  return {
    next: upcomingSunday(date),
    etats: { I: etatInitial(), II: etatInitial(), III: etatInitial() },
    weeks: {}
  };
}

function dueSunday(state, date) {
  if (!state || !state.next) return '';
  return slotReached(date, state.next) ? state.next : '';
}

function isParisSunday(iso) {
  const parts = parisParts(new Date(`${String(iso || '').slice(0, 10)}T12:00:00Z`));
  return parts.weekday === 0;
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

function marketLine(row, sunday) {
  return (Array.isArray(row && row.statements) ? row.statements : []).find((item) => item && item.market && item.on === sunday) || null;
}

function fundOpenForMarket(row) {
  return String((row && row.status) || '').trim().toLowerCase() === 'ouvert';
}

function applyFund(row, sunday, results) {
  // Pause / clôture : le tirage n'affecte ni le capital ni les relevés.
  if (!row || !fundOpenForMarket(row)) return null;
  const nom = TIER_OF[row.tier];
  const draw = nom && results && results[nom];
  if (!draw) return null;
  if (marketLine(row, sunday)) return null;
  const before = fundCapital(row);
  const after = money(Math.max(0, before * (1 + Number(draw.final) / 100)));
  const statements = (Array.isArray(row.statements) ? row.statements : []).concat([{
    on: sunday,
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

function dotPercent(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const text = Math.abs(number).toFixed(digits);
  if (number > 0) return `+${text}%`;
  if (number < 0) return `-${text}%`;
  return `${(0).toFixed(digits)}%`;
}

function snapshot(etats) {
  const copy = {};
  for (const nom of PALIERS) {
    const etat = (etats && etats[nom]) || etatInitial();
    copy[nom] = { regime: etat.regime || 'stable', serie: Number(etat.serie) || 0 };
  }
  return copy;
}

function projectionPalier(nom, etats) {
  return issueSemaine(nom, (etats && etats[nom]) || etatInitial());
}

function partages(parts) {
  const keys = ['hausse', 'baisse', 'neutre'];
  const points = keys.map((key) => Math.round(Number(parts[key]) * 10000));
  const drift = 10000 - points.reduce((total, value) => total + value, 0);
  let index = 0;
  points.forEach((value, cursor) => { if (value > points[index]) index = cursor; });
  points[index] += drift;
  return {
    hausse: (points[0] / 100).toFixed(2),
    baisse: (points[1] / 100).toFixed(2),
    neutre: (points[2] / 100).toFixed(2)
  };
}

function projectionPhrase(hausse, baisse) {
  const ecart = Math.abs(hausse - baisse) * 100;
  const biais = ecart < 10
    ? 'Un mouvement modéré est le plus probable, sans biais marqué.'
    : hausse > baisse
      ? 'Une hausse est le scénario le plus probable, avec un biais marqué.'
      : 'Une baisse est le scénario le plus probable, avec un biais marqué.';
  return `${biais} Un gros écart reste possible, mais peu probable.`;
}

function streakSentence(serie) {
  const value = Number(serie) || 0;
  const count = Math.abs(value);
  if (!count) return 'Aucune série en cours avant ce tirage.';
  const sens = value > 0 ? 'hausse' : 'baisse';
  const semaines = count === 1 ? '1 semaine' : `${count} semaines`;
  const affilee = count > 1 ? " d'affilée" : '';
  return `${semaines} de ${sens}${affilee} avant ce tirage.`;
}

function contexteTexte(avant) {
  const lines = PALIERS.map((nom) => streakSentence(avant && avant[nom] ? avant[nom].serie : 0));
  if (lines.every((line) => line === lines[0])) return lines[0];
  return PALIERS.map((nom, index) => {
    const text = lines[index];
    return `Palier ${nom} : ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }).join('\n');
}

function projectionField(nom, etats) {
  const parts = projectionPalier(nom, etats);
  const shown = partages(parts);
  return {
    name: `Projection · Palier ${nom}`,
    inline: true,
    value: [
      projectionPhrase(parts.hausse, parts.baisse),
      `Hausse : **${shown.hausse}%**`,
      `Baisse : **${shown.baisse}%**`,
      `Neutre : **${shown.neutre}%**`
    ].join('\n')
  };
}

function marketTeaserEmbed(week) {
  const when = marketDateFr(week && week.on);
  return {
    title: 'Haussmann Capital Partners',
    color: 0x9370db,
    description: [
      'Tirage hebdomadaire des fonds spéculatifs effectué.',
      'Les résultats seront publiés à **19 h** (une heure après le tirage).'
    ].join('\n'),
    footer: {
      text: `Publication des résultats à 19:00. • ${when} 18:00`
    }
  };
}

function marketEmbed(week) {
  const board = week || {};
  const results = board.results || {};
  const when = marketDateFr(board.on);
  return {
    title: 'Haussmann Capital Partners',
    color: 0x9370db,
    description: [
      'Publication hebdomadaire des résultats des fonds spéculatifs opérés par Haussmann Asset Management.',
      'Ces résultats s\'appliquent automatiquement au relevé de chaque client selon son palier.'
    ].join('\n'),
    fields: PALIERS.map((nom) => {
      const [lo, hi] = CONFIG[nom].bornes;
      const final = results[nom] && results[nom].final;
      return {
        name: `Palier ${nom}`,
        inline: true,
        value: `Résultat : **${dotPercent(final, 1)}**\nPlage : ${dotPercent(lo, 1)} à ${dotPercent(hi, 1)}`
      };
    }).concat(PALIERS.map((nom) => projectionField(nom, board.apres)), [
      {
        name: 'Contexte marché',
        inline: false,
        value: contexteTexte(board.avant)
      }
    ]),
    footer: {
      text: `Le capital investi demeure exposé à un risque de perte partielle ou totale selon les conditions du marché. • ${when} 19:00`
    }
  };
}

function channelId() {
  // Salon texte dédié, sinon forum des fonds (même ID côté Pi si un seul salon est configuré).
  return String(process.env.DISCORD_FUNDS_CHANNEL_ID || process.env.DISCORD_FUNDS_FORUM_ID || '').trim();
}

function present(state, date) {
  const now = date instanceof Date ? date : new Date();
  const base = state && state.next ? { ...state } : initialMarket(now);
  if (base.next && !isParisSunday(base.next)) base.next = upcomingSunday(now);
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

function claimFresh(iso, now, ms = 45000) {
  const claimed = Date.parse(iso || '');
  return Number.isFinite(claimed) && now - claimed < ms;
}

function isDiscordSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || '').trim());
}

function marketFullyPosted(data) {
  const posted = (data && data.posted) || {};
  return isDiscordSnowflake(posted.releve) || PALIERS.every((nom) => isDiscordSnowflake(posted[nom]));
}

function queueMarkets(state, date = new Date()) {
  const channel = channelId();
  const now = Date.now();
  const items = [];
  let dirty = false;
  const pending = [];
  if (!channel) {
    if (!channelWarned) {
      channelWarned = true;
      console.error('DISCORD_FUNDS_CHANNEL_ID / DISCORD_FUNDS_FORUM_ID manquant : les relevés de palier restent dans le registre.');
    }
  }
  for (const week of Object.keys(state.weeks || {}).sort()) {
    const data = state.weeks[week];
    if (!data || !data.results) continue;
    data.posted = data.posted || {};
    data.claims = data.claims || {};
    // Ancien marquage « posted » sans vrai message Discord → on republie.
    if (data.posted.releve && !isDiscordSnowflake(data.posted.releve)) {
      delete data.posted.releve;
      dirty = true;
    }
    if (data.posted.draft && !isDiscordSnowflake(data.posted.draft)) {
      delete data.posted.draft;
      dirty = true;
    }
    if (data.draft_message_id && !isDiscordSnowflake(data.draft_message_id)) {
      data.draft_message_id = '';
      dirty = true;
    }
    const rawDraft = String(data.draft_message_id || data.posted.draft || '').trim();
    const draftId = isDiscordSnowflake(rawDraft) ? rawDraft : '';
    const alreadyPosted = marketFullyPosted(data);
    const readyToPublish = !!data.applied && publishReached(date, week);
    if (alreadyPosted) continue;

    // 18 h : message d’attente (sera édité à 19 h).
    if (!readyToPublish && slotReached(date, week) && !draftId) {
      pending.push({ week, phase: 'draft', reason: channel ? 'awaiting_draft' : 'missing_channel' });
      if (!channel || claimFresh(data.claims.draft, now)) continue;
      data.claims.draft = new Date(now).toISOString();
      dirty = true;
      items.push({
        channel_id: channel,
        week,
        palier: 'draft',
        phase: 'draft',
        embed: marketTeaserEmbed({ on: week })
      });
      continue;
    }

    // 19 h : édition du message avec les résultats (ou envoi si pas de brouillon).
    if (!readyToPublish) {
      if (data.results && slotReached(date, week) && !data.applied) {
        pending.push({ week, phase: 'releve', reason: 'awaiting_apply' });
      }
      continue;
    }
    pending.push({ week, phase: 'releve', reason: channel ? 'awaiting_publish' : 'missing_channel' });
    if (!channel || claimFresh(data.claims.releve, now)) continue;
    data.claims.releve = new Date(now).toISOString();
    dirty = true;
    items.push({
      channel_id: channel,
      week,
      palier: 'releve',
      phase: 'releve',
      edit_message_id: /^\d+$/.test(draftId) ? draftId : undefined,
      embed: marketEmbed({ on: week, results: data.results, avant: data.avant, apres: data.apres })
    });
  }
  return { items, dirty, pending, channel: !!channel };
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
  if (state.next && !isParisSunday(state.next)) {
    state.next = upcomingSunday(now);
    dirty = true;
  }
  const sunday = dueSunday(state, now);
  if (sunday && !state.weeks[sunday]) {
    // 18 h : tirage uniquement.
    const avant = snapshot(state.etats);
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
    state.weeks[sunday] = {
      results,
      avant,
      apres: snapshot(drawn.etats),
      applied: false,
      posted: {},
      claims: {},
      totals: null,
      drawn_at: now.toISOString()
    };
    state.etats = drawn.etats;
    const signe = PALIERS.map((nom) => `${nom} ${percentFr(results[nom].final)}`).join(', ');
    console.log(`Tirage des fonds ${sunday} : ${signe}`);
    await saveState(state);
    dirty = false;
  }

  // 19 h (ou reprise) : appliquer toute séance tirée non encore passée sur les comptes.
  const toApply = Object.keys(state.weeks || {}).sort().filter((week) => {
    const data = state.weeks[week];
    return data && data.results && !data.applied && publishReached(now, week);
  });
  for (const weekKey of toApply) {
    const week = state.weeks[weekKey];
    const totals = blankTotals();
    let notices = 0;
    for (const row of funds || []) {
      if (!fundOpenForMarket(row)) continue;
      const existing = marketLine(row, weekKey);
      if (existing) {
        addTotal(totals, row.tier, existing);
        continue;
      }
      const patch = applyFund(row, weekKey, week.results);
      if (!patch) continue;
      const statement = patch.statements[patch.statements.length - 1];
      const next = { ...row, ...patch, market_statement: statement };
      try {
        await ensureFundDiscordUrl(next);
        if (next.discord_url && next.discord_url !== row.discord_url) {
          patch.discord_url = next.discord_url;
          if (next.discord_posted_at) patch.discord_posted_at = next.discord_posted_at;
        }
      } catch (error) {
        console.error('Lien Discord fonds', row.dossier_number || row.id, error.message || error);
      }
      const embed = serviceNotice('speculative_funds', 'market', next);
      Object.assign(patch, enqueueNotice(next, embed));
      if (patch.discord_notices) notices += 1;
      const updated = await sb.from('pret_speculative_funds').update(patch).eq('id', row.id);
      if (updated.error) throw new Error(updated.error.message);
      Object.assign(row, patch);
      addTotal(totals, row.tier, statement);
    }
    week.totals = totals;
    week.applied = true;
    week.applied_at = now.toISOString();
    week.dossier_notices_sent = true;
    week.claims = {};
    if (!state.next || state.next <= weekKey) state.next = addDays(weekKey, 7);
    console.log(`Application des fonds ${weekKey} sur les dossiers ouverts (${notices} avis dossier)`);
    dirty = true;
  }

  // Rattrapage : séance déjà appliquée avant l’ajout des avis dossier.
  for (const weekKey of Object.keys(state.weeks || {}).sort()) {
    const week = state.weeks[weekKey];
    if (!week || !week.applied || !week.results || week.dossier_notices_sent) continue;
    if (!publishReached(now, weekKey)) continue;
    let notices = 0;
    for (const row of funds || []) {
      if (!fundOpenForMarket(row)) continue;
      const statement = marketLine(row, weekKey);
      if (!statement) continue;
      const patch = {};
      const next = { ...row, market_statement: statement };
      try {
        await ensureFundDiscordUrl(next);
        if (next.discord_url && next.discord_url !== row.discord_url) {
          patch.discord_url = next.discord_url;
          if (next.discord_posted_at) patch.discord_posted_at = next.discord_posted_at;
        }
      } catch (error) {
        console.error('Lien Discord fonds', row.dossier_number || row.id, error.message || error);
      }
      const embed = serviceNotice('speculative_funds', 'market', next);
      Object.assign(patch, enqueueNotice(next, embed));
      if (!patch.discord_notices) continue;
      const updated = await sb.from('pret_speculative_funds').update(patch).eq('id', row.id);
      if (updated.error) throw new Error(updated.error.message);
      Object.assign(row, patch);
      notices += 1;
    }
    week.dossier_notices_sent = true;
    week.claims = {};
    dirty = true;
    console.log(`Rattrapage avis dossiers ${weekKey} : ${notices} fil(s)`);
  }

  // Reprise Discord global : séance appliquée sans vrai message snowflake.
  const latestUnposted = Object.keys(state.weeks || {}).sort().reverse().find((week) => {
    const data = state.weeks[week];
    return data && data.results && data.applied && publishReached(now, week) && !marketFullyPosted(data);
  });
  if (latestUnposted) {
    const data = state.weeks[latestUnposted];
    data.claims = data.claims || {};
    if (data.claims.releve || data.claims.draft) {
      data.claims.releve = null;
      data.claims.draft = null;
      dirty = true;
    }
  }

  const queued = queueMarkets(state, now);
  if (dirty || queued.dirty) await saveState(state);
  const items = queued.items;
  const weeksInfo = Object.keys(state.weeks || {}).sort().slice(-3).map((week) => {
    const data = state.weeks[week] || {};
    return {
      week,
      applied: !!data.applied,
      dossier_notices_sent: !!data.dossier_notices_sent,
      posted: !!(data.posted && data.posted.releve),
      posted_id: data.posted && data.posted.releve ? String(data.posted.releve).slice(0, 24) : ''
    };
  });
  items.meta = {
    channel: queued.channel,
    pending: queued.pending,
    next: state.next,
    weeks: weeksInfo
  };
  return items;
}

async function acknowledgeMarket(week, palier, messageId) {
  const draft = palier === 'draft';
  const releve = palier === 'releve';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(week || '')) || (!draft && !releve && !PALIERS.includes(palier))) {
    return { status: 400, error: 'Accusé de séance incomplet.' };
  }
  const state = await loadState();
  const data = state && state.weeks && state.weeks[week];
  if (!data) return { status: 404, error: 'Séance introuvable.' };
  const posted = { ...(data.posted || {}) };
  const snowflake = isDiscordSnowflake(messageId) ? String(messageId).trim() : '';
  if (!snowflake) return { status: 400, error: 'Identifiant Discord de message invalide.' };
  if (draft) {
    posted.draft = snowflake;
    data.draft_message_id = snowflake;
  } else {
    posted[palier] = snowflake;
    if (releve) {
      for (const nom of PALIERS) posted[nom] = snowflake;
      data.draft_message_id = snowflake;
    }
  }
  data.posted = posted;
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
route.dueSunday = dueSunday;
route.upcomingSunday = upcomingSunday;
route.dueFriday = dueSunday;
route.upcomingFriday = upcomingSunday;
route.slotReached = slotReached;
route.publishReached = publishReached;
route.applyFund = applyFund;
route.fundOpenForMarket = fundOpenForMarket;
route.marketEmbed = marketEmbed;
route.marketTeaserEmbed = marketTeaserEmbed;
module.exports = route;
