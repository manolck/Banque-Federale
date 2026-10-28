// Port de algo/engine.py. Les coefficients restent ceux du moteur Python.
const { randomBytes } = require('crypto');

const CONFIG = {
  I: {
    bornes: [-3, 9],
    rappel_apres: 2,
    rappel_force: 0.20,
    serie_max: 3,
    regimes: {
      croissance: [5.3, 2.0],
      stable: [3.2, 2.0],
      tassement: [0.1, 1.5],
      turbulence: [-2.5, 2.0]
    },
    transitions: {
      croissance: { croissance: 0.60, stable: 0.30, tassement: 0.10, turbulence: 0 },
      stable: { croissance: 0.20, stable: 0.60, tassement: 0.17, turbulence: 0.03 },
      tassement: { croissance: 0.10, stable: 0.45, tassement: 0.35, turbulence: 0.10 },
      turbulence: { croissance: 0.10, stable: 0.40, tassement: 0.50, turbulence: 0 }
    }
  },
  II: {
    bornes: [-5, 15],
    rappel_apres: 3,
    rappel_force: 0.12,
    serie_max: 4,
    regimes: {
      expansion: [7.8, 4],
      stable: [5.2, 3],
      correction: [-0.8, 4],
      choc: [-4.2, 4]
    },
    transitions: {
      expansion: { expansion: 0.50, stable: 0.30, correction: 0.18, choc: 0.02 },
      stable: { expansion: 0.25, stable: 0.40, correction: 0.28, choc: 0.07 },
      correction: { expansion: 0.15, stable: 0.30, correction: 0.40, choc: 0.15 },
      choc: { expansion: 0.15, stable: 0.35, correction: 0.50, choc: 0 }
    }
  },
  III: {
    bornes: [-15, 30],
    rappel_apres: 4,
    rappel_force: 0.06,
    serie_max: 5,
    regimes: {
      boom: [21, 9],
      stable: [8.5, 7],
      correction: [-6, 8],
      krach: [-12, 6]
    },
    transitions: {
      boom: { boom: 0.35, stable: 0.25, correction: 0.30, krach: 0.10 },
      stable: { boom: 0.25, stable: 0.30, correction: 0.30, krach: 0.15 },
      correction: { boom: 0.20, stable: 0.25, correction: 0.35, krach: 0.20 },
      krach: { boom: 0.20, stable: 0.30, correction: 0.50, krach: 0 }
    }
  }
};

const HAUSSIERS = new Set(['croissance', 'stable', 'expansion', 'boom']);
const LIBELLES = {
  croissance: 'Trafic soutenu',
  stable: 'Marché calme',
  tassement: 'Ralentissement',
  turbulence: 'Turbulences',
  expansion: 'Carnets pleins',
  correction: "Stocks qui s'accumulent",
  choc: 'Choc sectoriel',
  boom: 'Ruée',
  krach: 'Panique sur les marchés'
};
const PALIERS = ['I', 'II', 'III'];
const TIER_OF = { 'Palier I': 'I', 'Palier II': 'II', 'Palier III': 'III' };

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function erf(x) {
  if (typeof Math.erf === 'function') return Math.erf(x);
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

function pPositif(mu, sd) {
  return 0.5 * (1 + erf(mu / (sd * Math.sqrt(2))));
}

function normalCdf(x, mu, sd) {
  return 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2)));
}

function issueGauss(mu, sd, guard) {
  if (guard) {
    const cut = 0.05 / 0.3;
    return {
      hausse: normalCdf(-cut, mu, sd) + (1 - normalCdf(0.05, mu, sd)),
      baisse: 0,
      neutre: normalCdf(0.05, mu, sd) - normalCdf(-cut, mu, sd)
    };
  }
  const baisse = normalCdf(-0.05, mu, sd);
  return {
    hausse: 1 - normalCdf(0.05, mu, sd),
    baisse,
    neutre: normalCdf(0.05, mu, sd) - baisse
  };
}

function issueSemaine(nom, etat) {
  const cfg = CONFIG[nom];
  if (!cfg) throw new Error(`Palier inconnu : ${nom}`);
  const current = etat && etat.regime ? etat : etatInitial();
  const serie = Number(current.serie) || 0;
  const weights = transitionsAjustees(cfg, current.regime, serie);
  const guard = serie <= -cfg.serie_max;
  const total = { hausse: 0, baisse: 0, neutre: 0 };
  for (const [regime, weight] of Object.entries(weights)) {
    const [mu, sd] = cfg.regimes[regime];
    const part = issueGauss(mu, sd, guard);
    total.hausse += weight * part.hausse;
    total.baisse += weight * part.baisse;
    total.neutre += weight * part.neutre;
  }
  return total;
}

function roundDigits(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function cryptoRandom() {
  const bytes = randomBytes(6);
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return value / 281474976710656;
}

function boxMuller(random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function weightedChoice(population, weights, random) {
  const cum = [];
  let total = 0;
  for (const weight of weights) {
    total += Number(weight);
    cum.push(total);
  }
  if (!(total > 0)) throw new Error('Total of weights must be greater than zero');
  const target = random() * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (target < cum[mid]) hi = mid;
    else lo = mid + 1;
  }
  return population[lo];
}

function systemRng() {
  return {
    choices(population, weights) {
      return [weightedChoice(population, weights, cryptoRandom)];
    },
    gauss(mu, sd) {
      return mu + sd * boxMuller(cryptoRandom);
    }
  };
}

function etatInitial() {
  return { regime: 'stable', serie: 0 };
}

function transitionsAjustees(cfg, regime, serie) {
  const row = { ...cfg.transitions[regime] };
  if (Math.abs(serie) >= cfg.rappel_apres) {
    const bonus = cfg.rappel_force * (Math.abs(serie) - cfg.rappel_apres + 1);
    const cible = serie > 0 ? (name) => !HAUSSIERS.has(name) : (name) => HAUSSIERS.has(name);
    for (const name of Object.keys(row)) row[name] *= cible(name) ? (1 + bonus) : (1 - bonus);
    const total = Object.values(row).reduce((sum, value) => sum + value, 0);
    if (!(total > 0)) throw new Error('Total of weights must be greater than zero');
    for (const name of Object.keys(row)) row[name] /= total;
  }
  return row;
}

function tiragePalier(nom, etat, deltaEvenement = 0, rng = null) {
  const random = rng || systemRng();
  const cfg = CONFIG[nom];
  const [lo, hi] = cfg.bornes;
  const transitions = transitionsAjustees(cfg, etat.regime, etat.serie);
  const names = Object.keys(transitions);
  const regimeTire = random.choices(names, names.map((name) => transitions[name]))[0];
  const [mu, sd] = cfg.regimes[regimeTire];
  const brut = random.gauss(mu, sd);
  let base = clamp(brut, lo, hi);
  let regime = regimeTire;
  let gardeFou = false;
  if (etat.serie <= -cfg.serie_max && base < 0) {
    base = Math.abs(base) * 0.3;
    regime = 'stable';
    gardeFou = true;
  }
  const final = roundDigits(clamp(base + Number(deltaEvenement || 0), lo, hi), 1);
  const serie = final >= 0 ? Math.max(etat.serie, 0) + 1 : Math.min(etat.serie, 0) - 1;
  const suivant = transitionsAjustees(cfg, regime, serie);
  const pGain = Object.entries(suivant).reduce((sum, [name, weight]) => sum + weight * pPositif(...cfg.regimes[name]), 0);
  return {
    final,
    etat: { regime, serie },
    pGain,
    detail: {
      brut: roundDigits(brut, 2),
      base_apres_clamp: roundDigits(base, 2),
      delta_evenement: Number(deltaEvenement || 0),
      garde_fou: gardeFou
    }
  };
}

function tirageSemaine(etats, evenements = null, rng = null) {
  const random = rng || systemRng();
  const deltas = { I: 0, II: 0, III: 0 };
  for (const evenement of evenements || []) {
    const valeur = Number(evenement.valeur);
    for (const nom of evenement.paliers || []) {
      if (!Object.prototype.hasOwnProperty.call(deltas, nom)) throw new Error(`Palier inconnu : ${nom}`);
      deltas[nom] += valeur;
    }
  }
  const resultats = {};
  const nouveaux = {};
  const details = {};
  for (const nom of PALIERS) {
    const tire = tiragePalier(nom, etats[nom], deltas[nom], random);
    resultats[nom] = tire.final;
    nouveaux[nom] = tire.etat;
    details[nom] = { ...tire.detail, p_gain: tire.pGain, regime: tire.etat.regime, label: LIBELLES[tire.etat.regime] || tire.etat.regime };
  }
  return { resultats, etats: nouveaux, details };
}

module.exports = {
  CONFIG, HAUSSIERS, LIBELLES, PALIERS, TIER_OF,
  clamp, pPositif, transitionsAjustees, tiragePalier, tirageSemaine, etatInitial, weightedChoice, issueSemaine
};
