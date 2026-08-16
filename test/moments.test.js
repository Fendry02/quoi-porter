import test from 'node:test';
import assert from 'node:assert/strict';

import { laterAdvice } from '../js/moments.js';
import { buildOutfit } from '../js/rules.js';

/** Une journée dont on pilote le ressenti heure par heure. */
function dayWithHours(feelsLikeAt) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    temp: feelsLikeAt(hour),
    feelsLike: feelsLikeAt(hour),
    precipitationMm: 0,
    precipitationProbability: 0,
    windGustsKmh: 8,
    feelsLikeLow: null,
    feelsLikeHigh: null,
  }));

  const ressentis = hours.map((h) => h.feelsLike);

  return {
    date: '2026-08-14',
    tempMin: Math.min(...ressentis),
    tempMax: Math.max(...ressentis),
    feelsLikeMin: Math.min(...ressentis),
    feelsLikeMax: Math.max(...ressentis),
    precipitationMm: 0,
    precipitationProbability: 0,
    windMaxKmh: 8,
    windGustsKmh: 8,
    uvIndex: 2,
    weatherCode: 1,
    conditionDissent: null,
    sunrise: '2026-08-14T06:30',
    sunset: '2026-08-14T21:00',
    utcOffsetSeconds: 0,
    hours,
    feelsLikeSpread: null,
  };
}

const AUBE = new Date('2026-08-14T06:00:00Z');
const SOIREE = new Date('2026-08-14T20:00:00Z');

function adviceFor(weather, at = AUBE) {
  return laterAdvice(weather, buildOutfit(weather), at);
}

test('silence quand la tenue tient toute la journée', () => {
  // Une journée plate ne réserve aucune surprise : parler pour ne rien annoncer
  // userait la confiance dans les fois où l'on parle vraiment.
  assert.equal(adviceFor(dayWithHours(() => 18)), null);
});

test('annonce la couche quand le soir refroidit assez pour la changer', () => {
  // 21 °C l'après-midi, 7 °C le soir : la tenue du jour ne suffit plus.
  const jour = dayWithHours((hour) => (hour >= 18 ? 7 : 21));

  const avis = adviceFor(jour);
  assert.ok(avis, 'un avis est attendu');
  assert.match(avis, /soir/i);
});

test('l’avis nomme ce qu’il faut prendre, article compris', () => {
  const jour = dayWithHours((hour) => (hour >= 18 ? 3 : 21));

  // « Prends manteau » se lirait mal, et se dirait plus mal encore à voix haute.
  assert.match(adviceFor(jour), /un manteau|une veste/i);
});

test('la pièce à retirer porte aussi son article', () => {
  const jour = dayWithHours((hour) => (hour >= 12 && hour <= 17 ? 24 : 14));

  assert.match(adviceFor(jour), /la chemise|le pull|le t-shirt/i);
});

test('prévient aussi quand on aura trop chaud plus tard', () => {
  // Sortir couvert à 8 h pour suffoquer à 15 h est le même échec, à l'envers.
  // Le soir reste tempéré ici, sans quoi la pièce qui manquerait passerait
  // devant — et c'est bien ce qu'on veut par ailleurs.
  const jour = dayWithHours((hour) => (hour >= 12 && hour <= 17 ? 24 : 14));

  const avis = adviceFor(jour);
  assert.ok(avis, 'un avis est attendu');
  assert.match(avis, /chaud/i);
  assert.match(avis, /après-midi/i);
});

test('un moment déjà passé ne se commente pas', () => {
  // À 20 h, prévenir que l'après-midi était chaud n'aide plus personne. Le soir
  // reste commentable, lui : c'est l'heure qu'il est.
  const jour = dayWithHours((hour) => (hour >= 12 && hour <= 17 ? 29 : 18));

  assert.doesNotMatch(adviceFor(jour, SOIREE) ?? '', /après-midi/i);
});

test('ce qui manquera passe devant ce qui sera en trop', () => {
  // Après-midi trop chaud, soir trop froid. On annonce le soir bien qu'il
  // arrive plus tard : une couche en trop se retire, un manteau resté chez soi
  // ne s'invente pas.
  const jour = dayWithHours((hour) => {
    if (hour >= 18) return 4;
    if (hour >= 12) return 29;
    return 18;
  });

  assert.match(adviceFor(jour), /soir/i);
});

test('sans heures, pas d’avis', () => {
  const jour = dayWithHours(() => 18);
  jour.hours = [];

  assert.equal(adviceFor(jour), null);
});

test('les pièces qualifiées portent leur article, comme les autres', () => {
  // Une table de correspondance exacte manquait « chemise légère » et rendait
  // le nom nu — « prévois de retirer chemise légère » — sans que rien ne le
  // signale, y compris à VoiceOver. Le genre tient au nom de tête ; le
  // qualificatif ne le change pas. On balaie donc les journées qui montent, et
  // on exige un article partout où une pièce est nommée.
  const montees = [
    [10, 22],
    [12, 24],
    [14, 26],
    [16, 26],
    [18, 30],
    [4, 16],
    [0, 12],
  ];

  let vus = 0;

  for (const [matin, apresMidi] of montees) {
    const jour = dayWithHours((hour) => (hour < 12 ? matin : apresMidi));
    const conseil = laterAdvice(jour, buildOutfit(jour), AUBE);
    if (!conseil || !/retirer/.test(conseil)) continue;

    vus += 1;
    assert.match(conseil, /retirer (le|la|l’)/, `article manquant dans : ${conseil}`);
  }

  assert.ok(vus >= 3, `seulement ${vus} conseils de retrait produits, l’échantillon est trop maigre`);
});
