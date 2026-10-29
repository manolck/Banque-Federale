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

assert.strictEqual(money.money(7500 / 8), 937.5);
const lifeWeek1 = money.lifeFinancials([
  { status: 'paid', amount: 625, paid_at: '2026-01-01' }
], new Date('2026-01-08T12:00:00Z'));
assert.strictEqual(lifeWeek1.principal, 625);
assert.strictEqual(lifeWeek1.interest, 31.25);
assert.strictEqual(lifeWeek1.balance, 656.25);
const lifeWeek2 = money.lifeFinancials([
  { status: 'paid', amount: 625, paid_at: '2026-01-01' },
  { status: 'paid', amount: 625, paid_at: '2026-01-08' }
], new Date('2026-01-15T12:00:00Z'));
assert.strictEqual(lifeWeek2.principal, 1250);
assert.strictEqual(lifeWeek2.balance, 1345.31);
assert.strictEqual(lifeWeek2.interest, 95.31);
const fundGain = money.fundWithdrawalQuote({ amount: 1500, capital_balance: 2000 }, 2000);
assert.strictEqual(fundGain.profit, 500);
assert.strictEqual(fundGain.tax, 75);
assert.strictEqual(fundGain.net, 1925);
assert.strictEqual(fundGain.capital_after, 0);
assert.strictEqual(fundGain.cost_basis, 0);
const fundPart = money.fundWithdrawalQuote({ amount: 1500, capital_balance: 2000 }, 400);
assert.strictEqual(fundPart.profit, 100);
assert.strictEqual(fundPart.tax, 15);
assert.strictEqual(fundPart.net, 385);
assert.strictEqual(fundPart.capital_after, 1600);
assert.strictEqual(fundPart.cost_basis, 1200);
const fundLoss = money.fundWithdrawalQuote({ amount: 1000, capital_balance: 800 }, 800);
assert.strictEqual(fundLoss.profit, 0);
assert.strictEqual(fundLoss.tax, 0);
assert.strictEqual(fundLoss.net, 800);
const fundAdded = money.fundDepositQuote({ amount: 1500, capital_balance: 2000 }, 100);
assert.strictEqual(fundAdded.capital_after, 2100);
assert.strictEqual(fundAdded.cost_basis, 1600);
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
const mission = forms.missionEmbed({ agency: 'blackwater', dossier_number: 'EPT-BW-0001', prenom: 'Benjamin', nom: 'Goldstein', telegram: '65945' }, { date: '1904-11-24', amount: 1100 });
assert.strictEqual(mission.color, 0x8b642c);
assert.ok(!mission.description.includes('@Texas'));
assert.ok(mission.description.includes('Texas'));
assert.strictEqual(forms.receiptTitle({ agence: 'blackwater', loan_id: 'BW-0007', nom: 'Santana', prenom: 'Kane' }), 'Texas | BW-0007 | Santana Kane');
assert.strictEqual(forms.receiptTitle({ agency: 'van_horn', dossier_number: 'C-000001', nom: 'Muddy', prenom: 'Buck' }), 'Louisiane | C-000001 | Muddy Buck');
assert.strictEqual(forms.receiptTitle({ agencies: ['blackwater', 'rhodes'], company_name: 'Saloon Van Horn', dossier_number: 'GP-000001' }), 'Texas / Louisiane | GP-000001 | Saloon Van Horn');
assert.deepStrictEqual(forms.receiptTags('pret_loans', { agence: 'sunset' }), ['Nouveau', 'Sunset']);
assert.deepStrictEqual(forms.receiptTags('pret_consigne_contracts', { agency: 'rhodes', dossier_offered: true }), ['Ouvert', 'OFFERT']);
assert.deepStrictEqual(forms.receiptTags('pret_speculative_funds', { agency: 'blackwater', tier: 'Palier II', profit_distribution: 'Versement hebdomadaire' }), ['Palier II', 'Blackwater', 'Versement Hebdo']);
assert.deepStrictEqual(forms.receiptTags('pret_life_insurance_contracts', { agency: 'valentine' }), ['Période de versement']);
assert.deepStrictEqual(forms.receiptTags('pret_horse_credits', { statut: 'en_cours' }), ['Pari en cours']);
assert.strictEqual(forms.RECEIPT_FORUMS.pret_goldstein_booklets, undefined);

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
  prenom: 'Benjamin', nom: 'Goldstein', dossier_number: 'EPT-BW-0001',
  settlement: { kind: 'echeance', on: '1904-11-24', fee: 0, net: 1100 }
});
assert.ok(closed.description.includes('1 100,00') || closed.description.includes('1\u202f100,00') || closed.description.includes('1100'));
assert.ok(closed.description.includes('aucun'));
const queued = actions.enqueueNotice({ discord_url: 'https://discord.com/channels/1/2', discord_notices: [] }, early);
assert.strictEqual(queued.discord_notices.length, 1);
assert.deepStrictEqual(actions.enqueueNotice({ discord_url: '' }, early), {});
assert.strictEqual(actions.serviceNotice('term_savings', 'edit', {}), null);
const loan = actions.loanNotice(
  { prenom: 'Kane', nom: 'Santana', loan_id: 'VH-0001', echeances: [{ montant: 50, date: '1904-10-27', statut: 'attente' }], recouvrement_status: 'aucun' },
  { echeances: [{ montant: 50, date: '1904-10-27', statut: 'paye' }], recouvrement_status: 'cloture' }
);
assert.ok(loan.title.includes('Paiement validé'));
assert.ok(loan.description.includes('clôturé'));

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
  '2026-10-30',
  { I: { final: 2.1, regime: 'stable', label: 'Marché calme' } }
);
assert.strictEqual(credited.capital_balance, 1021);
assert.strictEqual(credited.statements[0].result_percent, 2.1);
assert.strictEqual(market.applyFund({ ...credited, status: 'ouvert', tier: 'Palier I' }, '2026-10-30', { I: { final: 9, regime: 'stable', label: 'Marché calme' } }), null);
assert.strictEqual(market.applyFund({ status: 'pause', tier: 'Palier I', capital_balance: 1000 }, '2026-10-30', { I: { final: 2.1, regime: 'stable', label: 'Marché calme' } }), null);
assert.strictEqual(market.applyFund({ status: 'clos', tier: 'Palier II', capital_balance: 1000 }, '2026-10-30', { II: { final: 3, regime: 'stable', label: 'Marché calme' } }), null);
const lost = market.applyFund({ status: 'ouvert', tier: 'Palier III', capital_balance: 1000, statements: [] }, '2026-10-30', { III: { final: -3, regime: 'krach', label: 'Panique sur les marchés' } });
assert.strictEqual(lost.capital_balance, 970);
const tuesday = new Date('2026-10-27T19:00:00Z');
const fridayMorning = new Date('2026-10-30T15:00:00Z');
const fridayEvening = new Date('2026-10-30T17:00:00Z');
assert.strictEqual(market.upcomingFriday(tuesday), '2026-10-30');
assert.strictEqual(market.slotReached(fridayMorning, '2026-10-30'), false);
assert.strictEqual(market.slotReached(fridayEvening, '2026-10-30'), true);
assert.strictEqual(market.dueFriday(market.initialMarket(tuesday), tuesday), '');
assert.strictEqual(market.dueFriday({ next: '2026-10-30' }, fridayEvening), '2026-10-30');
assert.strictEqual(market.dueFriday({ next: '2026-10-30' }, new Date('2026-10-31T12:00:00Z')), '2026-10-30');
const calm = engine.issueSemaine('I', engine.etatInitial());
assert.ok(Math.abs(calm.hausse + calm.baisse + calm.neutre - 1) < 1e-9);
assert.ok(calm.hausse > calm.baisse);
const guardedIssue = engine.issueSemaine('I', { regime: 'stable', serie: -3 });
assert.strictEqual(guardedIssue.baisse, 0);
assert.ok(guardedIssue.hausse > guardedIssue.neutre);
const sameStreak = { I: { regime: 'stable', serie: 2 }, II: { regime: 'stable', serie: 2 }, III: { regime: 'expansion', serie: 2 } };
const board = market.marketEmbed({
  on: '2026-10-30',
  results: { I: { final: -3 }, II: { final: -5 }, III: { final: -9.5 } },
  avant: sameStreak,
  apres: { I: engine.etatInitial(), II: engine.etatInitial(), III: engine.etatInitial() }
});
assert.strictEqual(board.title, 'Haussmann Capital Partners');
assert.strictEqual(board.color, 0x1f8b4c);
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
assert.ok(board.footer.text.includes('30/10/2026 18:00'));
const split = market.marketEmbed({
  on: '2026-10-30',
  results: { I: { final: 1 }, II: { final: -1 }, III: { final: 0 } },
  avant: { I: { serie: 2 }, II: { serie: -1 }, III: { serie: 0 } },
  apres: sameStreak
});
assert.ok(split.fields[6].value.includes("Palier I : 2 semaines de hausse d'affilée avant ce tirage."));
assert.ok(split.fields[6].value.includes('Palier II : 1 semaine de baisse avant ce tirage.'));
assert.ok(split.fields[6].value.includes('Palier III : aucune série en cours avant ce tirage.'));
assert.ok(split.fields[2].value.includes('**0.0%**'));

console.log('Règles Banque Fédérale : calculs conformes.');
