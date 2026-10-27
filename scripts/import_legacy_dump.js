const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_DATA = path.join(ROOT, '.local', 'old-db', 'data.sql');
const SQL_SCHEMA = path.join(ROOT, '.local', 'old-db', 'schema.sql');
const DOCUMENTS = path.join(ROOT, '.local', 'old-db', '2026-10-27_10-08-30', 'documents');

const IMPORTS = {
  pret_users: 'u',
  pret_clients: 'c',
  pret_loans: 'l',
  pret_client_notes: 'n',
  pret_client_documents: 'd',
  pret_credit_applications: 'r',
  pret_horse_credits: 'h',
  pret_life_insurance_contracts: 'v',
  pret_life_insurance_events: 'e',
  pret_agenda_events: 'a',
  pret_telegram_contacts: 't',
  pret_logs: 'g'
};

const FOREIGN_KEYS = {
  pret_clients: { banquier_id: 'pret_users' },
  pret_loans: {
    client_id: 'pret_clients',
    banquier_id: 'pret_users',
    application_id: 'pret_credit_applications'
  },
  pret_client_notes: { client_id: 'pret_clients' },
  pret_client_documents: { client_id: 'pret_clients' },
  pret_credit_applications: { client_id: 'pret_clients' },
  pret_horse_credits: { client_id: 'pret_clients' },
  pret_life_insurance_contracts: {
    subscriber_client_id: 'pret_clients',
    created_by_id: 'pret_users'
  },
  pret_life_insurance_events: { contract_id: 'pret_life_insurance_contracts' },
  pret_agenda_events: { client_id: 'pret_clients' },
  pret_telegram_contacts: { client_id: 'pret_clients' },
  pret_logs: { user_id: 'pret_users' }
};

const KNOWN_ROLES = new Set([
  'TECHNICIAN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'EXECUTIVE_ASSISTANT',
  'BANK_MANAGER', 'BANKER', 'TRAINEE_BANKER', 'PARTNER', 'UNAVAILABLE', 'PENDING_ASSIGNMENT'
]);
const LEGACY_ROLES = {
  admin: 'TECHNICIAN',
  directeur: 'DIRECTOR',
  co_directeur: 'DEPUTY_DIRECTOR',
  employe: 'BANKER'
};

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function unescapeCopy(value) {
  if (value === '\\N') return null;
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '\\') {
      out += value[i];
      continue;
    }
    const next = value[++i];
    if (next === undefined) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === 'v') out += '\v';
    else if (next === '\\') out += '\\';
    else if (next >= '0' && next <= '7') {
      let oct = next;
      for (let k = 0; k < 2 && value[i + 1] >= '0' && value[i + 1] <= '7'; k++) oct += value[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}

function kindOf(type) {
  const text = String(type || '').toLowerCase();
  if (text.startsWith('bool')) return 'bool';
  if (text.includes('json')) return 'json';
  if (/^(bigint|integer|smallint|numeric|decimal|real|double)/.test(text)) return 'number';
  if (text.startsWith('timestamp')) return 'timestamp';
  return 'text';
}

function columnKinds(schemaSql) {
  const tables = {};
  const re = /CREATE TABLE IF NOT EXISTS "public"\."([^"]+)" \(([\s\S]*?)\n\);/g;
  let match;
  while ((match = re.exec(schemaSql))) {
    const columns = {};
    for (const line of match[2].split('\n')) {
      const column = line.match(/^\s*"([^"]+)"\s+(.*)$/);
      if (!column) continue;
      columns[column[1]] = kindOf(column[2]);
    }
    tables[match[1]] = columns;
  }
  return tables;
}

function parseCopy(sql) {
  const blocks = {};
  const lines = sql.split(/\n/);
  const start = /^COPY "public"\."([^"]+)" \((.+)\) FROM stdin;$/;
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(start);
    if (!header) continue;
    const columns = [...header[2].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
    const rows = [];
    i += 1;
    while (i < lines.length && lines[i] !== '\\.') {
      const parts = lines[i].split('\t');
      if (parts.length !== columns.length) {
        throw new Error(`${header[1]} : ${parts.length} colonnes au lieu de ${columns.length}`);
      }
      const row = {};
      columns.forEach((name, index) => {
        row[name] = unescapeCopy(parts[index]);
      });
      rows.push(row);
      i += 1;
    }
    blocks[header[1]] = rows;
  }
  return blocks;
}

function convertRow(row, kinds) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) {
      out[key] = null;
      continue;
    }
    const kind = kinds[key] || 'text';
    if (kind === 'bool') out[key] = value === 't' || value === 'true' || value === '1';
    else if (kind === 'number') out[key] = value === '' ? null : Number(value);
    else if (kind === 'json') {
      try { out[key] = JSON.parse(value); } catch (error) { out[key] = value; }
    } else if (kind === 'timestamp') {
      const date = new Date(value);
      out[key] = Number.isNaN(date.getTime()) ? value : date.toISOString();
    } else out[key] = value;
  }
  return out;
}

function recordId(prefix, legacy) {
  const text = String(legacy);
  if (/^\d+$/.test(text) && text.length <= 14) return prefix + text.padStart(14, '0');
  return crypto.createHash('sha1').update(prefix + ':' + text).digest('hex').slice(0, 15);
}

function attachReminders(loans, reminders) {
  let attached = 0;
  let missed = 0;
  for (const reminder of reminders || []) {
    const loan = loans.find((item) => String(item.loan_id) === String(reminder.loan_id) || String(item.id) === String(reminder.loan_id));
    const echeances = loan && Array.isArray(loan.echeances) ? loan.echeances : null;
    const index = Number(reminder.echeance_index);
    if (!echeances || !Number.isInteger(index) || index < 0 || index >= echeances.length) {
      missed += 1;
      continue;
    }
    const time = reminder.reminder_time ? String(reminder.reminder_time).slice(0, 5) : '';
    const note = {
      reminder_date: reminder.reminder_date,
      reminder_time: time,
      reminder_method: reminder.reminder_method || 'telegram',
      note: reminder.note || '',
      recorded_by_username: reminder.recorded_by_username || '',
      created_at: reminder.created_at || new Date().toISOString()
    };
    echeances[index].rappels = [...(echeances[index].rappels || []), note];
    attached += 1;
  }
  return { attached, missed };
}

function adaptUsers(rows) {
  for (const row of rows) {
    if (!KNOWN_ROLES.has(row.role_code)) {
      row.role_code = LEGACY_ROLES[row.role] || 'PENDING_ASSIGNMENT';
    }
  }
}

function rewriteLinks(table, row, maps) {
  const links = FOREIGN_KEYS[table] || {};
  for (const [field, target] of Object.entries(links)) {
    if (row[field] === null || row[field] === undefined || row[field] === '') continue;
    const next = maps[target] && maps[target].get(String(row[field]));
    if (next) row[field] = next;
  }
}

async function main() {
  loadEnv();
  const { ensureCollections } = require('../server_api/pocket');
  const PocketBase = require('pocketbase/cjs');
  const kinds = columnKinds(fs.readFileSync(SQL_SCHEMA, 'utf8'));
  const blocks = parseCopy(fs.readFileSync(SQL_DATA, 'utf8'));
  const tables = {};
  for (const [name, rows] of Object.entries(blocks)) {
    tables[name] = rows.map((row) => convertRow(row, kinds[name] || {}));
  }

  const summary = {};
  for (const [name, rows] of Object.entries(tables)) summary[name] = rows.length;
  console.log('Tables lues : ' + JSON.stringify(summary));

  adaptUsers(tables.pret_users || []);
  const reminders = attachReminders(tables.pret_loans || [], tables.pret_loan_reminders || []);
  console.log(`Rappels rattachés aux échéances : ${reminders.attached}, ignorés : ${reminders.missed}`);

  const maps = {};
  const prepared = {};
  for (const [table, prefix] of Object.entries(IMPORTS)) {
    maps[table] = new Map();
    prepared[table] = (tables[table] || []).map((row) => {
      const id = recordId(prefix, row.id);
      maps[table].set(String(row.id), id);
      const stored = { ...row, legacy_id: row.id };
      delete stored.id;
      return { id, row: stored };
    });
  }
  for (const [table, records] of Object.entries(prepared)) {
    for (const record of records) rewriteLinks(table, record.row, maps);
  }

  const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://127.0.0.1:8090');
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(
    process.env.POCKETBASE_ADMIN_EMAIL,
    process.env.POCKETBASE_ADMIN_PASSWORD
  );
  await ensureCollections();

  const imported = {};
  for (const [table, records] of Object.entries(prepared)) {
    const existing = await pb.collection(table).getFullList({ batch: 200, requestKey: null });
    for (const record of existing) {
      if (record.row && record.row.legacy_id !== undefined && record.row.legacy_id !== null) {
        await pb.collection(table).delete(record.id, { requestKey: null });
      }
    }
    for (const record of records) {
      await pb.collection(table).create({ id: record.id, row: record.row }, { requestKey: null });
    }
    imported[table] = records.length;
  }

  let files = 0;
  let missingFiles = 0;
  const documents = prepared.pret_client_documents || [];
  const previousFiles = await pb.collection('pret_storage').getFullList({ batch: 200, requestKey: null });
  for (const record of previousFiles) {
    if (record.row && record.row.legacy_source === 'vanhorn-backup') {
      await pb.collection('pret_storage').delete(record.id, { requestKey: null });
    }
  }
  for (const document of documents) {
    const storagePath = document.row.storage_path;
    if (!storagePath) continue;
    const file = path.join(DOCUMENTS, ...String(storagePath).split('/'));
    if (!fs.existsSync(file)) {
      missingFiles += 1;
      console.log('Fichier absent : ' + storagePath);
      continue;
    }
    const body = fs.readFileSync(file);
    await pb.collection('pret_storage').create({
      row: {
        path: storagePath,
        mime: document.row.mime_type || 'application/octet-stream',
        content_base64: body.toString('base64'),
        legacy_source: 'vanhorn-backup'
      }
    }, { requestKey: null });
    files += 1;
  }

  console.log('Importés : ' + JSON.stringify(imported));
  console.log(`Pièces jointes : ${files}, manquantes : ${missingFiles}`);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  if (error && error.response) console.error(JSON.stringify(error.response));
  process.exit(1);
});
