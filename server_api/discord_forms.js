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
const SUBSCRIPTION_COLOR = 0x247174;

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
    line('Intérêt', '5 % par semaine après chaque ajout de fonds'),
    line('Retrait volontaire', '15 %'),
    line('Après les 8 semaines', 'Capital laissé placé tant que le contrat n’est pas clôturé'),
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
    color: SUBSCRIPTION_COLOR,
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
    line('Expérience en investissement', row.experience),
    line("Objectif principal de l'investissement", row.objectives),
    line('Montant de la souscription', moneyFr(row.amount)),
    line('Palier de la souscription', row.tier),
    line("Durée d'investissement envisagée", row.horizon),
    line('Mode de versement', row.payment_mode),
    line("Numéro d'identification bancaire", row.bank_id),
    line('Distribution des profits', row.profit_distribution),
    '',
    '**Origine des fonds**',
    line('Source principale des capitaux investis', row.funds_origin),
    line('Investit pour un autre client', yesNo(!row.own_account)),
    ...(!row.own_account ? [
      line('Investissement pour le compte de', row.for_full_name || '—'),
      line('Télégramme du compte', row.for_telegram || '—')
    ] : []),
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
    color: SUBSCRIPTION_COLOR,
    author: { name: 'Interstate Banking & Trust Company' },
    footer: { text: `Risque de perte partielle ou totale du capital. ${stamp}` }
  };
}

function pawnEmbed(row, stamp) {
  const who = `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`.trim();
  return letterhead({
    title: dossierTitle('Prêt sur gage', who, row.dossier_number),
    description: pawnText(row),
    footer: `Bien saisi si le prêt n'est pas remboursé sous 7 jours. ${stamp || ''}`.trim(),
    color: SUBSCRIPTION_COLOR
  });
}
function consigneEmbed(row, stamp) {
  const who = `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`.trim();
  return letterhead({
    title: dossierTitle('Location de consigne', who, row.dossier_number),
    description: consigneText(row),
    footer: stamp,
    color: SUBSCRIPTION_COLOR
  });
}
function termEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle('Épargne à terme', `${row.prenom || ''} ${row.nom || ''}`.trim(), row.dossier_number),
    description: termText(row),
    footer: stamp,
    color: SUBSCRIPTION_COLOR
  });
}
function payrollEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle('Gestion de paie', row.company_name, row.dossier_number),
    description: payrollText(row),
    footer: stamp,
    color: SUBSCRIPTION_COLOR
  });
}
function goldsteinEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle("Livret d'épargne Goldstein", `${row.prenom || ''} ${row.nom || ''}`.trim(), row.dossier_number),
    description: goldsteinText(row),
    footer: stamp,
    color: SUBSCRIPTION_COLOR
  });
}
function loanBirth(row) {
  if (validDate(row.date_naissance) || validDate(row.birth_date)) return dateFr(row.date_naissance || row.birth_date);
  return String(row.date_naissance || row.birth_date || '');
}
function loanText(row) {
  const who = `${row.prenom || ''} ${(row.nom || '').toUpperCase()}`.trim();
  return [
    `## DÉTAILS PERSONNELS - ${who} ##`,
    '',
    '**INFORMATIONS PERSONNELLES**',
    line('Date du jour', dateFr(row.date_creation || row.signed_on)),
    line('Votre identité', `${row.prenom || ''} ${row.nom || ''}`.trim()),
    line('Télégramme', row.telegram),
    line('Adresse résidentielle actuelle', row.adresse),
    line('Date de naissance', loanBirth(row)),
    line('Nationalité', row.nationalite || row.nationality),
    line('État civil', row.civilite || row.civility || row.etat_civil),
    line('Profession', row.profession),
    line('Entreprise', row.entreprise),
    line('Salaire hebdomadaire', row.salaire_hebdomadaire || row.salaire),
    '',
    '**DÉTAILS DU PRÊT**',
    line('Dossier', row.loan_id),
    line('Agence', AGENCY_LABELS[row.agence] || row.agence),
    line('Somme prêtée', moneyFr(row.somme)),
    line('Taux par échéance', `${row.taux} %`),
    line('Total à rembourser', moneyFr(row.total_a_rembourser)),
    line('Garanties', row.garanties),
    ...(Array.isArray(row.echeances) ? row.echeances.map((item, index) =>
      line(`Échéance ${index + 1}`, `${moneyFr(item.montant)} le ${dateFr(item.date)}`)
    ) : [])
  ].join('\n');
}
function loanEmbed(row, stamp) {
  const who = `${row.prenom || ''} ${row.nom || ''}`.trim();
  return letterhead({
    title: dossierTitle('Prêt', who, row.loan_id),
    description: loanText(row),
    footer: stamp,
    color: SUBSCRIPTION_COLOR
  });
}

const HORSE_PARI = {
  gagnant: 'Gagnant',
  place: 'Placé',
  couple: 'Couplé'
};

function horseWho(row) {
  return `${row.client_prenom || row.prenom || ''} ${row.client_nom || row.nom || ''}`.trim();
}

function horseDate(value) {
  if (validDate(value)) return dateFr(value);
  return String(value || '').trim();
}

function horsePari(row) {
  if (row.type_pari === 'autre') return row.type_pari_autre || 'Autre';
  return HORSE_PARI[row.type_pari] || row.type_pari || '';
}

function horseText(row) {
  const who = horseWho(row);
  const coupons = Array.isArray(row.numeros_coupons)
    ? row.numeros_coupons.filter(Boolean)
    : String(row.numeros_coupons || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const count = Math.max(1, Number(row.coupons_count) || coupons.length || 1);
  const total = row.montant_total != null && row.montant_total !== ''
    ? money(row.montant_total)
    : 25 * count;
  return [
    `## DOSSIER DE CRÉDIT DE MISE HIPPIQUE — ${who.toUpperCase()} ##`,
    '',
    '**INFORMATIONS PERSONNELLES**',
    line('Date du jour', horseDate(row.date_du_jour || row.signed_on)),
    line('Identité', who),
    line('Télégramme', row.telegram),
    line('Adresse résidentielle actuelle', row.adresse || row.address),
    line('Profession actuelle', row.profession),
    line('Agence', AGENCY_LABELS[row.agence || row.agency] || row.agence || row.agency),
    line('Dossier', row.dossier_id || row.dossier_number),
    '',
    '**VÉRIFICATION D’IDENTITÉ**',
    ...accepted([
      [row.identite_presentee, 'Pièce d’identité valide présentée'],
      [row.photographie_ajoutee, 'Photographie du client réalisée et ajoutée au dossier']
    ]),
    '',
    '**DEMANDE DE CRÉDIT DE MISE**',
    line('Montant total emprunté', `${moneyFr(25)} x ${count} = ${moneyFr(total)}`),
    line('Taux d’intérêt fixe', `${row.taux != null ? row.taux : 0} %`),
    '',
    '**INFORMATIONS SUR LE PARI HIPPIQUE**',
    line('Date de la course', horseDate(row.date_course)),
    line('Écurie ou cheval', row.cheval_ecurie),
    line('Type de pari', horsePari(row)),
    line('Bookmaker', row.bookmaker),
    '',
    '**COUPONS DE MISE**',
    line('Numéros de série', coupons.length ? coupons.map((item) => `N°${item}`).join(', ') : ''),
    ...accepted([
      [row.coupons_enregistres, 'Coupons enregistrés dans le registre officiel'],
      [row.numeros_verifies, 'Vérification des numéros de série effectuée']
    ]),
    '',
    '**SITUATION FINANCIÈRE**',
    line('Revenus mensuels estimés', row.revenus_mensuels),
    line('Patrimoine déclaré', row.patrimoine),
    line('Biens en garantie', row.garanties),
    '',
    '**RÉFÉRENCES**',
    line('Recommandé', row.recommande ? 'Oui' : 'Non'),
    ...(row.recommande ? [line('Référent', row.referent)] : []),
    line('Autres recommandations', row.recommandations),
    '',
    'Remboursement immédiat après la course. Les coupons restent propriété de la banque jusqu’à leur utilisation.'
  ].join('\n');
}

function horseEmbed(row, stamp) {
  return letterhead({
    title: dossierTitle('Crédit hippique', horseWho(row), row.dossier_id || row.dossier_number),
    description: horseText(row),
    footer: stamp,
    color: SUBSCRIPTION_COLOR
  });
}

function missionEmbed(row, echeance) {
  const state = stateLabel(row.agency);
  return letterhead({
    title: missionTitle(row, echeance),
    description: missionText(row, echeance).replace(new RegExp(` @${state}`, 'g'), ''),
    color: SUBSCRIPTION_COLOR,
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
    line('Nouveau solde', moneyFr(row.balance)),
    line('Règle', '+3 % du solde, toutes les deux semaines'),
    line('Prochaine capitalisation', dateFr(row.next_capitalization)),
    line("Intérêt de la période", moneyFr(row.period_interest)),
    line('Solde prévu', moneyFr(row.next_balance)),
    '',
    '**DÉCLARATIONS**',
    ...accepted([
      [row.declare_accuracy, 'Exactitude des informations'],
      [row.declare_rule, 'Connaissance de la règle des 3 % toutes les deux semaines sur le solde'],
      [row.declare_terms, 'Prise de connaissance des conditions générales']
    ]),
    '',
    "Les sommes inscrites au livret demeurent la propriété du titulaire. Toutes les deux semaines, la Interstate Banking & Trust Company porte au crédit du livret un intérêt de 3 % calculé sur le seul solde."
  ].join('\n');
}

const MISSION_KINDS = {
  pret_loans: 'Prêt',
  pret_life_insurance_contracts: 'Assurance-vie',
  pret_pawn_loans: 'Prêt sur gage',
  pret_consigne_contracts: 'Location de consigne',
  pret_term_savings: 'Épargne à terme'
};

function missionKind(echeance) {
  return MISSION_KINDS[echeance && echeance.collection] || 'Dossier';
}

function missionText(row, echeance) {
  const state = stateLabel(row.agency);
  const kind = missionKind(echeance);
  const kindLower = kind.toLocaleLowerCase('fr');
  const who = `${civilityTitle(row.civility || row.enrollment && row.enrollment.subscriber_civility)} ${person(row)}`.trim();
  const number = row.contract_number || row.dossier_number || row.loan_id || row.dossier_id || row.id;
  const bankName = state === 'Texas' ? 'Banque du Texas' : 'Banque de Louisiane';
  const missions = [
    `- Rédiger le télégramme à l'attention de ${who}.`,
    `- L'adresser au numéro de télégramme ${row.telegram || row.subscriber_telegram || row.patron_telegram || ''}.`,
    (echeance && echeance.collection) === 'pret_term_savings'
      ? `- Lui signifier que la somme de ${moneyFr(echeance.amount)} lui sera versée le ${dateFr(echeance.date)}.`
      : `- Lui signifier que la somme de ${moneyFr(echeance.amount)} est due le ${dateFr(echeance.date)}.`
  ];
  if ((echeance && echeance.collection) === 'pret_pawn_loans') {
    missions.push(
      `- Informer le client que l’objet remis en gage deviendra la propriété de la ${bankName} à compter du ${dateFr(echeance.date)}, faute de remboursement de sa dette.`
    );
  }
  missions.push(`- Inscrire au dossier ${number} la réponse obtenue.`);
  const author = text(row.created_by_username || row.banquier_username, 80) || '—';
  return [
    line('Type de dossier', kind),
    line('Contrat établi par', author),
    line('Référence', number),
    '',
    `Objectif : Faire parvenir, avant l'échéance de demain, un télégramme de rappel à ${who} concernant son dossier de ${kindLower} (${number}).`,
    '',
    'Missions à accomplir :',
    '',
    ...missions,
    '',
    `Personnel autorisé : Mission exclusivement réservée aux Banquiers de ${state}. @${state}`,
    '',
    `Responsabilité : Le banquier prenant en charge cette mission sera responsable du rappel de cette échéance de ${kindLower} et de la suite portée au dossier.`
  ].join('\n');
}

function missionTitle(row, echeance) {
  const state = stateLabel(row.agency).toUpperCase();
  const number = row.contract_number || row.dossier_number || row.loan_id || row.dossier_id || row.id;
  const name = person(row);
  return `${state} | ${number} | ${name}`.slice(0, 100);
}

const RECEIPT_FORUMS = {
  pret_loans: '1506280056488722483',
  pret_consigne_contracts: '1506297488724725812',
  pret_speculative_funds: '1513571647817257020',
  pret_horse_credits: '1514364208479998114',
  pret_payroll_contracts: '1519112605434904627',
  pret_life_insurance_contracts: '1532771839418564731',
  pret_pawn_loans: '1560021701427724298',
  pret_term_savings: '1562932945193402378',
  pret_goldstein_booklets: '1567191919782789161'
};

function receiptForumId(collection) {
  if (collection === 'pret_goldstein_booklets') {
    const override = String(process.env.DISCORD_GOLDSTEIN_FORUM_ID || '').trim();
    if (override) return override;
  }
  return RECEIPT_FORUMS[collection];
}

function receiptAgencies(row) {
  const list = Array.isArray(row.agencies) && row.agencies.length ? row.agencies : [row.agence || row.agency];
  return list.filter((item) => AGENCIES.includes(item));
}

function receiptState(row) {
  return [...new Set(receiptAgencies(row).map((agency) => stateLabel(agency)))].join(' / ');
}

function receiptName(row) {
  if (row.client_nom || row.client_prenom) return `${row.client_nom || ''} ${row.client_prenom || ''}`.replace(/\s+/g, ' ').trim();
  if (row.subscriber_last_name || row.subscriber_first_name) return `${row.subscriber_last_name || ''} ${row.subscriber_first_name || ''}`.replace(/\s+/g, ' ').trim();
  if (row.company_name) return String(row.company_name).trim();
  if (row.full_name) return String(row.full_name).trim();
  return `${row.nom || ''} ${row.prenom || ''}`.replace(/\s+/g, ' ').trim();
}

function receiptTitle(row) {
  const number = row.contract_number || row.dossier_number || row.loan_id || row.dossier_id || row.id || '';
  return [receiptState(row), number, receiptName(row)].filter(Boolean).join(' | ').slice(0, 100);
}

function receiptTags(collection, row) {
  const city = AGENCY_LABELS[receiptAgencies(row)[0]] || '';
  if (collection === 'pret_loans') return ['Nouveau', city].filter(Boolean);
  if (collection === 'pret_life_insurance_contracts') return ['Période de versement'];
  if (collection === 'pret_speculative_funds') {
    const tags = [row.tier, city].filter(Boolean);
    const distribution = String(row.profit_distribution || '').toLocaleLowerCase('fr');
    if (distribution.includes('versement')) tags.push('Versement Hebdo');
    else if (distribution.includes('réinvest') || distribution.includes('reinvest') || distribution.includes('ré-invest')) tags.push('Ré-investissement');
    return tags;
  }
  if (collection === 'pret_horse_credits') {
    if (row.statut === 'termine') return ['Remboursé'];
    if (row.statut === 'refuse') return [];
    return ['Pari en cours'];
  }
  if (collection === 'pret_payroll_contracts') return ['Ouvert'];
  if (collection === 'pret_goldstein_booklets') return ['Ouvert'];
  if (collection === 'pret_consigne_contracts') return row.dossier_offered ? ['Ouvert', 'OFFERT'] : ['Ouvert'];
  return [];
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
  const { rpToday } = require('./money');
  const date = rpToday();
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

function lifeInterestEmbed(row, statement) {
  const number = text(row && row.contract_number, 40);
  const who = `${text(row && row.subscriber_first_name, 80)} ${text(row && row.subscriber_last_name, 80)}`.trim() || 'Souscripteur';
  return letterhead({
    title: `Relevé hebdomadaire — ${who}${number ? ` (Dossier ${number})` : ''}`.replace(/\s+/g, ' ').trim(),
    color: 0x1f8b4c,
    description: [
      line('Date du relevé', dateFr(statement && statement.on)),
      line('Solde', moneyFr(statement && statement.balance)),
      line('Intérêts de la semaine', moneyFr(statement && statement.week_interest)),
      line('Capital versé', moneyFr(statement && statement.principal)),
      line('Intérêts cumulés', moneyFr(statement && statement.interest))
    ].join('\n'),
    footer: 'Après la fin des versements. Relevé automatique jusqu’à clôture du contrat.'
  });
}

module.exports = {
  rpStamp, nextSerial, nextTermDossier, validDate,
  AGENCIES, AGENCY_LABELS, CONSIGNE_BANKS, COVERAGES,
  text, requireText, requireUrl, discordUrlOk, letterhead, embedFromText,
  lifeEmbed, lifeInterestEmbed, fondsEmbed, pawnText, pawnEmbed, consigneEmbed, termEmbed, payrollEmbed, goldsteinEmbed,
  loanText, loanEmbed, horseText, horseEmbed, consigneText, termText, payrollText, goldsteinText, missionText, missionTitle, missionEmbed,
  RECEIPT_FORUMS, receiptForumId, receiptTitle, receiptTags,
  quotePawn, quoteConsigne, quoteTerm, quotePayroll, quoteGoldstein, money
};
