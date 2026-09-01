import { describe, it, expect, beforeAll } from 'vitest';
import { loadEngine } from './engine-loader.js';

let engine;
beforeAll(() => { engine = loadEngine(); });

function residence(code, distEnergie) {
  return { code, distEnergie, distGES: distEnergie };
}

describe('computeTrajectory — cascade DPE (cahier des charges §8.2)', () => {
  it('fait progresser le parc de N classes selon le gain de la grille (D -> B pour un gain de 2)', () => {
    const gainsGrid = { 'Réha niv. 2': { energie: { G: 0, F: 0, E: 0, D: 2, C: 0, B: 0, A: 0 }, ges: {} } };
    const residences = [residence('R1', { D: 100 })];
    const operations = [{ id: 1, resCode: 'R1', annee: 2025, type: 'Réha niv. 2', nature: 'Réha niv. 2', statut: 'programme' }];
    const timeline = engine.computeTrajectory(residences, operations, gainsGrid, [2024, 2025, 2026], 'energie', true);
    expect(timeline[2024].D).toBe(100);
    expect(timeline[2025].B).toBe(100);
    expect(timeline[2025].D).toBe(0);
    expect(timeline[2026].B).toBe(100);
  });

  it('plafonne aussi la régression à la classe G (un gain négatif erroné ne fait pas disparaître les logements des totaux)', () => {
    const gainsGrid = { 'Saisie erronée': { energie: { G: 0, F: 0, E: 0, D: -9, C: 0, B: 0, A: 0 }, ges: {} } };
    const residences = [residence('R1', { D: 100 })];
    const operations = [{ id: 1, resCode: 'R1', annee: 2025, type: 'Saisie erronée', nature: 'Saisie erronée', statut: 'programme' }];
    const timeline = engine.computeTrajectory(residences, operations, gainsGrid, [2025], 'energie', true);
    expect(timeline[2025].G).toBe(100);
    expect(Object.values(timeline[2025]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('plafonne la progression à la classe A (ne dépasse jamais le meilleur niveau)', () => {
    const gainsGrid = { Rénovation: { energie: { G: 0, F: 0, E: 0, D: 0, C: 10, B: 0, A: 0 }, ges: {} } };
    const residences = [residence('R1', { C: 50 })];
    const operations = [{ id: 1, resCode: 'R1', annee: 2025, type: 'Rénovation', nature: 'Rénovation', statut: 'programme' }];
    const timeline = engine.computeTrajectory(residences, operations, gainsGrid, [2025], 'energie', true);
    expect(timeline[2025].A).toBe(50);
    expect(Object.values(timeline[2025]).reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('une démolition sort la résidence du portefeuille pour les années suivantes', () => {
    const gainsGrid = {};
    const residences = [residence('R1', { D: 100 }), residence('R2', { C: 50 })];
    const operations = [{ id: 1, resCode: 'R1', annee: 2025, type: 'Démolition', nature: 'Démolition', statut: 'programme' }];
    const timeline = engine.computeTrajectory(residences, operations, gainsGrid, [2024, 2025, 2026], 'energie', true);
    const total2024 = Object.values(timeline[2024]).reduce((a, b) => a + b, 0);
    const total2026 = Object.values(timeline[2026]).reduce((a, b) => a + b, 0);
    expect(total2024).toBe(150);
    expect(total2026).toBe(50);
  });

  it('includeIdentifiees=false ignore les opérations au statut "identifie"', () => {
    const gainsGrid = { Réha: { energie: { G: 0, F: 0, E: 0, D: 2, C: 0, B: 0, A: 0 }, ges: {} } };
    const residences = [residence('R1', { D: 100 })];
    const operations = [{ id: 1, resCode: 'R1', annee: 2025, type: 'Réha', nature: 'Réha', statut: 'identifie' }];
    const timelineIncluded = engine.computeTrajectory(residences, operations, gainsGrid, [2025], 'energie', true);
    const timelineExcluded = engine.computeTrajectory(residences, operations, gainsGrid, [2025], 'energie', false);
    expect(timelineIncluded[2025].B).toBe(100);
    expect(timelineExcluded[2025].D).toBe(100);
  });

  it('une opération sans gain connu dans la grille laisse la distribution inchangée', () => {
    const gainsGrid = { 'Réha niv. 2': { energie: { G: 0, F: 0, E: 0, D: 2, C: 0, B: 0, A: 0 }, ges: {} } };
    const residences = [residence('R1', { D: 100 })];
    const operations = [{ id: 1, resCode: 'R1', annee: 2025, type: 'Type inconnu de la grille', nature: null, statut: 'programme' }];
    const timeline = engine.computeTrajectory(residences, operations, gainsGrid, [2025], 'energie', true);
    expect(timeline[2025].D).toBe(100);
  });

  it('un tableau de résidences vide ne lève pas et renvoie un agrégat nul pour chaque année', () => {
    const timeline = engine.computeTrajectory([], [], {}, [2024, 2025], 'energie', true);
    expect(Object.values(timeline[2024]).every((v) => v === 0)).toBe(true);
  });
});

describe('resolveGain / findGridKey — priorité nature puis type, insensible à la casse/accents', () => {
  it('priorise op.nature sur op.type quand les deux sont dans la grille', () => {
    const gainsGrid = {
      'Nature précise': { energie: { A: 0, B: 0, C: 0, D: 1, E: 0, F: 0, G: 0 }, ges: {} },
      'Type générique': { energie: { A: 0, B: 0, C: 0, D: 9, E: 0, F: 0, G: 0 }, ges: {} },
    };
    const gain = engine.resolveGain({ type: 'Type générique', nature: 'Nature précise' }, gainsGrid, 'energie');
    expect(gain.D).toBe(1);
  });
  it('retombe sur op.type si op.nature ne matche aucune entrée de la grille', () => {
    const gainsGrid = { 'Type générique': { energie: { A: 0, B: 0, C: 0, D: 9, E: 0, F: 0, G: 0 }, ges: {} } };
    const gain = engine.resolveGain({ type: 'Type générique', nature: 'Nature absente de la grille' }, gainsGrid, 'energie');
    expect(gain.D).toBe(9);
  });
  it('la recherche de clé est insensible aux accents/casse (ceNorm)', () => {
    const gainsGrid = { 'Réhabilitation Lourde': { energie: { A: 0, B: 0, C: 0, D: 3, E: 0, F: 0, G: 0 }, ges: {} } };
    expect(engine.findGridKey('rehabilitation lourde', gainsGrid)).toBe('Réhabilitation Lourde');
  });
  it('toute variante de "démolition" retourne le marqueur DEMOL quel que soit son statut dans la grille', () => {
    expect(engine.resolveGain({ type: 'Démolition totale' }, {}, 'energie')).toBe('DEMOL');
  });
});
