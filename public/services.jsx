/* Pages des services Banque Fédérale. Les montants affichés reprennent server_api/money.js. */
const BFReact = React;

function bfMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}
function bfDate(value) {
  const iso = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : String(value || '');
}
function bfAddDays(iso, days) {
  const date = new Date(`${String(iso || '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}
function bfPayment(capital, rate, periods) {
  const amount = Number(capital);
  const count = parseInt(periods, 10);
  const ratio = Number(rate) / 100;
  if (!amount || !count) return 0;
  if (!ratio) return bfMoney(amount / count);
  return bfMoney(amount * ratio / (1 - Math.pow(1 + ratio, -count)));
}
function bfFr(value) {
  const format = bfKit().fCur;
  if (format) return format(value);
  return `${bfMoney(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}
function fundResult(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const text = number.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${number > 0 ? '+' : ''}${text} %`;
}
function fundTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return 'flat';
  return number > 0 ? 'gain' : 'loss';
}
function fundWithdrawals(row) {
  if (Array.isArray(row && row.withdrawals) && row.withdrawals.length) return row.withdrawals;
  if (Array.isArray(row)) return row;
  return row && row.withdrawal ? [row.withdrawal] : [];
}
function latestMarketStatement(row) {
  const list = (Array.isArray(row && row.statements) ? row.statements : []).filter((item) => item && item.market && item.on);
  list.sort((left, right) => String(left.on).localeCompare(String(right.on)));
  return list.length ? list[list.length - 1] : null;
}
function MarketBoard({ market }) {
  if (!market) return null;
  const names = ['I', 'II', 'III'];
  const ready = market.paliers;
  return <div className="bvh-ledger" style={{ marginBottom: 16 }}>
    <div className="bvh-ledger-title">Séance du vendredi, 18 h</div>
    <div className="bvh-market">
      {names.map((nom) => {
        const item = ready ? market.paliers[nom] : null;
        return <article key={nom}>
          <b>Palier {nom}</b>
          {item
            ? <>
              <strong className={fundTone(item.result)}>{fundResult(item.result)}</strong>
              <span>{item.label || '—'}</span>
              <span>{bfDate(market.on)} · {item.dossiers} dossier{item.dossiers > 1 ? 's' : ''} ouvert{item.dossiers > 1 ? 's' : ''}</span>
            </>
            : <span>Premier relevé le {bfDate(market && market.next)} à 18 h</span>}
        </article>;
      })}
    </div>
  </div>;
}
function fundLines(statements, deposits, withdrawals) {
  const taken = Array.isArray(withdrawals) ? withdrawals : fundWithdrawals(withdrawals);
  return (Array.isArray(statements) ? statements : []).map((item) => ({ kind: 'statement', ...item }))
    .concat((Array.isArray(deposits) ? deposits : []).map((item) => ({ kind: 'deposit', ...item })))
    .concat(taken.map((item) => ({ kind: 'withdrawal', ...item })))
    .sort((left, right) => String(left.on || '').localeCompare(String(right.on || '')));
}
function fundTaxText(item) {
  if (item.tax == null || item.tax === '') return '—';
  return Number(item.tax) ? bfFr(item.tax) : 'Aucune';
}
function FundStatements({ statements, deposits, withdrawals }) {
  const lines = fundLines(statements, deposits, withdrawals);
  if (!lines.length) return null;
  return <div className="bvh-ledger" style={{ marginTop: 16 }}>
    <div className="bvh-ledger-title">Relevés hebdomadaires</div>
    <div className="bvh-statement bvh-statement-head">
      <span>Date</span><span>Résultat</span><span>Capital avant</span><span>Capital après</span><span>Virement net</span><span>Taxe</span>
    </div>
    {lines.map((item, index) => <div className="bvh-statement" key={`${item.kind}-${item.on || 'releve'}-${index}`}>
      <b data-label="Date">{bfDate(item.on)}</b>
      {item.kind === 'deposit'
        ? <span className="deposit" data-label="Résultat">{`Dépôt ${bfFr(item.amount)}`}</span>
        : item.kind === 'withdrawal'
          ? <span className="withdrawal" data-label="Résultat">{`Retrait ${bfFr(item.amount)}`}</span>
          : <span className={fundTone(item.result_percent)} data-label="Résultat">{fundResult(item.result_percent)}</span>}
      <span data-label="Capital avant">{bfFr(item.capital_before)}</span>
      <span data-label="Capital après">{bfFr(item.capital_after)}</span>
      <span data-label="Virement net">{item.kind === 'withdrawal' ? bfFr(item.net != null ? item.net : bfMoney(item.amount) - (Number(item.tax) || 0)) : (item.kind === 'statement' && item.payout_net ? bfFr(item.payout_net) : '—')}</span>
      <span data-label="Taxe">{item.kind === 'deposit' ? '—' : ((item.kind === 'withdrawal' || (item.kind === 'statement' && item.payout_net)) ? fundTaxText(item) : '—')}</span>
    </div>)}
  </div>;
}
function bfFundPosition(row) {
  const capital = row && row.capital_balance != null && row.capital_balance !== '' ? bfMoney(row.capital_balance) : bfMoney(row && row.amount);
  const basis = row && row.cost_basis != null && row.cost_basis !== ''
    ? bfMoney(row.cost_basis)
    : (capital > 0 ? bfMoney(bfMoney(row.amount) + (Array.isArray(row.deposits) ? row.deposits : []).reduce((sum, item) => sum + bfMoney(item && item.amount), 0)) : 0);
  return { capital, basis, profit: bfMoney(Math.max(0, capital - basis)) };
}
function bfWithdrawalQuote(row, gross) {
  const position = bfFundPosition(row);
  const amount = bfMoney(gross);
  if (!(amount > 0)) return null;
  if (amount > position.capital) return { error: 'Le retrait dépasse le capital.' };
  const share = position.capital ? amount / position.capital : 0;
  const basisOut = bfMoney(position.basis * share);
  const profit = bfMoney(Math.max(0, amount - basisOut));
  const tax = bfMoney(profit * 0.15);
  return { amount, profit, tax, net: bfMoney(amount - tax), capital_after: bfMoney(position.capital - amount) };
}
function fundMoveHint(row, gross) {
  const amount = bfMoney(gross);
  const position = bfFundPosition(row);
  if (!(amount > 0)) return 'La taxe de retrait est de 15 % du bénéfice encore dans le capital. Les sommes versées ne sont pas taxées.';
  const added = bfFr(bfMoney(position.capital + amount));
  const quote = bfWithdrawalQuote(row, amount);
  if (!quote || quote.error) return `Ajout : capital ${added}. ${quote && quote.error ? quote.error : ''}`;
  return `Ajout : capital ${added}. Retrait : bénéfice ${bfFr(quote.profit)}, taxe 15 % ${quote.tax ? bfFr(quote.tax) : 'aucune'}, net ${bfFr(quote.net)}, capital restant ${bfFr(quote.capital_after)}.`;
}
function termHint(row) {
  const fee = bfMoney(row.early_fee);
  const earlyNet = bfMoney(bfMoney(row.amount) - fee);
  const maturity = bfMoney(row.maturity_amount || row.amount_due);
  return `Retrait anticipé : frais ${bfFr(fee)} (${row.early_rate} % du montant placé), somme restituée ${bfFr(earlyNet)}. Clôture à l'échéance du ${bfDate(row.echeance_date)} : somme restituée ${bfFr(maturity)}.`;
}

const BF_AGENCY_ORDER = ['saint_denis', 'van_horn', 'valentine', 'rhodes', 'blackwater', 'strawberry', 'sunset'];
const BF_CONSIGNE = [
  ['blackwater', 'Blackwater'],
  ['rhodes', 'Rhodes'],
  ['valentine', 'Valentine'],
  ['van_horn', 'Van Horn'],
  ['sunset', 'Sunset City'],
  ['saint_denis', 'Saint Denis']
];

function bfKit() {
  return window.BVH || {};
}

function Choice({ label, value, options, onChange }) {
  return <div className="bvh-field" style={{ marginBottom: 12 }}>
    <b>{label}</b>
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      {options.map((option) => <label key={option.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="radio" checked={value === option.value} onChange={() => onChange(option.value)} /> {option.label}
      </label>)}
    </div>
  </div>;
}
function Checks({ label, values, options, onChange }) {
  const selected = Array.isArray(values) ? values : [];
  function toggle(option) {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : selected.concat(option));
  }
  return <div className="bvh-field" style={{ marginBottom: 12 }}>
    <b>{label}</b>
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      {options.map((option) => <label key={option.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} /> {option.label}
      </label>)}
    </div>
  </div>;
}
function Flag({ label, checked, onChange }) {
  return <label className="bvh-field" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
    <input type="checkbox" checked={!!checked} onChange={(event) => onChange(event.target.checked)} /> {label}
  </label>;
}

function AgencySelect({ label, value, onChange, consigne }) {
  const { Select, AGENCIES } = bfKit();
  const entries = consigne ? BF_CONSIGNE : BF_AGENCY_ORDER.map((key) => [key, (AGENCIES || {})[key] || key]);
  return <Select label={label || 'Succursale'} value={value || ''} onChange={onChange}><option value="">—</option>{entries.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Select>;
}

function FormPopup({ title, onClose, children }) {
  return <div onClick={(event) => event.target === event.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: '#000b', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ background: '#1a1d2e', borderTop: '4px solid #4a9eff', borderRadius: 14, padding: 24, width: 880, maxWidth: '100%', maxHeight: '92vh', overflow: 'auto' }}>
      <h2 style={{ marginBottom: 8 }}>{title}</h2>
      {children}
    </div>
  </div>;
}

function Part({ title, children, plain }) {
  return <section className="bvh-form-part">
    <h3>{title}</h3>
    {plain ? <div className="bvh-form-plain">{children}</div> : <div className="bvh-form-grid">{children}</div>}
  </section>;
}
function Span({ children }) {
  return <div className="bvh-form-span">{children}</div>;
}

function ClientSelect({ clients, value, onChange, label, section }) {
  const { Select } = bfKit();
  const list = Array.isArray(clients) ? clients : [];
  return <Part title={section || 'Client'} plain>
    <Select label={label || 'Client existant'} value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">— Sélectionner —</option>
      {list.map((client) => <option key={client.id} value={client.id}>{client.prenom} {client.nom}</option>)}
    </Select>
  </Part>;
}

function findClient(clients, id) {
  return (clients || []).find((client) => String(client.id) === String(id));
}

function fillFromClient(form, client, mode) {
  if (!client) {
    if (mode === 'company') return { ...form, client_id: '', patron: '', patron_telegram: '' };
    if (mode === 'fonds') return { ...form, client_id: '', full_name: '', telegram: '', address: '', birth_date: '', nationality: '' };
    return { ...form, client_id: '', prenom: '', nom: '', telegram: '', address: '', birth_date: '', nationality: '' };
  }
  const prenom = client.prenom || '';
  const nom = client.nom || '';
  const civility = client.civilite === 'Madame' ? 'Madame' : 'Monsieur';
  if (mode === 'company') {
    return {
      ...form,
      client_id: client.id,
      patron: `${prenom} ${nom}`.trim(),
      patron_telegram: client.telegram || '',
      address: client.adresse || '',
      company_name: client.entreprise || form.company_name || ''
    };
  }
  return {
    ...form,
    client_id: client.id,
    prenom,
    nom,
    full_name: `${prenom} ${nom}`.trim(),
    telegram: client.telegram || '',
    address: client.adresse || '',
    birth_date: client.date_naissance || '',
    nationality: client.nationalite || '',
    civility
  };
}

const DUE_TABS = [['tous', 'Tous'], ['retard', 'Retards'], ['aujourdhui', "Aujourd'hui"], ['avenir', 'À venir'], ['cloture', 'Clôturés']];
const FUND_TABS = [['tous', 'Tous'], ['ouvert', 'Ouverts'], ['pause', 'En pause'], ['fonds_clos', 'Clôturés']];
const HORSE_TABS = [['tous', 'Tous'], ['en_cours', 'En cours'], ['termine', 'Terminés'], ['refuse', 'Refusés']];
const SERVICE_CLOSED = new Set(['clos', 'paye', 'solde', 'anticipe']);
const LIFE_CLOSED = new Set(['closed', 'cancelled', 'paid_to_beneficiary']);
const LIFE_STATUS = {
  active: 'Versements en cours',
  payments_complete: '8 versements terminés',
  placed: 'Placement actif',
  closure_requested: 'Clôture demandée',
  closed: 'Clôturé',
  death_reported: 'Décès signalé',
  under_review: 'Vérification en cours',
  paid_to_beneficiary: 'Capital versé au bénéficiaire',
  cancelled: 'Annulé'
};
const CAT_COLOR = {
  retard: '#d76453', aujourdhui: '#db912e', avenir: '#4a9eff', cloture: '#3f9b67',
  ouvert: '#3f9b67', pause: '#e08a2a', fonds_clos: '#111111', en_cours: '#c9943c', termine: '#3f9b67', refuse: '#b94735', ajour: '#3f9b67'
};
const CAT_LABEL = {
  retard: 'En retard', aujourdhui: "Aujourd'hui", avenir: 'À venir', cloture: 'Clôturé',
  ouvert: 'Ouvert', pause: 'En pause', fonds_clos: 'Clôturé', en_cours: 'En cours', termine: 'Terminé', refuse: 'Refusé', ajour: 'À jour'
};

function bfDaysDiff(iso) {
  const day = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const left = new Date(`${day}T00:00:00`);
  const right = new Date();
  left.setHours(0, 0, 0, 0);
  right.setHours(0, 0, 0, 0);
  return Math.floor((left - right) / 86400000);
}
function dueState(date, closed) {
  if (closed) return 'cloture';
  const diff = bfDaysDiff(date);
  if (diff == null) return 'avenir';
  if (diff < 0) return 'retard';
  if (diff === 0) return 'aujourdhui';
  return 'avenir';
}
function personName(row) {
  return row.full_name || row.company_name || `${row.prenom || ''} ${row.nom || ''}`.trim() || row.patron || '—';
}
function agencyName(key) {
  return (bfKit().AGENCIES || {})[key] || '';
}
function serviceTabs(service) {
  if (service === 'speculative_funds') return FUND_TABS;
  if (service === 'term_savings') return [['tous', 'Tous'], ['retard', 'Retards'], ['aujourdhui', "Aujourd'hui"], ['ajour', 'À jour'], ['avenir', 'À venir'], ['cloture', 'Clôturés']];
  return DUE_TABS;
}
function termDueState(row, closed) {
  const category = dueState(row.echeance_date, closed);
  return row.validated && category === 'retard' ? 'ajour' : category;
}
function serviceSnapshot(service, row) {
  const closed = SERVICE_CLOSED.has(row.status) || (service === 'goldstein_booklets' && Number(row.balance) === 0);
  const name = personName(row);
  const telegram = row.telegram || row.patron_telegram || '';
  const ref = row.dossier_number || row.id;
  const agency = row.agency || '';
  let due = '';
  let dueCaption = 'Prochaine échéance';
  let left = bfFr(row.amount || 0);
  let leftLabel = 'Montant';
  let right = bfFr(row.amount_due || 0);
  let rightLabel = 'Dû';
  if (service === 'speculative_funds') {
    left = bfFr(row.amount); leftLabel = 'Souscrit';
    if (row.capital_balance != null) {
      right = bfFr(row.capital_balance); rightLabel = 'Capital';
    } else {
      right = row.tier || '—'; rightLabel = 'Palier';
    }
    dueCaption = 'Palier';
  } else if (service === 'pawn_loans') {
    due = row.echeance_date;
    left = bfFr(row.amount); leftLabel = 'Prêté';
    right = bfFr(row.amount_due || row.repayment); rightLabel = 'À rembourser';
    dueCaption = 'Date de saisie';
  } else if (service === 'consigne_contracts') {
    due = row.next_due;
    left = bfFr(row.weekly_total); leftLabel = 'Par semaine';
    right = bfFr(row.stored_value); rightLabel = 'Valeur déposée';
  } else if (service === 'term_savings') {
    due = row.echeance_date;
    left = bfFr(row.amount); leftLabel = 'Placé';
    if (row.settlement) {
      right = bfFr(row.settlement.net); rightLabel = 'Restitué';
    } else {
      right = bfFr(row.maturity_amount || row.amount_due); rightLabel = "À l'échéance";
    }
  } else if (service === 'payroll_contracts') {
    due = row.next_due;
    left = bfFr(row.payroll); leftLabel = 'Masse salariale';
    right = bfFr(row.installment_cost || row.amount_due); rightLabel = 'Échéance';
  } else if (service === 'goldstein_booklets') {
    due = row.next_capitalization;
    left = bfFr(row.balance); leftLabel = 'Somme restante';
    right = bfFr(row.period_interest); rightLabel = 'Intérêt 3 %';
    dueCaption = 'Prochaine capitalisation';
  }
  const category = service === 'speculative_funds'
    ? (row.status === 'pause' ? 'pause' : closed ? 'fonds_clos' : 'ouvert')
    : service === 'term_savings'
      ? termDueState(row, closed)
      : dueState(due, closed);
  const settled = category === 'cloture' || category === 'fonds_clos';
  const nextText = settled
    ? ''
    : service === 'speculative_funds'
      ? (latestMarketStatement(row) ? `${row.tier} · ${fundResult(latestMarketStatement(row).result_percent)}` : (row.tier || '—'))
      : service === 'goldstein_booklets'
        ? (due ? `${bfDate(due)} · solde prévu ${bfFr(row.next_balance)}` : '')
        : (due ? `${bfDate(due)}${service === 'consigne_contracts' ? '' : ` · ${right}`}` : '');
  return {
    category,
    shell: settled ? 'recouvrement-cloture' : '',
    color: settled ? '#111111' : (CAT_COLOR[category] || '#c9943c'),
    status: CAT_LABEL[category] || row.status || 'Ouvert',
    ref, name, telegram, agency, agencyLabel: agencyName(agency),
    left, leftLabel, right, rightLabel, dueCaption,
    nextText,
    complete: settled,
    doneText: service === 'term_savings' && row.settlement
      ? (row.settlement.kind === 'anticipe' ? '✓ Retrait anticipé' : '✓ Clôturé à terme')
      : ''
  };
}
function lifeSnapshot(row) {
  const closed = LIFE_CLOSED.has(row.status);
  const next = (row.payments || []).find((payment) => payment.status !== 'paid');
  const category = dueState(next && next.date, closed);
  const figures = row.financials || {};
  const special = !closed && row.status && !['active', 'payments_complete', 'placed'].includes(row.status);
  return {
    category,
    shell: closed ? 'recouvrement-cloture' : '',
    color: closed ? '#111111' : (CAT_COLOR[category] || '#c9943c'),
    status: special ? (LIFE_STATUS[row.status] || row.status) : (CAT_LABEL[category] || row.status),
    ref: row.contract_number || row.id,
    name: `${row.subscriber_first_name || ''} ${row.subscriber_last_name || ''}`.trim() || '—',
    telegram: row.subscriber_telegram || '',
    agency: row.agency || '',
    agencyLabel: agencyName(row.agency),
    left: bfFr(row.target_capital), leftLabel: 'Capital',
    right: bfFr(figures.balance), rightLabel: 'Solde suivi',
    dueCaption: next ? 'Prochaine échéance' : 'Versements',
    nextText: next ? `${bfDate(next.date)} · ${bfFr(next.amount)}` : (closed ? '' : 'Versements terminés'),
    complete: closed
  };
}
const FUND_RANK = { ouvert: 0, pause: 1, fonds_clos: 2 };
function fundNumber(row) {
  const digits = String(row.dossier_number || '').match(/(\d+)\s*$/);
  return digits ? Number(digits[1]) : Number.MAX_SAFE_INTEGER;
}
function fundOrder(left, right) {
  const rank = (FUND_RANK[serviceSnapshot('speculative_funds', left).category] ?? 9) - (FUND_RANK[serviceSnapshot('speculative_funds', right).category] ?? 9);
  if (rank) return rank;
  const number = fundNumber(left) - fundNumber(right);
  if (number) return number;
  return String(left.dossier_number || '').localeCompare(String(right.dossier_number || ''), 'fr');
}
function serviceSearch(service, row) {
  const card = serviceSnapshot(service, row);
  return [card.ref, card.name, card.telegram, card.agencyLabel, row.item_type, row.tier, row.company_name, row.patron].filter(Boolean).join(' ');
}

function OfferBoard({ kicker, title, note, action, rows, tabs, categoryOf, present, searchOf, agencyOf, agency, onAgency, onOpen, empty }) {
  const { useState, useEffect } = BFReact;
  const { Inp, Select } = bfKit();
  const [category, setCategory] = useState('tous');
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState(agency || 'toutes');
  useEffect(() => { setBank(agency || 'toutes'); }, [agency]);
  const scoped = (rows || []).filter((row) => {
    if (bank === 'toutes') return true;
    if (agencyOf) return agencyOf(row) === bank;
    if (row.agency === bank) return true;
    return Array.isArray(row.agencies) && row.agencies.includes(bank);
  });
  const needle = query.trim().toLowerCase();
  const visible = scoped
    .filter((row) => category === 'tous' || categoryOf(row) === category)
    .filter((row) => !needle || String(searchOf(row) || '').toLowerCase().includes(needle));
  const counts = {};
  tabs.forEach(([key]) => {
    counts[key] = key === 'tous' ? scoped.length : scoped.filter((row) => categoryOf(row) === key).length;
  });
  const tabLabel = (tabs.find((item) => item[0] === category) || ['', 'Tous'])[1];
  const bankLabel = bank === 'toutes' ? 'Toutes banques' : (agencyName(bank) || bank);
  return <div>
    <div className="bvh-loans-head">
      <div><small>{kicker}</small><h1>{title}</h1>{note ? <p>{note}</p> : null}</div>
      {action}
    </div>
    <div className="bvh-loan-filter-panel">
      <div className="bvh-loan-tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={'bvh-loan-tab ' + (category === key ? 'active ' : '') + key} onClick={() => setCategory(key)}><span>{label}</span><b>{counts[key] || 0}</b></button>)}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <Select label="Banque" value={bank} onChange={(event) => { setBank(event.target.value); onAgency?.(event.target.value); }}>
            <option value="toutes">Toutes les banques</option>
            {BF_AGENCY_ORDER.map((key) => <option key={key} value={key}>{agencyName(key) || key}</option>)}
          </Select>
        </div>
        <div className="bvh-loan-search"><Inp label="Recherche" placeholder="Client, référence, télégramme…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </div>
    </div>
    <div className="bvh-loan-filter-summary">
      <span>{tabLabel} · {bankLabel}</span>
      <b>{visible.length} résultat{visible.length === 1 ? '' : 's'}</b>
    </div>
    {visible.length === 0
      ? <div className="bvh-empty bvh-loan-empty">{empty}{query ? ' pour cette recherche' : ''}.</div>
      : <div className="bvh-loan-grid">{visible.map((row) => {
        const card = present(row);
        return <button key={row.id} type="button" className={'bvh-loan-card ' + card.category + (card.shell ? ' ' + card.shell : '')} onClick={() => onOpen(row)} style={{ '--loan-color': card.color }}>
          <div className="bvh-loan-card-top"><span className="bvh-loan-reference">{card.ref}</span><span className="bvh-loan-status" style={{ background: card.color }}>{card.status}</span></div>
          <b className="bvh-loan-client">{card.name}</b>
          <span className="bvh-loan-telegram">{card.telegram || 'Télégramme non indiqué'}</span>
          {card.agencyLabel ? <div className="bvh-mini-badges"><span className="bvh-mini-badge agence">🏦 {card.agencyLabel}</span></div> : null}
          <div className="bvh-loan-amounts"><span>{card.left} <i>{card.leftLabel}</i></span><span>{card.right} <i>{card.rightLabel}</i></span></div>
          {card.complete
            ? <div className="bvh-loan-next complete"><span>{card.doneCaption || 'Dossier soldé'}</span><b>{card.doneText || '✓ Clôturé'}</b></div>
            : <div className="bvh-loan-next"><span>{card.dueCaption}</span><b>{card.nextText || '—'}</b></div>}
        </button>;
      })}</div>}
  </div>;
}

function ficheLine(label, value, color) {
  return <p key={label}>{label} : <b style={color ? { color } : undefined}>{value || '—'}</b></p>;
}
function FicheShell({ reference, title, telegram, agencyLabel, onBack, badges, left, right, children, actions }) {
  return <div>
    <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#4d8fbd', cursor: 'pointer', marginBottom: 16 }}>← Retour</button>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h1>{title}</h1>
        <div className="bvh-mini-badges">
          {agencyLabel ? <span className="bvh-mini-badge agence">🏦 {agencyLabel}</span> : null}
          {badges}
        </div>
      </div>
      <code style={{ background: '#2a2d3e', padding: '5px 10px', borderRadius: 6, color: '#4d8fbd' }}>{reference}</code>
    </div>
    <div className="bvh-loan-detail-summary">
      <div>
        <p>📱 {telegram || '—'}</p>
        <p>Agence : <b>{agencyLabel || '—'}</b></p>
        {left}
      </div>
      <div>{right}</div>
    </div>
    {children}
    {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'end' }}>{actions}</div> : null}
  </div>;
}
function dossierSides(service, row) {
  const position = service === 'speculative_funds' ? bfFundPosition(row) : null;
  if (service === 'speculative_funds') {
    return {
      left: [['Palier', row.tier || '—'], ['Dernière séance', latestMarketStatement(row) ? `${bfDate(latestMarketStatement(row).on)} · ${fundResult(latestMarketStatement(row).result_percent)}` : '—'], ['Régime', (latestMarketStatement(row) && latestMarketStatement(row).regime_label) || '—'], ['Distribution', row.profit_distribution || '—'], ['Origine des fonds', row.funds_origin || '—'], ['Souscription', bfDate(row.signed_on)]],
      right: [['Souscrit', bfFr(row.amount), '#f3d58a'], ['Capital', row.capital_balance == null ? '—' : bfFr(row.capital_balance), '#f3d58a'], ['Sommes versées', bfFr(position.basis)], ['Bénéfice', bfFr(position.profit), '#74d59d']]
    };
  }
  if (service === 'pawn_loans') {
    return {
      left: [['Bien', row.item_type || '—'], ['Description', row.item_description || '—'], ['Taux', row.rate != null ? `${row.rate} %` : '—']],
      right: [['Prêté', bfFr(row.amount), '#f3d58a'], ['À rembourser', bfFr(row.amount_due || row.repayment), '#f3d58a'], ['Saisie', bfDate(row.echeance_date)]]
    };
  }
  if (service === 'consigne_contracts') {
    return {
      left: [['Couverture', row.coverage || '—'], ['Accès', row.access || '—'], ['Prochaine échéance', bfDate(row.next_due)]],
      right: [['Par semaine', bfFr(row.weekly_total), '#f3d58a'], ['Valeur déposée', bfFr(row.stored_value)], ['Dû aujourd’hui', bfFr(row.due_today)]]
    };
  }
  if (service === 'term_savings') {
    return {
      left: [['Durée', row.weeks ? `${row.weeks} semaines` : '—'], ['Échéance', bfDate(row.echeance_date)], ['Dossier', row.validated ? `Validé le ${bfDate(row.validated_on)}` : 'À valider'], ['Taux de retrait anticipé', row.early_rate != null ? `${row.early_rate} %` : '—'], ['Règlement', row.settlement ? (row.settlement.kind === 'anticipe' ? 'Retrait anticipé' : 'Clôture à l’échéance') : 'En cours']],
      right: [['Placé', bfFr(row.amount), '#f3d58a'], ['À l’échéance', bfFr(row.maturity_amount || row.amount_due), '#f3d58a'], ['Frais de retrait', bfFr(row.early_fee)], ['Restitué', row.settlement ? bfFr(row.settlement.net) : '—', '#74d59d']]
    };
  }
  if (service === 'payroll_contracts') {
    return {
      left: [['Entreprise', row.company_name || '—'], ['Patron', row.patron || '—'], ['Prochaine échéance', bfDate(row.next_due)]],
      right: [['Masse salariale', bfFr(row.payroll), '#f3d58a'], ['Échéance', bfFr(row.installment_cost || row.amount_due), '#f3d58a'], ['Gestion', bfFr(row.management_fee)], ['Virement', bfFr(row.transfer_fee)]]
    };
  }
  return {
    left: [['Prochaine capitalisation', bfDate(row.next_capitalization)]],
    right: [['Somme restante', bfFr(row.balance), '#f3d58a'], ['Intérêt 3 %', bfFr(row.period_interest)], ['Solde prévu', bfFr(row.next_balance), '#74d59d']]
  };
}
function DueLedger({ title, rows }) {
  const Badge = bfKit().Badge;
  if (!rows || !rows.length) return null;
  return <div className="bvh-ledger"><div className="bvh-ledger-title">{title}</div>
    {rows.map((item) => <div className="bvh-reminder-row bvh-echeance-row" key={item.key}>
      <span className="bvh-reminder-number">#{item.number}</span>
      <b>{item.amount}</b>
      <span>{item.date}</span>
      {Badge ? <Badge s={item.state} /> : null}
      <div className="bvh-reminder-latest">{item.done ? <span className="bvh-reminder-paid">{item.done}</span> : <b>{item.pending || 'En attente'}</b>}</div>
      {item.action ? <div className="bvh-reminder-actions">{item.action}</div> : null}
    </div>)}
  </div>;
}
function dueStateOf(date, done) {
  if (done) return 'paye';
  const diff = bfDaysDiff(date);
  if (diff == null) return 'avenir';
  if (diff < 0) return 'retard';
  if (diff === 0) return 'aujourdhui';
  return 'avenir';
}
const DUE_RANK = { retard: 0, aujourdhui: 1, ajour: 2, avenir: 2, en_cours: 2, cloture: 3, termine: 3, refuse: 4, ouvert: 2, pause: 1, fonds_clos: 3 };
function serviceOrder(service) {
  return (left, right) => {
    const rank = (DUE_RANK[serviceSnapshot(service, left).category] ?? 9) - (DUE_RANK[serviceSnapshot(service, right).category] ?? 9);
    if (rank) return rank;
    const leftDate = left.echeance_date || left.next_due || left.next_capitalization || '9999-12-31';
    const rightDate = right.echeance_date || right.next_due || right.next_capitalization || '9999-12-31';
    const compared = String(leftDate).localeCompare(String(rightDate));
    if (compared) return compared;
    return String(serviceSnapshot(service, left).ref).localeCompare(String(serviceSnapshot(service, right).ref), 'fr', { numeric: true });
  };
}

function ServiceDesk({ service, notify, activeAgence, onActiveAgenceChange, clients }) {
  const { useState, useEffect } = BFReact;
  const { Btn, Inp } = bfKit();
  const spec = BF_SERVICES[service];
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(spec.blank());
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [movement, setMovement] = useState('');
  const [agency, setAgency] = useState(activeAgence || 'toutes');
  const [market, setMarket] = useState(null);
  useEffect(() => { setAgency(activeAgence || 'toutes'); }, [activeAgence]);
  async function load() {
    const data = await bfKit().api.service(spec.route);
    setRows(Array.isArray(data) ? data : []);
    if (service === 'speculative_funds') {
      try { setMarket(await bfKit().api.service('fonds_market')); } catch (error) { setMarket(null); }
    } else setMarket(null);
  }
  useEffect(() => { load().catch((error) => notify('⚠ ' + error.message)); }, [service]);
  const preview = spec.preview(form);
  async function save() {
    try {
      setBusy(true);
      const saved = await bfKit().api.saveService(spec.route, spec.payload(form));
      setRows([saved, ...rows.filter((row) => row.id !== saved.id)]);
      setSelected(saved);
      setOpen(false);
      setForm(spec.blank());
      notify('Dossier enregistré');
    } catch (error) {
      notify('⚠ ' + error.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action, extra) {
    if (!selected || busy) return false;
    try {
      setBusy(true);
      const saved = await bfKit().api.saveService(spec.route, { id: selected.id, action, ...extra }, 'PUT');
      setRows(rows.map((row) => row.id === saved.id ? saved : row));
      setSelected(saved);
      notify('Dossier mis à jour');
      return true;
    } catch (error) {
      notify('⚠ ' + error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function moveFunds(action) {
    if (await act(action, { amount: movement })) setMovement('');
  }
  function begin() {
    const next = spec.blank();
    const scope = agency && agency !== 'toutes' ? agency : '';
    if (scope) {
      if (spec.clientMode === 'company') next.agencies = [scope];
      else next.agency = scope;
    }
    setForm(next);
    setOpen(true);
  }
  function chooseAgency(value) {
    setAgency(value);
    if (onActiveAgenceChange) onActiveAgenceChange(value);
  }
  const mode = spec.clientMode || 'person';
  const formPopup = open && <FormPopup title={spec.create.replace(/^\+\s*/, '')} onClose={() => setOpen(false)}>
      <ClientSelect clients={clients} value={form.client_id} label={mode === 'company' ? 'Patron existant' : 'Client existant'} onChange={(id) => setForm(fillFromClient(form, findClient(clients, id), mode))} />
      {spec.form(form, setForm)}
      <Part title="Calcul" plain>
        {Object.entries(preview).map(([label, value]) => <div className="bvh-field" key={label}><b>{label}</b><span>{value}</span></div>)}
      </Part>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <Btn color="#555" disabled={busy} onClick={() => setOpen(false)}>Annuler</Btn>
        <Btn disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </FormPopup>;
  if (selected) {
    const card = serviceSnapshot(service, selected);
    const sides = dossierSides(service, selected);
    const closed = card.complete;
    const termOpen = service === 'term_savings' && !selected.settlement && selected.status !== 'paye' && selected.status !== 'clos' && selected.status !== 'anticipe';
    const dueRows = service === 'pawn_loans' || service === 'term_savings'
      ? [{
          key: 'echeance',
          number: 1,
          amount: card.right,
          date: bfDate(selected.echeance_date),
          state: service === 'term_savings' ? termDueState(selected, closed) : dueStateOf(selected.echeance_date, closed),
          done: closed ? (service === 'term_savings' && selected.settlement ? (selected.settlement.kind === 'anticipe' ? 'Retrait anticipé' : 'Clôturé à l\'échéance') : 'Échéance réglée') : '',
          pending: 'En attente'
        }]
      : service === 'consigne_contracts'
        ? [{ key: 'echeance', number: 1, amount: bfFr(selected.weekly_total), date: bfDate(selected.next_due), state: dueStateOf(selected.next_due, closed), done: closed ? 'Échéance réglée' : '', pending: 'Location à encaisser' }]
        : service === 'payroll_contracts'
          ? [{ key: 'echeance', number: 1, amount: bfFr(selected.installment_cost || selected.amount_due), date: bfDate(selected.next_due), state: dueStateOf(selected.next_due, closed), done: closed ? 'Échéance réglée' : '', pending: 'Échéance à venir' }]
          : [];
    return <FicheShell
      reference={card.ref}
      title={card.name}
      telegram={card.telegram}
      agencyLabel={card.agencyLabel}
      onBack={() => setSelected(null)}
      left={sides.left.map(([label, value]) => ficheLine(label, value))}
      right={sides.right.map(([label, value, color]) => ficheLine(label, value, color))}
      actions={<>
        {service === 'speculative_funds' && selected.status === 'pause' && <Btn disabled={busy} onClick={() => act('resume')}>Reprendre</Btn>}
        {service === 'speculative_funds' && selected.status !== 'pause' && selected.status !== 'clos' && selected.status !== 'paye' && <Btn color="#555" disabled={busy} onClick={() => act('pause')}>Mettre en pause</Btn>}
        {service === 'speculative_funds' && selected.status !== 'clos' && selected.status !== 'paye' && <>
          <Inp label="Montant" type="number" value={movement} onChange={(event) => setMovement(event.target.value)} />
          <Btn disabled={busy} onClick={() => moveFunds('deposit')}>Ajouter des fonds</Btn>
          <Btn color="#8b642c" disabled={busy} onClick={() => moveFunds('withdraw')}>Retirer</Btn>
          <span style={{ flexBasis: '100%', color: '#c9a567', fontSize: 13 }}>{fundMoveHint(selected, movement)}</span>
        </>}
        {termOpen && <>
          <Btn color="#4a9eff" disabled={busy || selected.validated} onClick={() => act('validate_dossier')}>{selected.validated ? 'Dossier validé' : 'Valider le dossier'}</Btn>
          <Btn color="#ff4444" disabled={busy} onClick={() => act('early_withdrawal')}>Retrait anticipé</Btn>
          <Btn color="#2ecc71" disabled={busy} onClick={() => act('close_term')}>Valider le paiement</Btn>
          <span style={{ flexBasis: '100%', color: '#c9a567', fontSize: 13 }}>{termHint(selected)}</span>
        </>}
        {spec.payable && selected.status !== 'paye' && selected.status !== 'clos' && selected.status !== 'pause' && <Btn onClick={() => act('mark_paid')}>Valider paiement</Btn>}
        {spec.closable && selected.status !== 'clos' && selected.status !== 'pause' && <Btn color="#555" onClick={() => act('close')}>Clôturer</Btn>}
        {spec.savings && selected.status !== 'solde' && <>
          <Inp label="Mouvement" type="number" value={movement} onChange={(event) => setMovement(event.target.value)} />
          <Btn onClick={() => act('deposit', { amount: movement })}>Versement</Btn>
          <Btn color="#8b642c" onClick={() => act('withdraw', { amount: movement })}>Retrait</Btn>
        </>}
      </>}
    >
      {dueRows.length > 0 && <DueLedger title="Échéance" rows={dueRows} />}
      {service === 'goldstein_booklets' && Array.isArray(selected.movements) && selected.movements.length > 0 && <div className="bvh-ledger" style={{ marginTop: 16 }}><div className="bvh-ledger-title">Mouvements</div>
        {selected.movements.map((item, index) => <div className="bvh-reminder-row" key={`${item.on || 'mouvement'}-${index}`}><span className="bvh-reminder-number">#{index + 1}</span><b>{item.type || 'mouvement'}</b><span>{bfDate(item.on)}</span><span>{bfFr(item.amount)}</span><div className="bvh-reminder-latest"><b>Solde {bfFr(item.balance)}</b></div></div>)}
      </div>}
      {service === 'speculative_funds' && <FundStatements statements={selected.statements} deposits={selected.deposits} withdrawals={fundWithdrawals(selected)} />}
    </FicheShell>;
  }
  const listed = service === 'speculative_funds' ? rows.slice().sort(fundOrder) : rows.slice().sort(serviceOrder(service));
  return <div>
    {formPopup}
    {service === 'speculative_funds' && <MarketBoard market={market} />}
    <OfferBoard
      kicker={spec.kicker}
      title={spec.title}
      note={spec.note}
      action={<Btn onClick={begin}>{spec.create}</Btn>}
      rows={listed}
      tabs={serviceTabs(service)}
      categoryOf={(row) => serviceSnapshot(service, row).category}
      present={(row) => serviceSnapshot(service, row)}
      searchOf={(row) => serviceSearch(service, row)}
      agency={agency}
      onAgency={chooseAgency}
      onOpen={setSelected}
      empty="Aucun dossier dans cette catégorie"
    />
  </div>;
}

function bind(form, setForm) {
  return (key) => (event) => setForm({ ...form, [key]: event.target.value });
}
function identityFields(form, setForm, options = {}) {
  const { Inp, Select } = bfKit();
  const on = bind(form, setForm);
  return <>
    <Inp label="Date du jour" type="date" value={form.signed_on || ''} onChange={on('signed_on')} />
    {options.fullName
      ? <Inp label="Nom complet" value={form.full_name || ''} onChange={on('full_name')} />
      : <><Inp label="Prénom" value={form.prenom || ''} onChange={on('prenom')} /><Inp label="Nom" value={form.nom || ''} onChange={on('nom')} /></>}
    <Select label="État civil" value={form.civility || 'Monsieur'} onChange={on('civility')}><option>Monsieur</option><option>Madame</option></Select>
    <Inp label="Date de naissance" type="date" value={form.birth_date || ''} onChange={on('birth_date')} />
    <Inp label="Nationalité" value={form.nationality || ''} onChange={on('nationality')} />
    <Inp label="Télégramme" value={form.telegram || ''} onChange={on('telegram')} />
    {options.address && <Span><Inp label="Adresse résidentielle" value={form.address || ''} onChange={on('address')} /></Span>}
  </>;
}

const BF_SERVICES = {
  speculative_funds: {
    route: 'speculative_funds', title: 'Fonds spéculatifs', kicker: 'Souscription', create: '+ Nouvelle souscription', clientMode: 'fonds',
    blank: () => ({ civility: 'Monsieur', tier: 'Palier I', own_account: true, declare_risks: false, declare_past: false, declare_accuracy: false, declare_terms: false }),
    preview: (form) => ({ 'Résultat hebdomadaire': 'Tirage du palier, chaque vendredi à 18 h', Palier: form.tier || '', 'Montant souscrit': bfFr(form.amount) }),
    payload: (form) => form,
    form: (form, setForm) => {
      const { Inp, Select } = bfKit();
      const on = bind(form, setForm);
      return <>
        <Part title="Identité">
          <AgencySelect value={form.agency} onChange={on('agency')} />
          {identityFields(form, setForm, { fullName: true, address: true })}
        </Part>
        <Part title="Profil d'investissement">
          <Inp label="Expérience" value={form.experience || ''} onChange={on('experience')} />
          <Inp label="Durée envisagée" value={form.horizon || ''} onChange={on('horizon')} />
          <Span><Inp label="Objectifs" value={form.objectives || ''} onChange={on('objectives')} /></Span>
        </Part>
        <Part title="Souscription">
          <Select label="Palier" value={form.tier || 'Palier I'} onChange={on('tier')}><option>Palier I</option><option>Palier II</option><option>Palier III</option></Select>
          <Inp label="Montant souscrit" type="number" value={form.amount || ''} onChange={on('amount')} />
          <Inp label="Distribution des profits" value={form.profit_distribution || ''} onChange={on('profit_distribution')} />
          <Inp label="Mode de versement" value={form.payment_mode || ''} onChange={on('payment_mode')} />
          <Inp label="Identification bancaire" value={form.bank_id || ''} onChange={on('bank_id')} />
          <Inp label="Origine des fonds" value={form.funds_origin || ''} onChange={on('funds_origin')} />
          <Inp label="Patrimoine estimé" type="number" value={form.estimated_wealth || ''} onChange={on('estimated_wealth')} />
        </Part>
        <Part title="Déclarations" plain>
          <Flag label="Investit pour son propre compte" checked={form.own_account} onChange={(value) => setForm({ ...form, own_account: value })} />
          <Flag label="Recommandé par un client ou partenaire" checked={form.recommended} onChange={(value) => setForm({ ...form, recommended: value })} />
          <Flag label="Risques reconnus" checked={form.declare_risks} onChange={(value) => setForm({ ...form, declare_risks: value })} />
          <Flag label="Performances passées non garantes" checked={form.declare_past} onChange={(value) => setForm({ ...form, declare_past: value })} />
          <Flag label="Exactitude des informations" checked={form.declare_accuracy} onChange={(value) => setForm({ ...form, declare_accuracy: value })} />
          <Flag label="Conditions générales acceptées" checked={form.declare_terms} onChange={(value) => setForm({ ...form, declare_terms: value })} />
        </Part>
      </>;
    }
  },
  pawn_loans: {
    route: 'pawn_loans', title: 'Prêt sur gage', kicker: 'Bien déposé', create: '+ Nouveau gage', payable: true,
    blank: () => ({ civility: 'Monsieur', rate_mode: '15' }),
    preview: (form) => {
      const rate = form.rate_mode === 'autre' ? Number(form.rate) : 15;
      return { 'Taux retenu': `${rate} %`, 'Remboursement demandé': bfFr(bfPayment(form.amount, rate, 1)), 'Date limite de saisie': bfDate(bfAddDays(form.signed_on, 7)) };
    },
    payload: (form) => form,
    form: (form, setForm) => {
      const { Inp, Txt } = bfKit();
      const on = bind(form, setForm);
      return <>
        <Part title="Identité">
          <AgencySelect value={form.agency} onChange={on('agency')} label="Agence" />
          {identityFields(form, setForm)}
        </Part>
        <Part title="Bien déposé">
          <Inp label="Type de bien" value={form.item_type || ''} onChange={on('item_type')} />
          <Inp label="Prix de base" type="number" value={form.base_price || ''} onChange={on('base_price')} />
          <Span><Txt label="Description détaillée" value={form.item_description || ''} onChange={on('item_description')} /></Span>
          <Span><p style={{ color: '#c9a567', margin: 0 }}>Numéro de série, nom sur l'étiquette, etc.</p></Span>
        </Part>
        <Part title="Prêt">
          <Inp label="Montant prêté" type="number" value={form.amount || ''} onChange={on('amount')} />
          {form.rate_mode === 'autre' && <Inp label="Taux exceptionnel (%)" type="number" value={form.rate || ''} onChange={on('rate')} />}
          <Span><Choice label="Taux d'intérêt de remboursement" value={form.rate_mode || '15'} options={[{ value: '15', label: '15 %' }, { value: 'autre', label: 'autre (cas exceptionnel)' }]} onChange={(value) => setForm({ ...form, rate_mode: value })} /></Span>
        </Part>
      </>;
    }
  },
  consigne_contracts: {
    route: 'consigne_contracts', title: 'Location de consigne', kicker: 'Coffre', create: '+ Nouvelle consigne', closable: true,
    note: 'Banques de consigne : Blackwater, Rhodes, Valentine, Van Horn, Sunset City, Saint Denis.',
    blank: () => ({ civility: 'Monsieur', coverage: 'standard', access: 'individuel' }),
    preview: (form) => {
      const plus = { standard: 5, renforcee: 15, premium: 35 }[form.coverage];
      let weekly = plus == null ? 0 : 25 + plus;
      if (form.agency === 'saint_denis') weekly += 10;
      if (form.agency === 'van_horn' || form.agency === 'sunset') weekly -= 5;
      const fee = form.dossier_offered ? 0 : 10;
      return { 'Total par semaine': bfFr(weekly), "Total à régler aujourd'hui": bfFr(fee), "Frais d'assurance supplémentaires": bfFr(0), 'Prochaine échéance': bfDate(bfAddDays(form.signed_on, 7)) };
    },
    payload: (form) => form,
    form: (form, setForm) => {
      const { Inp } = bfKit();
      const on = bind(form, setForm);
      return <>
        <Part title="Identité">
          <AgencySelect consigne value={form.agency} onChange={on('agency')} label="Banque de la consigne" />
          {identityFields(form, setForm, { address: true })}
        </Part>
        <Part title="Coffre">
          <Inp label="Valeur approximative du contenu" type="number" value={form.stored_value || ''} onChange={on('stored_value')} />
          <Span><Choice label="Couverture" value={form.coverage || 'standard'} options={[{ value: 'standard', label: 'Standard (25 % / +5 $)' }, { value: 'renforcee', label: 'Renforcée (50 % / +15 $)' }, { value: 'premium', label: 'Premium (100 % / +35 $)' }]} onChange={(value) => setForm({ ...form, coverage: value })} /></Span>
          <Span><p style={{ color: '#c9a567', margin: 0 }}>Protection : vol. L'accès frauduleux n'est couvert qu'avec la formule Premium.</p></Span>
        </Part>
        <Part title="Accès">
          <Span><Choice label="Accès au coffre" value={form.access || 'individuel'} options={[{ value: 'individuel', label: 'Individuel' }, { value: 'partagé', label: 'Partagé' }, { value: 'rendez-vous', label: 'Rendez-vous bancaire uniquement' }]} onChange={(value) => setForm({ ...form, access: value })} /></Span>
          {form.access === 'partagé' && <>
            <Inp label="Noms et prénoms autorisés" value={form.shared_names || ''} onChange={on('shared_names')} />
            <Inp label="Télégramme des autorisés" value={form.shared_telegram || ''} onChange={on('shared_telegram')} />
            <Span><Inp label="Lien avec le titulaire" value={form.shared_link || ''} onChange={on('shared_link')} /></Span>
          </>}
          <Span><Flag label="Offrir les frais de dossier (0 $ au lieu de 10 $)" checked={form.dossier_offered} onChange={(value) => setForm({ ...form, dossier_offered: value })} /></Span>
        </Part>
      </>;
    }
  },
  term_savings: {
    route: 'term_savings', title: 'Épargne à terme', kicker: 'Souscription', create: '+ Nouvelle souscription',
    blank: () => ({ weeks: '4', payment_mode: 'Transfert bancaire', origin: 'Revenus professionnels' }),
    preview: (form) => {
      const rates = { 1: 2, 2: 4.5, 4: 10, 8: 22 };
      const days = { 1: 7, 2: 14, 4: 28, 8: 56 };
      const rate = rates[form.weeks];
      return { 'Taux garanti': rate == null ? '' : `${rate} %`, "Montant à l'échéance": bfFr(bfPayment(form.amount, rate, 1)), "Date de l'échéance": bfDate(bfAddDays(form.signed_on, days[form.weeks] || 0)), 'Taux de retrait anticipé': rate == null ? '' : `${bfMoney(rate * 2)} %`, 'Frais de retrait anticipé': bfFr(bfMoney(Number(form.amount) * (rate || 0) * 2 / 100)), 'Délai de réponse': '3 jours' };
    },
    payload: (form) => form,
    form: (form, setForm) => {
      const { Inp } = bfKit();
      const on = bind(form, setForm);
      const origins = ['Revenus professionnels', 'Épargne personnelle', "Vente d'actifs", 'Autres'].map((value) => ({ value, label: value }));
      return <>
        <Part title="Identité">
          <AgencySelect value={form.agency} onChange={on('agency')} />
          {identityFields(form, setForm)}
        </Part>
        <Part title="Versement">
          <Span><Choice label="Origine des fonds" value={form.origin || ''} options={origins} onChange={(value) => setForm({ ...form, origin: value })} /></Span>
          {form.origin === 'Autres' && <Inp label="Précision" value={form.origin_other || ''} onChange={on('origin_other')} />}
          <Span><Choice label="Mode de versement" value={form.payment_mode || ''} options={[{ value: 'Transfert bancaire', label: 'Transfert bancaire' }, { value: 'Espèces', label: 'Espèces' }]} onChange={(value) => setForm({ ...form, payment_mode: value })} /></Span>
          <Inp label="Identification bancaire" value={form.bank_id || ''} onChange={on('bank_id')} />
        </Part>
        <Part title="Placement">
          <Span><Choice label="Durée" value={String(form.weeks || '')} options={[{ value: '1', label: '1 semaine' }, { value: '2', label: '2 semaines' }, { value: '4', label: '4 semaines' }, { value: '8', label: '8 semaines' }]} onChange={(value) => setForm({ ...form, weeks: value })} /></Span>
          <Inp label="Montant souscrit" type="number" value={form.amount || ''} onChange={on('amount')} />
        </Part>
        <Part title="Déclarations" plain>
          <Flag label="Exactitude des informations" checked={form.declare_accuracy} onChange={(value) => setForm({ ...form, declare_accuracy: value })} />
          <Flag label="Acceptation des frais de retrait anticipé" checked={form.declare_early} onChange={(value) => setForm({ ...form, declare_early: value })} />
          <Flag label="Rupture si pas de réponse par télégramme dans le délai" checked={form.declare_silence} onChange={(value) => setForm({ ...form, declare_silence: value })} />
          <Flag label="Rupture si casier judiciaire avant l'échéance" checked={form.declare_record} onChange={(value) => setForm({ ...form, declare_record: value })} />
          <Flag label="Rupture si décès avant l'échéance" checked={form.declare_death} onChange={(value) => setForm({ ...form, declare_death: value })} />
          <Flag label="Prise de connaissance des conditions générales" checked={form.declare_terms} onChange={(value) => setForm({ ...form, declare_terms: value })} />
        </Part>
      </>;
    }
  },
  payroll_contracts: {
    route: 'payroll_contracts', title: 'Gestion de paie', kicker: 'Mandat salarial', create: '+ Nouveau mandat', closable: true, clientMode: 'company',
    blank: () => ({ frequency: 'Hebdomadaire', advances: 'Non', company_type: 'Privée', history: 'nouveau', agencies: [], unit_fee: 5 }),
    preview: (form) => {
      const count = Math.max(0, Math.trunc(Number(form.employees) || 0));
      const unit = Math.max(5, Number(form.unit_fee) || 5);
      const management = bfMoney(count * unit);
      const transfer = bfMoney(Number(form.payroll) * 0.1);
      return { 'Frais de gestion': bfFr(management), 'Frais de virement': bfFr(transfer), 'Coût estimé par échéance': bfFr(management + transfer) };
    },
    payload: (form) => form,
    form: (form, setForm) => {
      const { Inp, Txt, AGENCIES } = bfKit();
      const on = bind(form, setForm);
      const commitments = { commit_accuracy: 'Exactitude des informations', commit_lists: 'Transmission des listes salariales dans les délais', commit_funds: 'Approvisionnement des fonds', commit_advances: 'Garantie des sommes avancées', commit_information: 'Responsabilité des informations', commit_employees: 'Transmission de la liste des salariés', commit_terms: 'Acceptation des conditions du contrat' };
      return <>
        <Part title="Entreprise">
          <Inp label="Date du jour" type="date" value={form.signed_on || ''} onChange={on('signed_on')} />
          <Inp label="Raison sociale" value={form.company_name || ''} onChange={on('company_name')} />
          <Inp label="Date de création de l'entreprise" type="date" value={form.company_created || ''} onChange={on('company_created')} />
          <Inp label="Numéro de compte" value={form.account || ''} onChange={on('account')} />
          <Span><Inp label="Adresse du siège social" value={form.address || ''} onChange={on('address')} /></Span>
          <Span><Choice label="Secteur" value={form.sector || ''} options={['Commerce', 'Transport', 'Exploitation minière', 'Maison de jeux', 'Journal', 'Agriculture/Élevage', 'Autre'].map((value) => ({ value, label: value }))} onChange={(value) => setForm({ ...form, sector: value })} /></Span>
          {form.sector === 'Autre' && <Inp label="Précision du secteur" value={form.sector_other || ''} onChange={on('sector_other')} />}
          <Span><Choice label="Type" value={form.company_type || 'Privée'} options={[{ value: 'Privée', label: 'Privée' }, { value: 'Publique', label: 'Publique' }]} onChange={(value) => setForm({ ...form, company_type: value })} /></Span>
        </Part>
        <Part title="Dirigeants">
          <Inp label="Patron" value={form.patron || ''} onChange={on('patron')} />
          <Inp label="Télégramme du patron" value={form.patron_telegram || ''} onChange={on('patron_telegram')} />
          <Inp label="Co-patron" value={form.copatron || ''} onChange={on('copatron')} />
          <Inp label="Télégramme du co-patron" value={form.copatron_telegram || ''} onChange={on('copatron_telegram')} />
        </Part>
        <Part title="Mandat salarial">
          <Inp label="Date de début" type="date" value={form.start_date || ''} onChange={on('start_date')} />
          <Inp label="Nombre d'employés" type="number" value={form.employees || ''} onChange={on('employees')} />
          <Inp label="Masse salariale hebdomadaire" type="number" value={form.payroll || ''} onChange={on('payroll')} />
          <Inp label="Tarif unitaire de gestion (minimum 5 $)" type="number" value={form.unit_fee || 5} onChange={on('unit_fee')} />
          <Span><Choice label="Fréquence" value={form.frequency || 'Hebdomadaire'} options={[{ value: 'Hebdomadaire', label: 'Hebdomadaire' }, { value: 'Autre', label: 'Autre' }]} onChange={(value) => setForm({ ...form, frequency: value })} /></Span>
          {form.frequency === 'Autre' && <Inp label="Précision" value={form.frequency_other || ''} onChange={on('frequency_other')} />}
          <Span><Choice label="Avances sur salaires" value={form.advances || 'Non'} options={[{ value: 'Oui', label: 'Oui' }, { value: 'Non', label: 'Non' }, { value: 'Autre', label: 'Autre' }]} onChange={(value) => setForm({ ...form, advances: value })} /></Span>
          {form.advances === 'Oui' && <Inp label="Plafond par employé" type="number" value={form.advance_cap || ''} onChange={on('advance_cap')} />}
          <Span><Txt label="Conditions particulières" value={form.special_terms || ''} onChange={on('special_terms')} /></Span>
          <Span><Flag label="La liste complète des employés est jointe" checked={form.list_attached} onChange={(value) => setForm({ ...form, list_attached: value })} /></Span>
          {form.list_attached && <Span><input type="file" onChange={(event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => setForm({ ...form, employees_file: { filename: file.name, mime: file.type, content_base64: String(reader.result || '').split(',')[1] || '' } });
            reader.readAsDataURL(file);
          }} /></Span>}
        </Part>
        <Part title="Garanties">
          <Inp label="Liquidités disponibles" type="number" value={form.liquidity || ''} onChange={on('liquidity')} />
          <Span><Txt label="Biens ou actifs en garantie" value={form.collateral_assets || ''} onChange={on('collateral_assets')} /></Span>
          <Span><Choice label="Historique" value={form.history || 'nouveau'} options={[{ value: 'nouveau', label: 'Nouveau client' }, { value: 'existant', label: 'Client déjà dans les archives' }]} onChange={(value) => setForm({ ...form, history: value })} /></Span>
        </Part>
        <Part title="Succursales" plain>
          <Checks label="Succursales en charge" values={form.agencies || []} options={BF_AGENCY_ORDER.map((key) => ({ value: key, label: (AGENCIES || {})[key] || key }))} onChange={(values) => setForm({ ...form, agencies: values })} />
        </Part>
        <Part title="Engagements" plain>
          {Object.entries(commitments).map(([key, label]) => <Flag key={key} label={label} checked={form[key]} onChange={(value) => setForm({ ...form, [key]: value })} />)}
        </Part>
        <Part title="Contrôles" plain>
          <Flag label="Falsification = fraude financière" checked={form.control_fraud} onChange={(value) => setForm({ ...form, control_fraud: value })} />
          <Flag label="Contrôles de la réserve fédérale" checked={form.control_reserve} onChange={(value) => setForm({ ...form, control_reserve: value })} />
          <Flag label="Transmission aux autorités en cas d'anomalie ou de fraude" checked={form.control_authorities} onChange={(value) => setForm({ ...form, control_authorities: value })} />
        </Part>
      </>;
    }
  },
  goldstein_booklets: {
    route: 'goldstein_booklets', title: "Livret d'épargne Goldstein", kicker: 'Livret', create: '+ Nouveau livret', savings: true,
    blank: () => ({ civility: 'Monsieur', payment_mode: 'Transfert bancaire', origin: 'Revenus professionnels' }),
    preview: (form) => {
      const interest = bfMoney(Number(form.opening_amount) * 0.03);
      return { Règle: '+3 % de la somme restante, toutes les deux semaines', 'Prochaine capitalisation': bfDate(bfAddDays(form.signed_on, 14)), 'Intérêt de la période': bfFr(interest), 'Somme après capitalisation': bfFr(bfMoney(Number(form.opening_amount) + interest)) };
    },
    payload: (form) => form,
    form: (form, setForm) => {
      const { Inp } = bfKit();
      const on = bind(form, setForm);
      return <>
        <Part title="Identité">
          <AgencySelect value={form.agency} onChange={on('agency')} />
          {identityFields(form, setForm, { address: true })}
        </Part>
        <Part title="Versement">
          <Span><Choice label="Origine des fonds" value={form.origin || ''} options={['Revenus professionnels', 'Épargne personnelle', "Vente d'actifs", 'Autres'].map((value) => ({ value, label: value }))} onChange={(value) => setForm({ ...form, origin: value })} /></Span>
          {form.origin === 'Autres' && <Inp label="Précision" value={form.origin_other || ''} onChange={on('origin_other')} />}
          <Span><Choice label="Mode de versement" value={form.payment_mode || ''} options={[{ value: 'Transfert bancaire', label: 'Transfert bancaire' }, { value: 'Espèces', label: 'Espèces' }]} onChange={(value) => setForm({ ...form, payment_mode: value })} /></Span>
          <Inp label="Identification bancaire" value={form.bank_id || ''} onChange={on('bank_id')} />
          <Inp label="Premier versement" type="number" value={form.opening_amount || ''} onChange={on('opening_amount')} />
        </Part>
        <Part title="Déclarations" plain>
          <Flag label="Exactitude des informations" checked={form.declare_accuracy} onChange={(value) => setForm({ ...form, declare_accuracy: value })} />
          <Flag label="Connaissance de la règle des 3 % toutes les deux semaines" checked={form.declare_rule} onChange={(value) => setForm({ ...form, declare_rule: value })} />
          <Flag label="Prise de connaissance des conditions générales" checked={form.declare_terms} onChange={(value) => setForm({ ...form, declare_terms: value })} />
        </Part>
      </>;
    }
  }
};

function LifeDesk(props) {
  const { useState, useEffect } = BFReact;
  const { contracts, setContracts, notify, activeAgence, onActiveAgenceChange, clients } = props;
  const { Btn, Inp, Select, Txt, fCur, fDate, InfoCard } = bfKit();
  const blank = { target_capital: 7500, civility: 'Monsieur', beneficiary_civility: 'Monsieur' };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [agency, setAgency] = useState(activeAgence || 'toutes');
  useEffect(() => { setAgency(activeAgence || 'toutes'); }, [activeAgence]);
  const weekly = bfMoney(Number(form.target_capital) / 8);
  async function save() {
    try {
      setBusy(true);
      const saved = await bfKit().api.addLifeInsurance({
        agency: form.agency,
        target_capital: Number(form.target_capital),
        start_date: form.start_date,
        subscriber_client_id: form.subscriber_client_id,
        subscriber_first_name: form.prenom,
        subscriber_last_name: form.nom,
        subscriber_telegram: form.telegram,
        beneficiary_first_name: form.beneficiary_first_name,
        beneficiary_last_name: form.beneficiary_last_name,
        beneficiary_telegram: form.beneficiary_telegram,
        discord_url: form.discord_url,
        notes: form.notes,
        enrollment: {
          subscriber_civility: form.civility,
          subscriber_birth: form.birth_date,
          subscriber_nationality: form.nationality,
          subscriber_address: form.address,
          subscriber_job: form.job,
          subscriber_company: form.company,
          boss_name: form.boss_name,
          boss_telegram: form.boss_telegram,
          weekly_income: form.weekly_income,
          beneficiary_civility: form.beneficiary_civility,
          beneficiary_birth: form.beneficiary_birth,
          beneficiary_nationality: form.beneficiary_nationality,
          beneficiary_link: form.beneficiary_link,
          leave_placed: !!form.leave_placed,
          first_payment_at_signature: !!form.first_payment,
          collected_today: form.collected_today,
          subscriber_present: !!form.subscriber_present,
          beneficiary_present: !!form.beneficiary_present,
          funds_coherent: !!form.funds_coherent,
          bailiff: form.bailiff
        }
      });
      setContracts([saved, ...contracts]);
      setSelected(saved);
      setOpen(false);
      notify('Police enregistrée');
    } catch (error) {
      notify('⚠ ' + error.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action, extra) {
    try {
      const saved = await bfKit().api.updateLifeInsurance({ id: selected.id, action, ...extra });
      setContracts(contracts.map((row) => row.id === saved.id ? saved : row));
      setSelected(saved);
      notify('Assurance-vie mise à jour');
    } catch (error) {
      notify('⚠ ' + error.message);
    }
  }
  if (selected) {
    const figures = selected.financials || {};
    const closed = LIFE_CLOSED.has(selected.status);
    const next = (selected.payments || []).find((payment) => payment.status !== 'paid');
    const beneficiary = `${selected.beneficiary_first_name || ''} ${selected.beneficiary_last_name || ''}`.trim();
    return <FicheShell
      reference={selected.contract_number}
      title={`${selected.subscriber_first_name || ''} ${selected.subscriber_last_name || ''}`.trim() || '—'}
      telegram={selected.subscriber_telegram}
      agencyLabel={agencyName(selected.agency)}
      onBack={() => setSelected(null)}
      left={[
        ficheLine('Bénéficiaire', beneficiary || '—'),
        ficheLine('Statut', LIFE_STATUS[selected.status] || selected.status),
        ficheLine('Dernier versement prévu', fDate(selected.last_due))
      ]}
      right={[
        ficheLine('Capital constitué', fCur(figures.principal), '#f3d58a'),
        ficheLine('Intérêts acquis', fCur(figures.interest), '#74d59d'),
        ficheLine('Solde suivi', fCur(figures.balance), '#f3d58a'),
        ficheLine('Prochaine échéance', next ? `${fDate(next.date)} · ${fCur(next.amount)}` : 'Terminées')
      ]}
      actions={<>
        {selected.status === 'payments_complete' && <Btn onClick={() => act('leave_placed')}>Laisser placé</Btn>}
        <Btn color="#8b642c" onClick={() => act('request_closure')}>Demander la clôture</Btn>
        {selected.status === 'closure_requested' && <Btn color="#b94735" onClick={() => act('confirm_closure')}>Confirmer la clôture</Btn>}
        <Btn onClick={() => act('report_death')}>Signaler un décès</Btn>
        {selected.status === 'death_reported' && <Btn onClick={() => act('start_review')}>Ouvrir la vérification</Btn>}
        {selected.status === 'under_review' && <Btn onClick={() => act('pay_beneficiary')}>Payer le bénéficiaire</Btn>}
      </>}
    >
      <DueLedger title="Échéances" rows={(selected.payments || []).map((payment) => ({
        key: payment.number,
        number: payment.number,
        amount: fCur(payment.amount),
        date: fDate(payment.date),
        state: payment.status === 'paid' ? 'paye' : dueStateOf(payment.date, closed),
        done: payment.status === 'paid' ? 'Échéance remboursée' : '',
        pending: 'En attente',
        action: payment.status !== 'paid' && !closed ? <Btn onClick={() => act('record_payment', { installment_number: payment.number })}>Valider paiement</Btn> : null
      }))} />
    </FicheShell>;
  }
  function openContract() {
    const next = { ...blank };
    if (agency && agency !== 'toutes') next.agency = agency;
    setForm(next);
    setOpen(true);
  }
  function pickSubscriber(id) {
    const client = findClient(clients, id);
    if (!client) {
      setForm({ ...form, subscriber_client_id: '', prenom: '', nom: '', telegram: '' });
      return;
    }
    setForm({
      ...form,
      subscriber_client_id: client.id,
      prenom: client.prenom || '',
      nom: client.nom || '',
      telegram: client.telegram || '',
      address: client.adresse || '',
      birth_date: client.date_naissance || '',
      nationality: client.nationalite || '',
      civility: client.civilite === 'Madame' ? 'Madame' : 'Monsieur',
      job: client.profession || '',
      company: client.entreprise || ''
    });
  }
  function pickBeneficiary(id) {
    const client = findClient(clients, id);
    if (!client) {
      setForm({ ...form, beneficiary_client_id: '', beneficiary_first_name: '', beneficiary_last_name: '', beneficiary_telegram: '' });
      return;
    }
    setForm({
      ...form,
      beneficiary_client_id: client.id,
      beneficiary_first_name: client.prenom || '',
      beneficiary_last_name: client.nom || '',
      beneficiary_telegram: client.telegram || '',
      beneficiary_birth: client.date_naissance || '',
      beneficiary_nationality: client.nationalite || '',
      beneficiary_civility: client.civilite === 'Madame' ? 'Madame' : 'Monsieur'
    });
  }
  return <div>
    {open && <FormPopup title="Nouveau contrat" onClose={() => setOpen(false)}>
      <ClientSelect clients={clients} value={form.subscriber_client_id} label="Souscripteur existant" onChange={pickSubscriber} />
      <Part title="Contrat">
        <AgencySelect label="Agence" value={form.agency} onChange={(event) => setForm({ ...form, agency: event.target.value })} />
        <Select label="Capital" value={form.target_capital} onChange={(event) => setForm({ ...form, target_capital: event.target.value })}>{[1000, 2500, 5000, 7500, 10000].map((value) => <option key={value} value={value}>{bfFr(value)}</option>)}</Select>
        <Inp label="Versement hebdomadaire" value={bfFr(weekly)} readOnly />
        <Inp label="Montant encaissé ce jour" type="number" value={form.collected_today || ''} onChange={(event) => setForm({ ...form, collected_today: event.target.value })} />
        <Inp label="Premier versement" type="date" value={form.start_date || ''} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
        <Inp label="Dernier versement prévu" value={form.start_date ? bfDate(bfAddDays(form.start_date, 49)) : ''} readOnly />
      </Part>
      <Part title="Souscripteur">
        <Inp label="Prénom" value={form.prenom || ''} onChange={(event) => setForm({ ...form, prenom: event.target.value })} />
        <Inp label="Nom" value={form.nom || ''} onChange={(event) => setForm({ ...form, nom: event.target.value })} />
        <Select label="Civilité" value={form.civility || 'Monsieur'} onChange={(event) => setForm({ ...form, civility: event.target.value })}><option>Monsieur</option><option>Madame</option></Select>
        <Inp label="Naissance" type="date" value={form.birth_date || ''} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} />
        <Inp label="Nationalité" value={form.nationality || ''} onChange={(event) => setForm({ ...form, nationality: event.target.value })} />
        <Inp label="Télégramme" value={form.telegram || ''} onChange={(event) => setForm({ ...form, telegram: event.target.value })} />
        <Span><Inp label="Adresse" value={form.address || ''} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Span>
      </Part>
      <Part title="Emploi">
        <Inp label="Profession" value={form.job || ''} onChange={(event) => setForm({ ...form, job: event.target.value })} />
        <Inp label="Revenu hebdomadaire" type="number" value={form.weekly_income || ''} onChange={(event) => setForm({ ...form, weekly_income: event.target.value })} />
        <Inp label="Entreprise" value={form.company || ''} onChange={(event) => setForm({ ...form, company: event.target.value })} />
        <Inp label="Chef d'entreprise" value={form.boss_name || ''} onChange={(event) => setForm({ ...form, boss_name: event.target.value })} />
        <Span><Inp label="Télégramme du chef" value={form.boss_telegram || ''} onChange={(event) => setForm({ ...form, boss_telegram: event.target.value })} /></Span>
      </Part>
      <ClientSelect clients={clients} value={form.beneficiary_client_id} section="Bénéficiaire" label="Bénéficiaire existant" onChange={pickBeneficiary} />
      <Part title="Identité du bénéficiaire">
        <Inp label="Prénom" value={form.beneficiary_first_name || ''} onChange={(event) => setForm({ ...form, beneficiary_first_name: event.target.value })} />
        <Inp label="Nom" value={form.beneficiary_last_name || ''} onChange={(event) => setForm({ ...form, beneficiary_last_name: event.target.value })} />
        <Select label="Civilité" value={form.beneficiary_civility || 'Monsieur'} onChange={(event) => setForm({ ...form, beneficiary_civility: event.target.value })}><option>Monsieur</option><option>Madame</option></Select>
        <Inp label="Naissance" type="date" value={form.beneficiary_birth || ''} onChange={(event) => setForm({ ...form, beneficiary_birth: event.target.value })} />
        <Inp label="Nationalité" value={form.beneficiary_nationality || ''} onChange={(event) => setForm({ ...form, beneficiary_nationality: event.target.value })} />
        <Inp label="Télégramme" value={form.beneficiary_telegram || ''} onChange={(event) => setForm({ ...form, beneficiary_telegram: event.target.value })} />
        <Span><Inp label="Lien avec le souscripteur" value={form.beneficiary_link || ''} onChange={(event) => setForm({ ...form, beneficiary_link: event.target.value })} /></Span>
      </Part>
      <Part title="Validation" plain>
        <Inp label="Huissier de justice fédéral" value={form.bailiff || ''} onChange={(event) => setForm({ ...form, bailiff: event.target.value })} />
        <Flag label="Capital laissé placé après les 8 semaines" checked={form.leave_placed} onChange={(value) => setForm({ ...form, leave_placed: value })} />
        <Flag label="Premier versement effectué à la signature" checked={form.first_payment} onChange={(value) => setForm({ ...form, first_payment: value })} />
        <Flag label="Souscripteur présent" checked={form.subscriber_present} onChange={(value) => setForm({ ...form, subscriber_present: value })} />
        <Flag label="Bénéficiaire présent" checked={form.beneficiary_present} onChange={(value) => setForm({ ...form, beneficiary_present: value })} />
        <Flag label="Origine des fonds cohérente" checked={form.funds_coherent} onChange={(value) => setForm({ ...form, funds_coherent: value })} />
        <p style={{ color: '#c9a567', margin: 0 }}>Le bénéficiaire est immuable après la création. Chaque semaine, 5 % sont calculés sur le capital déjà investi, intérêts compris, puis ajoutés à ce capital. Retrait volontaire : 15 %. Statut de validation : Police acceptée.</p>
      </Part>
      <Part title="Notes" plain>
        <Txt label="Notes internes" value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </Part>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <Btn color="#555" disabled={busy} onClick={() => setOpen(false)}>Annuler</Btn>
        <Btn disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Créer la police'}</Btn>
      </div>
    </FormPopup>}
    <OfferBoard
      kicker="Protection et placement"
      title="Assurances-vie"
      action={<Btn onClick={openContract}>+ Nouveau contrat</Btn>}
      rows={(contracts || []).slice().sort((left, right) => {
        const rank = (DUE_RANK[lifeSnapshot(left).category] ?? 9) - (DUE_RANK[lifeSnapshot(right).category] ?? 9);
        if (rank) return rank;
        const leftNext = (left.payments || []).find((payment) => payment.status !== 'paid');
        const rightNext = (right.payments || []).find((payment) => payment.status !== 'paid');
        return String(leftNext && leftNext.date || '9999-12-31').localeCompare(String(rightNext && rightNext.date || '9999-12-31'));
      })}
      tabs={DUE_TABS}
      categoryOf={(row) => lifeSnapshot(row).category}
      present={lifeSnapshot}
      searchOf={(row) => `${row.contract_number || ''} ${row.subscriber_first_name || ''} ${row.subscriber_last_name || ''} ${row.subscriber_telegram || ''} ${row.beneficiary_first_name || ''} ${row.beneficiary_last_name || ''}`}
      agencyOf={(row) => row.agency}
      agency={agency}
      onAgency={(value) => { setAgency(value); if (onActiveAgenceChange) onActiveAgenceChange(value); }}
      onOpen={setSelected}
      empty="Aucune police dans cette catégorie"
    />
  </div>;
}

window.BF = { ServiceDesk, LifeDesk, OfferBoard, FicheShell, ficheLine, services: BF_SERVICES };
