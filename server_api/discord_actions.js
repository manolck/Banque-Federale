const { randomBytes } = require('node:crypto');
const { moneyFr, dateFr, discordUrlOk } = require('./money');
const { letterhead } = require('./discord_forms');

const BROWN = 0x8b642c;
const GREEN = 0x1f8b4c;
const GOLD = 0xd7a64d;

function who(row) {
  return row.full_name || row.company_name || row.patron
    || `${row.prenom || row.subscriber_first_name || row.client_prenom || ''} ${row.nom || row.subscriber_last_name || row.client_nom || ''}`.trim()
    || 'Dossier';
}
function ref(row) {
  return row.dossier_number || row.contract_number || row.loan_id || row.dossier_id || '';
}
function notice(heading, lines, color, row) {
  const number = ref(row);
  return letterhead({
    title: `${heading} — ${who(row)}${number ? ` — Dossier ${number}` : ''}`.replace(/\s+/g, ' ').trim(),
    description: lines.filter(Boolean).join('\n'),
    footer: number ? `Dossier ${number}` : 'Interstate Banking & Trust Company',
    color: color == null ? GOLD : color
  });
}
function line(label, value) {
  return `**${label} :** ${value ?? '—'}`;
}
function lastOf(list) {
  return Array.isArray(list) && list.length ? list[list.length - 1] : {};
}

function serviceNotice(service, action, row) {
  if (service === 'term_savings' && action === 'validate_dossier') {
    return notice('Dossier validé', [
      line('Validé le', dateFr(row.validated_on)),
      'Le contrat est à jour.'
    ], GOLD, row);
  }
  if (service === 'term_savings' && action === 'early_withdrawal') {
    const settlement = row.settlement || {};
    return notice('Retrait anticipé', [
      line('Date', dateFr(settlement.on)),
      line('Frais', `${moneyFr(settlement.fee)}${settlement.rate != null ? ` (${settlement.rate} %)` : ''}`),
      line('Somme restituée', moneyFr(settlement.net))
    ], BROWN, row);
  }
  if (service === 'term_savings' && action === 'close_term') {
    const settlement = row.settlement || {};
    return notice('Clôture à l\'échéance', [
      line('Date', dateFr(settlement.on)),
      line('Somme restituée', moneyFr(settlement.net)),
      'Frais de retrait : aucun.'
    ], BROWN, row);
  }
  if (service === 'speculative_funds' && action === 'deposit') {
    const movement = lastOf(row.deposits);
    return notice('Versement', [
      line('Date', dateFr(movement.on)),
      line('Montant', moneyFr(movement.amount)),
      line('Capital', moneyFr(row.capital_balance))
    ], GREEN, row);
  }
  if (service === 'speculative_funds' && action === 'withdraw') {
    const movement = row.withdrawal || {};
    return notice(movement.capital_after === 0 ? 'Retrait — fonds clôturé' : 'Retrait', [
      line('Date', dateFr(movement.on)),
      line('Montant retiré', moneyFr(movement.amount)),
      line('Bénéfice', moneyFr(movement.profit)),
      line('Taxe 15 %', movement.tax ? moneyFr(movement.tax) : 'Aucune'),
      line('Virement net', moneyFr(movement.net)),
      line('Capital restant', moneyFr(movement.capital_after))
    ], BROWN, row);
  }
  if (service === 'speculative_funds' && action === 'pause') {
    return notice('Mise en pause', ['Le fonds est en pause.'], GOLD, row);
  }
  if (service === 'speculative_funds' && action === 'resume') {
    return notice('Reprise', ['Le fonds est de nouveau ouvert.'], GREEN, row);
  }
  if (service === 'pawn_loans' && action === 'mark_paid') {
    return notice('Paiement validé', [
      line('Somme', moneyFr(row.amount_due || row.repayment || row.amount))
    ], GREEN, row);
  }
  if (service === 'goldstein_booklets' && (action === 'deposit' || action === 'withdraw')) {
    const movement = lastOf(row.movements);
    const sold = action === 'withdraw' && Number(row.balance) === 0;
    return notice(sold ? 'Retrait — livret soldé' : (action === 'withdraw' ? 'Retrait' : 'Versement'), [
      line('Date', dateFr(movement.on)),
      line('Montant', moneyFr(movement.amount)),
      line('Somme restante', moneyFr(row.balance))
    ], action === 'withdraw' ? BROWN : GREEN, row);
  }
  if (action === 'mark_paid') {
    return notice('Paiement validé', [line('Somme', moneyFr(row.amount_due || row.installment_cost || row.weekly_total || row.amount))], GREEN, row);
  }
  if (action === 'close') {
    return notice('Clôture', ['Le dossier est clôturé.'], BROWN, row);
  }
  return null;
}

function lifeNotice(action, row, details) {
  const extra = details || {};
  if (action === 'record_payment') {
    return notice('Versement validé', [
      line('Échéance', extra.installment_number),
      line('Montant', moneyFr(extra.amount)),
      row.status === 'payments_complete' ? 'Les huit versements sont terminés.' : 'Les versements continuent.'
    ], GREEN, row);
  }
  if (action === 'leave_placed') {
    return notice('Placement maintenu', ['Les fonds restent placés. Les intérêts continuent.'], GOLD, row);
  }
  if (action === 'request_closure') {
    return notice('Demande de clôture', [
      line('Solde', moneyFr(extra.balance)),
      line('Frais 15 %', moneyFr(extra.fee)),
      line('Net', moneyFr(extra.net))
    ], BROWN, row);
  }
  if (action === 'confirm_closure') {
    return notice('Clôture confirmée', [
      line('Frais', moneyFr(row.closure_fee)),
      line('Net versé', moneyFr(row.closure_net_amount))
    ], BROWN, row);
  }
  if (action === 'report_death') return notice('Décès signalé', ['Le contrat passe en vérification.'], BROWN, row);
  if (action === 'start_review') return notice('Vérification ouverte', ['La direction vérifie le dossier.'], GOLD, row);
  if (action === 'pay_beneficiary') {
    return notice('Capital versé au bénéficiaire', [
      line('Bénéficiaire', `${row.beneficiary_first_name || ''} ${row.beneficiary_last_name || ''}`.trim()),
      line('Solde', moneyFr(extra.balance))
    ], GREEN, row);
  }
  if (action === 'cancel') return notice('Contrat annulé', [line('Motif', row.cancellation_reason)], BROWN, row);
  return null;
}

const RECOUVREMENT = {
  aucun: 'Aucun',
  relance_simple: 'Relance',
  mise_en_demeure: 'Mise en demeure',
  recouvrement_actif: 'Recouvrement',
  saisie_garantie: 'Saisie de garantie',
  cloture: 'Clôturé'
};

function loanNotice(before, after) {
  const previous = before.echeances || [];
  const next = after.echeances || previous;
  const paid = [];
  const undone = [];
  if (after.echeances) {
    next.forEach((item, index) => {
      const was = (previous[index] || {}).statut;
      if (item.statut === 'paye' && was !== 'paye') paid.push({ ...item, index });
      if (item.statut !== 'paye' && was === 'paye') undone.push({ ...item, index });
    });
  }
  const closed = after.recouvrement_status === 'cloture' && before.recouvrement_status !== 'cloture';
  const recovery = after.recouvrement_status && after.recouvrement_status !== before.recouvrement_status && after.recouvrement_status !== 'cloture';
  if (!paid.length && !undone.length && !closed && !recovery) return null;
  const lines = [];
  paid.forEach((item) => lines.push(line(`Échéance ${item.index + 1}`, `${moneyFr(item.montant)} · ${dateFr(item.date)}`)));
  undone.forEach((item) => lines.push(line(`Échéance ${item.index + 1} annulée`, `${moneyFr(item.montant)} · ${dateFr(item.date)}`)));
  if (closed) lines.push('Le prêt est clôturé.');
  if (recovery) lines.push(line('Recouvrement', RECOUVREMENT[after.recouvrement_status] || after.recouvrement_status));
  const heading = undone.length ? 'Paiement annulé' : paid.length ? 'Paiement validé' : closed ? 'Prêt clôturé' : 'Recouvrement';
  return notice(heading, lines, undone.length || closed ? BROWN : GREEN, { ...before, ...after });
}

function horseNotice(before, after) {
  if (!before || !after || !after.statut || after.statut === before.statut) return null;
  const labels = { termine: 'Crédit hippique terminé', refuse: 'Crédit hippique refusé', en_cours: 'Crédit hippique repris' };
  return notice(labels[after.statut] || 'Crédit hippique', [
    line('Statut', after.statut === 'termine' ? 'Terminé' : after.statut === 'refuse' ? 'Refusé' : 'En cours')
  ], after.statut === 'refuse' || after.statut === 'termine' ? BROWN : GOLD, { ...before, ...after });
}

function enqueueNotice(row, embed) {
  if (!embed || !discordUrlOk(row && row.discord_url)) return {};
  const current = Array.isArray(row.discord_notices) ? row.discord_notices : [];
  const entry = { id: randomBytes(6).toString('hex'), embed, at: new Date().toISOString() };
  return { discord_notices: current.concat(entry).slice(-20) };
}

function pendingNotices(collection, row) {
  if (!discordUrlOk(row.discord_url) || !Array.isArray(row.discord_notices)) return [];
  return row.discord_notices
    .filter((item) => item && item.id && item.embed)
    .map((item) => ({ collection, id: row.id, notice_id: item.id, discord_url: row.discord_url, embed: item.embed }));
}

module.exports = { serviceNotice, lifeNotice, loanNotice, horseNotice, enqueueNotice, pendingNotices };
