const {
  AGENCIES, CONSIGNE_BANKS, text, requireText, validDate,
  fondsEmbed, pawnEmbed, consigneEmbed, termEmbed, payrollEmbed, goldsteinEmbed,
  quotePawn, quoteConsigne, quoteTerm, quotePayroll, quoteGoldstein,
  rpStamp, nextSerial, nextTermDossier, money
} = require('./discord_forms');
const { goldsteinNext, fundDepositQuote, fundWithdrawalQuote, termPayout, datedLike, rpToday } = require('./money');
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

async function finish(row, render) {
  const { stamp } = await rpStamp();
  row.discord_embed = render === 'fonds' ? fondsEmbed(row, stamp) : render(row, stamp);
  row.discord_text = row.discord_embed.description;
  row.discord_posted_at = null;
  row.discord_receipt = true;
  return { row };
}

async function withDossier(row, render, number) {
  row.dossier_number = number;
  return finish(row, render);
}

async function speculative(body) {
  const agency = agencyOf(body.agency);
  const tier = text(body.tier, 20);
  if (!['Palier I', 'Palier II', 'Palier III'].includes(tier)) return fail('Le palier est I, II ou III.');
  if (!agency) return fail('La succursale est obligatoire.');
  const missing = [requireText(body, 'full_name', 'Le nom'), requireText(body, 'civility', 'La civilité'), requireText(body, 'telegram', 'Le télégramme')].find(Boolean);
  if (missing) return fail(missing);
  if (!validDate(body.birth_date) || !validDate(body.signed_on)) return fail('Les dates du dossier sont obligatoires.');
  if (!flags(body, ['declare_risks', 'declare_past', 'declare_accuracy', 'declare_terms'])) return fail('Les quatre déclarations sont obligatoires.');
  if (!(Number(body.amount) > 0)) return fail('Le montant souscrit est obligatoire.');
  const row = {
    agency, client_id: safeId(body.client_id), tier, full_name: text(body.full_name, 160), civility: text(body.civility, 20),
    birth_date: body.birth_date, signed_on: body.signed_on, nationality: text(body.nationality, 80),
    telegram: text(body.telegram, 80), address: text(body.address, 240), experience: text(body.experience, 120),
    objectives: text(body.objectives, 240), horizon: text(body.horizon, 120), amount: money(body.amount),
    profit_distribution: text(body.profit_distribution, 160), payment_mode: text(body.payment_mode, 80),
    bank_id: text(body.bank_id, 40), funds_origin: text(body.funds_origin, 160), estimated_wealth: money(body.estimated_wealth),
    own_account: !!body.own_account, recommended: !!body.recommended,
    declare_risks: true, declare_past: true, declare_accuracy: true, declare_terms: true,
    discord_url: text(body.discord_url, 300), status: 'ouvert', mission_keys: {},
    dossier_number: await nextSerial('pret_speculative_funds', 'dossier_number', 'HCP-')
  };
  return finish(row, 'fonds');
}

async function pawn(body) {
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
    discord_url: text(body.discord_url, 300), status: 'ouvert', mission_keys: {}
  };
  return finish(row, pawnEmbed);
}

async function consigne(body) {
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
    dossier_offered: !!body.dossier_offered, ...quoted, paid: false,
    discord_url: text(body.discord_url, 300), status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, consigneEmbed, await nextSerial('pret_consigne_contracts', 'dossier_number', 'C-'));
}

async function term(body) {
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
    discord_url: text(body.discord_url, 300), status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, termEmbed, dossier_number);
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

async function payroll(body) {
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
    discord_url: text(body.discord_url, 300), status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, payrollEmbed, await nextSerial('pret_payroll_contracts', 'dossier_number', 'GP-'));
}

async function goldstein(body) {
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
    movements: [{ type: 'ouverture', amount: money(body.opening_amount), balance: quoted.balance, on: body.signed_on }],
    discord_url: text(body.discord_url, 300), status: 'ouvert', mission_keys: {}
  };
  return withDossier(row, goldsteinEmbed, await nextSerial('pret_goldstein_booklets', 'dossier_number', 'LEG-'));
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
    return { row: { deposits, capital_balance: quoted.capital_after, cost_basis: quoted.cost_basis } };
  }
  if (body.action === 'withdraw') {
    const quoted = fundWithdrawalQuote(row, body.amount);
    if (quoted.error) return fail(quoted.error);
    const entry = {
      on, amount: quoted.amount, tax: quoted.tax, net: quoted.net, profit: quoted.profit,
      capital_before: quoted.capital_before, capital_after: quoted.capital_after
    };
    const withdrawals = fundHistory(row).concat(entry);
    const patch = { withdrawals, withdrawal: entry, capital_balance: quoted.capital_after, cost_basis: quoted.cost_basis };
    if (quoted.capital_after === 0) {
      patch.status = 'clos';
      patch.closed_at = new Date().toISOString();
    }
    return { row: patch };
  }
  return fail('Ce dossier ne reçoit pas ce mouvement.');
}

function moveGoldstein(row, body) {
  const amount = money(body.amount);
  if (!(amount > 0)) return fail('Le montant du mouvement est obligatoire.');
  const balance = body.action === 'withdraw' ? money(row.balance - amount) : money(row.balance + amount);
  if (balance < 0) return fail('Le retrait dépasse la somme restante.');
  const next = goldsteinNext(balance);
  const movements = Array.isArray(row.movements) ? row.movements.slice() : [];
  movements.push({ type: body.action, amount, balance, on: body.on || row.signed_on });
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
  speculative_funds: { collection: 'pret_speculative_funds', prepare: speculative, render: 'fonds', move: moveFund },
  pawn_loans: { collection: 'pret_pawn_loans', prepare: pawn, render: pawnEmbed, usesRecordId: true },
  consigne_contracts: { collection: 'pret_consigne_contracts', prepare: consigne, render: consigneEmbed },
  term_savings: { collection: 'pret_term_savings', prepare: term, render: termEmbed, settle: settleTerm, validate: validateTerm },
  payroll_contracts: { collection: 'pret_payroll_contracts', prepare: payroll, render: payrollEmbed },
  goldstein_booklets: { collection: 'pret_goldstein_booklets', prepare: goldstein, render: goldsteinEmbed, move: moveGoldstein }
};

module.exports = { PRODUCTS };
