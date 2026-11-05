const { randomBytes } = require('node:crypto');
const { money, moneyFr, dateFr, discordUrlOk, stateLabel } = require('./money');
const { letterhead, CONSIGNE_BANKS, COVERAGES } = require('./discord_forms');

const BROWN = 0x8b642c;
const GREEN = 0x1f8b4c;
const GOLD = 0xd7a64d;
const RED = 0xff0000;
const WITHDRAW = 0xf0c300;
const RESERVE_MENTION = '@Réserve fédérale';
const DIRECTOR_MENTION = '@Directeur';

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
function closureNotice(heading, lines, row) {
  const embed = notice(heading, lines, RED, row);
  embed.mention = RESERVE_MENTION;
  return embed;
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
    ], WITHDRAW, row);
  }
  if (service === 'term_savings' && action === 'close_term') {
    const settlement = row.settlement || {};
    const embed = closureNotice('Clôture à l\'échéance', [
      line('Date', dateFr(settlement.on)),
      line('Somme restituée', moneyFr(settlement.net)),
      'Frais de retrait : aucun.'
    ], row);
    embed.mention = `@${stateLabel(row.agency)}`;
    return embed;
  }
  if (service === 'speculative_funds' && action === 'deposit') {
    const movement = lastOf(row.deposits);
    return notice('Versement', [
      line('Date', dateFr(movement.on)),
      line('Montant', moneyFr(movement.amount)),
      line('Capital', moneyFr(row.capital_balance))
    ], 0x34c924, row);
  }
  if (service === 'speculative_funds' && action === 'withdraw') {
    const movement = row.withdrawal || {};
    const transfer = !!movement.transfer_to_offer;
    const closed = row.status === 'clos' || row.status === 'paye'
      || (movement.capital_after != null && movement.capital_after !== '' && !(money(movement.capital_after) > 0));
    const lines = [
      line('Date', dateFr(movement.on)),
      line('Montant retiré', moneyFr(movement.amount)),
      line('Dont capital versé', moneyFr(movement.basis_out)),
      line('Dont bénéfice', moneyFr(movement.profit)),
      line('Taxe 15 % (sur le bénéfice)', movement.tax ? moneyFr(movement.tax) : 'Aucune'),
      line(transfer ? 'Net transféré' : 'Virement net', moneyFr(movement.net)),
      transfer ? 'Transfert vers une autre offre — pas de demande de remboursement.' : '',
      line('Capital versé restant', moneyFr(row.cost_basis)),
      line('Total déjà retiré', moneyFr(movement.withdrawn_total != null ? movement.withdrawn_total : row.withdrawn_total)),
      line('Capital restant', moneyFr(movement.capital_after))
    ];
    return closed
      ? closureNotice(transfer ? 'Clôture — transfert d’offre' : 'Clôture — fonds', lines, row)
      : notice(transfer ? 'Transfert vers une autre offre' : 'Retrait', lines, WITHDRAW, row);
  }
  if (service === 'speculative_funds' && action === 'close') {
    return closureNotice('Clôture — fonds', [
      line('Capital restant', moneyFr(row.capital_balance)),
      'Le dossier de fonds spéculatifs est clôturé.'
    ], row);
  }
  if (service === 'speculative_funds' && action === 'pause') {
    return notice('Mise en pause', ['Le fonds est en pause.'], GOLD, row);
  }
  if (service === 'speculative_funds' && action === 'resume') {
    return notice('Reprise', ['Le fonds est de nouveau ouvert.'], GREEN, row);
  }
  if (service === 'speculative_funds' && action === 'change_tier') {
    return notice('Changement de palier', [
      line('Ancien palier', row.previous_tier || '—'),
      line('Nouveau palier', row.tier || '—'),
      line('Capital', moneyFr(row.capital_balance != null ? row.capital_balance : row.amount)),
      'Le dossier suit désormais les résultats de marché du nouveau palier.'
    ], GOLD, row);
  }
  if (service === 'pawn_loans' && action === 'mark_paid') {
    return notice('Paiement validé', [
      line('Somme', moneyFr(row.amount_due || row.repayment || row.amount))
    ], GREEN, row);
  }
  if (service === 'pawn_loans' && (action === 'close' || action === 'seize')) {
    return closureNotice('Clôture — saisie du gage', [
      line('Bien', row.item_type),
      line('Date limite', dateFr(row.echeance_date)),
      line('Somme non remboursée', moneyFr(row.amount_due || row.repayment || row.amount)),
      'L\'objet mis en gage devient à ce jour propriété de la banque.'
    ], row);
  }
  if (service === 'consigne_contracts' && action === 'pay_week') {
    return notice('Règlement hebdomadaire — consigne', [
      line('Échéance réglée', dateFr(row.last_paid_due || row.next_due)),
      line('Montant', moneyFr(row.last_paid_amount != null ? row.last_paid_amount : row.weekly_total)),
      line('Prochaine échéance', dateFr(row.next_due)),
      line('Banque', CONSIGNE_BANKS[row.agency] || row.agency)
    ], GREEN, row);
  }
  if (service === 'consigne_contracts' && action === 'close') {
    return closureNotice('Clôture — consigne', [
      line('Banque', CONSIGNE_BANKS[row.agency] || row.agency),
      line('Couverture', COVERAGES[row.coverage] || row.coverage),
      'Tout objet présent dans les coffres lors de la clôture devient propriété de la banque.'
    ], row);
  }
  if (service === 'payroll_contracts' && action === 'close') {
    return closureNotice('Clôture — gestion de paie', [
      line('Entreprise', row.company_name),
      'Le mandat de gestion de paie est clôturé.'
    ], row);
  }
  if (service === 'goldstein_booklets' && action === 'capitalize') {
    const movement = lastOf(row.movements);
    const before = movement.balance_before != null && movement.balance_before !== ''
      ? money(movement.balance_before)
      : money(money(row.balance) - money(movement.amount));
    return notice('Intérêts — livret Goldstein', [
      line('Date', dateFr(movement.on)),
      line('Solde (base)', moneyFr(before)),
      line('Intérêts 3 %', moneyFr(movement.amount)),
      line('Nouveau solde', moneyFr(row.balance)),
      'Les intérêts sont calculés uniquement sur le solde au jour de la capitalisation.'
    ], GREEN, row);
  }
  if (service === 'goldstein_booklets' && (action === 'deposit' || action === 'withdraw')) {
    const movement = lastOf(row.movements);
    const sold = action === 'withdraw' && Number(row.balance) === 0;
    const lines = [
      line('Date', dateFr(movement.on)),
      line('Montant', moneyFr(movement.amount)),
      line('Nouveau solde', moneyFr(row.balance))
    ];
    if (sold) return closureNotice('Retrait — livret soldé', lines, row);
    return notice(action === 'withdraw' ? 'Retrait' : 'Versement', lines, action === 'withdraw' ? WITHDRAW : GREEN, row);
  }
  if (action === 'mark_paid') {
    return notice('Paiement validé', [line('Somme', moneyFr(row.amount_due || row.installment_cost || row.weekly_total || row.amount))], GREEN, row);
  }
  if (action === 'close') {
    return closureNotice('Clôture', ['Le dossier est clôturé.'], row);
  }
  return null;
}

function lifeNotice(action, row, details) {
  const extra = details || {};
  if (action === 'record_payment') {
    const number = ref(row);
    const whoName = who(row);
    const week = extra.installment_number != null ? `${extra.installment_number} / 8` : '—';
    const weekInterest = extra.week_interest != null ? extra.week_interest : extra.interest;
    return letterhead({
      title: `Versement encaissé — ${whoName}${number ? ` (Dossier ${number})` : ''}`.replace(/\s+/g, ' ').trim(),
      description: [
        line('Semaine', week),
        line('Montant perçu', moneyFr(extra.amount)),
        line('Intérêts de la semaine', moneyFr(weekInterest)),
        line('Intérêts cumulés', moneyFr(extra.interest_total != null ? extra.interest_total : 0)),
        line('Solde', moneyFr(extra.balance))
      ].join('\n'),
      footer: 'Reçu à conserver.',
      color: 0x34c924
    });
  }
  if (action === 'request_closure') {
    const embed = notice('Demande de clôture', [
      line('Solde', moneyFr(extra.balance)),
      line('Frais 15 %', moneyFr(extra.fee)),
      line('Net', moneyFr(extra.net)),
      'Validation du directeur requise pour confirmer la clôture.'
    ], GOLD, row);
    embed.mention = DIRECTOR_MENTION;
    return embed;
  }
  if (action === 'confirm_closure') {
    return closureNotice('Clôture confirmée', [
      line('Frais', moneyFr(row.closure_fee)),
      line('Net versé', moneyFr(row.closure_net_amount))
    ], row);
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

const REMINDER_METHODS = {
  telegram: 'Télégramme',
  courrier: 'Courrier',
  en_personne: 'En personne',
  autre: 'Autre'
};

function loanNotice(before, after) {
  if (!before || !after) return null;
  const previous = before.echeances || [];
  const next = after.echeances || previous;
  const paid = [];
  const undone = [];
  const followUps = [];
  next.forEach((item, index) => {
    const was = previous[index] || {};
    if (item.statut === 'paye' && was.statut !== 'paye') paid.push({ ...item, index });
    if (item.statut !== 'paye' && was.statut === 'paye') undone.push({ ...item, index });
    const beforeRappels = Array.isArray(was.rappels) ? was.rappels : [];
    const afterRappels = Array.isArray(item.rappels) ? item.rappels : [];
    const added = afterRappels.length - beforeRappels.length;
    if (added > 0) {
      afterRappels.slice(0, added).forEach((reminder) => {
        followUps.push({ ...reminder, index, echeance: item });
      });
    }
  });
  const closed = after.recouvrement_status === 'cloture' && before.recouvrement_status !== 'cloture';
  const recovery = after.recouvrement_status
    && after.recouvrement_status !== before.recouvrement_status
    && after.recouvrement_status !== 'cloture';
  const notesChanged = after.recouvrement_notes !== undefined
    && String(after.recouvrement_notes || '') !== String(before.recouvrement_notes || '');
  if (!paid.length && !undone.length && !closed && !recovery && !followUps.length && !notesChanged) return null;

  const lines = [];
  paid.forEach((item) => lines.push(line(`Échéance ${item.index + 1}`, `${moneyFr(item.montant)} · ${dateFr(item.date)}`)));
  undone.forEach((item) => lines.push(line(`Échéance ${item.index + 1} annulée`, `${moneyFr(item.montant)} · ${dateFr(item.date)}`)));
  followUps.forEach((item) => {
    lines.push(line(`Suivi échéance ${item.index + 1}`, `${moneyFr(item.echeance.montant)} · ${dateFr(item.echeance.date)}`));
    lines.push(line('Moyen', REMINDER_METHODS[item.reminder_method] || item.reminder_method || 'Autre'));
    const when = [dateFr(item.reminder_date), item.reminder_time ? String(item.reminder_time).slice(0, 5) : '']
      .filter(Boolean)
      .join(' à ');
    if (when) lines.push(line('Date du rappel', when));
    if (item.recorded_by_username) lines.push(line('Agent', item.recorded_by_username));
    if (item.note) lines.push(line('Note', item.note));
  });
  if (closed) lines.push('Le prêt est clôturé.');
  if (recovery) lines.push(line('Statut', RECOUVREMENT[after.recouvrement_status] || after.recouvrement_status));
  if (notesChanged && !recovery && !closed) {
    const status = after.recouvrement_status || before.recouvrement_status;
    if (status && status !== 'aucun') lines.push(line('Statut', RECOUVREMENT[status] || status));
  }
  const notes = after.recouvrement_notes !== undefined ? after.recouvrement_notes : before.recouvrement_notes;
  if ((recovery || closed || notesChanged) && String(notes || '').trim()) {
    lines.push(line('Notes', notes));
  }

  const heading = undone.length
    ? 'Paiement annulé'
    : paid.length
      ? 'Paiement validé'
      : closed
        ? 'Prêt clôturé'
        : recovery
          ? 'Recouvrement'
          : (followUps.length || notesChanged)
            ? 'Suivi de dossier'
            : 'Mise à jour';
  const row = { ...before, ...after };
  if (closed) return closureNotice(heading, lines, row);
  const color = undone.length ? BROWN : paid.length ? 0x34c924 : recovery ? BROWN : GOLD;
  return notice(heading, lines, color, row);
}

function horseNotice(before, after) {
  if (!before || !after || !after.statut || after.statut === before.statut) return null;
  const row = { ...before, ...after };
  const labels = { termine: 'Crédit hippique terminé', refuse: 'Crédit hippique refusé', en_cours: 'Crédit hippique repris' };
  const lines = [
    line('Statut', after.statut === 'termine' ? 'Terminé' : after.statut === 'refuse' ? 'Refusé' : 'En cours')
  ];
  if (row.montant_total != null && row.montant_total !== '') lines.push(line('Montant', moneyFr(row.montant_total)));
  if (row.date_course) lines.push(line('Course', dateFr(row.date_course) || row.date_course));
  if (row.cheval_ecurie) lines.push(line('Cheval / écurie', row.cheval_ecurie));
  if (row.bookmaker) lines.push(line('Bookmaker', row.bookmaker));
  return notice(labels[after.statut] || 'Crédit hippique', lines, after.statut === 'refuse' || after.statut === 'termine' ? BROWN : GOLD, row);
}

const CLAIM_TTL_MS = 2 * 60 * 1000;

function claimExpired(iso, now = Date.now()) {
  const at = Date.parse(iso || '');
  return !Number.isFinite(at) || now - at >= CLAIM_TTL_MS;
}

function deliveryLocked(value, now = Date.now()) {
  if (value == null || value === '') return false;
  const text = String(value);
  if (text.startsWith('claim:')) return !claimExpired(text.slice(6), now);
  return true;
}

function enqueueNotice(row, embed) {
  if (!embed) return {};
  const current = Array.isArray(row && row.discord_notices) ? row.discord_notices : [];
  const mention = embed.mention ? String(embed.mention) : '';
  const stored = { ...embed };
  delete stored.mention;
  const entry = { id: randomBytes(6).toString('hex'), embed: stored, content: mention || undefined, at: new Date().toISOString() };
  return { discord_notices: current.concat(entry).slice(-20) };
}

function pendingNotices(collection, row) {
  if (!discordUrlOk(row && row.discord_url)) return [];
  const now = Date.now();
  const list = Array.isArray(row.discord_notices) ? row.discord_notices : [];
  return list
    .filter((item) => item && item.id && item.embed && !item.sent_at && (!item.claimed_at || claimExpired(item.claimed_at, now)))
    .map((item) => ({
      collection,
      id: row.id,
      notice_id: item.id,
      discord_url: row.discord_url,
      embed: item.embed,
      content: item.content || ''
    }));
}

/** Réserve les avis prêts à l’envoi (anti double-envoi). Retourne { notices, rowPatch }. */
function claimNotices(row, now = Date.now()) {
  if (!discordUrlOk(row && row.discord_url)) return { notices: [], rowPatch: null };
  const list = Array.isArray(row.discord_notices) ? row.discord_notices : [];
  const notices = [];
  let changed = false;
  const next = list.map((item) => {
    if (!item || !item.id || !item.embed || item.sent_at) return item;
    if (item.claimed_at && !claimExpired(item.claimed_at, now)) return item;
    changed = true;
    const claimed = { ...item, claimed_at: new Date(now).toISOString() };
    notices.push({
      notice_id: item.id,
      discord_url: row.discord_url,
      embed: item.embed,
      content: item.content || ''
    });
    return claimed;
  });
  if (!changed) return { notices: [], rowPatch: null };
  return { notices, rowPatch: { discord_notices: next } };
}

module.exports = {
  serviceNotice, lifeNotice, loanNotice, horseNotice, enqueueNotice, pendingNotices,
  claimNotices, claimExpired, deliveryLocked, CLAIM_TTL_MS
};
