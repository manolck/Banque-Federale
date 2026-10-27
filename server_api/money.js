function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function moneyFr(value) {
  return `${money(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

function dateFr(iso) {
  const text = String(iso || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function addDays(iso, days) {
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

function payment(capital, rate, periods) {
  const amount = Number(capital);
  const count = parseInt(periods, 10);
  const ratio = Number(rate) / 100;
  if (!amount || !count) return 0;
  if (!ratio) return money(amount / count);
  return money(amount * ratio / (1 - Math.pow(1 + ratio, -count)));
}

function periodsForDays(days) {
  const count = Math.round(Number(days) / 7);
  return count > 0 ? count : 0;
}

function buildSchedule(capital, rate, periods, start) {
  const count = parseInt(periods, 10);
  const installment = payment(capital, rate, count);
  const echeances = [];
  for (let index = 0; index < count; index += 1) {
    echeances.push({ montant: installment, date: addDays(start, index * 7), statut: 'attente' });
  }
  return { echeances, total: money(installment * count), montant: installment };
}

const TERM_RATES = { 1: 2, 2: 4.5, 4: 10, 8: 22 };
const TERM_DAYS = { 1: 7, 2: 14, 4: 28, 8: 56 };

function termQuote(amount, weeks) {
  const rate = TERM_RATES[weeks];
  if (rate === undefined) return null;
  const capital = money(amount);
  const earlyRate = money(rate * 2);
  return {
    rate,
    days: TERM_DAYS[weeks],
    dueDate: null,
    maturityAmount: payment(capital, rate, 1),
    earlyRate,
    earlyFee: money(capital * earlyRate / 100)
  };
}

function termPayout(row, kind) {
  const capital = money(row && row.amount);
  if (kind === 'anticipe') {
    const rate = Number(row && row.early_rate);
    const fee = row && row.early_fee != null && row.early_fee !== ''
      ? money(row.early_fee)
      : money(capital * rate / 100);
    return { kind, rate, fee, net: money(capital - fee) };
  }
  const net = money(row && row.maturity_amount != null ? row.maturity_amount : row && row.amount_due);
  return { kind: 'echeance', rate: Number(row && row.rate), fee: 0, net };
}

function datedLike(sample) {
  const now = new Date();
  const year = String(sample || '').slice(0, 4);
  const used = /^\d{4}$/.test(year) ? year : String(now.getFullYear());
  return `${used}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function consigneWeekly(coverage, agency) {
  const plus = { standard: 5, renforcee: 15, premium: 35 }[coverage];
  if (plus === undefined) return null;
  let total = 25 + plus;
  if (agency === 'saint_denis') total += 10;
  if (agency === 'van_horn' || agency === 'sunset') total -= 5;
  return money(total);
}

function pawnQuote(amount, rate) {
  const capital = money(amount);
  const ratio = Number(rate);
  return {
    repayment: payment(capital, ratio, 1),
    rate: ratio
  };
}

function payrollQuote(employees, payroll, unit) {
  const count = Math.max(0, Math.trunc(Number(employees) || 0));
  const fee = Math.max(5, Number(unit) || 5);
  const management = money(count * fee);
  const transfer = money(Number(payroll) * 0.10);
  return { management, transfer, installment: money(management + transfer), unit: fee };
}

function goldsteinNext(balance) {
  const remaining = money(balance);
  const interest = money(remaining * 0.03);
  return { interest, nextBalance: money(remaining + interest) };
}

const TEXAS = new Set(['blackwater', 'strawberry', 'sunset']);

function stateOf(agency) {
  return TEXAS.has(agency) ? 'texas' : 'louisiane';
}

function stateLabel(agency) {
  return stateOf(agency) === 'texas' ? 'Texas' : 'Louisiane';
}

function discordUrlOk(value) {
  return /^https:\/\/(?:discord\.com|discordapp\.com)\/channels\/\d+\/\d+(?:\/\d+)?$/.test(String(value || '').trim());
}

const LIFE_WEEKLY = 1.05;
const LIFE_STOPPED = new Set(['closed', 'paid_to_beneficiary', 'cancelled']);

function completedWeeks(from, to) {
  const start = new Date(`${String(from).slice(0, 10)}T12:00:00Z`);
  const end = to instanceof Date ? to : new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 604800000));
}

function growLifeDeposit(amount, weeks) {
  let balance = money(amount);
  for (let index = 0; index < weeks; index += 1) balance = money(balance * LIFE_WEEKLY);
  return balance;
}

function lifeAsOf(contract, now = new Date()) {
  if (!contract || !LIFE_STOPPED.has(contract.status)) return now;
  const stamp = contract.closed_at || contract.beneficiary_paid_at || contract.cancelled_at;
  const date = stamp ? new Date(stamp) : now;
  return Number.isNaN(date.getTime()) ? now : date;
}

function lifeFinancials(payments, now = new Date()) {
  const paid = (Array.isArray(payments) ? payments : [])
    .filter((payment) => payment && payment.status === 'paid' && payment.paid_at)
    .map((payment) => ({ amount: money(payment.amount), at: String(payment.paid_at).slice(0, 10) }))
    .filter((payment) => /^\d{4}-\d{2}-\d{2}$/.test(payment.at))
    .sort((left, right) => left.at.localeCompare(right.at));
  let balance = 0;
  let principal = 0;
  for (const payment of paid) {
    const weeks = completedWeeks(payment.at, now);
    principal = money(principal + payment.amount);
    balance = money(balance + growLifeDeposit(payment.amount, weeks));
  }
  return {
    principal,
    interest: money(balance - principal),
    balance,
    paid_installments: paid.length,
    remaining_installments: Math.max(0, 8 - paid.length)
  };
}

function fundCapital(row) {
  if (!row) return 0;
  if (row.capital_balance != null && row.capital_balance !== '') return money(row.capital_balance);
  return money(row.amount);
}

function fundCostBasis(row) {
  if (!row) return 0;
  if (row.cost_basis != null && row.cost_basis !== '') return money(row.cost_basis);
  if (!(fundCapital(row) > 0)) return 0;
  const added = (Array.isArray(row.deposits) ? row.deposits : []).reduce((sum, item) => sum + money(item && item.amount), 0);
  return money(money(row.amount) + added);
}

function fundDepositQuote(row, gross) {
  const amount = money(gross);
  if (!(amount > 0)) return { error: 'Le montant à ajouter est obligatoire.' };
  const capital = fundCapital(row);
  return {
    amount,
    capital_before: capital,
    capital_after: money(capital + amount),
    cost_basis: money(fundCostBasis(row) + amount)
  };
}

function fundWithdrawalQuote(row, gross) {
  const amount = money(gross);
  const capital = fundCapital(row);
  if (!(amount > 0)) return { error: 'Le montant du retrait est obligatoire.' };
  if (amount > capital) return { error: 'Le retrait dépasse le capital.' };
  const basis = fundCostBasis(row);
  const share = capital ? amount / capital : 0;
  const basisOut = money(basis * share);
  const profit = money(Math.max(0, amount - basisOut));
  const tax = money(profit * 0.15);
  return {
    amount,
    profit,
    tax,
    net: money(amount - tax),
    capital_before: capital,
    capital_after: money(capital - amount),
    cost_basis: money(basis - basisOut)
  };
}

module.exports = {
  money, moneyFr, dateFr, addDays, validDate, payment, periodsForDays, buildSchedule,
  TERM_RATES, termQuote, termPayout, datedLike, consigneWeekly, pawnQuote, payrollQuote, goldsteinNext,
  stateOf, stateLabel, discordUrlOk, TEXAS,
  lifeFinancials, lifeAsOf,
  fundCapital, fundCostBasis, fundDepositQuote, fundWithdrawalQuote
};
