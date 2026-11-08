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
assert.strictEqual(money.fundContributed({ opening_amount: 1500, amount: 1600, deposits: [{ amount: 100 }] }), 1600);
assert.strictEqual(money.fundOpening({ amount: 1600, deposits: [{ on: '1904-10-01', amount: 100, capital_before: 1500 }] }), 1500);
assert.strictEqual(money.fundOpening({
  amount: 1100,
  deposits: [{ on: '1904-11-05', amount: 100, capital_before: 1100 }],
  statements: [{ on: '1904-10-05', result_percent: 10, capital_before: 1000, capital_after: 1100 }]
}), 1000);
assert.deepStrictEqual(money.fundContributedFields({ amount: 1500 }, [{ amount: 100 }]), { opening_amount: 1500, amount: 1500 });
assert.deepStrictEqual(money.fundContributedFields({ opening_amount: 1500, amount: 1600 }, [{ amount: 100 }, { amount: 50 }]), { opening_amount: 1500, amount: 1500 });
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
  declare_accuracy: true, declare_terms: true, created_by_username: 'Kane.Santana'
}, '27/10/1904');
assert.ok(term.description.startsWith('#Épargne à Terme — SOUSCRIPTION'));
assert.ok(term.description.includes('**Contrat établi par :** Kane.Santana'));
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
const lifeOffer = forms.lifeEmbed({
  contract_number: 'AV-000001', agency: 'valentine', subscriber_first_name: 'Ada', subscriber_last_name: 'Lovelace',
  beneficiary_first_name: 'Charles', beneficiary_last_name: 'Babbage', target_capital: 1000, weekly_payment: 125,
  start_date: '1904-10-01', enrollment: {}, created_by_username: 'Ada.Lovelace'
}, 'stamp');
assert.strictEqual(lifeOffer.color, 0x247174);
assert.ok(lifeOffer.description.startsWith('**Contrat établi par :** Ada.Lovelace'));
const mission = forms.missionEmbed({ agency: 'blackwater', dossier_number: 'EPT-BW-0001', prenom: 'Benjamin', nom: 'Goldstein', telegram: '65945', created_by_username: 'Kane.Santana' }, { collection: 'pret_term_savings', date: '1904-11-24', amount: 1100 });
assert.strictEqual(mission.color, 0x247174);
assert.ok(mission.description.includes('- Rédiger le télégramme'));
assert.ok(mission.description.includes('Épargne à terme'));
assert.ok(mission.description.includes('**Contrat établi par :** Kane.Santana'));
assert.ok(mission.description.includes('lui sera versée le 24/11/1904'));
assert.ok(!mission.description.includes('est due le 24/11/1904'));
assert.ok(mission.title.includes('EPT-BW-0001'));
assert.ok(!mission.title.includes('Épargne à terme'));
const pawnMission = forms.missionEmbed(
  { agency: 'blackwater', dossier_number: 'PG-BW-0001', prenom: 'Kane', nom: 'Santana', telegram: '66110', banquier_username: 'Ada.Lovelace' },
  { collection: 'pret_pawn_loans', date: '1904-11-03', amount: 115 }
);
assert.ok(pawnMission.description.includes('**Contrat établi par :** Ada.Lovelace'));
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
  garanties: 'Titres', echeances: [{ date: '1904-11-03', montant: 220 }],
  banquier_username: 'Kane.Santana'
}, '27/10/1904 12:00');
assert.ok(loanEmbed.description.includes('**Contrat établi par :** Kane.Santana'));
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
  referent: 'Kane Santana',
  created_by_username: 'Ada.Lovelace'
}, '03/11/1904 12:00');
assert.ok(horseEmbed.title.includes('Crédit hippique'));
assert.ok(horseEmbed.title.includes('Ada Lovelace'));
assert.ok(horseEmbed.description.includes('**Contrat établi par :** Ada.Lovelace'));
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
const fundTransfer = actions.serviceNotice('speculative_funds', 'withdraw', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', status: 'ouvert', cost_basis: 500, withdrawn_total: 500,
  withdrawal: {
    on: '1904-11-03', amount: 500, basis_out: 500, profit: 0, tax: 0, net: 500,
    capital_after: 500, withdrawn_total: 500, transfer_to_offer: true
  }
});
assert.ok(fundTransfer.title.includes('Transfert vers une autre offre'));
assert.ok(fundTransfer.description.includes('pas de demande de remboursement'));
const fundTransferMove = require('../server_api/products').PRODUCTS.speculative_funds.move(
  { status: 'ouvert', capital_balance: 1000, cost_basis: 1000, withdrawn_total: 0, deposits: [], withdrawals: [] },
  { action: 'withdraw', amount: 400, transfer_to_offer: true }
);
assert.strictEqual(fundTransferMove.row.withdrawal.transfer_to_offer, true);
const fundCloseAction = actions.serviceNotice('speculative_funds', 'close', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', status: 'clos', capital_balance: 0
});
assert.ok(fundCloseAction.title.includes('Clôture — fonds'));
assert.strictEqual(fundCloseAction.color, 0xff0000);
assert.strictEqual(fundCloseAction.mention, '@Réserve fédérale');
const fundMarketNotice = actions.serviceNotice('speculative_funds', 'market', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', tier: 'Palier II', capital_balance: 2040,
  market_statement: {
    on: '2026-11-08', result_percent: 2, capital_before: 2000, capital_after: 2040,
    regime_label: 'Marché calme', market: true
  }
});
assert.ok(fundMarketNotice.title.includes('Compte rendu de séance'));
assert.ok(fundMarketNotice.description.includes('Palier du dossier'));
assert.ok(fundMarketNotice.description.includes('Palier II'));
assert.ok(fundMarketNotice.description.includes('Capital après'));
assert.ok(fundMarketNotice.description.includes('+2'));
assert.ok(!fundMarketNotice.description.includes('Palier III'));
assert.ok(!fundMarketNotice.description.includes('Projection'));
assert.ok(!fundMarketNotice.description.includes('Haussmann Asset Management'));
const fundMarketQueued = actions.enqueueNotice(
  { discord_url: 'https://discord.com/channels/1/2', discord_notices: [] },
  fundMarketNotice
);
assert.strictEqual(fundMarketQueued.discord_notices.length, 1);
const fundTierChange = actions.serviceNotice('speculative_funds', 'change_tier', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', status: 'ouvert',
  previous_tier: 'Palier I', tier: 'Palier II', capital_balance: 2500
});
assert.ok(fundTierChange.title.includes('Changement de palier'));
assert.ok(fundTierChange.description.includes('Palier I'));
assert.ok(fundTierChange.description.includes('Palier II'));
assert.strictEqual(fundTierChange.color, 0xd7a64d);
const { catchUpFund } = require('../server_api/products');
const fundCatchBase = {
  status: 'ouvert',
  amount: 1000,
  capital_balance: 1100,
  cost_basis: 1000,
  withdrawn_total: 0,
  deposits: [],
  withdrawals: [],
  statements: [{ on: '1904-10-05', result_percent: 10, capital_before: 1000, capital_after: 1100, market: true }]
};
const fundCatchDeposit = catchUpFund(fundCatchBase, { kind: 'deposit', on: '1904-10-03', amount: 500 });
assert.strictEqual(fundCatchDeposit.error, undefined);
assert.strictEqual(fundCatchDeposit.row.deposits.length, 1);
assert.strictEqual(fundCatchDeposit.row.deposits[0].on, '1904-10-03');
assert.strictEqual(fundCatchDeposit.row.deposits[0].capital_before, 1000);
assert.strictEqual(fundCatchDeposit.row.deposits[0].capital_after, 1500);
assert.strictEqual(fundCatchDeposit.row.statements[0].capital_before, 1500);
assert.strictEqual(fundCatchDeposit.row.statements[0].capital_after, 1650);
assert.strictEqual(fundCatchDeposit.row.capital_balance, 1650);
assert.strictEqual(fundCatchDeposit.row.cost_basis, 1500);
assert.strictEqual(fundCatchDeposit.row.opening_amount, 1000);
assert.strictEqual(fundCatchDeposit.row.amount, 1000);
const fundCatchLateDeposit = catchUpFund({
  status: 'ouvert',
  amount: 1000,
  opening_amount: 1000,
  capital_balance: 1100,
  cost_basis: 1000,
  withdrawn_total: 0,
  deposits: [],
  withdrawals: [],
  statements: [{ on: '1904-10-05', result_percent: 10, capital_before: 1000, capital_after: 1100, market: true }]
}, { kind: 'deposit', on: '1904-11-05', amount: 100 });
assert.strictEqual(fundCatchLateDeposit.error, undefined);
assert.strictEqual(fundCatchLateDeposit.row.deposits[0].capital_before, 1100);
assert.strictEqual(fundCatchLateDeposit.row.deposits[0].capital_after, 1200);
assert.strictEqual(fundCatchLateDeposit.row.capital_balance, 1200);
assert.strictEqual(fundCatchLateDeposit.row.amount, 1000);
assert.strictEqual(fundCatchLateDeposit.row.cost_basis, 1100);
assert.strictEqual(money.fundContributed(fundCatchLateDeposit.row), 1100);
// amount déjà gonflé au capital versé : le recalcul repart bien du capital de souscription.
const fundCatchHealed = catchUpFund({
  status: 'ouvert',
  amount: 1100,
  capital_balance: 1200,
  cost_basis: 1100,
  withdrawn_total: 0,
  deposits: [{ on: '1904-11-05', amount: 100, capital_before: 1100, capital_after: 1200 }],
  withdrawals: [],
  statements: [{ on: '1904-10-05', result_percent: 10, capital_before: 1000, capital_after: 1100, market: true }]
}, { kind: 'deposit', on: '1904-11-06', amount: 50 });
assert.strictEqual(fundCatchHealed.error, undefined);
assert.strictEqual(fundCatchHealed.row.opening_amount, 1000);
assert.strictEqual(fundCatchHealed.row.amount, 1000);
assert.strictEqual(fundCatchHealed.row.deposits[0].capital_before, 1100);
assert.strictEqual(fundCatchHealed.row.deposits[1].capital_before, 1200);
assert.strictEqual(fundCatchHealed.row.capital_balance, 1250);
const fundCatchWithdraw = catchUpFund({
  ...fundCatchBase,
  capital_balance: 1650,
  cost_basis: 1500,
  deposits: [{ on: '1904-10-03', amount: 500, capital_before: 1000, capital_after: 1500 }],
  statements: [{ on: '1904-10-05', result_percent: 10, capital_before: 1500, capital_after: 1650, market: true }]
}, { kind: 'withdraw', on: '1904-10-04', amount: 300 });
assert.strictEqual(fundCatchWithdraw.error, undefined);
assert.strictEqual(fundCatchWithdraw.row.withdrawals.length, 1);
assert.strictEqual(fundCatchWithdraw.row.withdrawals[0].on, '1904-10-04');
assert.strictEqual(fundCatchWithdraw.row.statements[0].capital_before, 1200);
assert.strictEqual(fundCatchWithdraw.row.capital_balance, 1320);
const fundCatchStatement = catchUpFund({
  status: 'ouvert',
  amount: 1000,
  capital_balance: 1000,
  cost_basis: 1000,
  withdrawn_total: 0,
  deposits: [],
  withdrawals: [],
  statements: []
}, { kind: 'statement', on: '1904-10-12', result_percent: -5 });
assert.strictEqual(fundCatchStatement.error, undefined);
assert.strictEqual(fundCatchStatement.row.statements.length, 1);
assert.strictEqual(fundCatchStatement.row.capital_balance, 950);
const fundCatchDupDeposit = catchUpFund({
  ...fundCatchBase,
  deposits: [{ on: '1904-10-03', amount: 500, capital_before: 1000, capital_after: 1500 }]
}, { kind: 'deposit', on: '1904-10-03', amount: 500 });
assert.ok(fundCatchDupDeposit.error);
const fundCatchDupStatement = catchUpFund(fundCatchBase, { kind: 'statement', on: '1904-10-05', result_percent: 10 });
assert.ok(fundCatchDupStatement.error);
const fundMoveDup = require('../server_api/products').PRODUCTS.speculative_funds.move(
  {
    status: 'ouvert',
    capital_balance: 1500,
    cost_basis: 1500,
    withdrawn_total: 0,
    deposits: [{ on: money.rpToday(), amount: 100, capital_before: 1400, capital_after: 1500 }],
    withdrawals: []
  },
  { action: 'deposit', amount: 100 }
);
assert.ok(fundMoveDup.error);
const fundCatchNotice = actions.serviceNotice('speculative_funds', 'catch_up', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', capital_balance: 1650,
  catch_up: { kind: 'deposit', on: '1904-10-03', amount: 500 }
});
assert.ok(fundCatchNotice.title.includes('Correction manuelle'));
assert.ok(fundCatchNotice.description.includes('Dépôt'));
assert.strictEqual(fundCatchNotice.color, 0xd7a64d);
const fundCatchRemove = catchUpFund({
  status: 'ouvert',
  amount: 1000,
  capital_balance: 1650,
  cost_basis: 1500,
  withdrawn_total: 0,
  deposits: [{ on: '1904-10-03', amount: 500, capital_before: 1000, capital_after: 1500 }],
  withdrawals: [],
  statements: [{ on: '1904-10-05', result_percent: 10, capital_before: 1500, capital_after: 1650, market: true }]
}, { remove: true, entry_kind: 'deposit', source_index: 0 });
assert.strictEqual(fundCatchRemove.error, undefined);
assert.strictEqual(fundCatchRemove.row.deposits.length, 0);
assert.strictEqual(fundCatchRemove.row.statements[0].capital_before, 1000);
assert.strictEqual(fundCatchRemove.row.capital_balance, 1100);
assert.strictEqual(fundCatchRemove.row.cost_basis, 1000);
assert.strictEqual(fundCatchRemove.row.amount, 1000);
assert.strictEqual(fundCatchRemove.row.opening_amount, 1000);
assert.strictEqual(money.fundContributed(fundCatchRemove.row), 1000);
const fundCatchRemoveNotice = actions.serviceNotice('speculative_funds', 'catch_up', {
  full_name: 'Ada Lovelace', dossier_number: 'FS-000001', capital_balance: 1100,
  catch_up: { remove: true, kind: 'deposit', on: '1904-10-03', amount: 500 }
});
assert.ok(fundCatchRemoveNotice.title.includes('suppression'));
assert.ok(fundCatchRemoveNotice.description.includes('retirée'));
assert.strictEqual(fundCatchRemoveNotice.color, 0xd7a64d);
const lifeClosureAsk = actions.lifeNotice('request_closure', {
  subscriber_first_name: 'Ada', subscriber_last_name: 'Lovelace', contract_number: 'AV-000001'
}, { balance: 1000, fee: 150, net: 850 });
assert.ok(lifeClosureAsk.title.includes('Demande de clôture'));
assert.ok(lifeClosureAsk.description.includes('850'));
assert.strictEqual(lifeClosureAsk.mention, '@Directeur');
assert.strictEqual(lifeClosureAsk.color, 0xd7a64d);
const lifeClosureQueued = actions.enqueueNotice(
  { discord_notices: [] },
  lifeClosureAsk
);
assert.strictEqual(lifeClosureQueued.discord_notices[0].content, '@Directeur');
assert.strictEqual(lifeClosureQueued.discord_notices[0].embed.mention, undefined);
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
const forum = require('../server_api/fonds_forum');
const depositEmbed = forum.parseMovementEmbed({
  title: 'Dépôt complémentaire — Tommy Wayne (Dossier HCP-000003)',
  description: '',
  author: { name: 'Haussmann Capital Partners' },
  fields: [
    { name: 'Montant déposé', value: '**8 000,00 $**', inline: true },
    { name: 'Capital', value: 'Avant : **2 990,26 $**\nAprès : **10 990,26 $**', inline: true }
  ],
  footer: { text: 'Le capital investi demeure exposé à un risque de perte partielle ou totale selon les conditions du marché. • 13/10/1904 19:42' }
});
assert.strictEqual(depositEmbed.dossier_number, 'HCP-000003');
assert.strictEqual(depositEmbed.movement.kind, 'deposit');
assert.strictEqual(depositEmbed.movement.amount, 8000);
assert.strictEqual(depositEmbed.movement.capital_before, 2990.26);
assert.strictEqual(depositEmbed.movement.capital_after, 10990.26);
assert.strictEqual(depositEmbed.movement.on, '2026-10-13');
const depositAlt = forum.parseMovementEmbed({
  title: 'Haussmann Capital Partners',
  description: 'Dépôt complémentaire — Tommy Wayne (Dossier HCP-000003)\n\n**Montant déposé :** 8 000,00 $\n**Capital :**\nAvant : 2 990,26 $\nAprès : 10 990,26 $',
  fields: [],
  footer: { text: '13/10/1904 19:42' }
});
assert.ok(depositAlt);
assert.strictEqual(depositAlt.movement.amount, 8000);
assert.strictEqual(depositAlt.movement.capital_after, 10990.26);
const fundBeforeDeposit = {
  status: 'ouvert', amount: 2000, capital_balance: 2990.26, cost_basis: 2000, deposits: [], statements: []
};
const depositApplied = forum.applyProposal(fundBeforeDeposit, {
  kind: 'add_deposit',
  movement: depositEmbed.movement
});
assert.ok(!depositApplied.error);
assert.strictEqual(depositApplied.patch.capital_balance, 10990.26);
assert.strictEqual(depositApplied.patch.cost_basis, 10000);
assert.strictEqual(depositApplied.patch.deposits.length, 1);
assert.strictEqual(depositApplied.patch.deposits[0].amount, 8000);
// Capital déjà à jour via un relevé : on enregistre le dépôt pour le cost_basis sans double compter.
const alreadyCounted = forum.applyProposal(
  { status: 'ouvert', amount: 2000, capital_balance: 10990.26, cost_basis: 2000, deposits: [], statements: [{ on: '2026-10-20', capital_after: 10990.26 }] },
  { kind: 'add_deposit', movement: depositEmbed.movement }
);
assert.strictEqual(alreadyCounted.patch.capital_balance, 10990.26);
assert.strictEqual(alreadyCounted.patch.cost_basis, 10000);
const withLaterDeposit = forum.applyProposal(
  {
    status: 'ouvert', amount: 2000, capital_balance: 10990.26, cost_basis: 10000,
    deposits: [{ on: '2026-10-13', amount: 8000 }],
    statements: []
  },
  { kind: 'add_statement', statement: { date: '2026-10-06', result_percent: 2, capital_before: 2000, capital_after: 2040 } }
);
assert.strictEqual(withLaterDeposit.patch.capital_balance, 10040);
const withdrawTax = money.fundWithdrawalQuote({
  amount: 2000, capital_balance: 10990.26, cost_basis: 10000, deposits: [{ amount: 8000 }], withdrawals: []
}, 10990.26);
assert.ok(withdrawTax.basis_out > 9000);
assert.ok(withdrawTax.tax < 200);
const fundPayouts = require('../server_api/fund_payouts');
assert.strictEqual(fundPayouts.canManage({ role_code: 'DIRECTOR' }), true);
assert.strictEqual(fundPayouts.canManage({ role_code: 'DEPUTY_DIRECTOR' }), true);
assert.strictEqual(fundPayouts.canManage({ role_code: 'TECHNICIAN' }), false);
assert.strictEqual(fundPayouts.canManage({ role_code: 'BANKER' }), false);
assert.strictEqual(fundPayouts.COLLECTION, 'pret_fund_payouts');
const lost = market.applyFund({ status: 'ouvert', tier: 'Palier III', capital_balance: 1000, statements: [] }, '2026-11-01', { III: { final: -3, regime: 'krach', label: 'Panique sur les marchés' } });
assert.strictEqual(lost.capital_balance, 970);
const tuesday = new Date('2026-10-27T19:00:00Z');
const sundayMorning = new Date('2026-11-01T15:00:00Z');
const sundayEvening = new Date('2026-11-01T17:00:00Z'); // 18:00 Paris (CET)
const sundayPublish = new Date('2026-11-01T18:00:00Z'); // 19:00 Paris (CET)
assert.strictEqual(market.upcomingSunday(tuesday), '2026-11-01');
assert.strictEqual(market.slotReached(sundayMorning, '2026-11-01'), false);
assert.strictEqual(market.slotReached(sundayEvening, '2026-11-01'), true);
assert.strictEqual(market.publishReached(sundayEvening, '2026-11-01'), false);
assert.strictEqual(market.publishReached(sundayPublish, '2026-11-01'), true);
assert.strictEqual(market.dueSunday(market.initialMarket(tuesday), tuesday), '');
assert.strictEqual(market.dueSunday({ next: '2026-11-01' }, sundayEvening), '2026-11-01');
assert.strictEqual(market.dueSunday({ next: '2026-11-01' }, new Date('2026-11-02T12:00:00Z')), '2026-11-01');
assert.strictEqual(market.present({ next: '2026-10-30', weeks: {} }, tuesday).next, '2026-11-01');
const teaser = market.marketTeaserEmbed({ on: '2026-11-08' });
assert.ok(teaser.description.includes('19 h'));
assert.ok(teaser.footer.text.includes('08/11/1904 18:00'));
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
assert.ok(board.footer.text.includes('01/11/1904 19:00'));
assert.strictEqual(require('../server_api/money').marketDateFr('2026-11-01'), '01/11/1904');
assert.strictEqual(require('../server_api/money').marketDateFr('2026-11-08'), '08/11/1904');
assert.strictEqual(require('../server_api/money').marketDateFr('1904-11-06'), '08/11/1904');
assert.strictEqual(require('../server_api/money').marketDateFr('2026-11-06'), '08/11/1904');
assert.strictEqual(require('../server_api/money').marketOnKey('1904-11-06'), '2026-11-08');
assert.strictEqual(require('../server_api/money').marketOnKey('2026-11-08'), '2026-11-08');
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
