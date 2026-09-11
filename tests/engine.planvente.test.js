// V8 Phase 1 — socle du plan de vente : lecture de « 5. Cessions identifiées », rapprochement avec
// les résidences, construction des lignes de plan de vente issues de l'import.
// Les matrices de test sont SYNTHÉTIQUES : aucune donnée client, conformément à la règle absolue de
// la V8. Elles reproduisent en revanche les particularités réelles du gabarit standard vérifiées le
// 2026-09-11 (en-tête en ligne 2, libellés accentués, familles annualisées 2023→2072, familles
// « Nb logts » et « Mois cession » pouvant être entièrement vides).
import { describe, it, expect, beforeAll } from 'vitest';
import { loadEngine } from './engine-loader.js';

let engine;
beforeAll(() => { engine = loadEngine(); });

// Gabarit minimal : une ligne de titre (comme dans le vrai fichier), puis l'en-tête, puis les lignes.
function matriceCessions(lignes, { avecNbLgt = true } = {}) {
  const header = [
    'N° groupe', 'N° sous-groupe', 'Information', 'Nom du groupe', 'Nb de logts', 'Autre', 'Code INSEE',
    'Commentaire', 'Nature',
    'Mois cession 2026', 'Nb logts 2026', 'Prix net de cession K€/logt 2026',
    'Valeur comptable en K€ / lgt cédé 2026', 'Remboursements anticipés en K€ 2026',
    'Mois cession 2027', 'Nb logts 2027', 'Prix net de cession K€/logt 2027',
    'Valeur comptable en K€ / lgt cédé 2027', 'Remboursements anticipés en K€ 2027',
    // Famille hors périmètre, volontairement présente : ne doit jamais être parsée.
    "Economies d'annuités cumulée suite à RA - part capital 2026",
  ];
  const rows = lignes.map((l) => {
    const r = new Array(header.length).fill(null);
    r[0] = l.numeroGroupe; r[3] = l.nomGroupe; r[4] = l.nbLgtTotal ?? null; r[8] = l.nature ?? null;
    if (l.a2026) {
      r[9] = l.a2026.mois ?? null;
      r[10] = avecNbLgt ? (l.a2026.nbLgt ?? null) : null;
      r[11] = l.a2026.prixKE ?? null;
      r[12] = l.a2026.vncKE ?? null;
      r[13] = l.a2026.rembKE ?? null;
    }
    if (l.a2027) {
      r[15] = l.a2027.mois ?? null;
      r[16] = avecNbLgt ? (l.a2027.nbLgt ?? null) : null;
      r[17] = l.a2027.prixKE ?? null;
    }
    r[19] = 1; // remplissage de la famille hors périmètre
    return r;
  });
  return [['Plan de cessions'], header].concat(rows);
}

describe('parseCessionsIdentifiees', () => {
  it("détecte la ligne d'en-tête au lieu de la présumer", () => {
    const out = engine.parseCessionsIdentifiees(matriceCessions([{ numeroGroupe: 12, nomGroupe: 'Groupe A' }]));
    expect(out.headerRowIdx).toBe(1);
  });

  it('rend null si aucune colonne « N° groupe » n\'est trouvée', () => {
    expect(engine.parseCessionsIdentifiees([['Autre chose'], ['a', 'b']])).toBeNull();
  });

  it('filtre les lignes vides et les n° de groupe à 0 (gabarit de 150 lignes majoritairement vides)', () => {
    const m = matriceCessions([
      { numeroGroupe: 12, nomGroupe: 'Groupe A' },
      { numeroGroupe: 0, nomGroupe: null },
      { numeroGroupe: '', nomGroupe: '' },
      { numeroGroupe: 34, nomGroupe: 'Groupe B' },
    ]);
    expect(engine.parseCessionsIdentifiees(m).lignes.map((l) => l.numeroGroupe)).toEqual([12, 34]);
  });

  it('convertit les k€/logt en € par logement à la lecture, pas à l\'affichage', () => {
    const m = matriceCessions([{ numeroGroupe: 12, nomGroupe: 'A', a2026: { nbLgt: 5, prixKE: 150, vncKE: 40, rembKE: 12 } }]);
    const ligne = engine.parseCessionsIdentifiees(m).lignes[0];
    expect(ligne.parAnnee[2026].prixUnitaire).toBe(150000);
    expect(ligne.parAnnee[2026].valeurComptable).toBe(40000);
    expect(ligne.parAnnee[2026].remboursement).toBe(12000);
    expect(ligne.parAnnee[2026].nbLgt).toBe(5); // un volume n'est pas un montant : aucune conversion
  });

  it('ne parse pas les familles hors périmètre (économies d\'annuités suite à RA)', () => {
    const m = matriceCessions([{ numeroGroupe: 12, nomGroupe: 'A', a2026: { prixKE: 150 } }]);
    const parAnnee = engine.parseCessionsIdentifiees(m).lignes[0].parAnnee;
    expect(Object.keys(parAnnee[2026]).sort()).toEqual(['prixUnitaire']);
  });

  it('accepte un échéancier sans aucun volume (cas nominal du gabarit standard)', () => {
    const m = matriceCessions([{ numeroGroupe: 12, nomGroupe: 'A', a2026: { prixKE: 150 } }], { avecNbLgt: false });
    const ligne = engine.parseCessionsIdentifiees(m).lignes[0];
    expect(ligne.parAnnee[2026].nbLgt).toBeUndefined();
    expect(ligne.parAnnee[2026].prixUnitaire).toBe(150000);
  });

  it('ne conserve aucune année dépourvue de valeur', () => {
    const m = matriceCessions([{ numeroGroupe: 12, nomGroupe: 'A', a2026: { prixKE: 150 } }]);
    expect(Object.keys(engine.parseCessionsIdentifiees(m).lignes[0].parAnnee)).toEqual(['2026']);
  });

  it('recense les années détectées, y compris celles restées vides', () => {
    const m = matriceCessions([{ numeroGroupe: 12, nomGroupe: 'A' }]);
    expect(engine.parseCessionsIdentifiees(m).anneesDetectees).toEqual([2026, 2027]);
  });
});

describe('matchCessionsToResidences', () => {
  const residences = [
    { code: 12, nom: 'Les Tilleuls' },
    { code: 34, nom: 'Le Clos Fleuri' },
    { code: 56, nom: 'Doublon' },
    { code: 78, nom: 'Doublon' },
  ];

  it('apparie par code en priorité', () => {
    const c = engine.parseCessionsIdentifiees(matriceCessions([{ numeroGroupe: 12, nomGroupe: 'Nom qui ne correspond pas', a2026: { nbLgt: 3 } }]));
    const out = engine.matchCessionsToResidences(c, residences);
    expect(out.parResCode[12].via).toBe('code');
    expect(out.orphelines).toHaveLength(0);
  });

  it('replie sur le nom normalisé (accents et casse indifférents)', () => {
    const c = engine.parseCessionsIdentifiees(matriceCessions([{ numeroGroupe: 999, nomGroupe: 'le clos fleuri', a2026: { nbLgt: 2 } }]));
    const out = engine.matchCessionsToResidences(c, residences);
    expect(out.parResCode[34].via).toBe('nom');
  });

  it('n\'apparie jamais au hasard sur un nom en doublon', () => {
    const c = engine.parseCessionsIdentifiees(matriceCessions([{ numeroGroupe: 999, nomGroupe: 'Doublon' }]));
    const out = engine.matchCessionsToResidences(c, residences);
    expect(Object.keys(out.parResCode)).toHaveLength(0);
    expect(out.orphelines).toHaveLength(1);
  });

  it('conserve les lignes non appariées au lieu de les ignorer silencieusement', () => {
    const c = engine.parseCessionsIdentifiees(matriceCessions([{ numeroGroupe: 999, nomGroupe: 'Inconnue' }]));
    expect(engine.matchCessionsToResidences(c, residences).orphelines).toHaveLength(1);
  });

  it('fusionne deux lignes visant la même résidence : les volumes s\'additionnent, pas les prix', () => {
    const c = engine.parseCessionsIdentifiees(matriceCessions([
      { numeroGroupe: 12, nomGroupe: 'A', a2026: { nbLgt: 3, prixKE: 150 } },
      { numeroGroupe: 12, nomGroupe: 'A', a2026: { nbLgt: 4, prixKE: 200 } },
    ]));
    const out = engine.matchCessionsToResidences(c, residences);
    expect(out.parResCode[12].parAnnee[2026].nbLgt).toBe(7);
    expect(out.parResCode[12].parAnnee[2026].prixUnitaire).toBe(150000);
  });

  it('ne lève pas quand l\'onglet est absent (cessions = null)', () => {
    expect(engine.matchCessionsToResidences(null, residences)).toEqual({ parResCode: {}, orphelines: [] });
  });
});

describe('buildPlanVenteInitial', () => {
  const base = { code: 12, nom: 'A', nbLgt: 80, planVente: null, nbLgtMiseVente: null, typeVente: null, conventionneVente: null, nbLgtRestantVente: null, prixVenteBrut: null };
  const res = (patch) => Object.assign({}, base, patch);

  it('ne crée aucune ligne pour une résidence hors plan de vente et sans échéancier', () => {
    expect(engine.buildPlanVenteInitial([res({})], {})).toHaveLength(0);
  });

  it('crée une ligne « import-cotation » quand la Base de cotation porte le plan de vente', () => {
    const l = engine.buildPlanVenteInitial([res({ planVente: 'OUI', typeVente: 'Vente HLM', nbLgtRestantVente: 7, prixVenteBrut: 900000 })], {})[0];
    expect(l.origine).toBe('import-cotation');
    expect(l.retenue).toBe(true);
    expect(l.logementsTotal).toBe(80);
    expect(l.parAnnee).toEqual({});
    expect(l._legacyLogementsRestants).toBe(7);
    expect(l._legacyPrixVente).toBe(900000);
  });

  it('crée une ligne à partir du seul nombre de logements mis en vente', () => {
    expect(engine.buildPlanVenteInitial([res({ nbLgtMiseVente: 5 })], {})[0].origine).toBe('import-cotation');
  });

  it('crée une ligne « import-cessions » quand seul l\'échéancier existe', () => {
    const l = engine.buildPlanVenteInitial([res({})], { 12: { parAnnee: { 2026: { nbLgt: 5 } } } })[0];
    expect(l.origine).toBe('import-cessions');
    expect(l.parAnnee[2026].nbLgt).toBe(5);
  });

  it('ne produit qu\'une ligne quand les deux sources concernent la même résidence', () => {
    const out = engine.buildPlanVenteInitial([res({ planVente: 'OUI' })], { 12: { parAnnee: { 2026: { nbLgt: 5 } } } });
    expect(out).toHaveLength(1);
    expect(out[0].origine).toBe('import-cotation');
    expect(out[0].parAnnee[2026].nbLgt).toBe(5);
  });

  it('dérive un identifiant stable du code résidence (comparaison entre millésimes)', () => {
    const a = engine.buildPlanVenteInitial([res({ planVente: 'OUI' })], {})[0].id;
    const b = engine.buildPlanVenteInitial([res({ planVente: 'OUI' })], {})[0].id;
    expect(a).toBe(b);
    expect(a).toBe('pv_12');
  });
});
