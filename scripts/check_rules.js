const assert = require('assert');
const money = require('../server_api/money');
const fonds = require('../server_api/fonds_interest');

assert.strictEqual(money.payment(100, 15, 1), 115);
assert.strictEqual(money.payment(100, 10, 1), 110);
assert.strictEqual(money.payment(100, 0, 4), 25);
assert.strictEqual(money.periodsForDays(7), 1);
assert.strictEqual(money.periodsForDays(14), 2);
assert.strictEqual(money.periodsForDays(21), 3);
assert.strictEqual(money.periodsForDays(28), 4);

const fourWeeks = money.termQuote(100, 4);
assert.strictEqual(fourWeeks.rate, 10);
assert.strictEqual(fourWeeks.maturityAmount, 110);
assert.strictEqual(fourWeeks.earlyRate, 20);
assert.strictEqual(fourWeeks.earlyFee, 20);
const earlyTerm = money.termPayout({ amount: 100, rate: 10, early_rate: 20, early_fee: 20, maturity_amount: 110 }, 'anticipe');
assert.strictEqual(earlyTerm.fee, 20);
assert.strictEqual(earlyTerm.net, 80);
const matureTerm = money.termPayout({ amount: 1000, rate: 10, early_rate: 20, early_fee: 200, maturity_amount: 1100 }, 'echeance');
assert.strictEqual(matureTerm.fee, 0);
assert.strictEqual(matureTerm.net, 1100);
assert.strictEqual(money.termPayout({ amount: 1000, early_rate: 20, early_fee: 200 }, 'anticipe').net, 800);
assert.strictEqual(money.addDays('1904-10-26', 49), '1904-12-14');
assert.strictEqual(money.addDays('1904-10-26', 28), '1904-11-23');

assert.strictEqual(money.consigneWeekly('standard', 'blackwater'), 30);
assert.strictEqual(money.consigneWeekly('standard', 'saint_denis'), 40);
assert.strictEqual(money.consigneWeekly('standard', 'van_horn'), 25);
assert.strictEqual(money.consigneWeekly('premium', 'sunset'), 55);
assert.strictEqual(money.consigneWeekly('standard', 'rhodes'), 30);

const pawn = money.pawnQuote(100, 15);
assert.strictEqual(pawn.repayment, 115);
assert.strictEqual(money.addDays('1904-10-26', 7), '1904-11-02');
assert.strictEqual(money.rpToday(new Date(2026, 9, 29, 15, 30, 0)), '1904-10-29');
assert.strictEqual(money.rpPlusDays(7, new Date(2026, 9, 29)), '1904-11-05');
assert.strictEqual(money.rpDaysDiff('1904-10-27', new Date(2026, 9, 29)), -2);
assert.strictEqual(money.rpDaysDiff('1904-10-29', new Date(2026, 9, 29)), 0);
assert.strictEqual(money.rpDaysDiff('1904-11-05', new Date(2026, 9, 29)), 7);
assert.strictEqual(money.datedLike('1904-06-26'), money.rpToday());
assert.strictEqual(money.datedLike('2026-08-01'), money.rpToday());
assert.strictEqual(money.dateFr('1904-10-29'), '29/10/1904');
assert.strictEqual(money.dateFr('2026-10-30'), '30/10/1904');
assert.strictEqual(money.dateFr('2027-10-30'), '30/10/1905');
assert.strictEqual(money.dateFr('2025-10-29'), '29/10/1903');
assert.strictEqual(money.dateFr('1905-06-01'), '01/06/1905');
assert.strictEqual(money.rpToday(new Date(2027, 0, 15)), '1905-01-15');
assert.strictEqual(money.rpPlusDays(7, new Date(2027, 9, 29)), '1905-11-05');
assert.strictEqual(money.rpDaysDiff('2026-10-27', new Date(2026, 9, 29)), -2);
assert.strictEqual(money.rpDaysDiff('2027-10-29', new Date(2026, 9, 29)), 365);

const payroll = money.payrollQuote(10, 500, 5);
assert.strictEqual(payroll.management, 50);
assert.strictEqual(payroll.transfer, 50);
assert.strictEqual(payroll.installment, 100);

const first = money.goldsteinNext(100);
assert.strictEqual(first.interest, 3);
assert.strictEqual(first.nextBalance, 103);
const second = money.goldsteinNext(103);
assert.strictEqual(second.interest, 3.09);
assert.strictEqual(second.nextBalance, 106.09);
const afterWithdrawal = money.goldsteinNext(53);
assert.strictEqual(afterWithdrawal.interest, 1.59);
assert.strictEqual(afterWithdrawal.nextBalance, 54.59);
// Ouverture 1000 $, retrait 500 $ avant l'échéance : intérêts uniquement sur 500 $.
const halfBook = money.goldsteinNext(500);
assert.strictEqual(halfBook.interest, 15);
assert.strictEqual(halfBook.nextBalance, 515);

assert.strictEqual(money.money(7500 / 8), 937.5);
const lifeSub = money.lifeFinancials([
  { status: 'paid', amount: 125, paid_at: '2026-01-01' }
], new Date('2026-01-01T12:00:00Z'));
assert.strictEqual(lifeSub.balance, 131.25);
assert.strictEqual(lifeSub.last_interest, 6.25);
const lifeWeek2Due = money.lifeFinancials([
  { status: 'paid', amount: 125, paid_at: '2026-01-01' },
  { status: 'paid', amount: 125, paid_at: '2026-01-08' }
], new Date('2026-01-08T12:00:00Z'));
assert.strictEqual(lifeWeek2Due.principal, 250);
assert.strictEqual(lifeWeek2Due.balance, 269.06);
assert.strictEqual(lifeWeek2Due.interest, 19.06);
assert.strictEqual(lifeWeek2Due.last_interest, 12.81);
const lifeWeek1 = money.lifeFinancials([
  { status: 'paid', amount: 625, paid_at: '2026-01-01' }
], new Date('2026-01-08T12:00:00Z'));
assert.strictEqual(lifeWeek1.principal, 625);
assert.strictEqual(lifeWeek1.balance, 689.06);
assert.strictEqual(lifeWeek1.interest, 64.06);
const lifeWeek2 = money.lifeFinancials([
  { status: 'paid', amount: 625, paid_at: '2026-01-01' },
  { status: 'paid', amount: 625, paid_at: '2026-01-08' }
], new Date('2026-01-15T12:00:00Z'));
assert.strictEqual(lifeWeek2.principal, 1250);
assert.strictEqual(lifeWeek2.balance, 1412.58);
assert.strictEqual(lifeWeek2.interest, 162.58);
const lifePaid = Array.from({ length: 8 }, (_, index) => ({
  status: 'paid',
  amount: 625,
  number: index + 1,
  paid_at: money.addDays('2026-01-01', index * 7)
}));
assert.strictEqual(money.lifePaymentsComplete({ payments: lifePaid }), true);
assert.strictEqual(money.lifePaymentsComplete({
  payments: lifePaid.map((payment, index) => index < 7 ? payment : { ...payment, status: 'pending', paid_at: null })
}), false);
assert.strictEqual(money.lifeLastPaidOn({ payments: lifePaid }), '1904-02-19');
assert.strictEqual(money.asRpDay('2026-02-19'), '1904-02-19');
assert.strictEqual(money.asRpDay('1904-02-19'), '1904-02-19');
const lifeStatementOn = money.addDays(money.lifeLastPaidOn({ payments: lifePaid }), 7);
assert.strictEqual(lifeStatementOn, '1904-02-26');
const lifeAtStatement = money.lifeFinancials(lifePaid, lifeStatementOn);
const lifeWeekBefore = money.lifeFinancials(lifePaid, money.addDays(lifeStatementOn, -7));
assert.strictEqual(money.money(lifeAtStatement.balance - lifeWeekBefore.balance), lifeAtStatement.last_interest);
assert.strictEqual(
  money.lifeAsOf({ status: 'closed', closed_at: '2026-03-05T10:00:00Z' }, new Date('2026-03-20T12:00:00Z')).toISOString().slice(0, 10),
  '2026-03-05'
);
const fundGain = money.fundWithdrawalQuote({ amount: 1500, capital_balance: 2000, cost_basis: 1500, withdrawn_total: 0 }, 2000);
assert.strictEqual(fundGain.profit, 500);
assert.strictEqual(fundGain.tax, 75);
assert.strictEqual(fundGain.net, 1925);
assert.strictEqual(fundGain.basis_out, 1500);
assert.strictEqual(fundGain.capital_after, 0);
assert.strictEqual(fundGain.cost_basis, 0);
assert.strictEqual(fundGain.withdrawn_total, 2000);
const fundPart = money.fundWithdrawalQuote({ amount: 1500, capital_balance: 2000, cost_basis: 1500, withdrawn_total: 0 }, 400);
assert.strictEqual(fundPart.profit, 100);
assert.strictEqual(fundPart.tax, 15);
assert.strictEqual(fundPart.net, 385);
assert.strictEqual(fundPart.basis_out, 300);
assert.strictEqual(fundPart.capital_after, 1600);
assert.strictEqual(fundPart.cost_basis, 1200);
assert.strictEqual(fundPart.withdrawn_total, 400);
const fundNext = money.fundWithdrawalQuote({
  amount: 1500, capital_balance: 1600, cost_basis: 1200, withdrawn_total: 400,
  withdrawals: [{ amount: 400, basis_out: 300 }]
}, 1600);
assert.strictEqual(fundNext.profit, 400);
assert.strictEqual(fundNext.tax, 60);
assert.strictEqual(fundNext.basis_out, 1200);
assert.strictEqual(fundNext.withdrawn_total, 2000);
assert.strictEqual(fundNext.cost_basis, 0);
const fundLoss = money.fundWithdrawalQuote({ amount: 1000, capital_balance: 800, cost_basis: 1000, withdrawn_total: 0 }, 800);
assert.strictEqual(fundLoss.profit, 0);
assert.strictEqual(fundLoss.tax, 0);
assert.strictEqual(fundLoss.net, 800);
const fundAdded = money.fundDepositQuote({ amount: 1500, capital_balance: 2000, cost_basis: 1500 }, 100);
assert.strictEqual(fundAdded.capital_after, 2100);
assert.strictEqual(fundAdded.cost_basis, 1600);
assert.strictEqual(money.fundContributed({ amount: 1500, deposits: [{ amount: 100 }] }), 1600);
assert.strictEqual(money.fundWithdrawnTotal({ withdrawn_total: 400 }), 400);
assert.strictEqual(fonds.WEEKLY_RATE, null);
assert.strictEqual(money.stateOf('blackwater'), 'texas');
assert.strictEqual(money.stateOf('van_horn'), 'louisiane');
assert.strictEqual(money.stateOf('saint_denis'), 'louisiane');
assert.strictEqual(money.discordUrlOk('https://discord.com/channels/1/2'), true);
assert.strictEqual(money.discordUrlOk('https://example.com'), false);

const schedule = money.buildSchedule(100, 0, 2, '1904-10-26');
assert.strictEqual(schedule.montant, 50);
assert.strictEqual(schedule.total, 100);
assert.deepStrictEqual(schedule.echeances.map((item) => item.date), ['1904-10-26', '1904-11-02']);

const forms = require('../server_api/discord_forms');
const receipt = forms.letterhead({ title: 'Épargne à terme — Benjamin Goldstein — Dossier EPT-BW-0001', description: '**Montant souscrit :** 1 000,00 $', footer: '27/10/1904' });
assert.strictEqual(receipt.author.name, 'Interstate Banking & Trust Company');
assert.strictEqual(receipt.color, 0xd7a64d);
assert.ok(receipt.title.includes('EPT-BW-0001'));
const wrapped = forms.embedFromText('Dossier EPT-BW-0001\n\n#Épargne à Terme — SOUSCRIPTION\n\ntexte');
assert.strictEqual(wrapped.title, 'Dossier EPT-BW-0001');
assert.ok(wrapped.description.startsWith('#Épargne'));
const term = forms.termEmbed({
  prenom: 'Benjamin', nom: 'Goldstein', agency: 'blackwater', origin: 'Épargne personnelle',
  payment_mode: 'Espèces', weeks: 4, rate: 10, amount: 1000, maturity_amount: 1100,
  early_rate: 20, early_fee: 200, signed_on: '1904-10-27', echeance_date: '1904-11-24',
  declare_accuracy: true, declare_terms: true
}, '27/10/1904');
assert.ok(!term.description.includes('[x]'));
assert.ok(!term.description.includes('[]'));
assert.ok(term.description.includes('✅ Exactitude des informations'));
assert.ok(!term.description.includes('✅ Rupture si décès'));
assert.ok(term.description.includes('✅ Prise de connaissance des conditions générales'));
assert.ok(!term.description.includes('Rupture si décès'));
assert.ok(term.description.includes('Épargne personnelle'));
assert.ok(!term.description.includes('Revenus professionnels'));
assert.ok(term.description.includes('**Durée :** 4 semaines'));
assert.ok(!term.description.includes('8 semaines'));
assert.strictEqual(term.color, 0x247174);
assert.strictEqual(forms.lifeEmbed({
  contract_number: 'AV-000001', agency: 'valentine', subscriber_first_name: 'Ada', subscriber_last_name: 'Lovelace',
  beneficiary_first_name: 'Charles', beneficiary_last_name: 'Babbage', target_capital: 1000, weekly_payment: 125,
  start_date: '1904-10-01', enrollment: {}
}, 'stamp').color, 0x247174);
const mission = forms.missionEmbed({ agency: 'blackwater', dossier_number: 'EPT-BW-0001', prenom: 'Benjamin', nom: 'Goldstein', telegram: '65945' }, { collection: 'pret_term_savings', date: '1904-11-24', amount: 1100 });
assert.strictEqual(mission.color, 0x247174);
assert.ok(mission.description.includes('- Rédiger le télégramme'));
assert.ok(mission.description.includes('Épargne à terme'));
assert.ok(mission.description.includes('lui sera versée le 24/11/1904'));
assert.ok(!mission.description.includes('est due le 24/11/1904'));
assert.ok(mission.title.includes('EPT-BW-0001'));
assert.ok(!mission.title.includes('Épargne à terme'));
const pawnMission = forms.missionEmbed(
  { agency: 'blackwater', dossier_number: 'PG-BW-0001', prenom: 'Kane', nom: 'Santana', telegram: '66110' },
  { collection: 'pret_pawn_loans', date: '1904-11-03', amount: 115 }
);
assert.ok(pawnMission.description.includes('objet remis en gage'));
assert.ok(pawnMission.description.includes('Banque du Texas'));
assert.ok(pawnMission.description.includes('03/11/1904'));
const pawnSeize = require('../server_api/discord_actions').serviceNotice('pawn_loans', 'seize', {
  prenom: 'Kane', nom: 'Santana', dossier_number: 'PG-BW-0001',
  item_type: 'Montre', echeance_date: '1904-11-03', amount_due: 115
});
assert.ok(pawnSeize.title.includes('Clôture — saisie du gage'));
assert.ok(pawnSeize.description.includes("L'objet mis en gage devient à ce jour propriété de la banque."));
assert.strictEqual(pawnSeize.color, 0xff0000);
assert.strictEqual(pawnSeize.mention, '@Réserve fédérale');
const consigneClose = require('../server_api/discord_actions').serviceNotice('consigne_contracts', 'close', {
  prenom: 'Ada', nom: 'Lovelace', dossier_number: 'C-000001', agency: 'blackwater', coverage: 'standard'
});
assert.ok(consigneClose.title.includes('Clôture — consigne'));
assert.ok(consigneClose.description.includes('Tout objet présent dans les coffres lors de la clôture devient propriété de la banque.'));
assert.strictEqual(consigneClose.color, 0xff0000);
assert.strictEqual(consigneClose.mention, '@Réserve fédérale');
const consignePaid = require('../server_api/products').PRODUCTS.consigne_contracts.payWeek({
  status: 'ouvert', next_due: '1904-11-03', weekly_total: 30, mission_keys: {}, payments: []
});
assert.strictEqual(consignePaid.row.next_due, '1904-11-10');
assert.strictEqual(consignePaid.row.last_paid_amount, 30);
assert.strictEqual(consignePaid.row.last_paid_due, '1904-11-03');
assert.ok(consignePaid.row.mission_keys['due:1904-11-03:']);
const consigneWeekNotice = require('../server_api/discord_actions').serviceNotice('consigne_contracts', 'pay_week', {
  prenom: 'Ada', nom: 'Lovelace', dossier_number: 'C-000001', agency: 'blackwater',
  weekly_total: 30, last_paid_due: '1904-11-03', last_paid_amount: 30, next_due: '1904-11-10'
});
assert.ok(consigneWeekNotice.title.includes('Règlement hebdomadaire'));
assert.ok(consigneWeekNotice.description.includes('30'));
assert.ok(consigneWeekNotice.description.includes('10/11/1904') || consigneWeekNotice.description.includes('11/10/1904') || consigneWeekNotice.description.includes('1904'));
assert.strictEqual(require('../server_api/products').PRODUCTS.consigne_contracts.payWeek({ status: 'clos', next_due: '1904-11-03', weekly_total: 30 }).error, 'Ce dossier est clôturé.');
const payrollClose = require('../server_api/discord_actions').serviceNotice('payroll_contracts', 'close', {
  company_name: 'Saloon Valentine', dossier_number: 'GP-000001'
});
assert.ok(payrollClose.title.includes('Clôture — gestion de paie'));
assert.strictEqual(payrollClose.color, 0xff0000);
const goldsteinCap = require('../server_api/discord_actions').serviceNotice('goldstein_booklets', 'capitalize', {
  prenom: 'Benjamin', nom: 'Goldstein', dossier_number: 'LEG-000001', balance: 515,
  movements: [{ on: '1904-11-10', amount: 15, balance_before: 500, balance: 515, type: 'capitalisation' }]
});
assert.ok(goldsteinCap.title.includes('Intérêts — livret Goldstein'));
assert.ok(goldsteinCap.description.includes('500,00') || goldsteinCap.description.includes('500'));
assert.ok(goldsteinCap.description.includes('15,00') || goldsteinCap.description.includes('15'));
assert.ok(goldsteinCap.description.includes('Solde (base)'));
assert.ok(goldsteinCap.description.includes('Nouveau solde'));
assert.strictEqual(goldsteinCap.color, 0x1f8b4c);
assert.ok(!mission.description.includes('@Texas'));
assert.ok(mission.description.includes('Texas'));
const loanEmbed = forms.loanEmbed({
  prenom: 'Ada', nom: 'Lovelace', loan_id: 'SD-0007', agence: 'saint_denis',
  telegram: '65945', adresse: '12 Rue du Port', date_naissance: '1875-12-10',
  nationalite: 'Britannique', civilite: 'Madame', profession: 'Mathématicienne',
  date_creation: '1904-10-27', somme: 400, taux: 10, total_a_rembourser: 440,
  garanties: 'Titres', echeances: [{ date: '1904-11-03', montant: 220 }]
}, '27/10/1904 12:00');
assert.ok(loanEmbed.description.includes('INFORMATIONS PERSONNELLES'));
assert.ok(loanEmbed.description.includes('12 Rue du Port'));
assert.ok(loanEmbed.description.includes('Britannique'));
assert.ok(loanEmbed.description.includes('Mathématicienne'));
assert.ok(loanEmbed.description.includes('400,00') || loanEmbed.description.includes('400'));
assert.strictEqual(forms.receiptTitle({ agence: 'blackwater', loan_id: 'BW-0007', nom: 'Santana', prenom: 'Kane' }), 'Texas | BW-0007 | Santana Kane');
assert.strictEqual(forms.receiptTitle({ agency: 'van_horn', dossier_number: 'C-000001', nom: 'Muddy', prenom: 'Buck' }), 'Louisiane | C-000001 | Muddy Buck');
assert.strictEqual(forms.receiptTitle({ agencies: ['blackwater', 'rhodes'], company_name: 'Saloon Van Horn', dossier_number: 'GP-000001' }), 'Texas / Louisiane | GP-000001 | Saloon Van Horn');
assert.deepStrictEqual(forms.receiptTags('pret_loans', { agence: 'sunset' }), ['Nouveau', 'Sunset']);
assert.deepStrictEqual(forms.receiptTags('pret_consigne_contracts', { agency: 'rhodes', dossier_offered: true }), ['Ouvert', 'OFFERT']);
assert.deepStrictEqual(forms.receiptTags('pret_speculative_funds', { agency: 'blackwater', tier: 'Palier II', profit_distribution: 'Versement hebdomadaire' }), ['Palier II', 'Blackwater', 'Versement Hebdo']);
assert.deepStrictEqual(forms.receiptTags('pret_life_insurance_contracts', { agency: 'valentine' }), ['Période de versement']);
const lifeInterest = forms.lifeInterestEmbed(
  { contract_number: 'AV-000001', subscriber_first_name: 'Ada', subscriber_last_name: 'Lovelace' },
  { on: '2026-02-26', balance: 5000, principal: 5000, interest: 0, week_interest: 250 }
);
assert.strictEqual(lifeInterest.color, 0x1f8b4c);
assert.ok(lifeInterest.title.includes('AV-000001'));
assert.ok(lifeInterest.description.includes('Solde'));
assert.ok(lifeInterest.description.includes('250'));
assert.ok(lifeInterest.footer.text.includes('clôture'));
assert.deepStrictEqual(forms.receiptTags('pret_horse_credits', { statut: 'en_cours' }), ['Pari en cours']);
const horseEmbed = forms.horseEmbed({
  client_prenom: 'Ada',
  client_nom: 'Lovelace',
  dossier_id: 'HIP-19041103-ABC12',
  telegram: '65945',
  adresse: '12 Rue du Port, Saint-Denis',
  profession: 'Mathématicienne',
  agence: 'saint_denis',
  date_du_jour: '1904-11-03',
  identite_presentee: true,
  photographie_ajoutee: true,
  coupons_count: 2,
  montant_total: 50,
  taux: 0,
  date_course: '1904-11-05',
  cheval_ecurie: 'Éclair Noir',
  type_pari: 'gagnant',
  bookmaker: 'Blackwater Downs',
  numeros_coupons: ['4412', '4413'],
  coupons_enregistres: true,
  numeros_verifies: true,
  revenus_mensuels: '120 $',
  patrimoine: 'Chevaux et titres',
  garanties: 'Titres',
  recommande: true,
  referent: 'Kane Santana'
}, '03/11/1904 12:00');
assert.ok(horseEmbed.title.includes('Crédit hippique'));
assert.ok(horseEmbed.title.includes('Ada Lovelace'));
assert.ok(horseEmbed.description.includes('INFORMATIONS PERSONNELLES'));
assert.ok(horseEmbed.description.includes('65945'));
assert.ok(horseEmbed.description.includes('Éclair Noir'));
assert.ok(horseEmbed.description.includes('Gagnant'));
assert.ok(horseEmbed.description.includes('N°4412'));
assert.ok(horseEmbed.description.includes('50,00') || horseEmbed.description.includes('50'));
assert.ok(horseEmbed.description.includes('Kane Santana'));
assert.strictEqual(horseEmbed.color, 0x247174);
assert.strictEqual(forms.RECEIPT_FORUMS.pret_goldstein_booklets, '1567191919782789161');
assert.deepStrictEqual(forms.receiptTags('pret_goldstein_booklets', { status: 'ouvert' }), ['Ouvert']);

const actions = require('../server_api/discord_actions');
const early = actions.serviceNotice('term_savings', 'early_withdrawal', {
  prenom: 'Benjamin', nom: 'Goldstein', dossier_number: 'EPT-BW-0001',
  settlement: { kind: 'anticipe', on: '1904-10-27', fee: 200, net: 800, rate: 20 }
});
assert.ok(early.title.includes('Retrait anticipé'));
assert.ok(early.title.includes('EPT-BW-0001'));
assert.ok(early.description.includes('800,00'));
assert.ok(early.description.includes('200,00'));
assert.strictEqual(early.author.name, 'Interstate Banking & Trust Company');
const closed = actions.serviceNotice('term_savings', 'close_term', {
  prenom: 'Benjamin', nom: 'Goldstein', dossier_number: 'EPT-BW-0001', agency: 'blackwater',
  settlement: { kind: 'echeance', on: '1904-11-24', fee: 0, net: 1100 }
});
assert.ok(closed.description.includes('1 100,00') || closed.description.includes('1\u202f100,00') || closed.description.includes('1100'));
assert.ok(closed.description.includes('aucun'));
assert.strictEqual(closed.color, 0xff0000);
assert.strictEqual(closed.mention, '@Texas');
const closedLa = actions.serviceNotice('term_savings', 'close_term', {
  prenom: 'Ada', nom: 'Lovelace', dossier_number: 'EPT-VH-0001', agency: 'van_horn',
  settlement: { kind: 'echeance', on: '1904-11-24', fee: 0, net: 1100 }
});
assert.strictEqual(closedLa.mention, '@Louisiane');
const queued = actions.enqueueNotice({ discord_url: 'https://discord.com/channels/1/2', discord_notices: [] }, early);
assert.strictEqual(queued.discord_notices.length, 1);
const queuedBeforeUrl = actions.enqueueNotice({ discord_url: '', discord_notices: [] }, early);
assert.strictEqual(queuedBeforeUrl.discord_notices.length, 1);
assert.deepStrictEqual(actions.enqueueNotice({ discord_url: '' }, null), {});
assert.strictEqual(actions.pendingNotices('pret_term_savings', { discord_url: '', discord_notices: queuedBeforeUrl.discord_notices }).length, 0);
assert.strictEqual(actions.pendingNotices('pret_term_savings', { discord_url: 'https://discord.com/channels/1/2', discord_notices: queuedBeforeUrl.discord_notices }).length, 1);
const queuedClose = actions.enqueueNotice({ discord_url: 'https://discord.com/channels/1/2', discord_notices: [] }, closed);
assert.strictEqual(queuedClose.discord_notices[0].content, '@Texas');
assert.strictEqual(queuedClose.discord_notices[0].embed.mention, undefined);
assert.strictEqual(actions.serviceNotice('term_savings', 'edit', {}), null);
const fundClosed = actions.serviceNotice('speculative_funds', 'withdraw', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', status: 'clos', cost_basis: 0, withdrawn_total: 1000,
  withdrawal: { on: '1904-11-03', amount: 1000, basis_out: 1000, profit: 0, tax: 0, net: 1000, capital_after: '0', withdrawn_total: 1000 }
});
assert.ok(fundClosed.title.includes('Clôture — fonds'));
assert.strictEqual(fundClosed.color, 0xff0000);
assert.strictEqual(fundClosed.mention, '@Réserve fédérale');
const fundCloseAction = actions.serviceNotice('speculative_funds', 'close', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', status: 'clos', capital_balance: 0
});
assert.ok(fundCloseAction.title.includes('Clôture — fonds'));
assert.strictEqual(fundCloseAction.color, 0xff0000);
assert.strictEqual(fundCloseAction.mention, '@Réserve fédérale');
const loanBase = {
  prenom: 'Kane',
  nom: 'Santana',
  loan_id: 'VH-0001',
  echeances: [{ montant: 50, date: '1904-10-27', statut: 'attente' }],
  recouvrement_status: 'aucun',
  recouvrement_notes: ''
};
const loanPaid = actions.loanNotice(
  loanBase,
  { ...loanBase, echeances: [{ montant: 50, date: '1904-10-27', statut: 'paye' }] }
);
assert.ok(loanPaid.title.includes('Paiement validé'));
assert.strictEqual(loanPaid.color, 0x34c924);
const loan = actions.loanNotice(
  loanBase,
  { ...loanBase, echeances: [{ montant: 50, date: '1904-10-27', statut: 'paye' }], recouvrement_status: 'cloture' }
);
assert.ok(loan.title.includes('Paiement validé'));
assert.ok(loan.description.includes('clôturé'));
assert.strictEqual(loan.color, 0xff0000);
const loanClosed = actions.loanNotice(
  { ...loanBase, echeances: [{ montant: 50, date: '1904-10-27', statut: 'paye' }] },
  { ...loanBase, echeances: [{ montant: 50, date: '1904-10-27', statut: 'paye' }], recouvrement_status: 'cloture', recouvrement_notes: 'Dossier soldé.' }
);
assert.ok(loanClosed.title.includes('Prêt clôturé'));
assert.ok(loanClosed.description.includes('Dossier soldé'));
assert.strictEqual(loanClosed.color, 0xff0000);
assert.strictEqual(loanClosed.mention, '@Réserve fédérale');
const loanRecovery = actions.loanNotice(
  loanBase,
  { ...loanBase, recouvrement_status: 'mise_en_demeure', recouvrement_notes: 'Aucune réponse au télégramme.' }
);
assert.ok(loanRecovery.title.includes('Recouvrement'));
assert.ok(loanRecovery.description.includes('Mise en demeure'));
assert.ok(loanRecovery.description.includes('Aucune réponse'));
assert.strictEqual(loanRecovery.color, 0x8b642c);
const loanFollowUp = actions.loanNotice(
  loanBase,
  {
    ...loanBase,
    echeances: [{
      montant: 50,
      date: '1904-10-27',
      statut: 'attente',
      rappels: [{
        reminder_date: '1904-10-20',
        reminder_time: '14:30',
        reminder_method: 'telegram',
        note: 'Client joignable demain.',
        recorded_by_username: 'Ada',
        created_at: '1904-10-20T14:35:00.000Z'
      }]
    }]
  }
);
assert.ok(loanFollowUp.title.includes('Suivi de dossier'));
assert.ok(loanFollowUp.description.includes('Télégramme'));
assert.ok(loanFollowUp.description.includes('Client joignable'));
assert.ok(loanFollowUp.description.includes('Ada'));
assert.strictEqual(loanFollowUp.color, 0xd7a64d);
const loanNotes = actions.loanNotice(
  { ...loanBase, recouvrement_status: 'recouvrement_actif', recouvrement_notes: 'Ancienne note' },
  { ...loanBase, recouvrement_status: 'recouvrement_actif', recouvrement_notes: 'Relance télégramme envoyée.' }
);
assert.ok(loanNotes.title.includes('Suivi de dossier'));
assert.ok(loanNotes.description.includes('Relance télégramme'));

const engine = require('../server_api/fonds_engine');
const market = require('../server_api/fonds_market');
for (const cfg of Object.values(engine.CONFIG)) {
  for (const [regime, row] of Object.entries(cfg.transitions)) {
    assert.ok(Math.abs(Object.values(row).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    const adjusted = engine.transitionsAjustees(cfg, regime, cfg.rappel_apres + 3);
    assert.ok(Math.abs(Object.values(adjusted).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    const calm = Object.entries(engine.transitionsAjustees(cfg, regime, 0)).reduce((sum, [name, weight]) => sum + (engine.HAUSSIERS.has(name) ? 0 : weight), 0);
    const pulled = Object.entries(adjusted).reduce((sum, [name, weight]) => sum + (engine.HAUSSIERS.has(name) ? 0 : weight), 0);
    assert.ok(pulled > calm);
  }
}
assert.strictEqual(engine.CONFIG.I.transitions.stable.stable, 0.60);
function fixedRng(regime, value) {
  return {
    choices(population) {
      assert.ok(population.includes(regime));
      return [regime];
    },
    gauss() { return value; }
  };
}
const shock = engine.tirageSemaine(
  { I: engine.etatInitial(), II: engine.etatInitial(), III: engine.etatInitial() },
  [{ valeur: -2, paliers: ['I'] }, { valeur: -3, paliers: ['I'] }],
  fixedRng('stable', 4)
);
assert.strictEqual(shock.resultats.I, -1);
assert.strictEqual(shock.resultats.II, 4);
assert.strictEqual(shock.resultats.III, 4);
const guarded = engine.tiragePalier('I', { regime: 'stable', serie: -3 }, 0, fixedRng('stable', -100));
assert.strictEqual(guarded.detail.garde_fou, true);
assert.ok(guarded.final >= 0);
assert.ok(guarded.final >= engine.CONFIG.I.bornes[0] && guarded.final <= engine.CONFIG.I.bornes[1]);
const floored = engine.tiragePalier('I', engine.etatInitial(), -5, fixedRng('stable', -100));
assert.strictEqual(floored.final, -3);
for (const nom of engine.PALIERS) {
  let etat = engine.etatInitial();
  for (let step = 0; step < 30; step += 1) {
    const drawn = engine.tiragePalier(nom, etat, step % 2 ? 40 : -40);
    const [lo, hi] = engine.CONFIG[nom].bornes;
    assert.ok(drawn.final >= lo && drawn.final <= hi);
    etat = drawn.etat;
  }
}
const credited = market.applyFund(
  { status: 'ouvert', tier: 'Palier I', amount: 1000, capital_balance: 1000, statements: [] },
  '2026-11-01',
  { I: { final: 2.1, regime: 'stable', label: 'Marché calme' } }
);
assert.strictEqual(credited.capital_balance, 1021);
assert.strictEqual(credited.statements[0].result_percent, 2.1);
assert.strictEqual(market.applyFund({ ...credited, status: 'ouvert', tier: 'Palier I' }, '2026-11-01', { I: { final: 9, regime: 'stable', label: 'Marché calme' } }), null);
assert.strictEqual(market.applyFund({ status: 'pause', tier: 'Palier I', capital_balance: 1000 }, '2026-11-01', { I: { final: 2.1, regime: 'stable', label: 'Marché calme' } }), null);
assert.strictEqual(market.applyFund({ status: 'Pause', tier: 'Palier I', capital_balance: 1000, statements: [] }, '2026-11-01', { I: { final: 2.1, regime: 'stable', label: 'Marché calme' } }), null);
assert.ok(!market.fundOpenForMarket({ status: 'pause' }));
assert.ok(market.fundOpenForMarket({ status: 'ouvert' }));
assert.strictEqual(market.applyFund({ status: 'clos', tier: 'Palier II', capital_balance: 1000 }, '2026-11-01', { II: { final: 3, regime: 'stable', label: 'Marché calme' } }), null);
const forumPaused = require('../server_api/fonds_forum').applyProposal(
  { status: 'pause', capital_balance: 1000, statements: [] },
  { kind: 'add_statement', statement: { date: '2026-11-01', result_percent: 2, capital_before: 1000, capital_after: 1020 } }
);
assert.ok(forumPaused.error);
const lost = market.applyFund({ status: 'ouvert', tier: 'Palier III', capital_balance: 1000, statements: [] }, '2026-11-01', { III: { final: -3, regime: 'krach', label: 'Panique sur les marchés' } });
assert.strictEqual(lost.capital_balance, 970);
const tuesday = new Date('2026-10-27T19:00:00Z');
const sundayMorning = new Date('2026-11-01T15:00:00Z');
const sundayEvening = new Date('2026-11-01T17:00:00Z');
assert.strictEqual(market.upcomingSunday(tuesday), '2026-11-01');
assert.strictEqual(market.slotReached(sundayMorning, '2026-11-01'), false);
assert.strictEqual(market.slotReached(sundayEvening, '2026-11-01'), true);
assert.strictEqual(market.dueSunday(market.initialMarket(tuesday), tuesday), '');
assert.strictEqual(market.dueSunday({ next: '2026-11-01' }, sundayEvening), '2026-11-01');
assert.strictEqual(market.dueSunday({ next: '2026-11-01' }, new Date('2026-11-02T12:00:00Z')), '2026-11-01');
assert.strictEqual(market.present({ next: '2026-10-30', weeks: {} }, tuesday).next, '2026-11-01');
const calm = engine.issueSemaine('I', engine.etatInitial());
assert.ok(Math.abs(calm.hausse + calm.baisse + calm.neutre - 1) < 1e-9);
assert.ok(calm.hausse > calm.baisse);
const guardedIssue = engine.issueSemaine('I', { regime: 'stable', serie: -3 });
assert.strictEqual(guardedIssue.baisse, 0);
assert.ok(guardedIssue.hausse > guardedIssue.neutre);
const sameStreak = { I: { regime: 'stable', serie: 2 }, II: { regime: 'stable', serie: 2 }, III: { regime: 'expansion', serie: 2 } };
const board = market.marketEmbed({
  on: '2026-11-01',
  results: { I: { final: -3 }, II: { final: -5 }, III: { final: -9.5 } },
  avant: sameStreak,
  apres: { I: engine.etatInitial(), II: engine.etatInitial(), III: engine.etatInitial() }
});
assert.strictEqual(board.title, 'Haussmann Capital Partners');
assert.strictEqual(board.color, 0x9370db);
assert.ok(!board.author);
assert.ok(board.description.includes('Haussmann Asset Management'));
assert.ok(board.description.includes('selon son palier'));
assert.strictEqual(board.fields.length, 7);
assert.strictEqual(board.fields[0].name, 'Palier I');
assert.strictEqual(board.fields[0].inline, true);
assert.ok(board.fields[0].value.includes('**-3.0%**'));
assert.ok(board.fields[0].value.includes('-3.0% à +9.0%'));
assert.ok(board.fields[1].value.includes('**-5.0%**'));
assert.ok(board.fields[1].value.includes('-5.0% à +15.0%'));
assert.ok(board.fields[2].value.includes('**-9.5%**'));
assert.ok(board.fields[2].value.includes('-15.0% à +30.0%'));
engine.PALIERS.forEach((nom, index) => {
  const field = board.fields[3 + index];
  const issue = engine.issueSemaine(nom, engine.etatInitial());
  assert.strictEqual(field.name, `Projection · Palier ${nom}`);
  assert.strictEqual(field.inline, true);
  const shares = field.value.match(/Hausse : \*\*(\d+\.\d+)%\*\*\nBaisse : \*\*(\d+\.\d+)%\*\*\nNeutre : \*\*(\d+\.\d+)%\*\*/);
  assert.ok(shares);
  assert.ok(Math.abs(Number(shares[1]) + Number(shares[2]) + Number(shares[3]) - 100) < 0.011);
  assert.ok(Math.abs(Number(shares[1]) - issue.hausse * 100) < 0.02);
});
assert.notStrictEqual(board.fields[3].value, board.fields[5].value);
assert.strictEqual(board.fields[6].name, 'Contexte marché');
assert.strictEqual(board.fields[6].value, "2 semaines de hausse d'affilée avant ce tirage.");
assert.ok(board.footer.text.includes('perte partielle ou totale'));
assert.ok(board.footer.text.includes('30/10/1904 18:00'));
assert.strictEqual(require('../server_api/money').marketDateFr('2026-11-01'), '30/10/1904');
assert.strictEqual(require('../server_api/money').marketDateFr('2026-11-08'), '06/11/1904');
const split = market.marketEmbed({
  on: '2026-11-01',
  results: { I: { final: 1 }, II: { final: -1 }, III: { final: 0 } },
  avant: { I: { serie: 2 }, II: { serie: -1 }, III: { serie: 0 } },
  apres: sameStreak
});
assert.ok(split.fields[6].value.includes("Palier I : 2 semaines de hausse d'affilée avant ce tirage."));
assert.ok(split.fields[6].value.includes('Palier II : 1 semaine de baisse avant ce tirage.'));
assert.ok(split.fields[6].value.includes('Palier III : aucune série en cours avant ce tirage.'));
assert.ok(split.fields[2].value.includes('**0.0%**'));

console.log('Règles Banque Fédérale : calculs conformes.');
