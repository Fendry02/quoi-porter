/**
 * Agrégation de plusieurs modèles météo.
 *
 * Module pur. Open-Meteo sert la même requête à travers plusieurs centres de
 * prévision — ECMWF, GFS, Météo-France, ICON, UK Met Office — en suffixant
 * chaque champ par le nom du modèle. On en tire deux choses :
 *
 *  - la **médiane**, plus robuste qu'un modèle isolé ;
 *  - l'**étendue**, qui dit à quel point les modèles s'accordent. C'est le vrai
 *    gain : une prévision sur laquelle cinq centres divergent de 4 °C ne mérite
 *    pas la même confiance qu'une sur laquelle ils tombent d'accord.
 *
 * Tout se fait variable par variable, jamais modèle par modèle : chaque centre
 * ne publie pas les mêmes grandeurs. ECMWF n'a pas les rafales ; Météo-France
 * et UKMO n'ont pas la probabilité de pluie. Un modèle muet sur une variable
 * doit être ignoré pour celle-là et compté pour les autres.
 */

/** Ne garde que ce qui est réellement chiffré. */
function chiffres(values) {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

/**
 * La médiane, en ignorant les modèles muets.
 *
 * Compter une absence pour zéro ferait plonger la valeur : deux modèles sur
 * cinq annonçant 80 % de pluie donneraient une médiane de 0.
 *
 * @returns {number|null} null si aucun modèle n'a répondu
 */
export function median(values) {
  const tries = chiffres(values).sort((a, b) => a - b);
  if (tries.length === 0) return null;

  const milieu = Math.floor(tries.length / 2);
  return tries.length % 2 === 0 ? (tries[milieu - 1] + tries[milieu]) / 2 : tries[milieu];
}

/**
 * La mise en commun de probabilités, en ignorant les modèles muets.
 *
 * La médiane convient aux grandeurs — un modèle aberrant à 40 °C ne doit pas
 * emporter la journée. Sur une probabilité elle est trompeuse : elle donne la
 * voix au modèle du milieu et fait taire les autres. Trois modèles annonçant
 * 0 %, 90 % et 0 % à la même heure ont une médiane de 0 %, alors qu'un centre
 * sur trois y attend une averse.
 *
 * La moyenne est la façon usuelle de combiner des prévisions probabilistes :
 * chaque modèle pèse sa part, et une minorité reste audible.
 *
 * @returns {number|null} null si aucun modèle n'a répondu
 */
export function pool(values) {
  const tries = chiffres(values);
  if (tries.length === 0) return null;

  return tries.reduce((somme, v) => somme + v, 0) / tries.length;
}

/**
 * Les deux extrêmes entre modèles.
 *
 * @returns {{low: number, high: number}|null} null en dessous de deux modèles,
 *   car il n'y a alors pas de désaccord à mesurer
 */
export function spread(values) {
  const tries = chiffres(values);
  if (tries.length < 2) return null;

  return { low: Math.min(...tries), high: Math.max(...tries) };
}

/**
 * Rassemble une variable sur tous les modèles, à un instant donné.
 *
 * Sans modèle nommé, on lit le champ sans suffixe : c'est le format d'une
 * requête simple, celle du repli quand l'ensemble échoue.
 *
 * @param {object} block le bloc `daily` ou `hourly` de la réponse
 * @param {string} variable le nom de la variable, sans suffixe
 * @param {string[]} models les modèles interrogés
 * @param {number} index le rang de l'heure ou du jour
 */
export function acrossModels(block, variable, models, index) {
  if (models.length === 0) return [block[variable]?.[index]];

  return models.map((model) => block[`${variable}_${model}`]?.[index]);
}
