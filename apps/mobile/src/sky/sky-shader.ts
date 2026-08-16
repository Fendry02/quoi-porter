/**
 * Le ciel, en un seul shader.
 *
 * Le web empile des maillages Three.js — un dôme, des plans de nuages, un
 * système de particules. Sur téléphone, tout tient dans un seul passage de
 * fragment : une passe plein écran coûte moins cher que la géométrie, et la
 * batterie d'un geste matinal n'est pas extensible.
 *
 * Comme sur le web, ce module ne connaît que des SkyMood. Aucun code WMO,
 * aucune température n'arrive jusqu'ici : `js/sky.js` a déjà tout traduit.
 *
 * Chaque effet qui coûte du bruit est gardé derrière un `if` sur son uniforme.
 * Un uniforme est constant sur tout le tirage : la branche est prise ou non
 * pour l'écran entier, sans divergence entre pixels voisins. C'est ce qui
 * permet d'avoir onze couches sans les payer toutes à chaque image — un ciel
 * dégagé de nuit ne calcule ni rayons, ni ombres, ni arc-en-ciel.
 */

export const SKY_SHADER = `
uniform float2 u_resolution;
uniform float  u_time;

uniform float3 u_zenith;
uniform float3 u_horizon;

uniform float u_sunHeight;
uniform float u_sunIntensity;
uniform float u_starDensity;
uniform float u_cloudCover;
uniform float u_cloudSpeed;
uniform float u_turbulence;
uniform float u_haze;
uniform float u_precipIntensity;
uniform float u_precipIsSnow;
uniform float u_flash;

uniform float u_wind;
uniform float u_heat;
uniform float u_moonPhase;

/** Progression du défilement, 0 en haut de page, 1 en bas. */
uniform float u_scroll;
/** Ce qu'on a tiré vers le bas au-delà du haut, de 0 à 1. */
uniform float u_dawn;

const float TAU = 6.2831853;

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float d = hash21(i + float2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Quatre octaves : au-delà, le gain visuel ne paie plus son coût. */
float fbm(float2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

/**
 * Deux octaves, pour les masses qui dérivent sans qu'on lise leur détail :
 * les ombres de nuages et les traînées de vent. Moitié moins cher que fbm.
 */
float fbm2(float2 p) {
  return 0.64 * valueNoise(p) + 0.28 * valueNoise(p * 2.03 + 17.0);
}

/**
 * Une nappe de pluie : des colonnes qui défilent, chacune avec sa phase.
 *
 * L'inclinaison suit les rafales. Elle était fixe, si bien qu'une bourrasque à
 * 70 km/h faisait tomber la pluie aussi droit qu'une bruine — le vent se lisait
 * dans les traînées d'air et pas dans ce qui tombe, ce qui est l'inverse de ce
 * qu'on voit par la fenêtre.
 */
float rainLayer(float2 uv, float scale, float speed, float seedOffset) {
  float2 p = float2(uv.x * scale, uv.y);
  p.x += uv.y * (0.25 + u_wind * 1.7);

  float column = floor(p.x);
  float phase = hash21(float2(column, seedOffset));

  float y = fract(p.y * 6.0 - u_time * speed - phase * 10.0);
  float x = fract(p.x);

  return smoothstep(0.06, 0.0, abs(x - 0.5)) * smoothstep(0.55, 0.0, y);
}

/** La neige tombe moins vite et dérive de côté. */
float snowLayer(float2 uv, float scale, float speed, float seedOffset) {
  float2 p = uv * scale;
  p.y -= u_time * speed * 0.15;
  p.x += sin(u_time * 0.6 + p.y * 1.4) * 0.25 + seedOffset;

  float2 id = floor(p);
  float2 f = fract(p) - 0.5;

  float seed = hash21(id);
  float radius = 0.10 + seed * 0.10;

  return smoothstep(radius, radius * 0.3, length(f)) * step(0.62, seed);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_resolution;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);

  // 0. L'air qui tremble au-dessus du sol, par grosse chaleur. Appliqué au
  //    tout début, sur les coordonnées : tout ce qui suit en hérite, comme si
  //    on regardait la scène à travers une couche d'air chaud.
  if (u_heat > 0.01) {
    float wobble = sin(uv.y * 118.0 - u_time * 5.5) * sin(uv.x * 9.0 + u_time * 1.3);
    uv.x += wobble * u_heat * 0.0035 * smoothstep(0.42, 1.0, uv.y);
  }

  // 0b. La parallaxe. Chaque couche se décale d'autant moins qu'elle est loin :
  //     les nuages beaucoup, le dôme à peine, les étoiles pas du tout — elles
  //     sont à l'infini, et c'est exactement pour ça qu'elles ne bougent pas.
  float par = u_scroll;

  // 0c. Ce qu'on a tiré vers le bas relève le soleil : le jour se lève sous le
  //     pouce. Tout ce qui dépend de l'astre passe par sunLit et en profite.
  float sunLit = clamp(u_sunIntensity + u_dawn * 0.45, 0.0, 1.0);

  // 1. Le dôme. L'exposant décide à quelle hauteur le zénith cède à l'horizon,
  //    et il suit la couverture : un ciel dégagé garde son bleu jusqu'au bas de
  //    l'écran et ne blanchit que sur la dernière bande, comme dehors ; un ciel
  //    couvert, lui, est pâle partout et le reste. Un exposant unique de 0,85
  //    donnait à tout le monde le ciel du couvert — le grand beau temps virait
  //    au blanc dès la moitié de la hauteur, et c'est ce qui lui ôtait son
  //    éclat bien plus que sa teinte.
  float courbe = mix(1.45, 0.85, u_cloudCover);
  float domeY = clamp(uv.y + par * 0.030, 0.0, 1.0);
  float3 color = mix(u_zenith, u_horizon, pow(domeY, courbe));

  // 1b. Le plein soleil réchauffe tout le dôme, et pas seulement les abords de
  //     l'astre. Un ciel dégagé de midi n'est jamais du bleu pur et froid : il
  //     est baigné. Sans ce terme, la seule chose qui distinguait un grand beau
  //     temps d'un ciel couvert clair était la teinte du dégradé, et l'écran ne
  //     donnait jamais la sensation qu'il fait beau dehors.
  float franc = sunLit * (1.0 - u_cloudCover);
  color += float3(0.11, 0.075, 0.025) * franc;

  // 2. L'astre. Sa hauteur suit le soleil réel du lieu ; les nuages l'ont déjà
  //    voilé en amont, dans sunIntensity.
  //
  //    Trois termes qui se superposent, comme sur le dôme du web : un disque
  //    net, une couronne serrée, un lobe large et faible. Un seul exponentiel
  //    ne donnait qu'une tache floue dont on ne savait pas si c'était le soleil
  //    ou un défaut du dégradé — et le grand beau temps se doit d'avoir un
  //    astre qu'on puisse montrer du doigt.
  float2 sunPos = float2(0.68, 0.74 - u_sunHeight * 0.58 + par * 0.085);
  float sunDist = distance(float2(uv.x * aspect, uv.y), float2(sunPos.x * aspect, sunPos.y));

  // Le disque respire à peine : de quoi empêcher le ciel de paraître figé sans
  // qu'on sache dire ce qui bouge.
  float breath = 0.92 + 0.08 * sin(u_time * 0.55);
  float disc = 1.0 - smoothstep(0.021, 0.028, sunDist);
  float corona = exp(-sunDist * 20.0) * 0.55 + exp(-sunDist * 4.2) * 0.5;

  // La couleur de l'astre suit sa hauteur : blanc franc au zénith, orangé quand
  // il rase l'horizon. C'est ce qui fait qu'un soleil de 8 h ne ressemble pas à
  // un soleil de midi.
  float3 warm = mix(float3(1.0, 0.72, 0.42), float3(1.0, 0.95, 0.82),
                    clamp(u_sunHeight, 0.0, 1.0));

  //    La couronne suit sunLit, qui sait déjà que les nuages voilent l'astre.
  //    Le disque, lui, suit franc : sous une couche épaisse on ne voit pas le
  //    soleil, on voit un ciel lumineux. Les faire dépendre du même nombre
  //    collait un disque blanc et net au milieu d'un ciel couvert — le contraire
  //    de ce qu'on voit en levant la tête un jour gris.
  color += warm * corona * breath * sunLit;

  //    Le disque s'ajoute au lieu de remplacer, et sature donc vers le blanc :
  //    c'est ce qu'on voit d'un astre qu'on ne peut pas regarder en face. Une
  //    version qui posait sa vraie couleur donnait une pastille orange en plein
  //    milieu d'un ciel bleu — un autocollant, pas un soleil. L'ambre reste où
  //    elle a lieu d'être : dans la couronne, et au ras de l'horizon, où la
  //    palette du crépuscule prend le relais.
  //
  //    Le seuil doux le fait naître quand le ciel se dégage : sous une couche
  //    épaisse le disque n'existe pas, et la couronne suffit à dire qu'il fait
  //    jour.
  float disqueVisible = smoothstep(0.04, 0.30, franc);
  color += mix(warm, float3(1.0), 0.7) * disc * disqueVisible * 1.15;

  // 2b. Les rayons crépusculaires. L'angle module trois sinusoïdes de périodes
  //     entières : elles se referment exactement sur un tour, là où du bruit
  //     laisserait une couture visible sur l'axe du soleil.
  //     Il faut des nuages pour qu'un rayon se dessine, mais il faut aussi que
  //     le soleil perce : sous l'averse il ne perce plus. Une ondée laisse
  //     encore passer ses traits — c'est le ciel des pluies de soleil — une
  //     pluie franche les éteint tout à fait.
  //
  //     Les nuages sont désormais une vraie condition et non un simple bonus.
  //     Un ciel parfaitement dégagé recevait 0,20 de rayons : il n'en existe
  //     pas dehors, et à l'écran ils dominaient tout, jusqu'à ce que le fond
  //     ressemble moins à un ciel qu'à un halo d'objectif. Leurs périodes ont
  //     baissé dans la foulée — moins de traits, plus larges, comme la lumière
  //     qui passe entre deux masses plutôt qu'un soleil d'affiche.
  float perce = sunLit * (1.0 - u_precipIntensity) * smoothstep(0.05, 0.45, u_cloudCover);
  if (perce > 0.02) {
    float2 sd = float2(uv.x * aspect, uv.y) - float2(sunPos.x * aspect, sunPos.y);
    float ang = atan(sd.y, sd.x);
    float rad = length(sd);

    float beam = sin(ang * 5.0 + u_time * 0.11)
               + 0.62 * sin(ang * 11.0 - u_time * 0.07)
               + 0.38 * sin(ang * 19.0 + u_time * 0.13);

    float rays = smoothstep(0.45, 1.55, beam) * exp(-rad * 2.8);
    color += float3(1.0, 0.94, 0.82) * rays * perce * (0.10 + 0.42 * u_cloudCover);
  }

  // 3. Les étoiles ne sortent que d'un ciel dégagé, et jamais près du sol.
  //
  //    Le tirage se fait par cellule de trois pixels, mais l'éclat suit la
  //    position *dans* la cellule : sans cela, ses neuf pixels reçoivent la même
  //    valeur et l'étoile est un petit carré. À trois pixels de côté, sur un
  //    écran qu'on tient à trente centimètres, cela se voit.
  if (u_starDensity > 0.01) {
    float2 grid = fragCoord / 3.0;
    float seed = hash21(floor(grid));
    float twinkle = 0.6 + 0.4 * sin(u_time * 2.0 + seed * 60.0);
    float rond = smoothstep(0.5, 0.05, length(fract(grid) - 0.5));
    float star = smoothstep(0.9965, 1.0, seed) * twinkle * rond;
    color += float3(1.0) * star * u_starDensity * (1.0 - uv.y);
  }

  // 3b. Une étoile filante, par ciel bien étoilé. Elle ne vit que les neuf
  //     premiers centièmes de son créneau : le reste du temps le ciel est vide,
  //     et c'est ce vide qui la rend précieuse quand elle passe.
  if (u_starDensity > 0.25) {
    float slot = floor(u_time / 6.5);
    float t = fract(u_time / 6.5);
    float live = (1.0 - smoothstep(0.075, 0.090, t)) * smoothstep(0.0, 0.012, t);

    if (live > 0.001) {
      float seed = hash21(float2(slot, 11.3));
      float2 start = float2(0.12 + seed * 0.72, 0.04 + fract(seed * 7.13) * 0.22);
      float2 dir = normalize(float2(-0.74, 0.67));

      float2 head = start + dir * (t / 0.090) * 0.55;
      float2 tail = head - dir * 0.11;

      // Distance au segment queue → tête, en unités d'écran comparables.
      float2 seg = float2((head.x - tail.x) * aspect, head.y - tail.y);
      float2 rel = float2((uv.x - tail.x) * aspect, uv.y - tail.y);
      float h = clamp(dot(rel, seg) / max(dot(seg, seg), 0.0001), 0.0, 1.0);
      float dist = length(rel - seg * h);

      // h fait s'affiner la traînée vers la queue, comme une comète.
      float streak = smoothstep(0.0035, 0.0, dist) * h;
      color += float3(1.0, 0.98, 0.92) * streak * live * u_starDensity;
    }
  }

  // 3c. La lune, avec sa phase. Le terminateur est une demi-ellipse dont la
  //     largeur signée vaut cos(2π·phase) : -1 en pleine lune donc tout le
  //     disque éclairé, +1 en nouvelle lune donc rien, 0 aux quartiers. Le
  //     signe de waxing retourne le croissant entre premier et dernier.
  float night = clamp(-u_sunHeight * 2.0, 0.0, 1.0);
  float moonVisible = night * (1.0 - u_cloudCover * 0.88);
  if (moonVisible > 0.01) {
    float radius = 0.062;
    float2 center = float2(0.24, 0.20 + par * 0.020);
    float2 md = float2((uv.x - center.x) * aspect, uv.y - center.y) / radius;
    float mr = length(md);

    float disc = 1.0 - smoothstep(0.93, 1.0, mr);
    float waxing = u_moonPhase < 0.5 ? 1.0 : -1.0;
    float term = cos(TAU * u_moonPhase);
    float lit = smoothstep(-0.07, 0.07, md.x * waxing - term * sqrt(max(0.0, 1.0 - md.y * md.y)));

    // Un peu de relief : sans lui, le disque est un autocollant.
    float maria = valueNoise(md * 3.4 + 8.1);
    float3 moonColor = float3(0.96, 0.95, 0.90) * (0.90 + 0.16 * maria);

    float halo = exp(-mr * 2.1) * 0.14;
    color += moonColor * (disc * lit + halo) * moonVisible;
  }

  // 4. Les nuages.
  //
  //    La dérive est retranchée des coordonnées avant toute mise à l'échelle :
  //    les deux nappes et la déformation en héritent donc ensemble, et le ciel
  //    traverse l'écran. Chacune glissait auparavant à sa propre vitesse, si
  //    bien que le champ bouillonnait sur place au lieu d'avancer — un
  //    frémissement, jamais un passage de nuages.
  //
  //    L'évolution, elle, ne touche que la déformation, et dix fois plus
  //    lentement : c'est ce qui fait qu'un nuage se refait en avançant sans
  //    qu'on puisse dire à quel moment il a changé.
  float drift = u_time * (0.004 + u_cloudSpeed * 0.014);
  float evolve = u_time * 0.010;
  float2 cuv = uv + float2(0.0, par * 0.16) - float2(drift, 0.0);

  //    L'échelle est celle d'origine. Agrandir les masses semblait devoir
  //    aider — on voit peu de ciel sur un téléphone — mais au-delà, les quatre
  //    octaves ne suffisent plus à border la forme : le nuage devient une
  //    découpe plate. La finesse du bord tient au rapport entre l'échelle et le
  //    nombre d'octaves, pas à l'une des deux seule.
  float2 warp = float2(fbm(cuv * 3.0 + evolve), fbm(cuv * 3.0 - evolve + 11.0));
  float2 cp = cuv * float2(2.2, 3.4) + warp * (0.12 + u_turbulence * 0.35);

  float brut = mix(fbm(cp), fbm(cp * 1.7 + 3.1), 0.45);

  //    Un fbm de bruit de valeur ne parcourt pas [0, 1] : ses quatre octaves se
  //    moyennent autour de 0,47 et le champ tient en réalité entre 0,22 et
  //    0,62. Les seuils, eux, étaient réglés comme s'il allait de zéro à un.
  //    Conséquence mesurée : à 38 % de couverture, 2 % de l'écran passait le
  //    seuil — aucun nuage visible ; à 82 %, 89 % le passait — un aplat sans
  //    forme. Aucune couverture ne donnait de vrais nuages. On ramène donc le
  //    champ sur [0, 1] avant d'en juger, et les seuils redeviennent lisibles.
  float clouds = clamp((brut - 0.22) / 0.40, 0.0, 1.0);

  //    Le fondu reste serré : c'est lui qui donne un bord au nuage. Étalé sur
  //    0,28 alors que le champ n'en parcourait que 0,40, il noyait toute forme
  //    dans un voile.
  float edge = mix(1.02, 0.02, u_cloudCover);
  float mask = smoothstep(edge, edge + 0.15, clouds) * smoothstep(0.95, 0.28, cuv.y);

  //    L'éclat d'un nuage tient à la lumière qui l'atteint, donc à la couche
  //    qui le surplombe : un cumulus isolé est éclatant, la base d'un ciel
  //    d'averse est sombre. La rampe précédente allait du gris au blanc sans
  //    tenir compte de la couverture, et peignait donc des nuages *plus clairs*
  //    que le ciel de pluie derrière eux — des sommets enneigés au-dessus d'un
  //    orage, exactement l'inverse de ce qu'on voit lever les yeux.
  float eclat = clamp(sunLit * (1.0 - 0.75 * u_cloudCover) + 0.12, 0.0, 1.0);

  //    Le côté sombre est pris sur le ciel lui-même plutôt que sur un gris
  //    absolu : le nuage appartient à l'ambiance du jour, il ne se pose pas
  //    dessus.
  float3 lit = mix(u_zenith * 0.85, float3(1.0, 0.99, 0.96), eclat);

  //    Le ventre du nuage est plus sombre que ses bords. Sans cette nuance, un
  //    ciel couvert n'a aucun relief : il est couvert d'un seul ton, ce qui
  //    n'arrive jamais dehors.
  lit = lit * (1.0 - 0.28 * smoothstep(edge, 1.0, clouds));

  color = mix(color, lit, mask * (0.40 + 0.45 * u_cloudCover));

  // 4a. Le liséré d'argent. Sur le bord tourné vers l'astre, la lumière passe
  //     au bord du nuage et le contour s'allume. On regarde le champ un pas
  //     plus loin en direction du soleil : là où il retombe, c'est qu'on est
  //     sur ce bord-là.
  //
  //     La branche porte sur des uniformes, donc elle est prise ou non pour
  //     l'écran entier : un ciel dégagé et une nuit ne paient pas les deux
  //     octaves supplémentaires.
  if (u_cloudCover > 0.12 && sunLit > 0.04) {
    float2 versSoleil = normalize(float2((sunPos.x - uv.x) * aspect, sunPos.y - uv.y));
    float2 pas = float2(versSoleil.x / aspect, versSoleil.y) * 0.010;
    float2 cpv = (cuv + pas) * float2(2.2, 3.4) + warp * (0.12 + u_turbulence * 0.35);

    float brutVoisin = mix(fbm(cpv), fbm(cpv * 1.7 + 3.1), 0.45);
    float voisin = clamp((brutVoisin - 0.22) / 0.40, 0.0, 1.0);

    float rim = clamp((clouds - voisin) * 7.0, 0.0, 1.0) * mask;
    color += float3(1.0, 0.96, 0.86) * rim * sunLit * 0.60;
  }

  // 4b. Les ombres de nuages traversent lentement, plus vite que les nuages
  //     eux-mêmes : c'est ce décalage qui donne l'impression d'un relief
  //     survolé plutôt que d'un aplat qui glisse.
  if (u_cloudCover > 0.12) {
    float shade = fbm2(uv * float2(1.05, 1.7) + float2(-u_time * 0.028 - par * 0.09, 0.0));
    color *= 1.0 - 0.10 * smoothstep(0.42, 0.78, shade) * u_cloudCover;
  }

  // 4c. Le vent se voit : des traînées d'air très étirées, qui filent d'autant
  //     plus vite qu'il souffle. Rien en dessous d'une brise.
  if (u_wind > 0.02) {
    float2 wp = float2(uv.x * 2.4 - u_time * (0.55 + u_wind * 1.1), uv.y * 30.0);
    float streaks = fbm2(wp);
    float veil = smoothstep(0.52, 0.74, streaks)
               * smoothstep(0.06, 0.35, uv.y)
               * (1.0 - smoothstep(0.72, 1.0, uv.y));
    color += float3(1.0) * veil * u_wind * 0.10;
  }

  // 5. La brume monte du bas et mange l'horizon.
  color = mix(color, u_horizon, u_haze * smoothstep(0.25, 1.0, uv.y) * 0.75);

  // 5b. L'arc-en-ciel : soleil franc et pluie en cours en même temps, ce qui
  //     est rare. Centré au point antisolaire — à l'opposé du soleil, autant
  //     sous l'horizon que l'astre est au-dessus — et large de 42°, si bien
  //     qu'il ne se lève que quand le soleil est bas. Comme dans la vraie vie.
  float bowGate = smoothstep(0.12, 0.40, sunLit)
                * smoothstep(0.08, 0.35, u_precipIntensity)
                * (1.0 - u_precipIsSnow);
  if (bowGate > 0.01) {
    float2 center = float2(1.0 - sunPos.x, 0.74 + 0.58 * u_sunHeight);
    float2 bd = float2((uv.x - center.x) * aspect, uv.y - center.y);
    float br = length(bd);

    float band = smoothstep(0.245, 0.262, br) * (1.0 - smoothstep(0.292, 0.312, br));
    band *= smoothstep(0.01, 0.16, center.y - uv.y);

    // Le rouge à l'extérieur, le violet à l'intérieur : l'ordre est celui du
    // vrai arc, pas celui d'un dégradé décoratif.
    float outward = clamp((br - 0.245) / 0.062, 0.0, 1.0);
    float3 bow = 0.5 + 0.5 * cos(TAU * (0.75 * (1.0 - outward) + float3(0.0, 0.33, 0.67)));

    color += bow * band * bowGate * 0.26;
  }

  // 6. Ce qui tombe. Deux nappes, l'une derrière l'autre.
  if (u_precipIntensity > 0.01) {
    if (u_precipIsSnow > 0.5) {
      float flakes = snowLayer(uv, 14.0, 1.0, 0.0) + snowLayer(uv, 9.0, 0.65, 3.7);
      color = mix(color, float3(1.0), clamp(flakes * u_precipIntensity * 0.9, 0.0, 1.0));
    } else {
      float drops = rainLayer(uv, 60.0, 2.6, 7.0) + rainLayer(uv, 38.0, 1.9, 19.0);
      color = mix(color, float3(0.85, 0.90, 0.95), clamp(drops * u_precipIntensity * 0.7, 0.0, 1.0));
    }
  }

  // 7. L'éclair blanchit tout le ciel, un instant.
  color += float3(0.90, 0.93, 1.0) * u_flash * 0.55;

  // 8. Et le geste de tirer éclaircit l'ensemble, en plus d'avoir relevé
  //    l'astre : sans ça, tirer sur un ciel de nuit ne montrerait rien.
  color += float3(1.0, 0.96, 0.88) * u_dawn * 0.10;

  // 9. Le grain, en tout dernier.
  //
  //    Un dégradé aussi doux ne dispose que de huit bits par canal, et se
  //    découpe donc en marches : jusqu'à trente-sept pixels d'une seule couleur
  //    au zénith d'une nuit, qu'un écran OLED souligne au lieu de les masquer.
  //    Un bruit d'un niveau et demi dissout la marche sans jamais se voir
  //    lui-même. Le dôme du web le fait depuis toujours ; celui-ci ne le
  //    faisait pas.
  //
  //    Renouvelé vingt-quatre fois par seconde et non à chaque image : au
  //    rythme de l'écran, le grain scintille ; à celui du cinéma, il vit.
  float grain = hash21(fragCoord + floor(u_time * 24.0)) - 0.5;
  color += grain * 0.012;

  return half4(half3(clamp(color, 0.0, 1.0)), 1.0);
}
`;
