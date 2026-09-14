import { describe, it, expect, beforeAll } from 'vitest';
import { loadEngine } from './engine-loader.js';

let engine;
beforeAll(() => { engine = loadEngine(); });

// Une « ligne » est la structure produite par la vue : la résidence, son score d'accessibilité, sa
// couverture et sa tranche de vieillissement. Le moteur de priorisation ne recalcule jamais le score
// d'accessibilité, il le consomme.
function ligne(over) {
  return Object.assign({
    r: { code: 'R1', nbLgt: 100, typeBati: null, dessertQuartier: null, commercesProximite: null },
    score: 50, couverture: 1, tranche: null,
  }, over || {});
}
function ctx(over) { return Object.assign({ opsParRes: {}, auPlanVente: {} }, over || {}); }
const op = (type, statut, annee) => ({ resCode: 'R1', type, statut, annee: annee || 2027 });

describe('evalueCriteresAdaptation — détection des bonus et malus', () => {
  it('distingue une réhabilitation programmée d\'une réhabilitation seulement identifiée', () => {
    const programmee = engine.evalueCriteresAdaptation(ligne(), ctx({ opsParRes: { R1: [op('Réha.', 'programme', 2028)] } }));
    expect(programmee.reha_programmee.actif).toBe(true);
    expect(programmee.reha_programmee.programmee).toBe(true);
    expect(programmee.reha_programmee.annee).toBe(2028);

    const identifiee = engine.evalueCriteresAdaptation(ligne(), ctx({ opsParRes: { R1: [op('Réha.', 'identifie', 2030)] } }));
    expect(identifiee.reha_programmee.actif).toBe(true);
    expect(identifiee.reha_programmee.programmee).toBe(false); // une intention, pas un calendrier
  });

  it('préfère la réhabilitation programmée quand les deux coexistent', () => {
    const c = engine.evalueCriteresAdaptation(ligne(), ctx({ opsParRes: { R1: [op('Réha.', 'identifie', 2031), op('Réha.', 'programme', 2027)] } }));
    expect(c.reha_programmee.programmee).toBe(true);
    expect(c.reha_programmee.annee).toBe(2027);
  });

  it('ne prend pas un remplacement de composants pour une réhabilitation', () => {
    const c = engine.evalueCriteresAdaptation(ligne(), ctx({ opsParRes: { R1: [op('RC', 'programme')] } }));
    expect(c.reha_programmee.actif).toBe(false);
  });

  it('active le bonus petites typologies au-delà du seuil, sur les typologies renseignées seulement', () => {
    const petit = ligne({ r: { code: 'R1', nbLgt: 100, T1: 40, T2: 30, T3: 10, T4: 20 } });
    expect(engine.evalueCriteresAdaptation(petit, ctx()).petites_typo.actif).toBe(true); // 80 %
    const grand = ligne({ r: { code: 'R1', nbLgt: 100, T1: 10, T4: 90 } });
    expect(engine.evalueCriteresAdaptation(grand, ctx()).petites_typo.actif).toBe(false);
  });

  it('marque le critère typologie inapplicable plutôt que faux quand aucune typologie n\'est renseignée', () => {
    const c = engine.evalueCriteresAdaptation(ligne(), ctx());
    expect(c.petites_typo.applicable).toBe(false);
    expect(c.petites_typo.actif).toBe(false);
  });

  it('moyenne desserte et commerces pour le bonus de desserte', () => {
    const bonne = ligne({ r: { code: 'R1', nbLgt: 100, dessertQuartier: 100, commercesProximite: 66 } });
    expect(engine.evalueCriteresAdaptation(bonne, ctx()).desserte.actif).toBe(true);
    const faible = ligne({ r: { code: 'R1', nbLgt: 100, dessertQuartier: 33, commercesProximite: 66 } });
    expect(engine.evalueCriteresAdaptation(faible, ctx()).desserte.actif).toBe(false);
  });

  it('lit le malus plan de vente et l\'exclusion démolition', () => {
    const c = engine.evalueCriteresAdaptation(ligne(), ctx({ auPlanVente: { R1: true }, opsParRes: { R1: [op('Démolition', 'programme', 2029)] } }));
    expect(c.plan_vente.actif).toBe(true);
    expect(c.demolition.actif).toBe(true);
    expect(c.demolition.annee).toBe(2029);
  });
});

describe('scorePrioriteAdaptation — accessibilité inversée, modulée', () => {
  it('part de l\'accessibilité inversée : plus elle est faible, plus la priorité est haute', () => {
    const bas = engine.scorePrioriteAdaptation(ligne({ score: 20 }), engine.PRIORITE_ADAPTATION_DEFAUT, ctx());
    const haut = engine.scorePrioriteAdaptation(ligne({ score: 90 }), engine.PRIORITE_ADAPTATION_DEFAUT, ctx());
    expect(bas.score).toBeGreaterThan(haut.score);
  });

  it('ajoute 10 points par unité de poids et normalise sur le maximum atteignable', () => {
    // Poids par défaut : 3+3+1+1+1 = 9, soit un maximum de 100 + 90 = 190.
    const l = ligne({ score: 40, tranche: { cle: 'fort' } });
    const s = engine.scorePrioriteAdaptation(l, engine.PRIORITE_ADAPTATION_DEFAUT, ctx({ opsParRes: { R1: [op('Réha.', 'programme')] } }));
    // 60 (inversé) + 30 (réhab) + 30 (vieillissement) = 120 sur 190.
    expect(s.score).toBeCloseTo(120 / 190 * 100, 6);
    expect(s.composantes.map((c) => c.points)).toEqual([60, 30, 30]);
  });

  it('retranche le malus plan de vente', () => {
    const sans = engine.scorePrioriteAdaptation(ligne({ score: 40 }), engine.PRIORITE_ADAPTATION_DEFAUT, ctx());
    const avec = engine.scorePrioriteAdaptation(ligne({ score: 40 }), engine.PRIORITE_ADAPTATION_DEFAUT, ctx({ auPlanVente: { R1: true } }));
    expect(avec.score).toBeLessThan(sans.score);
    expect(avec.composantes.find((c) => c.id === 'plan_vente').points).toBe(-20);
  });

  it('ne descend jamais sous zéro même quand les malus dépassent la base', () => {
    const cfg = { bonus: [], malus: [{ id: 'plan_vente', label: 'Vente', poids: 20, actif: true }], exclusions: [] };
    const s = engine.scorePrioriteAdaptation(ligne({ score: 95 }), cfg, ctx({ auPlanVente: { R1: true } }));
    expect(s.score).toBe(0);
  });

  it('exclut la résidence démolie du classement au lieu de lui donner un score', () => {
    const s = engine.scorePrioriteAdaptation(ligne({ score: 10 }), engine.PRIORITE_ADAPTATION_DEFAUT, ctx({ opsParRes: { R1: [op('Démolition', 'programme')] } }));
    expect(s.exclu).toBe(true);
    expect(s.score).toBeNull();
    expect(s.exclusion.id).toBe('demolition');
  });

  it('n\'exclut plus rien si l\'exclusion est désactivée dans la configuration', () => {
    const cfg = Object.assign({}, engine.PRIORITE_ADAPTATION_DEFAUT, { exclusions: [{ id: 'demolition', label: 'Démolition', actif: false }] });
    const s = engine.scorePrioriteAdaptation(ligne({ score: 10 }), cfg, ctx({ opsParRes: { R1: [op('Démolition', 'programme')] } }));
    expect(s.exclu).toBe(false);
    expect(s.score).not.toBeNull();
  });

  it('ignore un bonus désactivé, y compris dans le maximum de normalisation', () => {
    const cfg = { bonus: [{ id: 'vieillissement', label: 'V', poids: 3, actif: false }], malus: [], exclusions: [] };
    const s = engine.scorePrioriteAdaptation(ligne({ score: 40, tranche: { cle: 'fort' } }), cfg, ctx());
    expect(s.score).toBe(60); // 60 sur 100, le bonus ne compte ni au numérateur ni au dénominateur
  });

  it('ne classe pas une résidence sans aucun critère d\'accessibilité renseigné', () => {
    const s = engine.scorePrioriteAdaptation(ligne({ score: null }), engine.PRIORITE_ADAPTATION_DEFAUT, ctx());
    expect(s.score).toBeNull();
    expect(s.exclu).toBe(false);
  });
});

describe('listeAdaptation — affectation A / B', () => {
  const avecReha = { reha_programmee: { actif: true } };
  const sansReha = { reha_programmee: { actif: false } };

  it('affecte en A une résidence portant une réhabilitation, en B sinon', () => {
    expect(engine.listeAdaptation(avecReha, null).liste).toBe('A');
    expect(engine.listeAdaptation(sansReha, null).liste).toBe('B');
  });

  it('signale une affectation forcée contraire à l\'automatique', () => {
    const forcee = engine.listeAdaptation(avecReha, 'B');
    expect(forcee.liste).toBe('B');
    expect(forcee.auto).toBe('A');
    expect(forcee.forcee).toBe(true);
  });

  it('ne signale rien quand la surcharge confirme l\'automatique', () => {
    expect(engine.listeAdaptation(avecReha, 'A').forcee).toBe(false);
  });
});

describe('alertesAdaptation — elles informent, elles ne verrouillent pas', () => {
  const criteres = (over) => Object.assign({
    demolition: { actif: false }, plan_vente: { actif: false },
    reha_programmee: { actif: false, programmee: false, annee: null },
  }, over || {});

  it('remonte la démolition en rouge et le plan de vente en orange', () => {
    const a = engine.alertesAdaptation(ligne(), criteres({ demolition: { actif: true, annee: 2029 }, plan_vente: { actif: true } }), false);
    expect(a.map((x) => x.niveau)).toEqual(['rouge', 'orange']);
    expect(a[0].texte).toContain('2029');
  });

  it('signale en jaune l\'occasion manquée d\'une réhabilitation sans adaptation retenue', () => {
    const c = criteres({ reha_programmee: { actif: true, programmee: true, annee: 2028 } });
    const nonRetenue = engine.alertesAdaptation(ligne(), c, false);
    expect(nonRetenue.find((x) => x.niveau === 'jaune').texte).toContain('2028');
    // Une fois la résidence retenue, l'occasion est saisie : l'alerte disparaît.
    expect(engine.alertesAdaptation(ligne(), c, true).find((x) => x.niveau === 'jaune')).toBeUndefined();
  });

  it('signale une cotation incomplète sans empêcher le classement', () => {
    const a = engine.alertesAdaptation(ligne({ couverture: 0.3 }), criteres(), false);
    expect(a.find((x) => x.niveau === 'blanc')).toBeDefined();
  });

  it('ne produit aucune alerte sur une résidence sans particularité', () => {
    expect(engine.alertesAdaptation(ligne(), criteres(), false)).toEqual([]);
  });
});
