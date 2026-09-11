// Charge le moteur de calcul/parsing directement depuis index.html (bloc <script id="engine-source">)
// afin de tester le CODE RÉELLEMENT LIVRÉ, sans dupliquer sa logique dans un module séparé
// (ce qui créerait un risque de divergence entre les tests et la production).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = path.resolve(__dirname, '../index.html');

// Identifiants top-level exportés par <script id="engine-source"> que les tests peuvent utiliser.
const ENGINE_NAMES = [
  'ceStripAccents', 'ceNorm', 'ceNum',
  'sheetToMatrix', 'findHeaderRow', 'findColIndex', 'findAllColIndices', 'findSheet',
  'parseBaseCotation', 'parseGainsDPE', 'findClassCols',
  'CESSION_FAMILLES', 'parseCessionsIdentifiees', 'matchCessionsToResidences', 'buildPlanVenteInitial',
  'CLASS_ORDER', 'classIndex', 'findGridKey', 'resolveGain', 'hasKnownDpeGain',
  'computeTrajectory', 'computeTrajectoryByResidence',
  'familyOfType', 'TECH_SUBCRITERES', 'TECH_RC_MAP', 'TECH_REHA_MAP', 'computeTechniqueProjection',
  'DPE_PERF_ORDER', 'dpePerfBandOfDist', 'dpeGlobalBand', 'technicalBand',
  'anneeCoupureActuel', 'filterOpsUntil', 'matchOperations',
];

export function loadEngine() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const match = html.match(/<script id="engine-source">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Bloc <script id="engine-source"> introuvable dans index.html');
  }
  const code = match[1];
  const sandbox = { console };
  vm.createContext(sandbox);
  const trailer = `\nglobalThis.__engineExports = {${ENGINE_NAMES.join(',')}};`;
  vm.runInContext(code + trailer, sandbox, { filename: 'engine-source.js' });
  return sandbox.__engineExports;
}
