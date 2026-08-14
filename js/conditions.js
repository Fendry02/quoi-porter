/**
 * Les codes WMO : à quelle famille ils appartiennent, et ce que cinq modèles
 * qui n'en annoncent pas le même disent ensemble.
 *
 * Module pur. Un code météo est une catégorie, pas une grandeur : on n'en fait
 * ni médiane ni moyenne. Mais on peut compter les voix, et c'est ce qui
 * manquait — retenir le premier modèle du tableau revenait à donner la météo
 * du jour à ECMWF seul, majorité contraire ou non.
 *
 * `js/sky.js` garde sa propre partition, plus fine : le rendu distingue un ciel
 * couvert d'un ciel peu nuageux et du brouillard, ce dont l'accord entre
 * modèles n'a que faire.
 */

/** De la plus anodine à la plus sérieuse. L'ordre sert à départager. */
const SEVERITY = ['clear', 'cloud', 'rain', 'snow', 'storm'];

/** L'écart à partir duquel un avis minoritaire mérite d'être rapporté. */
const DISSENT_GAP = 2;

const STORM = [95, 96, 99];
const SNOW = [71, 73, 75, 77, 85, 86];
const RAIN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
const CLOUD = [2, 3, 45, 48];

/** @param {number} weatherCode code WMO */
export function familyOf(weatherCode) {
  if (STORM.includes(weatherCode)) return 'storm';
  if (SNOW.includes(weatherCode)) return 'snow';
  if (RAIN.includes(weatherCode)) return 'rain';
  if (CLOUD.includes(weatherCode)) return 'cloud';
  return 'clear';
}

function severityOf(family) {
  return SEVERITY.indexOf(family);
}

/** Le plus fréquent, les égalités tranchées par le plus grand code. */
function representative(codes) {
  const comptes = new Map();
  for (const code of codes) comptes.set(code, (comptes.get(code) ?? 0) + 1);

  return [...comptes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Ce que les modèles disent ensemble.
 *
 * On compte par famille et non par code : trois modèles annonçant bruine,
 * bruine et pluie sont d'accord sur l'essentiel — il va tomber quelque chose —
 * même si aucun ne choisit le même code.
 *
 * À égalité, le plus sévère l'emporte : mieux vaut un imperméable inutile que
 * l'inverse.
 *
 * @param {(number|null|undefined)[]} codes un code par modèle
 * @returns {{code: number, family: string, agreeing: number, total: number,
 *   dissent: {family: string, code: number, count: number}|null}|null}
 *   null si aucun modèle n'a répondu
 */
export function consensusCode(codes) {
  const avis = codes.filter((c) => typeof c === 'number' && Number.isFinite(c));
  if (avis.length === 0) return null;

  const parFamille = new Map();
  for (const code of avis) {
    const famille = familyOf(code);
    if (!parFamille.has(famille)) parFamille.set(famille, []);
    parFamille.get(famille).push(code);
  }

  const [family, membres] = [...parFamille.entries()].sort(
    (a, b) => b[1].length - a[1].length || severityOf(b[0]) - severityOf(a[0]),
  )[0];

  // La minorité qui annonce nettement pire. Deux crans, pas un : entre couvert
  // et bruine on ne s'habille pas différemment, et signaler chaque voisinage
  // noierait les réserves qui comptent. Celle qui annonce moins grave, elle,
  // ne change rien à ce qu'on met sur le dos : on la passe sous silence.
  const pires = [...parFamille.entries()].filter(
    ([f]) => severityOf(f) - severityOf(family) >= DISSENT_GAP,
  );
  const pire = pires.sort((a, b) => severityOf(b[0]) - severityOf(a[0]))[0];

  return {
    code: representative(membres),
    family,
    agreeing: membres.length,
    total: avis.length,
    dissent: pire
      ? {
          family: pire[0],
          code: representative(pire[1]),
          count: pire[1].length,
          // Le total voyage avec la réserve : « un modèle sur cinq » ne se dit
          // pas sans savoir combien ont voté.
          total: avis.length,
        }
      : null,
  };
}
