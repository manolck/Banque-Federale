/**
 * Vérifie les dossiers sans fiche client et crée / rattache les fiches manquantes.
 *
 * Usage :
 *   node scripts/link_missing_clients.js
 *   node scripts/link_missing_clients.js --apply
 */
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

async function main() {
  const { ensureCollections } = require('../server_api/pocket');
  const { scanMissing, applyMissing } = require('../server_api/client_link_repair');
  await ensureCollections();
  const report = await scanMissing();
  console.log(`Dossiers parcourus : ${report.scanned}`);
  console.log(`Fiches clients : ${report.clients}`);
  console.log(`Liens manquants : ${report.missing.length} (créer ${report.create}, rattacher ${report.link})`);
  for (const item of report.missing.slice(0, 40)) {
    console.log(`- ${item.service} ${item.ref} · ${item.role} · ${item.display_name} → ${item.action}${item.match_name ? ` (${item.match_name})` : ''}`);
  }
  if (report.missing.length > 40) console.log(`… +${report.missing.length - 40} autres`);
  if (!process.argv.includes('--apply')) {
    console.log('\nMode diagnostic. Relance avec --apply pour créer / rattacher.');
    return;
  }
  const actor = { id: 'script', username: 'script:link_missing_clients', role: 'admin', role_code: 'TECHNICIAN' };
  const result = await applyMissing(null, actor);
  console.log(`\nTerminé : ${result.created} créées, ${result.linked} rattachées, ${result.skipped} en erreur.`);
  for (const error of result.errors || []) console.error(`! ${error.key}: ${error.error}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
