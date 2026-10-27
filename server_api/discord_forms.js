const { sb } = require('./_lib');
const {
  money, moneyFr, dateFr, addDays, stateLabel,
  termQuote, consigneWeekly, pawnQuote, payrollQuote, goldsteinNext, discordUrlOk, validDate
} = require('./money');

const AGENCIES = ['saint_denis', 'van_horn', 'valentine', 'rhodes', 'blackwater', 'strawberry', 'sunset'];
const AGENCY_LABELS = {
  saint_denis: 'Saint-Denis',
  van_horn: 'Van Horn',
  valentine: 'Valentine',
  rhodes: 'Rhodes',
  blackwater: 'Blackwater',
  strawberry: 'Strawberry',
  sunset: 'Sunset'
};
const CONSIGNE_BANKS = {
  blackwater: 'Blackwater',
  rhodes: 'Rhodes',
  valentine: 'Valentine',
  van_horn: 'Van Horn',
  sunset: 'Sunset City',
  saint_denis: 'Saint Denis'
};
const COVERAGES = {
  standard: 'Standard (25 % / +5 $ par semaine)',
  renforcee: 'Renforcée (50 % / +15 $ par semaine)',
  premium: 'Premium (100 % / +35 $ par semaine)'
};

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}
function yesNo(value) {
  return value ? '✅' : 'Non';
}
function line(label, value) {
  return `**${label} :** ${value ?? ''}`;
}
function letterhead({ title, description, footer, color }) {
  const embed = {
    author: { name: 'Interstate Banking & Trust Company' },
    color: color == null ? 0xd7a64d : color
  };
  if (title) embed.title = String(title).slice(0, 256);
  if (description) embed.description = String(description).slice(0, 4096);
  if (footer) embed.footer = { text: String(footer).slice(0, 2048) };
  return embed;
}
function embedFromText(text, title) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let body = raw;
  let heading = title || '';
  const dossier = body.match(/^Dossier ([^\n]+)\n\n([\s\S]*)$/);
  if (dossier) {
    heading = heading || `Dossier ${dossier[1]}`;
    body = dossier[2].trim();
  }
  if (!heading) {
    const first = (body.split('\n').find((entry) => entry.trim()) || 'Compte rendu').replace(/^#+\s*/, '').replace(/\*/g, '').trim();
    heading = first.length > 180 ? 'Compte rendu' : first;
  }
  return letterhead({ title: heading, description: body });
}
function dossierTitle(kind, who, number) {
  const name = `${kind} — ${who || 'Dossier'}${number ? ` — Dossier ${number}` : ''}`;
  return name.replace(/\s+/g, ' ').trim().slice(0, 256);
}
function accepted(entries) {
  return entries.filter((entry) => entry[0]).map((entry) => `✅ ${entry[1]}`);
}
function requireText(body, key, label) {
  if (!text(body[key])) return `${label} est obligatoire.`;
  return '';
}
function requireUrl(body) {
  if (!discordUrlOk(body.discord_url)) return 'Le lien Discord du formulaire est obligatoire et doit viser un salon du serveur.';
  return '';
}
function civilityTitle(value) {
  if (value === 'Madame') return 'Mme';
  if (value === 'Monsieur') return 'M.';
  return 'M./Mme';
}
function person(row) {
  return `${row.nom || row.subscriber_last_name || row.company_name || ''} ${row.prenom || row.subscriber_first_name || ''}`.trim();
}

function lifeEmbed(row, stamp) {
  const enrollment = row.enrollment || {};
  const last = addDays(row.start_date, 49);
  const description = [
    line('Agence', AGENCY_LABELS[row.agency] || row.agency),
    '',
    '**Souscripteur**',
    line('Identité', `${enrollment.subscriber_civility || ''} ${row.subscriber_first_name || ''} ${row.subscriber_last_name || ''}`),
    line('Date de naissance', dateFr(enrollment.subscriber_birth)),
    line('Nationalité', enrollment.subscriber_nationality),
    line('Télégramme', row.subscriber_telegram),
    line('Adresse', enrollment.subscriber_address),
    line('Profession', enrollment.subscriber_job),
    line('Entreprise', enrollment.subscriber_company),
    line("Chef d'entreprise", `${enrollment.boss_name || ''} — ${enrollment.boss_telegram || ''}`),
    line('Revenu hebdomadaire', moneyFr(enrollment.weekly_income)),
    '',
    '**Bénéficiaire**',
    line('Identité', `${enrollment.beneficiary_civility || ''} ${row.beneficiary_first_name || ''} ${row.beneficiary_last_name || ''}`),
    line('Date de naissance', dateFr(enrollment.beneficiary_birth)),
    line('Nationalité', enrollment.beneficiary_nationality),
    line('Télégramme', row.beneficiary_telegram),
    line('Lien avec le souscripteur', enrollment.beneficiary_link),
    '',
    '**Police**',
    line('Capital', moneyFr(row.target_capital)),
    line('Versement hebdomadaire', moneyFr(row.weekly_payment)),
    line('Premier versement', dateFr(row.start_date)),
    line('Dernier versement prévu', dateFr(last)),
    '',
    '**Conditions**',
    line('Durée', '8 semaines'),
    line('Intérêt', '5 % par semaine sur le capital investi'),
    line('Retrait volontaire', '15 %'),
    line('Après les 8 semaines', enrollment.leave_placed ? 'Capital laissé placé' : 'Capital repris'),
    '',
    '**Versements**',
    line('Premier versement effectué à la signature', yesNo(enrollment.first_payment_at_signature)),
    line('Montant encaissé ce jour', moneyFr(enrollment.collected_today)),
    '',
    '**Vérifications du banquier**',
    ...accepted([
      [enrollment.subscriber_present, 'Souscripteur présent'],
      [enrollment.beneficiary_present, 'Bénéficiaire présent'],
      [enrollment.funds_coherent, 'Origine des fonds cohérente']
    ]),
    '',
    '**Validation**',
    line('Statut', 'Police acceptée'),
    line('Huissier de justice fédéral', enrollment.bailiff)
  ].join('\n');
  return {
    title: `Police d'assurance-vie — Dossier ${row.contract_number}`,
    description,
    color: 0x1f8b4c,
    author: { name: 'Interstate Banking & Trust Company' },
    footer: { text: `Contrat régi par les articles 1 à 4 des conditions générales de la police d'assurance-vie IB&TC. ${stamp}` }
  };
}

function fondsEmbed(row, stamp) {
  const description = [
    line('Identité', `${row.civility || ''} ${row.full_name || ''}`),
    line('Date de naissance', dateFr(row.birth_date)),
    line('Nationalité', row.nationality),
    line('Télégramme', row.telegram),
    line('Adresse résidentielle', row.address),
    line('Succursale', AGENCY_LABELS[row.agency] || ''),
    '',
    '**Profil investisseur**',
    line('Expérience', row.experience),
    line('Objectifs', row.objectives),
    line('Durée envisagée', row.horizon),
    '',
    '**Souscription**',
    line('Palier', row.tier),
    line('Montant souscrit', moneyFr(row.amount)),
    line('Distribution des profits', row.profit_distribution),
    line('Mode de versement', row.payment_mode),
    line('Identification bancaire', row.bank_id),
    '',
    '**Origine des fonds**',
    line('Origine', row.funds_origin),
    line('Patrimoine total estimé', moneyFr(row.estimated_wealth)),
    line('Investit pour son propre compte', yesNo(row.own_account)),
    line('Recommandé par un client ou partenaire', yesNo(row.recommended)),
    '',
    '**Déclarations**',
    ...accepted([
      [row.declare_risks, 'Risques reconnus'],
      [row.declare_past, 'Performances passées non garantes'],
      [row.declare_accuracy, 'Exactitude des informations'],
      [row.declare_terms, 'Conditions générales acceptées']
    ])
  ].join('\n');
  return {
    title: `Accusé de réception de souscription — ${row.full_name} (Dossier ${row.dossier_number})`,
    description,
    color: 0x1f8b4c,
    author: { name: 'Interstate Banking & Trust Company' },
    footer: { text: `Risque de perte partielle ou totale du capital. ${stamp}` }
  };
}

function pawnEmbed(row, stamp) {
  const who = `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`.trim();
  return letterhead({
    title: dossierTitle('Prêt sur gage', who, row.dossier_number),
    description: pawnText(row),
    footer: `Bien saisi si le prêt n'est pas remboursé sous 7 jours. ${stamp || ''}`.trim()
  });
}
function consigneEmbed(row, stamp) {
  const who = `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`.trim();
  return letterhead({
    title: dossierTitle('Location de consigne', who, row.dossier_number),
    description: consigneText(row),
    footer: stamp
  });
}
function termEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle('Épargne à terme', `${row.prenom || ''} ${row.nom || ''}`.trim(), row.dossier_number),
    description: termText(row),
    footer: stamp
  });
}
function payrollEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle('Gestion de paie', row.company_name, row.dossier_number),
    description: payrollText(row),
    footer: stamp
  });
}
function goldsteinEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle("Livret d'épargne Goldstein", `${row.prenom || ''} ${row.nom || ''}`.trim(), row.dossier_number),
    description: goldsteinText(row),
    footer: stamp
  });
}
function missionEmbed(row, echeance) {
  const state = stateLabel(row.agency);
  return letterhead({
    title: missionTitle(row, echeance),
    description: missionText(row, echeance).replace(new RegExp(` @${state}`, 'g'), ''),
    color: 0x8b642c,
    footer: 'Ordre de mission'
  });
}

function pawnText(row) {
  return [
    `## DÉTAILS PERSONNELS - ${row.prenom || ''} ${(row.nom || '').toUpperCase()} ##`,
    '',
    '**INFORMATIONS PERSONNELS**',
    line('Votre identité', `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`),
    line('Date de naissance', dateFr(row.birth_date)),
    line('Nationalité', row.nationality),
    line('État civil', row.civility),
    line('Télégramme', row.telegram),
    '',
    '**INFORMATIONS SUR LE BIEN DÉPOSÉ**',
    line('Date du jour', dateFr(row.signed_on)),
    line('Type de bien', row.item_type),
    line('Description détaillée', row.item_description),
    line('Prix de base', moneyFr(row.base_price)),
    line('Montant prêté', moneyFr(row.amount)),
    line('Taux', row.rate_mode === 'autre' ? `${row.rate} % (cas exceptionnel)` : '15 %'),
    line('Montant du remboursement demandé', moneyFr(row.repayment)),
    line('Date limite avant saisie du bien', dateFr(row.echeance_date)),
    '',
    'Le demandeur accepte la perte totale de propriété des biens mentionnés ci-dessus au profit de la banque, en cas de non remboursement du prêt sous 7 jours à partir de la date de création du contrat ci-présent.'
  ].join('\n');
}

function consigneText(row) {
  const shared = row.access === 'partagé';
  return [
    `## DÉTAILS PERSONNELS - ${row.prenom || ''} ${(row.nom || '').toUpperCase()} ##`,
    '',
    '**INFORMATIONS PERSONNELS**',
    line('Date du jour', dateFr(row.signed_on)),
    line('Votre identité', `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`),
    line('Date de naissance', dateFr(row.birth_date)),
    line('Nationalité', row.nationality),
    line('État civil', row.civility),
    line('Télégramme', row.telegram),
    line('Adresse résidentielle', row.address),
    '',
    '**AUTRES INFORMATIONS**',
    line('Valeur approximative du contenu stocké', moneyFr(row.stored_value)),
    line('Couverture', COVERAGES[row.coverage] || row.coverage),
    line('Risques couverts', row.coverage === 'premium' ? 'Vol, accès frauduleux' : 'Vol'),
    line('Banque', CONSIGNE_BANKS[row.agency] || ''),
    '',
    '**ACCES AU COFFRE**',
    line('Accès', { individuel: 'Accès individuel', 'partagé': 'Accès partagé avec personnes autorisées', 'rendez-vous': 'Accès sur rendez-vous bancaire uniquement' }[row.access] || row.access),
    ...(shared ? [
      line('Noms et prénoms', row.shared_names),
      line('Télégramme', row.shared_telegram),
      line('Lien avec le titulaire', row.shared_link)
    ] : []),
    '',
    '**TARIFICATION & FRAIS BANCAIRES**',
    line('Frais de dossier', moneyFr(row.dossier_fee)),
    line('Location de base', '25,00 $ par semaine'),
    line('Perte de clé', '15,00 $ si elle survient'),
    line('Retard', '5,00 $ par tranche de 3 jours'),
    line('Total par semaine', moneyFr(row.weekly_total)),
    line("Total à régler aujourd'hui", moneyFr(row.due_today)),
    line("Frais d'assurance supplémentaires", moneyFr(0)),
    '',
    'La banque se réserve le droit de suspendre l’accès aux coffres, et consignes en cas de non-paiement, fraude, activité illégale ou sur demande de la justice (mandat).'
  ].join('\n');
}

function termText(row) {
  const weeks = Number(row.weeks);
  return [
    "#Épargne à Terme — SOUSCRIPTION",
    '',
    '**INFORMATIONS PERSONNELLES**',
    line('Date du jour', dateFr(row.signed_on)),
    line('Identité', `${row.prenom || ''} ${row.nom || ''}`),
    line('Date de naissance', dateFr(row.birth_date)),
    line('Nationalité', row.nationality),
    line('Télégramme', row.telegram),
    line('Succursale', AGENCY_LABELS[row.agency] || ''),
    '',
    '**ORIGINE DES FONDS**',
    line('Origine', row.origin === 'Autres' ? (row.origin_other || 'Autres') : row.origin),
    '',
    '**DÉTAILS DE LA SOUSCRIPTION**',
    line('Mode de versement', row.payment_mode),
    line('Identification bancaire', `N°${row.bank_id || ''}`),
    line('Durée', `${weeks} semaine${weeks > 1 ? 's' : ''}`),
    line('Montant souscrit', moneyFr(row.amount)),
    line('Taux garanti', `${row.rate} %`),
    line("Montant à l'échéance", moneyFr(row.maturity_amount)),
    line("Date de l'échéance", dateFr(row.echeance_date)),
    line('Taux de retrait anticipé', `${row.early_rate} %`),
    line('Frais de retrait anticipé', moneyFr(row.early_fee)),
    line('Délai de réponse', '3 jours'),
    '',
    '**DÉCLARATIONS**',
    ...accepted([
      [row.declare_accuracy, 'Exactitude des informations'],
      [row.declare_early, 'Acceptation des frais de retrait anticipé'],
      [row.declare_silence, 'Rupture si pas de réponse par télégramme dans le délai'],
      [row.declare_record, "Rupture si casier judiciaire avant l'échéance"],
      [row.declare_death, "Rupture si décès avant l'échéance"],
      [row.declare_terms, 'Prise de connaissance des conditions générales']
    ]),
    '',
    "Les fonds versés deviennent la propriété des banques pour toute la durée du contrat et ne sont restituables qu'à l'échéance prévue, sous réserve des conditions de retrait anticipé.",
    'En cas de rupture du contrat, les fonds versés lors de la souscription à ce service restent la propriété des banques.',
    '',
    `Signature : ${row.prenom || ''}.${row.nom || ''}`
  ].join('\n');
}

function payrollText(row) {
  const agencies = (row.agencies || []).map((agency) => AGENCY_LABELS[agency] || agency).join(', ');
  return [
    `## DÉTAILS PERSONNELS - ${row.company_name || ''} ##`,
    '',
    '**INFORMATIONS PERSONNELS**',
    line('Date du jour', dateFr(row.signed_on)),
    line('Raison sociale', row.company_name),
    line("Date de création de l'entreprise", dateFr(row.company_created)),
    line('Patron', row.patron),
    line('Télégramme du patron', row.patron_telegram),
    line('Co-patron', row.copatron),
    line('Télégramme du co-patron', row.copatron_telegram),
    line('Adresse du siège social', row.address),
    line('Numéro de compte', `N°${row.account || ''}`),
    line('Secteur', row.sector === 'Autre' ? (row.sector_other || 'Autre') : row.sector),
    line('Type', row.company_type),
    '',
    '**PARAMÈTRES DE GESTION DE PAIE**',
    line('Date de début du contrat', dateFr(row.start_date)),
    line('Fréquence', row.frequency === 'Autre' ? (row.frequency_other || 'Autre') : row.frequency),
    line("Nombre d'employés", row.employees),
    line('Masse salariale estimée par semaine', moneyFr(row.payroll)),
    line('Avances sur salaires', row.advances),
    line('Plafond par employé', row.advances === 'Oui' ? moneyFr(row.advance_cap) : ''),
    line('Conditions particulières', row.special_terms),
    '',
    '**LISTE DES EMPLOYÉS**',
    line('Liste complète jointe', yesNo(row.list_attached)),
    '',
    '**GARANTIES FINANCIÈRES**',
    line('Liquidités disponibles', moneyFr(row.liquidity)),
    line('Biens ou actifs pouvant servir de garantie', row.collateral_assets),
    line('Historique', row.history === 'existant' ? 'Client déjà dans les archives' : 'Nouveau client'),
    line('Succursales en charge', agencies),
    '',
    '**MODÈLE DE FACTURATION**',
    line('Frais de gestion', moneyFr(row.management_fee)),
    line('Frais de virement', moneyFr(row.transfer_fee)),
    line('Coût estimé par échéance', moneyFr(row.installment_cost)),
    '',
    "**ENGAGEMENTS DE L'EMPLOYEUR**",
    ...accepted([
      [row.commit_accuracy, 'Exactitude des informations'],
      [row.commit_lists, 'Transmission des listes salariales dans les délais'],
      [row.commit_funds, 'Approvisionnement des fonds'],
      [row.commit_advances, 'Garantie des sommes avancées'],
      [row.commit_information, 'Responsabilité des informations'],
      [row.commit_employees, 'Transmission de la liste des salariés'],
      [row.commit_terms, 'Acceptation des conditions du contrat de gestion de paie']
    ]),
    '',
    '**CONTRÔLES ET CONFORMITÉ**',
    ...accepted([
      [row.control_fraud, 'Falsification = fraude financière'],
      [row.control_reserve, 'Contrôles de la réserve fédérale'],
      [row.control_authorities, "Transmission du dossier aux autorités en cas d'anomalie ou de fraude"]
    ]),
    '',
    "L'entreprise reconnaît que la Interstate Banking & Trust Company agit uniquement en qualité de mandataire chargé du traitement et du versement des salaires conformément aux informations fournies par l'employeur. Toute erreur, omission ou déclaration frauduleuse demeure sous la responsabilité exclusive de l'entreprise cliente."
  ].join('\n');
}

function goldsteinText(row) {
  return [
    "#Livret d'épargne Goldstein — SOUSCRIPTION",
    '',
    '**INFORMATIONS PERSONNELLES**',
    line('Date du jour', dateFr(row.signed_on)),
    line('Identité', `${row.civility || ''} ${row.prenom || ''} ${row.nom || ''}`),
    line('Date de naissance', dateFr(row.birth_date)),
    line('Nationalité', row.nationality),
    line('Télégramme', row.telegram),
    line('Adresse résidentielle', row.address),
    line('Succursale', AGENCY_LABELS[row.agency] || ''),
    '',
    '**ORIGINE DES FONDS**',
    line('Origine', row.origin === 'Autres' ? (row.origin_other || 'Autres') : row.origin),
    '',
    '**DÉTAILS DU LIVRET**',
    line('Mode de versement', row.payment_mode),
    line('Identification bancaire', `N°${row.bank_id || ''}`),
    line('Premier versement', moneyFr(row.opening_amount)),
    line('Somme restante', moneyFr(row.balance)),
    line('Règle', '+3 % de la somme restante, toutes les deux semaines'),
    line('Prochaine capitalisation', dateFr(row.next_capitalization)),
    line("Intérêt de la période", moneyFr(row.period_interest)),
    line('Somme après capitalisation', moneyFr(row.next_balance)),
    '',
    '**DÉCLARATIONS**',
    ...accepted([
      [row.declare_accuracy, 'Exactitude des informations'],
      [row.declare_rule, 'Connaissance de la règle des 3 % toutes les deux semaines sur la somme restante'],
      [row.declare_terms, 'Prise de connaissance des conditions générales']
    ]),
    '',
    "Les sommes inscrites au livret demeurent la propriété du titulaire. Toutes les deux semaines, la Interstate Banking & Trust Company porte au crédit du livret un intérêt de 3 % calculé sur la seule somme restante."
  ].join('\n');
}

function missionText(row, echeance) {
  const state = stateLabel(row.agency);
  const who = `${civilityTitle(row.civility || row.enrollment && row.enrollment.subscriber_civility)} ${person(row)}`.trim();
  const number = row.contract_number || row.dossier_number || row.loan_id || row.dossier_id || row.id;
  if (echeance.kind === 'capitalization') {
    return [
      `Objectif : Porter au crédit du livret, avant la capitalisation de demain, les intérêts du dossier ${number} de ${who}.`,
      '',
      'Missions à accomplir :',
      '',
      `Vérifier la somme restante du dossier ${number}.`,
      `Porter au crédit un intérêt de 3 %, soit ${moneyFr(echeance.interest)}.`,
      `Inscrire la nouvelle somme : ${moneyFr(echeance.nextBalance)}.`,
      `Informer ${who} au télégramme ${row.telegram || row.subscriber_telegram || ''}.`,
      '',
      `Personnel autorisé : Mission exclusivement réservée aux Banquiers de ${state}. @${state}`,
      '',
      'Responsabilité : Le banquier prenant en charge cette mission sera responsable du crédit de cette capitalisation et de la suite portée au dossier.'
    ].join('\n');
  }
  return [
    `Objectif : Faire parvenir, avant l'échéance de demain, un télégramme de rappel à ${who} pour le dossier ${number}.`,
    '',
    'Missions à accomplir :',
    '',
    `Rédiger le télégramme à l'attention de ${who}.`,
    `L'adresser au numéro de télégramme ${row.telegram || row.subscriber_telegram || row.patron_telegram || ''}.`,
    `Lui signifier que la somme de ${moneyFr(echeance.amount)} est due le ${dateFr(echeance.date)}.`,
    'Inscrire au dossier la réponse obtenue.',
    '',
    `Personnel autorisé : Mission exclusivement réservée aux Banquiers de ${state}. @${state}`,
    '',
    'Responsabilité : Le banquier prenant en charge cette mission sera responsable du rappel de cette échéance et de la suite portée au dossier.'
  ].join('\n');
}

function missionTitle(row, echeance) {
  const state = stateLabel(row.agency).toUpperCase();
  const number = row.contract_number || row.dossier_number || row.loan_id || row.dossier_id || row.id;
  const name = person(row);
  return `${state} | ${number} | ${name}`.slice(0, 100);
}

function quotePawn(body) {
  const rate = body.rate_mode === 'autre' ? Number(body.rate) : 15;
  const quoted = pawnQuote(body.amount, rate);
  return { rate, repayment: quoted.repayment, echeance_date: addDays(body.signed_on, 7) };
}

function quoteConsigne(body) {
  const weekly = consigneWeekly(body.coverage, body.agency);
  const dossierFee = body.dossier_offered ? 0 : 10;
  return { weekly_total: weekly, dossier_fee: money(dossierFee), due_today: money(dossierFee), next_due: addDays(body.signed_on, 7) };
}

function quoteTerm(body) {
  const quoted = termQuote(body.amount, Number(body.weeks));
  if (!quoted) return null;
  return {
    rate: quoted.rate,
    maturity_amount: quoted.maturityAmount,
    early_rate: quoted.earlyRate,
    early_fee: quoted.earlyFee,
    echeance_date: addDays(body.signed_on, quoted.days)
  };
}

function quotePayroll(body) {
  const quoted = payrollQuote(body.employees, body.payroll, body.unit_fee || 5);
  return { ...quoted, next_due: body.start_date };
}

function quoteGoldstein(balance, openedOn) {
  const next = goldsteinNext(balance);
  return {
    balance: money(balance),
    period_interest: next.interest,
    next_balance: next.nextBalance,
    next_capitalization: addDays(openedOn, 14)
  };
}

async function rpStamp() {
  const { data } = await sb.from('pret_bank_settings').select('*').eq('setting_key', 'bank_date').maybeSingle();
  const date = data && validDate(data.setting_value) ? data.setting_value : '1904-06-26';
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return { date, stamp: `${dateFr(date)} ${time}` };
}

const AGENCY_CODES = {
  saint_denis: 'SD', van_horn: 'VH', valentine: 'VT', rhodes: 'RH',
  blackwater: 'BW', strawberry: 'ST', sunset: 'SS'
};

async function nextTermDossier(agency) {
  const code = AGENCY_CODES[agency];
  if (!code) throw new Error('Succursale inconnue.');
  const { data, error } = await sb.from('pret_term_savings').select('dossier_number');
  if (error) throw new Error(error.message);
  let max = 0;
  const pattern = new RegExp(`^EPT-${code}-(\\d+)$`);
  for (const row of data || []) {
    const match = String(row.dossier_number || '').match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `EPT-${code}-${String(max + 1).padStart(4, '0')}`;
}

async function nextSerial(collection, field, prefix) {
  const { data, error } = await sb.from(collection).select(field);
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data || []) {
    const match = String(row[field] || '').match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

module.exports = {
  rpStamp, nextSerial, nextTermDossier, validDate,
  AGENCIES, AGENCY_LABELS, CONSIGNE_BANKS, COVERAGES,
  text, requireText, requireUrl, discordUrlOk, letterhead, embedFromText,
  lifeEmbed, fondsEmbed, pawnText, pawnEmbed, consigneEmbed, termEmbed, payrollEmbed, goldsteinEmbed,
  consigneText, termText, payrollText, goldsteinText, missionText, missionTitle, missionEmbed,
  quotePawn, quoteConsigne, quoteTerm, quotePayroll, quoteGoldstein, money
};
