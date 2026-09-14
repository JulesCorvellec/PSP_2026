import { describe, it, expect, beforeAll } from 'vitest';
import { loadEngine } from './engine-loader.js';

let engine;
beforeAll(() => { engine = loadEngine(); });

describe('resoudrePartiesCommunes — deux colonnes homonymes, deux critères distincts', () => {
  it('sépare les deux colonnes du gabarit standard, dont les libellés diffèrent', () => {
    // « Parties communes » y porte un espace final que ceNorm absorbe : les deux libellés restent
    // malgré tout distinguables, mais c'est l'ancre technique qui décide, pas le libellé.
    const header = ['Code de Résidence', 'Les parties communes', 'Moyenne - Technique', 'Parties communes '];
    expect(engine.resoudrePartiesCommunes(header, 2)).toEqual({ partiesCommunesAttr: 1, partiesCommunesTech: 3 });
  });

  it('sépare deux colonnes STRICTEMENT homonymes par leur position vis-à-vis du bloc technique', () => {
    // Cas du fichier client : les deux colonnes s'appellent « Parties communes ». Sans l'ancre, un
    // findColIndex renverrait la même colonne pour les deux critères, et la vétusté des circulations
    // serait comptée avec la note de conception.
    const header = ['Code de Résidence', 'Parties communes', 'Moyenne - Technique', 'Parties communes'];
    expect(engine.resoudrePartiesCommunes(header, 2)).toEqual({ partiesCommunesAttr: 1, partiesCommunesTech: 3 });
  });

  it('retombe sur l\'ordre des blocs de cotation quand l\'ancre technique est absente', () => {
    const header = ['Code de Résidence', 'Parties communes', 'Autre', 'Parties communes'];
    expect(engine.resoudrePartiesCommunes(header, -1)).toEqual({ partiesCommunesAttr: 1, partiesCommunesTech: 3 });
  });

  it('n\'invente pas un second critère quand une seule colonne existe', () => {
    const header = ['Code de Résidence', 'Les parties communes', 'Moyenne - Technique'];
    expect(engine.resoudrePartiesCommunes(header, 2)).toEqual({ partiesCommunesAttr: 1, partiesCommunesTech: -1 });
  });

  it('renvoie deux absences quand aucune colonne ne correspond', () => {
    expect(engine.resoudrePartiesCommunes(['Code de Résidence', 'Commune'], -1))
      .toEqual({ partiesCommunesAttr: -1, partiesCommunesTech: -1 });
  });
});

describe('echelleCotation — l\'échelle se détecte, elle ne se présume pas (§9.3)', () => {
  it('reconnaît les quatre échelles de cotation rencontrées', () => {
    expect(engine.echelleCotation([0, 0.33, 0.66, 1]).libelle).toBe('0-1');
    expect(engine.echelleCotation([0, 1, 2, 3]).libelle).toBe('0-3');
    expect(engine.echelleCotation([0, 5, 10]).libelle).toBe('0-10');
    expect(engine.echelleCotation([0, 33, 66, 100]).libelle).toBe('0-100');
  });

  it('ignore les valeurs absentes et renvoie null si la colonne est entièrement vide', () => {
    expect(engine.echelleCotation([null, 66, null]).libelle).toBe('0-100');
    expect(engine.echelleCotation([null, null])).toBeNull();
  });

  it('ramène les colonnes sur 0-100 et laisse intactes celles qui y sont déjà', () => {
    const residences = [
      { accessibilitePMR: 100, vieillissement: 0 },
      { accessibilitePMR: 33, vieillissement: 0.66 },
      { accessibilitePMR: null, vieillissement: 1 },
    ];
    const echelles = engine.normaliseEchellesAccessibilite(residences);
    expect(echelles.accessibilitePMR.facteur).toBe(1);
    expect(echelles.vieillissement.facteur).toBe(100);
    expect(residences.map((r) => r.accessibilitePMR)).toEqual([100, 33, null]);
    expect(residences.map((r) => r.vieillissement)).toEqual([0, 66, 100]);
  });

  it('convertit une cotation sur 0-3 sans la tronquer', () => {
    const residences = [{ accessibilitePMR: 0 }, { accessibilitePMR: 1 }, { accessibilitePMR: 3 }];
    engine.normaliseEchellesAccessibilite(residences);
    expect(residences.map((r) => Math.round(r.accessibilitePMR))).toEqual([0, 33, 100]);
  });
});

describe('scoreAccessibilite — un critère absent sort du dénominateur, jamais compté zéro', () => {
  const poids = { accessibilitePMR: 3, ascenseurs: 2, dessertQuartier: 1 };

  it('pondère les critères présents', () => {
    const s = engine.scoreAccessibilite({ accessibilitePMR: 100, ascenseurs: 50, dessertQuartier: 0 }, poids);
    expect(s.score).toBeCloseTo((3 * 100 + 2 * 50 + 1 * 0) / 6, 6);
    expect(s.couverture).toBe(1);
    expect(s.manquants).toEqual([]);
  });

  it('ne pénalise pas une résidence dont un critère n\'est pas renseigné', () => {
    const complet = engine.scoreAccessibilite({ accessibilitePMR: 100, ascenseurs: 100, dessertQuartier: 100 }, poids);
    const partiel = engine.scoreAccessibilite({ accessibilitePMR: 100, ascenseurs: null, dessertQuartier: 100 }, poids);
    expect(partiel.score).toBe(complet.score); // et surtout pas 100*4/6
    expect(partiel.manquants).toEqual(['ascenseurs']);
    expect(partiel.couverture).toBeCloseTo(4 / 6, 6);
  });

  it('marque la couverture sous 50 % sans refuser de calculer', () => {
    const s = engine.scoreAccessibilite({ accessibilitePMR: null, ascenseurs: null, dessertQuartier: 80 }, poids);
    expect(s.score).toBe(80);
    expect(s.couverture).toBeLessThan(0.5);
  });

  it('renvoie un score nul (et non zéro) quand aucun critère n\'est renseigné', () => {
    const s = engine.scoreAccessibilite({ accessibilitePMR: null }, poids);
    expect(s.score).toBeNull();
    expect(s.couverture).toBe(0);
  });

  it('ignore un critère dont la pondération a été mise à zéro dans l\'interface', () => {
    const s = engine.scoreAccessibilite({ accessibilitePMR: 100, ascenseurs: 0 }, { accessibilitePMR: 3, ascenseurs: 0 });
    expect(s.score).toBe(100);
  });
});

describe('bandeAccessibilite — seuils absolus, pas un pourcentage du maximum observé (§3.1)', () => {
  it('classe sur les bornes annoncées', () => {
    expect(engine.bandeAccessibilite(80, engine.ACCESS_BANDS_DEFAUT).cle).toBe('bonne');
    expect(engine.bandeAccessibilite(66, engine.ACCESS_BANDS_DEFAUT).cle).toBe('bonne');
    expect(engine.bandeAccessibilite(50, engine.ACCESS_BANDS_DEFAUT).cle).toBe('moyenne');
    expect(engine.bandeAccessibilite(0, engine.ACCESS_BANDS_DEFAUT).cle).toBe('faible');
  });

  it('ne remonte pas un parc médiocre en « bonne » faute de meilleure résidence', () => {
    // C'est précisément ce que ferait un classifieur relatif au maximum observé : ici le meilleur
    // score du parc est 30, et aucune résidence ne doit pour autant être dite bien accessible.
    [10, 20, 30].forEach((s) => expect(engine.bandeAccessibilite(s, engine.ACCESS_BANDS_DEFAUT).cle).toBe('faible'));
  });

  it('accepte des bornes personnalisées, quel que soit leur ordre de saisie', () => {
    const bandes = [{ cle: 'faible', min: 0 }, { cle: 'bonne', min: 80 }, { cle: 'moyenne', min: 50 }];
    expect(engine.bandeAccessibilite(85, bandes).cle).toBe('bonne');
    expect(engine.bandeAccessibilite(70, bandes).cle).toBe('moyenne');
  });

  it('renvoie null pour une résidence sans score', () => {
    expect(engine.bandeAccessibilite(null, engine.ACCESS_BANDS_DEFAUT)).toBeNull();
  });
});

describe('trancheVieillissement — 0 = vieillissement fort (barème du classeur)', () => {
  it('lit la note basse comme une forte part de locataires âgés', () => {
    // « 0. Paramétrage critères » : > 30 % de locataires de plus de 65 ans est la tranche de rang 1,
    // donc la moins bien notée. Une note de 0 signale le parc le plus vieillissant, pas l'inverse.
    expect(engine.trancheVieillissement(0).cle).toBe('fort');
    expect(engine.trancheVieillissement(33).cle).toBe('moyen');
    expect(engine.trancheVieillissement(66).cle).toBe('faible');
    expect(engine.trancheVieillissement(100).cle).toBe('faible');
  });

  it('ne classe pas une résidence dont la colonne est absente', () => {
    expect(engine.trancheVieillissement(null)).toBeNull();
    expect(engine.trancheVieillissement(undefined)).toBeNull();
  });
});

describe('CRITERES_ACCESSIBILITE — motifs de détection', () => {
  const motifsDe = (cle) => engine.CRITERES_ACCESSIBILITE.find((c) => c.cle === cle).motifs;
  const reconnait = (cle, entete) => motifsDe(cle).some((m) => m.test(engine.ceNorm(entete)));

  it('reconnaît le libellé du gabarit actuel comme celui des gabarits antérieurs', () => {
    expect(reconnait('accessibilitePMR', 'Accessibilité / Adaptabilité PMR')).toBe(true);
    expect(reconnait('accessibilitePMR', 'Accessibilité')).toBe(true);
    expect(reconnait('dessertQuartier', 'Accessibilité et desserte du quartier')).toBe(true);
    expect(reconnait('dessertQuartier', 'Qualité de la localisation et de desserte du quartier')).toBe(true);
    expect(reconnait('ascenseurs', 'Ascenseurs ')).toBe(true);
  });

  it('ne confond pas la desserte du quartier avec le critère PMR', () => {
    expect(reconnait('accessibilitePMR', 'Accessibilité et desserte du quartier')).toBe(false);
  });

  it('donne au critère PMR le poids le plus élevé', () => {
    const p = engine.ACCESSIBILITE_POIDS_DEFAUT;
    expect(Math.max.apply(null, Object.values(p))).toBe(p.accessibilitePMR);
  });
});

describe('migreAccessibiliteData — sauvegardes antérieures à la V9', () => {
  // Une sauvegarde d'avant la V9 porte des résidences sans les champs d'accessibilité, mais l'ancien
  // parseur rangeait déjà ces mêmes colonnes dans critereGroups : elles sont donc récupérables.
  const sauvegardeAncienne = () => ({
    residences: [{
      code: 'R1', nbLgt: 50,
      critereGroups: {
        programme: { label: 'Programme', values: [
          { label: 'Accessibilité / Adaptabilité PMR', value: 33 },
          { label: 'Équipements techniques collectifs', value: 66 },
          { label: 'Parties communes', value: 100 },
        ]},
        technique: { label: 'État technique', values: [
          { label: 'Parties communes', value: 0 },
          { label: 'Menuiserie', value: 66 },
        ]},
        environnement: { label: 'Environnement urbain', values: [
          { label: 'Accessibilité et desserte du quartier', value: 66 },
          { label: 'Équipements commerciaux et services de proximité', value: 100 },
        ]},
        social: { label: 'Fragilité sociale', values: [{ label: 'Vieillissement', value: 33 }] },
      },
    }],
  });

  it('reconstruit les sept critères récupérables depuis les groupes de cotation', () => {
    const r = engine.migreAccessibiliteData(sauvegardeAncienne()).residences[0];
    expect(r.accessibilitePMR).toBe(33);
    expect(r.equipementsTechniques).toBe(66);
    expect(r.dessertQuartier).toBe(66);
    expect(r.commercesProximite).toBe(100);
    expect(r.vieillissement).toBe(33);
  });

  it('distingue les deux « Parties communes », qui portent le même libellé dans deux groupes', () => {
    const r = engine.migreAccessibiliteData(sauvegardeAncienne()).residences[0];
    expect(r.partiesCommunesAttr).toBe(100); // groupe programme
    expect(r.partiesCommunesTech).toBe(0);   // groupe technique — et surtout pas 100
  });

  it('laisse « Ascenseurs » à null : il n\'appartient à aucun groupe de cotation', () => {
    const r = engine.migreAccessibiliteData(sauvegardeAncienne()).residences[0];
    expect(r.ascenseurs).toBeNull();
  });

  it('marque la donnée comme migrée, pour que l\'interface puisse le dire', () => {
    expect(engine.migreAccessibiliteData(sauvegardeAncienne()).accessibiliteMigree).toBe(true);
  });

  it('ne touche pas un import V9, qui porte déjà les champs', () => {
    const data = { residences: [{ code: 'R1', accessibilitePMR: 66, partiesCommunesTech: 33 }] };
    expect(engine.migreAccessibiliteData(data)).toBe(data); // même référence : aucun recalcul
  });

  it('laisse intacte une sauvegarde dont les groupes ne portent aucun critère d\'accessibilité', () => {
    const data = { residences: [{ code: 'R1', critereGroups: { technique: { values: [{ label: 'Menuiserie', value: 66 }] } } }] };
    expect(engine.migreAccessibiliteData(data)).toBe(data);
  });

  it('ne lève pas sur une sauvegarde vide ou malformée', () => {
    expect(() => engine.migreAccessibiliteData(null)).not.toThrow();
    expect(() => engine.migreAccessibiliteData({})).not.toThrow();
    expect(() => engine.migreAccessibiliteData({ residences: [] })).not.toThrow();
    expect(() => engine.migreAccessibiliteData({ residences: [{ code: 'R1' }] })).not.toThrow();
  });

  it('redresse l\'échelle des valeurs reconstruites comme à l\'import', () => {
    // Un gabarit cotant sur 0-3 : la migration doit produire les mêmes valeurs qu'un import frais.
    const data = { residences: [
      { code: 'R1', critereGroups: { programme: { values: [{ label: 'Accessibilité / Adaptabilité PMR', value: 3 }] } } },
      { code: 'R2', critereGroups: { programme: { values: [{ label: 'Accessibilité / Adaptabilité PMR', value: 0 }] } } },
    ]};
    const out = engine.migreAccessibiliteData(data);
    expect(Math.round(out.residences[0].accessibilitePMR)).toBe(100);
    expect(out.accessibiliteEchelles.accessibilitePMR.libelle).toBe('0-3');
  });
});
