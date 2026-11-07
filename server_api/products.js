const {
  AGENCIES, CONSIGNE_BANKS, text, requireText, validDate,
  fondsEmbed, pawnEmbed, consigneEmbed, termEmbed, payrollEmbed, goldsteinEmbed,
  quotePawn, quoteConsigne, quoteTerm, quotePayroll, quoteGoldstein,
  rpStamp, nextSerial, nextTermDossier, money
} = require('./discord_forms');
const { goldsteinNext, fundDepositQuote, fundWithdrawalQuote, fundOpening, fundContributedFields, termPayout, datedLike, rpToday, addDays, asRpDay } = require('./money');
const { safeId } = require('./ids');

function agencyOf(value) {
  const key = text(value, 40);
  return AGENCIES.includes(key) ? key : '';
}
function fail(message) {
  return { error: message };
}
function flags(body, keys) {
  return keys.every((key) => !!body[key]);
}

async function finish(row, render, actor) {
  if (actor && actor.username) row.created_by_username = text(actor.username, 80);
  const { stamp } = await rpStamp();
  row.discord_embed = render === 'fonds' ? fondsEmbed(row, stamp) : render(row, stamp);
  row.discord_text = row.discord_embed.description;
  row.discord_posted_at = null;
  row.discord_receipt = true;
  return { row };
}

async function withDossier(row, render, number, actor) {
  row.dossier_number = number;
  return finish(row, render, actor);
}

async function speculative(body, actor) {
  const agency = agencyOf(body.agency);
  const tier = text(body.tier, 20);
  if (!['Palier I', 'Palier II', 'Palier III'].includes(tier)) return fail('Le palier est I, II ou III.');
  if (!agency) return fail('La succursale est obligatoire.');
  const missing = [requireText(body, 'full_name', 'Le nom'), requireText(body, 'civility', 'La civilité'), requireText(body, 'telegram', 'Le télégramme')].find(Boolean);
  if (missing) return fail(missing);
  if (!validDate(body.birth_date) || !validDate(body.signed_on)) return fail('Les dates du dossier sont obligatoires.');
  if (!flags(body, ['declare_risks', 'declare_past', 'declare_accuracy', 'declare_terms'])) return fail('Les quatre déclarations sont obligatoires.');
  if (!(Number(body.amount) > 0)) return fail('Le montant souscrit est obligatoire.');
  const ownAccount = !!body.own_account;
  const forClientId = safeId(body.for_client_id);
  const forFullName = text(body.for_full_name, 160);
  if (!ownAccount && !forClientId && !forFullName) {
    return fail('Si l’investissement n’est pas pour son propre compte, l’autre client est obligatoire.');
  }
  const row = {
    agency, client_id: safeId(body.client_id), tier, full_name: text(body.full_name, 160), civility: text(body.civility, 20),
    birth_date: body.birth_date, signed_on: body.signed_on, nationality: text(body.nationality, 80),
    telegram: text(body.telegram, 80), address: text(body.address, 240), experience: text(body.experience, 120),
    objectives: text(body.objectives, 240), horizon: text(body.horizon, 120), amount: money(body.amount),
    profit_distribution: text(body.profit_distribution, 160), payment_mode: text(body.payment_mode, 80),
    bank_id: text(body.bank_id, 40), funds_origin: text(body.funds_origin, 160), estimated_wealth: money(body.estimated_wealth),
    own_account: ownAccount, recommended: !!body.recommended,
    for_client_id: ownAccount ? null : forClientId,
    for_full_name: ownAccount ? null : forFullName,
    for_telegram: ownAccount ? null : text(body.for_telegram, 80) || null,
    declare_risks: true, declare_past: true, declare_accuracy: true, declare_terms: true,
    opening_amount: money(body.amount),
    capital_balance: money(body.amount),
    cost_basis: money(body.amount),
    withdrawn_total: 0,
    deposits: [],
    withdrawals: [],
    discord_url: text(body.discord_url, 300), discord_notices: [], status: 'ouvert', mission_keys: {},
    dossier_number: await nextSerial('pret_speculative_funds', 'dossier_number', 'HCP-')
  };
  return finish(row, 'fonds', actor);
}

async function pawn(body, actor) {
  const agency = agencyOf(body.agency);
  const missing = [requireText(body, 'prenom', 'Le prénom'), requireText(body, 'nom', 'Le nom'), requireText(body, 'telegram', 'Le télégramme'), requireText(body, 'item_type', 'Le type de bien')].find(Boolean);
  if (missing) return fail(missing);
  if (!agency) return fail("L'agence est obligatoire.");
  if (!validDate(body.signed_on)) return fail('La date du contrat est obligatoire.');
  if (!(Number(body.amount) > 0)) return fail('Le montant prêté est obligatoire.');
  if (body.rate_mode === 'autre' && !(Number(body.rate) >= 0)) return fail('Le taux exceptionnel est obligatoire.');
  const quoted = quotePawn(body);
  const row = {
    agency, client_id: safeId(body.client_id), prenom: text(body.prenom, 80), nom: text(body.nom, 80), civility: text(body.civility, 20),
    birth_date: validDate(body.birth_date) ? body.birth_date : '', nationality: text(body.nationality, 80),
    telegram: text(body.telegram, 80), signed_on: body.signed_on, item_type: text(body.item_type, 120),
    item_description: text(body.item_description, 800), base_price: money(body.base_price), amount: money(body.amount),
    rate_mode: body.rate_mode === 'autre' ? 'autre' : '15', rate: quoted.rate, repayment: quoted.repayment,
    echeance_date: quoted.echeance_date, amount_due: quoted.repayment, paid: false,
    discord_url: text(body.discord_url, 300), discord_notices: [], status: 'ouvert', mission_keys: {}
  };
  return finish(row, pawnEmbed, actor);
}

async function consigne(body, actor) {
  if (!CONSIGNE_BANKS[body.agency]) return fail('La consigne est ouverte à Blackwater, Rhodes, Valentine, Van Horn, Sunset City et Saint Denis.');
  const missing = [requireText(body, 'prenom', 'Le prénom'), requireText(body, 'nom', 'Le nom'), requireText(body, 'telegram', 'Le télégramme')].find(Boolean);
  if (missing) return fail(missing);
  if (!validDate(body.signed_on)) return fail('La date du contrat est obligatoire.');
  if (!quoteConsigne(body).weekly_total && quoteConsigne(body).weekly_total !== 0) return fail('La couverture est obligatoire.');
  const quoted = quoteConsigne(body);
  if (quoted.weekly_total == null) return fail('La couverture est obligatoire.');
  if (body.access === 'partagé' && !text(body.shared_names)) return fail('Les personnes autorisées sont obligatoires pour un accès partagé.');
  const row = {
    agency: body.agency, client_id: safeId(body.client_id), prenom: text(body.prenom, 80), nom: text(body.nom, 80), civility: text(body.civility, 20),
    birth_date: validDate(body.birth_date) ? body.birth_date : '', nationality: text(body.nationality, 80),
    telegram: text(body.telegram, 80), address: text(body.address, 240), signed_on: body.signed_on,
    stored_value: money(body.stored_value), coverage: body.coverage, access: text(body.access, 40),
    shared_names: text(body.shared_names, 240), shared_telegram: text(body.shared_telegram, 80), shared_link: text(body.shared_link, 120),
    dossier_offered: !!body.dossier_offered, ...quoted, paid: false, payments: [],
    discord_url: text(body.discord_url, 300), discord_notices: [], status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, consigneEmbed, await nextSerial('pret_consigne_contracts', 'dossier_number', 'C-'), actor);
}

function payConsigneWeek(row) {
  if (row.status === 'clos' || row.status === 'paye') return fail('Ce dossier est clôturé.');
  const due = asRpDay(row.next_due) || rpToday();
  const next = addDays(due, 7);
  const amount = money(row.weekly_total);
  const payment = { on: rpToday(), due, amount, next_due: next };
  const payments = (Array.isArray(row.payments) ? row.payments : []).concat(payment).slice(-52);
  const keys = { ...(row.mission_keys || {}) };
  const dueKey = `due:${due}:`;
  if (!keys[dueKey]) keys[dueKey] = 'paid';
  return {
    row: {
      next_due: next,
      last_paid_on: payment.on,
      last_paid_due: due,
      last_paid_amount: amount,
      payments,
      mission_keys: keys
    },
    payment
  };
}

async function term(body, actor) {
  const agency = agencyOf(body.agency);
  const missing = [requireText(body, 'prenom', 'Le prénom'), requireText(body, 'nom', 'Le nom'), requireText(body, 'telegram', 'Le télégramme')].find(Boolean);
  if (missing) return fail(missing);
  if (!agency) return fail('La succursale est obligatoire.');
  if (!validDate(body.signed_on)) return fail('La date de souscription est obligatoire.');
  if (!flags(body, ['declare_accuracy', 'declare_early', 'declare_silence', 'declare_record', 'declare_death', 'declare_terms'])) return fail('Les six déclarations sont obligatoires.');
  const quoted = quoteTerm(body);
  if (!quoted) return fail('La durée est de 1, 2, 4 ou 8 semaines.');
  if (!(Number(body.amount) > 0)) return fail('Le montant souscrit est obligatoire.');
  const dossier_number = await nextTermDossier(agency);
  const row = {
    agency, client_id: safeId(body.client_id), prenom: text(body.prenom, 80), nom: text(body.nom, 80), birth_date: validDate(body.birth_date) ? body.birth_date : '',
    nationality: text(body.nationality, 80), telegram: text(body.telegram, 80), signed_on: body.signed_on,
    origin: text(body.origin, 80), origin_other: text(body.origin_other, 160), payment_mode: text(body.payment_mode, 40),
    bank_id: text(body.bank_id, 40), weeks: Number(body.weeks), amount: money(body.amount), ...quoted,
    amount_due: quoted.maturity_amount, paid: false, dossier_number,
    declare_accuracy: true, declare_early: true, declare_silence: true, declare_record: true, declare_death: true, declare_terms: true,
    discord_url: text(body.discord_url, 300), discord_notices: [], status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, termEmbed, dossier_number, actor);
}

function validateTerm(row) {
  if (row.paid || row.status === 'paye' || row.status === 'clos' || row.status === 'anticipe') return fail('Ce contrat est déjà réglé.');
  if (row.validated) return fail('Ce dossier est déjà validé.');
  return { row: { validated: true, validated_on: datedLike(row.signed_on || row.echeance_date) } };
}

function settleTerm(row, action) {
  if (row.paid || row.status === 'paye' || row.status === 'clos' || row.status === 'anticipe') return fail('Ce contrat est déjà réglé.');
  const kind = action === 'early_withdrawal' ? 'anticipe' : action === 'close_term' ? 'echeance' : '';
  if (!kind) return fail('Action inconnue.');
  const payout = termPayout(row, kind);
  if (!(payout.net >= 0)) return fail('Les frais dépassent le montant placé.');
  return {
    row: {
      status: kind === 'anticipe' ? 'anticipe' : 'paye',
      paid: true,
      paid_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      settlement: {
        kind,
        on: datedLike(row.signed_on || row.echeance_date),
        fee: payout.fee,
        net: payout.net,
        rate: payout.rate
      }
    }
  };
}

async function payroll(body, actor) {
  const agencies = (Array.isArray(body.agencies) ? body.agencies : []).filter((item) => AGENCIES.includes(item));
  const missing = [requireText(body, 'company_name', 'La raison sociale'), requireText(body, 'patron', 'Le patron'), requireText(body, 'patron_telegram', 'Le télégramme du patron')].find(Boolean);
  if (missing) return fail(missing);
  if (!agencies.length) return fail('Au moins une succursale est obligatoire.');
  if (!validDate(body.signed_on) || !validDate(body.start_date)) return fail('Les dates du contrat sont obligatoires.');
  if (!flags(body, ['commit_accuracy', 'commit_lists', 'commit_funds', 'commit_advances', 'commit_information', 'commit_employees', 'commit_terms', 'control_fraud', 'control_reserve', 'control_authorities'])) {
    return fail('Les engagements et les contrôles sont obligatoires.');
  }
  if (body.list_attached && !(body.employees_file && body.employees_file.content_base64)) return fail('La liste des employés jointe est obligatoire.');
  const quoted = quotePayroll(body);
  const row = {
    agency: agencies[0], agencies, client_id: safeId(body.client_id), company_name: text(body.company_name, 160), nom: text(body.patron, 120), prenom: '',
    company_created: validDate(body.company_created) ? body.company_created : '', patron: text(body.patron, 120),
    patron_telegram: text(body.patron_telegram, 80), copatron: text(body.copatron, 120), copatron_telegram: text(body.copatron_telegram, 80),
    telegram: text(body.patron_telegram, 80), address: text(body.address, 240), account: text(body.account, 40),
    sector: text(body.sector, 80), sector_other: text(body.sector_other, 120), company_type: text(body.company_type, 20),
    signed_on: body.signed_on, start_date: body.start_date, frequency: body.frequency === 'Autre' ? 'Autre' : 'Hebdomadaire',
    frequency_other: text(body.frequency_other, 120), employees: Math.max(0, Math.trunc(Number(body.employees) || 0)),
    payroll: money(body.payroll), advances: text(body.advances, 20), advance_cap: money(body.advance_cap),
    special_terms: text(body.special_terms, 800), list_attached: !!body.list_attached,
    employees_file: body.list_attached ? { filename: text(body.employees_file.filename, 120), mime: text(body.employees_file.mime, 80), content_base64: String(body.employees_file.content_base64 || '').slice(0, 9000000) } : null,
    liquidity: money(body.liquidity), collateral_assets: text(body.collateral_assets, 400), history: text(body.history, 20),
    management_fee: quoted.management, transfer_fee: quoted.transfer, installment_cost: quoted.installment,
    unit_fee: quoted.unit, next_due: quoted.next_due, amount_due: quoted.installment, paid: false,
    commit_accuracy: true, commit_lists: true, commit_funds: true, commit_advances: true, commit_information: true, commit_employees: true, commit_terms: true,
    control_fraud: true, control_reserve: true, control_authorities: true,
    discord_url: text(body.discord_url, 300), discord_notices: [], status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, payrollEmbed, await nextSerial('pret_payroll_contracts', 'dossier_number', 'GP-'), actor);
}

async function goldstein(body, actor) {
  const agency = agencyOf(body.agency);
  const missing = [requireText(body, 'prenom', 'Le prénom'), requireText(body, 'nom', 'Le nom'), requireText(body, 'telegram', 'Le télégramme'), requireText(body, 'civility', 'La civilité')].find(Boolean);
  if (missing) return fail(missing);
  if (!agency) return fail('La succursale est obligatoire.');
  if (!validDate(body.signed_on)) return fail("La date d'ouverture est obligatoire.");
  if (!(Number(body.opening_amount) > 0)) return fail('Le premier versement est obligatoire.');
  if (!flags(body, ['declare_accuracy', 'declare_rule', 'declare_terms'])) return fail('Les trois déclarations sont obligatoires.');
  const quoted = quoteGoldstein(body.opening_amount, body.signed_on);
  const row = {
    agency, client_id: safeId(body.client_id), prenom: text(body.prenom, 80), nom: text(body.nom, 80), civility: text(body.civility, 20),
    birth_date: validDate(body.birth_date) ? body.birth_date : '', nationality: text(body.nationality, 80),
    telegram: text(body.telegram, 80), address: text(body.address, 240), signed_on: body.signed_on,
    origin: text(body.origin, 80), origin_other: text(body.origin_other, 160), payment_mode: text(body.payment_mode, 40),
    bank_id: text(body.bank_id, 40), opening_amount: money(body.opening_amount), opened_on: body.signed_on,
    ...quoted, declare_accuracy: true, declare_rule: true, declare_terms: true,
    movements: [{ type: 'ouverture', amount: money(body.opening_amount), balance_before: 0, balance: quoted.balance, on: body.signed_on }],
    discord_url: text(body.discord_url, 300), discord_notices: [], status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, goldsteinEmbed, await nextSerial('pret_goldstein_booklets', 'dossier_number', 'LEG-'), actor);
}

function localToday() {
  return rpToday();
}

function fundHistory(row) {
  if (Array.isArray(row.withdrawals) && row.withdrawals.length) return row.withdrawals.slice();
  return row.withdrawal ? [row.withdrawal] : [];
}

function moveFund(row, body) {
  if (row.status === 'clos' || row.status === 'paye') return fail('Ce dossier est clôturé.');
  const on = localToday();
  if (body.action === 'deposit') {
    const quoted = fundDepositQuote(row, body.amount);
    if (quoted.error) return fail(quoted.error);
    const deposits = (Array.isArray(row.deposits) ? row.deposits : []).concat({
      on, amount: quoted.amount, capital_before: quoted.capital_before, capital_after: quoted.capital_after
    });
    return {
      row: {
        deposits,
        ...fundContributedFields(row, deposits),
        capital_balance: quoted.capital_after,
        cost_basis: quoted.cost_basis,
        withdrawn_total: quoted.withdrawn_total
      }
    };
  }
  if (body.action === 'withdraw') {
    const quoted = fundWithdrawalQuote(row, body.amount);
    if (quoted.error) return fail(quoted.error);
    const transferToOffer = !!(body.transfer_to_offer || body.transferToOffer);
    const entry = {
      on,
      amount: quoted.amount,
      tax: quoted.tax,
      net: quoted.net,
      profit: quoted.profit,
      basis_out: quoted.basis_out,
      capital_before: quoted.capital_before,
      capital_after: quoted.capital_after,
      contributed: quoted.contributed,
      withdrawn_before: quoted.withdrawn_before,
      withdrawn_total: quoted.withdrawn_total,
      transfer_to_offer: transferToOffer
    };
    const withdrawals = fundHistory(row).concat(entry);
    const patch = {
      withdrawals,
      withdrawal: entry,
      capital_balance: quoted.capital_after,
      cost_basis: quoted.cost_basis,
      withdrawn_total: quoted.withdrawn_total
    };
    if (quoted.capital_after === 0) {
      patch.status = 'clos';
      patch.closed_at = new Date().toISOString();
    }
    return { row: patch };
  }
  return fail('Ce dossier ne reçoit pas ce mouvement.');
}

function fundEventRank(type) {
  if (type === 'deposit') return 0;
  if (type === 'statement') return 1;
  return 2;
}

function rebuildFundTimeline(row, deposits, withdrawals, statements) {
  const events = [];
  for (const item of deposits || []) {
    if (!item || !item.on) continue;
    events.push({ type: 'deposit', on: String(item.on).slice(0, 10), amount: money(item.amount), source: item.source || '', raw: item });
  }
  for (const item of statements || []) {
    if (!item || !item.on) continue;
    events.push({
      type: 'statement',
      on: String(item.on).slice(0, 10),
      result_percent: Number(item.result_percent),
      source: item.source || '',
      raw: item
    });
  }
  for (const item of withdrawals || []) {
    if (!item || !item.on) continue;
    events.push({
      type: 'withdraw',
      on: String(item.on).slice(0, 10),
      amount: money(item.amount),
      source: item.source || '',
      transfer_to_offer: !!item.transfer_to_offer,
      raw: item
    });
  }
  events.sort((left, right) => {
    const byDate = left.on.localeCompare(right.on);
    if (byDate) return byDate;
    return fundEventRank(left.type) - fundEventRank(right.type);
  });

  // Rejoue le journal depuis le capital de souscription : chaque dépôt s’ajoute au capital
  // tel qu’il était à cette date (après les événements antérieurs).
  const opening = fundOpening(row);
  let capital = opening;
  let basis = opening;
  let withdrawnTotal = 0;
  const nextDeposits = [];
  const nextWithdrawals = [];
  const nextStatements = [];
  let lastWithdrawal = null;

  for (const event of events) {
    if (event.type === 'deposit') {
      if (!(event.amount > 0)) return fail('Un dépôt du journal est invalide.');
      const before = capital;
      const after = money(capital + event.amount);
      capital = after;
      basis = money(basis + event.amount);
      nextDeposits.push({
        on: event.on,
        amount: event.amount,
        capital_before: before,
        capital_after: after,
        source: event.source || undefined
      });
      continue;
    }
    if (event.type === 'statement') {
      if (!Number.isFinite(event.result_percent)) return fail('Un relevé du journal est invalide.');
      const before = capital;
      const after = money(Math.max(0, before * (1 + event.result_percent / 100)));
      capital = after;
      const line = {
        on: event.on,
        result_percent: event.result_percent,
        capital_before: before,
        capital_after: after,
        market: true,
        source: event.source || undefined
      };
      if (event.raw && event.raw.regime) line.regime = event.raw.regime;
      if (event.raw && event.raw.regime_label) line.regime_label = event.raw.regime_label;
      nextStatements.push(line);
      continue;
    }
    if (!(event.amount > 0)) return fail('Un retrait du journal est invalide.');
    if (event.amount > capital) {
      return fail(`Le retrait du ${event.on} (${event.amount}) dépasse le capital alors disponible (${capital}).`);
    }
    const share = capital ? event.amount / capital : 0;
    const basisOut = money(basis * share);
    const profit = money(Math.max(0, event.amount - basisOut));
    const tax = money(profit * 0.15);
    const before = capital;
    const after = money(capital - event.amount);
    capital = after;
    basis = money(basis - basisOut);
    withdrawnTotal = money(withdrawnTotal + event.amount);
    const entry = {
      on: event.on,
      amount: event.amount,
      tax,
      net: money(event.amount - tax),
      profit,
      basis_out: basisOut,
      capital_before: before,
      capital_after: after,
      withdrawn_total: withdrawnTotal,
      source: event.source || undefined,
      transfer_to_offer: event.transfer_to_offer || undefined
    };
    nextWithdrawals.push(entry);
    lastWithdrawal = entry;
  }

  const contributed = fundContributedFields(row, nextDeposits);
  const patch = {
    deposits: nextDeposits,
    withdrawals: nextWithdrawals,
    statements: nextStatements,
    opening_amount: contributed.opening_amount,
    amount: contributed.amount,
    capital_balance: capital,
    cost_basis: capital > 0 ? basis : 0,
    withdrawn_total: withdrawnTotal
  };
  if (lastWithdrawal) patch.withdrawal = lastWithdrawal;
  else if (row.withdrawal) patch.withdrawal = null;
  const status = String(row.status || '').trim();
  if (capital > 0) {
    if (status === 'clos' || status === 'paye') patch.status = 'ouvert';
  } else if (status !== 'pause' && nextWithdrawals.length) {
    patch.status = 'clos';
    patch.closed_at = row.closed_at || new Date().toISOString();
  }
  return { row: patch };
}

function catchUpFund(row, body) {
  if (row.status === 'clos' || row.status === 'paye') {
    // Une correction peut rouvrir le dossier si le capital redevient positif.
  }
  const kind = String(body.kind || body.entry_kind || '').trim().toLowerCase();
  const deposits = (Array.isArray(row.deposits) ? row.deposits : []).map((item) => ({ ...item }));
  const withdrawals = fundHistory(row).map((item) => ({ ...item }));
  const statements = (Array.isArray(row.statements) ? row.statements : []).map((item) => ({ ...item }));
  const removing = body.remove === true || body.remove === 'true' || body.mode === 'remove' || kind === 'remove' || kind === 'delete';

  if (removing) {
    const targetKind = String(body.entry_kind || body.target_kind || body.remove_kind || '').trim().toLowerCase();
    const sourceIndex = Number(body.source_index != null ? body.source_index : body.index);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return fail('Sélectionne l’entrée à supprimer.');
    }
    if (targetKind === 'deposit' || targetKind === 'ajout') {
      if (sourceIndex >= deposits.length) return fail('Dépôt introuvable.');
      deposits.splice(sourceIndex, 1);
    } else if (targetKind === 'withdraw' || targetKind === 'withdrawal' || targetKind === 'retrait') {
      if (sourceIndex >= withdrawals.length) return fail('Retrait introuvable.');
      withdrawals.splice(sourceIndex, 1);
    } else if (targetKind === 'statement' || targetKind === 'releve' || targetKind === 'market') {
      if (sourceIndex >= statements.length) return fail('Relevé introuvable.');
      statements.splice(sourceIndex, 1);
    } else {
      return fail('Le type d’entrée à supprimer est dépôt, retrait ou relevé.');
    }
    return rebuildFundTimeline(row, deposits, withdrawals, statements);
  }

  const on = String(body.on || '').trim().slice(0, 10);
  if (!validDate(on)) return fail('La date est obligatoire.');

  if (kind === 'deposit' || kind === 'ajout' || kind === 'add_deposit') {
    const amount = money(body.amount);
    if (!(amount > 0)) return fail('Le montant du dépôt est obligatoire.');
    deposits.push({ on, amount, source: 'manual' });
  } else if (kind === 'withdraw' || kind === 'retrait' || kind === 'add_withdrawal') {
    const amount = money(body.amount);
    if (!(amount > 0)) return fail('Le montant du retrait est obligatoire.');
    withdrawals.push({ on, amount, source: 'manual' });
  } else if (kind === 'statement' || kind === 'releve' || kind === 'market') {
    const raw = body.result_percent != null ? body.result_percent : body.result;
    const pct = Number(String(raw ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(pct)) return fail('Le résultat de marché est obligatoire.');
    if (statements.some((item) => item && item.market && String(item.on).slice(0, 10) === on)) {
      return fail('Un relevé de marché existe déjà à cette date.');
    }
    statements.push({ on, result_percent: pct, market: true, source: 'manual' });
  } else {
    return fail('Le type d’entrée est dépôt, retrait ou relevé.');
  }

  return rebuildFundTimeline(row, deposits, withdrawals, statements);
}

function moveGoldstein(row, body) {
  const amount = money(body.amount);
  if (!(amount > 0)) return fail('Le montant du mouvement est obligatoire.');
  const balance = body.action === 'withdraw' ? money(row.balance - amount) : money(row.balance + amount);
  if (balance < 0) return fail('Le retrait dépasse le solde.');
  const next = goldsteinNext(balance);
  const before = money(row.balance);
  const movements = Array.isArray(row.movements) ? row.movements.slice() : [];
  movements.push({
    type: body.action,
    amount,
    balance_before: before,
    balance,
    on: body.on || rpToday()
  });
  return {
    row: {
      ...row,
      balance,
      period_interest: next.interest,
      next_balance: next.nextBalance,
      status: balance === 0 ? 'solde' : 'ouvert',
      movements
    }
  };
}

const PRODUCTS = {
  speculative_funds: { collection: 'pret_speculative_funds', prepare: speculative, render: 'fonds', move: moveFund, catchUp: catchUpFund },
  pawn_loans: { collection: 'pret_pawn_loans', prepare: pawn, render: pawnEmbed, usesRecordId: true },
  consigne_contracts: { collection: 'pret_consigne_contracts', prepare: consigne, render: consigneEmbed, payWeek: payConsigneWeek },
  term_savings: { collection: 'pret_term_savings', prepare: term, render: termEmbed, settle: settleTerm, validate: validateTerm },
  payroll_contracts: { collection: 'pret_payroll_contracts', prepare: payroll, render: payrollEmbed },
  goldstein_booklets: { collection: 'pret_goldstein_booklets', prepare: goldstein, render: goldsteinEmbed, move: moveGoldstein }
};

module.exports = { PRODUCTS, catchUpFund, rebuildFundTimeline };
