import { describe, it, expect, beforeAll } from 'vitest';
import { loadEngine } from './engine-loader.js';

let engine;
beforeAll(() => { engine = loadEngine(); });

// Grille de gains minimale : une réhabilitation qui fait gagner 3 classes à un logement E (E -> B),
// et un changement de vecteur qui n'en fait gagner aucune (seul le facteur d'émission doit bouger).
const GAINS = {
  'Réha niv. 3': { energie: { G: 4, F: 4, E: 3, D: 2, C: 2, B: 1, A: 0 }, ges: {} },
  "- Passage à l'électrique (radiateurs)": { energie: { G: 0, F: 0, E: 0, D: 0, C: 0, B: 0, A: 0 }, ges: {} },
};
// Une résidence de 100 logements classés E, 10 000 m², 290 kWh/m² constatés, chauffage gaz collectif
// (facteur d'émission 0,244) : tous les chiffres attendus ci-dessous s'en déduisent à la main.
function residenceE() {
  return {
    code: 'R1', nbLgt: 100, shab: 10000, kwhM2: 290,
    modeChauffage: 'Gaz', typeChauffage: 'Collectif',
    distEnergie: { A: 0, B: 0, C: 0, D: 0, E: 100, F: 0, G: 0, NR: 0 },
  };
}
function reha(annee) {
  return { id: 'o1', resCode: 'R1', annee, type: 'Réha.', nature: 'Réha niv. 3', statut: 'programme', logements: null };
}
function run(residences, operations, years, mouvements, refs) {
  return engine.computeDecarbonation(residences, operations, GAINS, years, true, refs || engine.refsDecarbonationDefaut(), mouvements || {});
}

describe('parseTableDpeFe — référentiels optionnels du fichier client', () => {
  it('lit les valeurs moyennes par classe (GES puis thermique) et les facteurs d\'émission par vecteur', () => {
    const matrix = [
      ['Table DPE', 'GES', null, 'Thermique'],
      [null, 'kgCO2/m²', 'valeur moy', 'KWh/m²', null, 'valeur moy'],
      ['A', '0 à 6', 6, '0 à 70', null, 70],
      ['B', '6 à 11', 9, '70 à 110', null, 90],
      ['C', '11 à 30', 20, '110 à 180', null, 145],
      ['D', '30 à 50', 40, '180 à 250', null, 210],
      ['E', '50 à 70', 60, '250 à 330', null, 290],
      ['F', '70 à 100', 85, '330 à 420', null, 375],
      ['G', '100', 100, '420', null, 420],
      [],
      ['Energie'],
      ["Type d'énergie ", 'Nom FE', 'Valeur ', 'Unité '],
      ['Collectif - gaz', 'Gaz naturel', 0.244, 'kgCO2e/kWh'],
      ['Individuel - électrique', 'Electricité', 0.052, 'kgCO2e/kWh'],
    ];
    const out = engine.parseTableDpeFe(matrix);
    expect(out.kwhM2).toEqual({ A: 70, B: 90, C: 145, D: 210, E: 290, F: 375, G: 420 });
    expect(out.kgCo2M2.G).toBe(100);
    expect(out.fe['collectif - gaz']).toBe(0.244);
    expect(out.fe['individuel - electrique']).toBe(0.052);
  });

  it('retombe sur les valeurs Cellance pour les classes absentes du fichier, sans écraser les autres', () => {
    const matrix = [
      [null, null, 'valeur moy', null, null, 'valeur moy'],
      ['A', null, 5, null, null, 60],
    ];
    const out = engine.parseTableDpeFe(matrix);
    expect(out.kwhM2.A).toBe(60);
    expect(out.kwhM2.G).toBe(engine.DPE_KWH_M2_DEFAUT.G);
  });

  it('renvoie null quand la feuille ne contient aucun des deux blocs (repli complet côté appelant)', () => {
    expect(engine.parseTableDpeFe([['Autre chose'], [1, 2, 3]])).toBe(null);
  });
});

describe('parseVecteursTravaux — vecteur visé par une nature de travaux', () => {
  const matrix = [
    ['_RC', 'Remplacement de composants', 'Détail', 'Coût', 'Unité', null, 'Projection nvx vecteur'],
    ['Ravalement de façade', 'Ravalement de façade', null, 8000, 'logt', null, 'NC'],
    ['Chgt_vecteur', 'Changement de vecteur :', null, null, null, null, 'Vecteur post interv.'],
    ["- Passage à l'électrique (radiateurs)", null, null, 7000, 'logt', null, 'Individuel - électrique'],
    ['- Passage en réseau de chaleur urbain', null, null, 350000, 'Bâtiment', null, 'Chaufferie urbain'],
  ];

  it('ne retient que les natures qui changent effectivement de vecteur', () => {
    const out = engine.parseVecteursTravaux(matrix);
    expect(out["- passage a l'electrique (radiateurs)"] || out['- passage a lelectrique (radiateurs)']).toBe('Individuel - électrique');
    expect(out['- passage en reseau de chaleur urbain']).toBe('Chaufferie urbain');
    expect(out['ravalement de facade']).toBeUndefined();
  });

  it('ignore les lignes d\'en-tête de bloc plutôt que de les prendre pour un vecteur', () => {
    const out = engine.parseVecteursTravaux(matrix);
    expect(out['chgt_vecteur']).toBeUndefined();
    expect(out['_rc']).toBeUndefined();
  });
});

describe('vecteurInitialResidence — cascade JY (mode énergie × type chauffage)', () => {
  it('croise les deux colonnes pour produire la clé du facteur d\'émission', () => {
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Gaz', typeChauffage: 'Collectif' })).toBe('collectif - gaz');
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Electrique', typeChauffage: 'Individuel' })).toBe('individuel - electrique');
  });

  it('rattache la pompe à chaleur au facteur d\'émission de l\'électricité (écart assumé avec l\'Excel)', () => {
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Pompe à chaleur', typeChauffage: 'Individuel' })).toBe('individuel - electrique');
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Pompe à chaleur', typeChauffage: 'Collectif' })).toBe('collectif - electrique');
    // La géothermie est une PAC, mais elle a son propre facteur dans la table : elle ne doit pas
    // basculer sur celui de l'électricité.
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Géothermie', typeChauffage: 'Collectif' })).toBe('collectif - geothermie');
  });

  it('laisse non résolus les cas que l\'Excel renvoie lui-même « À ventiler » ou hors table', () => {
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Gaz', typeChauffage: 'Hybride' })).toBe(null);
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Pompe à chaleur', typeChauffage: 'Hybride' })).toBe(null);
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Bois', typeChauffage: null })).toBe(null);
    expect(engine.vecteurInitialResidence({ modeChauffage: null, typeChauffage: 'Collectif' })).toBe(null);
  });

  it('ne dépend pas du type de chauffage pour les vecteurs qui n\'existent qu\'en collectif', () => {
    expect(engine.vecteurInitialResidence({ modeChauffage: 'Réseau de chaleur', typeChauffage: null })).toBe('chaufferie urbain');
  });
});

describe('repartirEntier — arrondi de la répartition DPE', () => {
  it('fait toujours totaliser les parts arrondies à la ligne Total', () => {
    const parts = { A: 33.4, B: 33.3, C: 33.3 };
    const out = engine.repartirEntier(parts, 100);
    expect(out.A + out.B + out.C).toBe(100);
  });

  it('supporte un total nul (parc entièrement sorti)', () => {
    const out = engine.repartirEntier({ A: 0, B: 0 }, 0);
    expect(out.A + out.B).toBe(0);
  });
});

describe('computeDecarbonation — règle KB (kWh/m² constaté vs valeur conventionnelle)', () => {
  it('conserve le kWh/m² constaté tant que la classe DPE ne bouge pas', () => {
    const { lignes } = run([residenceE()], [], [2026, 2027]);
    expect(lignes[0].consoKwh).toBe(290 * 10000);
    expect(lignes[0].consoKwhM2).toBe(290);
    expect(lignes[0].gainConsoKwh).toBe(0);
    expect(lignes[1].consoKwh).toBe(290 * 10000);
    expect(lignes[1].gainConsoKwh).toBe(0);
  });

  it('bascule sur la valeur conventionnelle de la nouvelle classe dès que le logement en change (E -> B)', () => {
    const { lignes } = run([residenceE()], [reha(2027)], [2026, 2027]);
    expect(lignes[1].consoKwh).toBe(90 * 10000);          // valeur moyenne de la classe B
    expect(lignes[1].gainConsoKwh).toBe(90 * 10000 - 290 * 10000);
    expect(lignes[1].repartition.B).toBe(100);
    expect(lignes[1].repartition.E).toBe(0);
  });

  it('n\'applique la valeur conventionnelle qu\'aux logements ayant réellement changé de classe', () => {
    // Parc mixte : 40 logements en B et 60 en E. La réhabilitation fait gagner 1 classe aux B (-> A) et
    // 3 aux E (-> B) : les deux cohortes ont bougé, aucune ne conserve son kWh/m² constaté, et les 40
    // logements désormais en A ne doivent surtout pas être confondus avec des « restés en B ».
    const res = residenceE();
    res.distEnergie = { A: 0, B: 40, C: 0, D: 0, E: 60, F: 0, G: 0, NR: 0 };
    const { lignes } = run([res], [reha(2027)], [2026, 2027]);
    expect(lignes[0].consoKwh).toBe(100 * 100 * 290); // avant travaux : tout le parc au constaté
    expect(lignes[1].consoKwh).toBe(100 * (40 * 70 + 60 * 90));
  });

  it('conserve le constaté des classes qu\'aucune opération ne déplace, même après travaux ailleurs', () => {
    // Le gain de la grille est nul en classe A : ces logements-là restent au kWh/m² constaté alors que
    // les 60 logements en E basculent sur la valeur conventionnelle de leur nouvelle classe.
    const res = residenceE();
    res.distEnergie = { A: 40, B: 0, C: 0, D: 0, E: 60, F: 0, G: 0, NR: 0 };
    const { lignes } = run([res], [reha(2027)], [2026, 2027]);
    expect(lignes[1].consoKwh).toBe(100 * (40 * 290 + 60 * 90));
  });

  it('déduit les émissions du facteur d\'émission du vecteur, et non d\'une colonne importée', () => {
    const { lignes } = run([residenceE()], [], [2026]);
    expect(lignes[0].emissionsKg).toBeCloseTo(290 * 10000 * 0.244, 6);
    expect(lignes[0].emissionsKgM2).toBeCloseTo(290 * 0.244, 6);
  });
});

describe('computeDecarbonation — changement de vecteur', () => {
  const refsAvecVecteurs = () => {
    const r = engine.refsDecarbonationDefaut();
    r.vecteurs = engine.parseVecteursTravaux([
      [null, null, null, null, null, null, 'Vecteur post interv.'],
      ["- Passage à l'électrique (radiateurs)", null, null, null, null, null, 'Individuel - électrique'],
    ]);
    return r;
  };
  const opVecteur = { id: 'ov', resCode: 'R1', annee: 2027, type: 'Chgt de vecteur', nature: "- Passage à l'électrique (radiateurs)", statut: 'programme', logements: null };

  it('fait basculer le facteur d\'émission à l\'année des travaux, à consommation inchangée', () => {
    const { lignes } = run([residenceE()], [opVecteur], [2026, 2027], {}, refsAvecVecteurs());
    expect(lignes[1].consoKwh).toBe(lignes[0].consoKwh);
    expect(lignes[0].emissionsKg).toBeCloseTo(290 * 10000 * 0.244, 6);
    expect(lignes[1].emissionsKg).toBeCloseTo(290 * 10000 * 0.052, 6);
    expect(lignes[1].gainEmissionsKg).toBeLessThan(0);
  });

  it('laisse le facteur d\'émission inchangé quand l\'onglet des vecteurs manque', () => {
    const { lignes } = run([residenceE()], [opVecteur], [2026, 2027]);
    expect(lignes[1].emissionsKg).toBeCloseTo(lignes[0].emissionsKg, 6);
  });
});

describe('computeDecarbonation — comptages annuels d\'opérations', () => {
  it('compte les logements réhabilités l\'année des travaux, et eux seuls', () => {
    const { lignes } = run([residenceE()], [reha(2027)], [2026, 2027, 2028]);
    expect(lignes[0].nbLgtRehab).toBe(0);
    expect(lignes[1].nbLgtRehab).toBe(100);
    expect(lignes[2].nbLgtRehab).toBe(0);
  });

  it('retient le nombre de logements concernés par l\'opération quand il est renseigné', () => {
    const op = Object.assign(reha(2027), { logements: 30 });
    const { lignes } = run([residenceE()], [op], [2026, 2027]);
    expect(lignes[1].nbLgtRehab).toBe(30);
  });

  it('exclut les opérations qui ne font bouger aucune étiquette (filtre « le DPE évolue » de l\'Excel)', () => {
    const gainsNuls = { 'Réha non thermique': { energie: { G: 0, F: 0, E: 0, D: 0, C: 0, B: 0, A: 0 }, ges: {} } };
    const op = { id: 'o', resCode: 'R1', annee: 2027, type: 'Réha.', nature: 'Réha non thermique', statut: 'programme' };
    const out = engine.computeDecarbonation([residenceE()], [op], gainsNuls, [2026, 2027], true, engine.refsDecarbonationDefaut(), {});
    expect(out.lignes[1].nbLgtRehab).toBe(0);
  });

  it('ignore les opérations identifiées quand la bascule les exclut', () => {
    const op = Object.assign(reha(2027), { statut: 'identifie' });
    const out = engine.computeDecarbonation([residenceE()], [op], GAINS, [2026, 2027], false, engine.refsDecarbonationDefaut(), {});
    expect(out.lignes[1].nbLgtRehab).toBe(0);
    expect(out.lignes[1].consoKwh).toBe(290 * 10000);
  });
});

describe('computeDecarbonation — mouvements de parc', () => {
  it('sort la résidence démolie de la consommation comme de la répartition', () => {
    const demol = { id: 'od', resCode: 'R1', annee: 2027, type: 'Démolition', nature: 'Démol.', statut: 'programme' };
    const { lignes } = run([residenceE()], [demol], [2026, 2027]);
    expect(lignes[1].consoKwh).toBe(0);
    expect(lignes[1].surfaceM2).toBe(0);
    expect(lignes[1].totalLgt).toBe(0);
  });

  it('ajoute les livraisons d\'offre nouvelle en « Inconnu », cumulées d\'année en année', () => {
    const { lignes } = run([residenceE()], [], [2026, 2027], { offreNouvelleLgt: { 2026: 10, 2027: 5 } });
    expect(lignes[0].repartition.NR).toBe(10);
    expect(lignes[1].repartition.NR).toBe(15);
    expect(lignes[1].totalLgt).toBe(115);
  });

  it('ne fait pas peser les livraisons sur la consommation (aucune étiquette ni surface connue)', () => {
    const { lignes } = run([residenceE()], [], [2026], { offreNouvelleLgt: { 2026: 500 } });
    expect(lignes[0].consoKwh).toBe(290 * 10000);
    expect(lignes[0].surfaceM2).toBe(10000);
  });

  it('retranche les cessions au prorata des étiquettes de la résidence, en cumul', () => {
    const { lignes } = run([residenceE()], [], [2026, 2027], { ventesParAnnee: { 2026: { R1: 20 }, 2027: { R1: 30 } } });
    expect(lignes[0].repartition.E).toBe(80);
    expect(lignes[1].repartition.E).toBe(50);
  });

  it('ne retranche jamais plus de logements que la résidence n\'en porte', () => {
    const { lignes } = run([residenceE()], [], [2026], { ventesParAnnee: { 2026: { R1: 500 } } });
    expect(lignes[0].totalLgt).toBe(0);
  });
});

describe('computeDecarbonation — données manquantes', () => {
  it('applique la valeur moyenne de la classe quand le kWh/m² est absent, et le signale', () => {
    const res = residenceE(); res.kwhM2 = null;
    const out = run([res], [], [2026]);
    expect(out.lignes[0].consoKwh).toBe(290 * 10000); // valeur conventionnelle de la classe E
    expect(out.couverture.sansKwh).toBe(1);
  });

  it('applique le facteur d\'émission moyen du parc quand le vecteur n\'est pas résolu', () => {
    const hybride = Object.assign(residenceE(), { code: 'R2', typeChauffage: 'Hybride' });
    const out = run([residenceE(), hybride], [], [2026]);
    expect(out.couverture.sansFe).toBe(1);
    // Le seul vecteur connu du parc étant le gaz collectif, le facteur moyen vaut 0,244 : les deux
    // résidences émettent donc autant, et le total est exactement le double d'une seule.
    expect(out.lignes[0].emissionsKg).toBeCloseTo(2 * 290 * 10000 * 0.244, 6);
  });

  it('retombe sur l\'intensité carbone conventionnelle quand AUCUNE résidence du parc n\'a de vecteur', () => {
    // Cas réel du gabarit de démonstration : tous les chauffages sont hybrides ou hors table. Un
    // facteur moyen de parc vaudrait alors 0 et la ligne d'émissions serait nulle de bout en bout.
    const res = Object.assign(residenceE(), { typeChauffage: 'Hybride' });
    const out = run([res], [], [2026]);
    expect(out.couverture.feMoyenDisponible).toBe(false);
    // Intensité implicite de la classe E : 60 kgCO2e/m² ÷ 290 kWh/m².
    expect(out.lignes[0].emissionsKg).toBeCloseTo(290 * 10000 * (60 / 290), 6);
    expect(out.lignes[0].emissionsKgM2).toBeCloseTo(60, 6);
  });

  it('compte la surface et la consommation d\'une résidence sans répartition DPE exploitable', () => {
    const sansDist = Object.assign(residenceE(), { code: 'R2', distEnergie: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, NR: 0 } });
    const out = run([residenceE(), sansDist], [], [2026]);
    expect(out.lignes[0].surfaceM2).toBe(20000);
    expect(out.lignes[0].consoKwh).toBe(2 * 290 * 10000);
    expect(out.lignes[0].totalLgt).toBe(100); // elle n'apporte en revanche aucune étiquette
  });

  it('applique la surface moyenne par logement du parc quand la SHAB manque', () => {
    const sansShab = Object.assign(residenceE(), { code: 'R2', shab: null });
    const out = run([residenceE(), sansShab], [], [2026]);
    expect(out.couverture.sansShab).toBe(1);
    expect(out.lignes[0].surfaceM2).toBe(20000); // 100 m²/lgt observés sur R1, appliqués aux 100 lgt de R2
  });
});
