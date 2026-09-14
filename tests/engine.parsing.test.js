import { describe, it, expect, beforeAll } from 'vitest';
import { loadEngine } from './engine-loader.js';

let engine;
beforeAll(() => { engine = loadEngine(); });

describe('ceStripAccents / ceNorm', () => {
  it('retire les accents et met en minuscule/trim', () => {
    expect(engine.ceStripAccents('Réhabilitation')).toBe('Rehabilitation');
  });
  it('ceNorm normalise pour comparaison (accents, casse, espaces)', () => {
    expect(engine.ceNorm('  Code de Résidence  ')).toBe(engine.ceNorm('code de residence'));
  });
  it('ceNorm gère null/undefined sans lever', () => {
    expect(() => engine.ceNorm(null)).not.toThrow();
    expect(() => engine.ceNorm(undefined)).not.toThrow();
  });
});

describe('ceNum', () => {
  it('parse un nombre valide', () => {
    expect(engine.ceNum(42)).toBe(42);
    expect(engine.ceNum('42')).toBe(42);
  });
  it('traite les marqueurs NR/N/A comme donnée manquante (pas NaN)', () => {
    expect(engine.ceNum('NR')).toBeNull();
    expect(engine.ceNum('N/A')).toBeNull();
    expect(engine.ceNum('')).toBeNull();
    expect(engine.ceNum(null)).toBeNull();
    expect(engine.ceNum(undefined)).toBeNull();
  });
  it('gère les nombres au format français (virgule décimale)', () => {
    expect(engine.ceNum('1234,5')).toBeCloseTo(1234.5);
  });
});

describe('findHeaderRow / findColIndex / findAllColIndices', () => {
  const matrix = [
    ['', 'Titre du fichier', ''],
    ['Code de Résidence', 'Commune', 'DPE'],
    ['R001', 'Lyon', 'C'],
    ['R002', 'Paris', 'D'],
  ];
  it('trouve la ligne d\'en-tête via une fonction de test', () => {
    const idx = engine.findHeaderRow(matrix, (row) => row.some((c) => engine.ceNorm(c) === engine.ceNorm('Code de Résidence')), 10);
    expect(idx).toBe(1);
  });
  it('retourne -1 (ou équivalent) si aucune ligne ne correspond', () => {
    const idx = engine.findHeaderRow(matrix, () => false, 10);
    expect(idx).toBeLessThan(0);
  });
  it('findColIndex localise une colonne à partir d\'une liste de motifs candidats', () => {
    const header = matrix[1];
    const idx = engine.findColIndex(header, [/code.*residence/]);
    expect(idx).toBe(0);
  });
  it('findColIndex essaie les motifs dans l\'ordre et retient le premier qui matche', () => {
    const header = matrix[1];
    const idx = engine.findColIndex(header, [/colonne_inexistante_xyz/, /commune/]);
    expect(idx).toBe(1);
  });
  it('findColIndex retourne -1 si aucun motif ne matche', () => {
    const header = matrix[1];
    expect(engine.findColIndex(header, [/colonne_inexistante_xyz/])).toBe(-1);
  });
});

describe('classIndex / DPE bands', () => {
  it('ordonne les classes DPE de G (pire) à A (meilleur)', () => {
    expect(engine.classIndex('G')).toBe(0);
    expect(engine.classIndex('A')).toBe(6);
  });
  it('retourne null pour une classe inconnue', () => {
    expect(engine.classIndex('Z')).toBeNull();
    expect(engine.classIndex('NR')).toBeNull();
  });
});

describe('parseBaseCotation — robustesse aux fichiers incomplets/atypiques', () => {
  it('ne lève pas sur une matrice vide', () => {
    expect(() => engine.parseBaseCotation([])).not.toThrow();
  });
  it('ne lève pas sur une matrice sans en-tête reconnu (socle absent)', () => {
    expect(() => engine.parseBaseCotation([['a', 'b'], ['c', 'd']])).not.toThrow();
  });
  it('déduplique les codes de résidence en doublon et les remonte dans duplicateCodes', () => {
    const header = ['Code de Résidence', 'Nom Résidence', 'Commune'];
    const matrix = [header, ['R001', 'Résidence A', 'Lyon'], ['R001', 'Résidence A bis', 'Lyon'], ['R002', 'Résidence B', 'Paris']];
    const result = engine.parseBaseCotation(matrix);
    expect(result.residences.map((r) => r.code)).toEqual(['R001', 'R002']);
    expect(result.duplicateCodes).toEqual(['R001']);
  });

  it('accepte « Code de Bâtiment » comme identifiant, libellé des gabarits antérieurs', () => {
    const header = ['Code de Bâtiment', 'Nom Résidence', 'Commune'];
    const result = engine.parseBaseCotation([header, ['0714.1', 'Résidence A', 'Paris'], ['0721.1', 'Résidence B', 'Orly']]);
    expect(result.residences.map((r) => r.code)).toEqual(['0714.1', '0721.1']);
  });

  it('résout la ligne d\'en-tête ET la colonne de code sur le même libellé', () => {
    // Une detection de ligne plus permissive que celle de la colonne renverrait un en-tête trouvé mais
    // un codeCol à -1, et toutes les lignes seraient filtrées : import vide sans message explicite.
    const matrix = [
      ['Base de cotation du bailleur', null, null],
      ['Code de Bâtiment', 'Nom Résidence', 'Commune'],
      ['0714.1', 'Résidence A', 'Paris'],
    ];
    const result = engine.parseBaseCotation(matrix);
    expect(result.headerRowIdx).toBe(1);
    expect(result.residences.length).toBe(1);
  });
});

describe('parseGainsDPE — détection des colonnes A-G par nom, robuste au réordonnancement', () => {
  it('lit correctement un bloc Energie/Ges où les colonnes A-G sont dans l\'ordre attendu', () => {
    const header = ['Nature des travaux', 'Energie', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'Ges', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const row = ['Réha niv. 2', null, 0, 0, 0, 2, 0, 0, 0, null, 0, 0, 0, 1, 0, 0, 0];
    const grid = engine.parseGainsDPE([header, row]);
    expect(grid['Réha niv. 2'].energie.D).toBe(2);
    expect(grid['Réha niv. 2'].ges.D).toBe(1);
    expect(grid['Réha niv. 2'].energie.A).toBe(0);
  });

  it('lit correctement un bloc dont les colonnes A-G sont dans le désordre (détection par nom, pas par position)', () => {
    const header = ['Nature des travaux', 'Energie', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];
    const row = ['Rénovation totale', null, 0, 0, 0, 5, 0, 0, 0];
    const grid = engine.parseGainsDPE([header, row]);
    expect(grid['Rénovation totale'].energie.D).toBe(5);
    expect(grid['Rénovation totale'].energie.A).toBe(0);
    expect(grid['Rénovation totale'].energie.G).toBe(0);
  });

  it('retombe sur la lecture positionnelle historique si les en-têtes A-G ne sont pas explicites', () => {
    const header = ['Nature des travaux', 'Energie', '', '', '', '', '', '', ''];
    const row = ['Réha niv. 2', null, 0, 0, 0, 2, 0, 0, 0];
    const grid = engine.parseGainsDPE([header, row]);
    expect(grid['Réha niv. 2'].energie.D).toBe(2);
  });
});

describe('familyOfType', () => {
  it('est stable et ne lève pas sur des valeurs vides/inconnues', () => {
    expect(() => engine.familyOfType(null)).not.toThrow();
    expect(() => engine.familyOfType(undefined)).not.toThrow();
    expect(() => engine.familyOfType('')).not.toThrow();
    expect(() => engine.familyOfType('Type totalement inconnu xyz')).not.toThrow();
  });
});

describe('anneeCoupureActuel / filterOpsUntil', () => {
  it('filterOpsUntil ne renvoie que les opérations dont l\'année est <= année donnée', () => {
    const ops = [{ id: 1, annee: 2020 }, { id: 2, annee: 2025 }, { id: 3, annee: 2030 }];
    const filtered = engine.filterOpsUntil(ops, 2025);
    expect(filtered.every((o) => o.annee <= 2025)).toBe(true);
    expect(filtered.some((o) => o.id === 3)).toBe(false);
  });
  it('filterOpsUntil sur tableau vide renvoie un tableau vide', () => {
    expect(engine.filterOpsUntil([], 2025)).toEqual([]);
  });
});
