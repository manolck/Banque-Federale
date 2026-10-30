// Lecture des relevés « Haussmann Capital Partners » publiés dans le forum Discord des fonds.
// Fonctions pures : le bot envoie les embeds bruts, tout le décodage se fait ici.

const SPACES = /[\s  ]/g;

function parseNumber(text) {
  const cleaned = String(text == null ? '' : text).replace(SPACES, '').replace(/[−–]/g, '-').replace(',', '.');
  const found = cleaned.match(/-?\d+(?:\.\d+)?/);
  return found ? Number(found[0]) : NaN;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function plain(text) {
  return String(text == null ? '' : text).replace(/[*_`~|>]/g, '').replace(SPACES, ' ').trim();
}

function normal(text) {
  return plain(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Date RP de l'embed (année 1904) -> date réelle du registre (année 2026),
// puis recul jusqu'au vendredi : c'est la clé « on » utilisée par la séance des fonds.
function rpToBankFriday(timestamp) {
  const parsed = new Date(timestamp);
  if (!timestamp || Number.isNaN(parsed.getTime())) return '';
  const noon = new Date(parsed.getTime() + 12 * 3600 * 1000);
  const year = noon.getUTCFullYear();
  const real = new Date(Date.UTC(year >= 2000 ? year : year - 1904 + 2026, noon.getUTCMonth(), noon.getUTCDate(), 12));
  if (Number.isNaN(real.getTime())) return '';
  const back = (real.getUTCDay() - 5 + 7) % 7;
  real.setUTCDate(real.getUTCDate() - back);
  return real.toISOString().slice(0, 10);
}

function parseEmbed(embed) {
  if (!embed || typeof embed !== 'object') return null;
  const description = plain(embed.description);
  const dossier = description.match(/HCP-\s*(\d{3,})/i);
  if (!dossier) return null;
  let tier = '';
  let percent = NaN;
  let before = NaN;
  let after = NaN;
  for (const field of Array.isArray(embed.fields) ? embed.fields : []) {
    const name = plain(field && field.name);
    const value = String((field && field.value) || '');
    const palier = name.match(/^Palier\s+(III|II|I|[123])\b/i);
    if (palier) {
      tier = palier[1].toUpperCase().replace('1', 'I').replace('2', 'II').replace('3', 'III');
      const pct = plain(value).replace(/[−–]/g, '-').replace(/\s/g, '').match(/([+-]?\d+(?:[.,]\d+)?)%/);
      if (pct) percent = Number(pct[1].replace(',', '.'));
    }
    if (/^Capital$/i.test(name)) {
      const b = value.match(/Avant\s*:\s*([^\n\r]+)/i);
      const a = value.match(/Apr[eè]s\s*:\s*([^\n\r]+)/i);
      if (b) before = parseNumber(b[1]);
      if (a) after = parseNumber(a[1]);
    }
  }
  if (![percent, before, after].every(Number.isFinite)) return null;
  return {
    dossier_number: 'HCP-' + dossier[1].padStart(6, '0'),
    tier,
    result_percent: percent,
    capital_before: round2(before),
    capital_after: round2(after),
    date: rpToBankFriday(embed.timestamp)
  };
}

// Statut lu dans les étiquettes ou le titre du fil. Rien n'est déduit de l'archivage Discord,
// qui se fait tout seul après quelques jours d'inactivité.
function statusFromThread(thread) {
  const words = [thread && thread.name].concat((thread && thread.tags) || []).map(normal).join(' | ');
  if (/\b(clotur|clos|ferme|termine)/.test(words)) return 'clos';
  if (/\bpause\b|suspendu/.test(words)) return 'pause';
  return '';
}

function parseThread(thread) {
  const statements = [];
  for (const message of (thread && thread.messages) || []) {
    for (const embed of (message && message.embeds) || []) {
      const row = parseEmbed(embed);
      if (row) statements.push({ ...row, message_id: String(message.id || '') });
    }
  }
  const dossier = (statements[0] && statements[0].dossier_number)
    || ((String(thread && thread.name || '').match(/HCP-\s*(\d{3,})/i) || [])[1] ? 'HCP-' + String(thread.name.match(/HCP-\s*(\d{3,})/i)[1]).padStart(6, '0') : '');
  return {
    thread_id: String(thread && thread.id || ''),
    thread_url: String(thread && thread.url || ''),
    name: String(thread && thread.name || ''),
    dossier_number: dossier,
    status: statusFromThread(thread),
    statements: statements.filter((item) => !dossier || item.dossier_number === dossier)
  };
}

const CENTS = 0.011;
const same = (a, b) => Math.abs(Number(a) - Number(b)) <= CENTS;

function dayGap(left, right) {
  const a = Date.parse(String(left) + 'T12:00:00Z');
  const b = Date.parse(String(right) + 'T12:00:00Z');
  return Number.isNaN(a) || Number.isNaN(b) ? Infinity : Math.abs(a - b) / 86400000;
}

// Compare les relevés du forum à ceux du dossier. Ne modifie rien.
function diffFund(fund, forum) {
  const known = (Array.isArray(fund.statements) ? fund.statements : []).filter((item) => item && item.capital_after != null);
  const used = new Set();
  const out = [];
  const seen = new Set();
  for (const item of forum.statements) {
    const sig = [item.date, item.capital_before, item.capital_after].join('|');
    if (seen.has(sig)) continue; // doublon d'un même relevé dans le fil
    seen.add(sig);
    let match = known.find((x, i) => !used.has(i) && same(x.capital_before, item.capital_before) && same(x.capital_after, item.capital_after));
    if (match) {
      used.add(known.indexOf(match));
      if (Math.abs(Number(match.result_percent) - item.result_percent) > 0.051) out.push({ kind: 'fix_statement', statement: item, current: match });
      continue;
    }
    match = known.find((x, i) => !used.has(i) && x.on && item.date && dayGap(x.on, item.date) <= 3);
    if (match) {
      used.add(known.indexOf(match));
      out.push({ kind: 'fix_statement', statement: item, current: match });
      continue;
    }
    out.push({ kind: 'add_statement', statement: item, current: null });
  }
  const dbStatus = String(fund.status || 'ouvert');
  if (forum.status && forum.status !== dbStatus) out.push({ kind: 'status', status: forum.status, current_status: dbStatus });
  return { proposals: out, only_in_db: known.filter((_, i) => !used.has(i)).length };
}

// Signature stable d'une proposition : sert à ne pas la recréer à chaque lecture du forum.
function proposalSignature(fund, item) {
  if (item.kind === 'status') return [fund.id, 'status', item.status].join('|');
  const s = item.statement || {};
  return [fund.id, item.kind, s.date, s.capital_before, s.capital_after, s.result_percent].join('|');
}

function latestAfter(statements) {
  const dated = statements.filter((item) => item && item.on && item.capital_after != null)
    .sort((a, b) => String(a.on).localeCompare(String(b.on)));
  return dated.length ? round2(dated[dated.length - 1].capital_after) : null;
}

// Construit la mise à jour d'un dossier pour une proposition validée. Ne touche pas à la base.
function applyProposal(fund, proposal) {
  if (proposal.kind === 'status') {
    if (!['clos', 'pause'].includes(proposal.status)) return { error: 'Statut inconnu.' };
    if (String(fund.status || 'ouvert') === proposal.status) return { error: 'Le dossier a déjà ce statut.' };
    const patch = { status: proposal.status };
    if (proposal.status === 'clos') patch.closed_at = new Date().toISOString();
    return { patch };
  }
  const item = proposal.statement;
  if (!item || !item.date || ![item.result_percent, item.capital_before, item.capital_after].every(Number.isFinite)) {
    return { error: 'Relevé du forum incomplet.' };
  }
  const list = (Array.isArray(fund.statements) ? fund.statements : []).slice();
  const line = {
    on: item.date,
    result_percent: item.result_percent,
    capital_before: item.capital_before,
    capital_after: item.capital_after,
    market: true,
    source: 'discord'
  };
  if (proposal.kind === 'fix_statement' && proposal.current) {
    const index = list.findIndex((x) => x && x.on === proposal.current.on
      && same(x.capital_before, proposal.current.capital_before) && same(x.capital_after, proposal.current.capital_after));
    if (index < 0) return { error: 'Le relevé du dossier a changé depuis la lecture du forum. Relis le forum.' };
    list[index] = { ...list[index], ...line };
  } else if (proposal.kind === 'add_statement') {
    if (list.some((x) => x && x.on === line.on && same(x.capital_after, line.capital_after))) {
      return { error: 'Ce relevé existe déjà dans le dossier.' };
    }
    list.push(line);
  } else {
    return { error: 'Proposition inconnue.' };
  }
  list.sort((a, b) => String((a && a.on) || '').localeCompare(String((b && b.on) || '')));
  const patch = { statements: list };
  const last = latestAfter(list);
  if (last != null) patch.capital_balance = last;
  return { patch };
}

module.exports = { parseEmbed, parseThread, parseNumber, rpToBankFriday, statusFromThread, diffFund, round2, same, proposalSignature, applyProposal };