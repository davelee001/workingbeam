import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeBeam,
  calculateBendingMoment,
  calculateDeflection,
  calculateReactions,
  calculateShearForce,
  checkSteelSection,
  designConcreteReinforcement,
} from '../dist/utils/beamCalculations.js';

const simpleSupports = [
  { position: 'left', type: 'pin' },
  { position: 'right', type: 'roller' },
];

const closeTo = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
};

test('center point load gives equal reactions and PL/4 moment', () => {
  const geometry = { span: 6, width: 300, depth: 500 };
  const loads = [{ type: 'point', value: 40, position: 3, direction: 'down' }];
  const reactions = calculateReactions(geometry, loads, simpleSupports);
  closeTo(reactions.Ra, 20, 1e-9, 'Ra');
  closeTo(reactions.Rb, 20, 1e-9, 'Rb');
  const shear = calculateShearForce(geometry, loads, reactions, simpleSupports, 100);
  const moment = calculateBendingMoment(geometry, loads, reactions, simpleSupports, 100);
  closeTo(shear[0], 20, 1e-9, 'left shear');
  closeTo(moment[50], 60, 1e-9, 'midspan moment');
  closeTo(moment.at(-1), 0, 1e-9, 'right support moment');
});

test('full-span UDL gives wL/2 reactions and wL^2/8 moment', () => {
  const geometry = { span: 8, width: 300, depth: 500 };
  const loads = [{ type: 'distributed', value: 12, direction: 'down' }];
  const reactions = calculateReactions(geometry, loads, simpleSupports);
  closeTo(reactions.Ra, 48, 1e-9, 'Ra');
  closeTo(reactions.Rb, 48, 1e-9, 'Rb');
  const moment = calculateBendingMoment(geometry, loads, reactions, simpleSupports, 100);
  closeTo(moment[50], 96, 1e-9, 'midspan moment');
});

test('partial UDL uses its centroid for reactions', () => {
  const geometry = { span: 10, width: 300, depth: 500 };
  const loads = [{ type: 'distributed', value: 10, position: 2, endPosition: 6, direction: 'down' }];
  const reactions = calculateReactions(geometry, loads, simpleSupports);
  closeTo(reactions.Rb, 16, 1e-9, 'Rb');
  closeTo(reactions.Ra, 24, 1e-9, 'Ra');
});

test('cantilever reaction and fixed-end moment satisfy equilibrium', () => {
  const geometry = { span: 4, width: 250, depth: 400 };
  const supports = [{ position: 'left', type: 'fixed' }];
  const loads = [{ type: 'point', value: 25, position: 4, direction: 'down' }];
  const reactions = calculateReactions(geometry, loads, supports);
  closeTo(reactions.Ra, 25, 1e-9, 'vertical reaction');
  closeTo(reactions.Ma, 100, 1e-9, 'fixed-end moment');
  const moment = calculateBendingMoment(geometry, loads, reactions, supports, 100);
  closeTo(moment[0], -100, 1e-9, 'fixed-end internal moment');
  closeTo(moment.at(-1), 0, 1e-9, 'free-end moment');
});

test('numerical UDL deflection agrees with 5wL^4/(384EI)', () => {
  const geometry = { span: 6, width: 300, depth: 500 };
  const materials = { type: 'steel', fy: 345, E: 200 };
  const loads = [{ type: 'distributed', value: 10, direction: 'down' }];
  const reactions = calculateReactions(geometry, loads, simpleSupports);
  const calculated = Math.abs(calculateDeflection(geometry, materials, loads, reactions, simpleSupports, 1000));
  const I = geometry.width * geometry.depth ** 3 / 12;
  // 10 kN/m is numerically 10 N/mm in the N-mm-MPa unit system.
  const expected = 5 * 10 * 6000 ** 4 / (384 * 200_000 * I);
  closeTo(calculated, expected, expected * 0.002, 'maximum deflection');
});

test('ACI design enforces minimum steel and adds stirrups when required', () => {
  const geometry = { span: 6, width: 300, depth: 500 };
  const materials = { type: 'concrete', fc: 30, fy: 420 };
  const light = designConcreteReinforcement(geometry, materials, 20, 20);
  assert.ok(light.requiredSteelArea >= light.minimumSteelArea);
  assert.ok(light.providedSteelArea >= light.requiredSteelArea);
  assert.equal(light.flexurePass, true);
  const heavyShear = designConcreteReinforcement(geometry, materials, 100, 250);
  assert.ok(heavyShear.stirrup);
  assert.ok(heavyShear.stirrup.providedAvOverS >= heavyShear.stirrup.requiredAvOverS);
  assert.equal(heavyShear.shearPass, true);
});

test('AISC compact braced section reports LRFD flexural and shear capacity', () => {
  const section = {
    span: 6, width: 300, depth: 500, Ix: 1.0e9, Sx: 4.0e6, Zx: 4.5e6,
    webThickness: 10, flangeWidth: 300, flangeThickness: 20, unbracedLength: 0,
  };
  const result = checkSteelSection(section, { type: 'steel', fy: 345, E: 200 }, 500, 300);
  assert.equal(result.sectionClassification, 'compact');
  closeTo(result.phiMn, 0.9 * 345 * 4.5e6 / 1e6, 1e-9, 'phi Mn');
  assert.equal(result.flexurePass, true);
  assert.equal(result.shearPass, true);
});

test('complete analysis returns diagrams, factored design demands and checks', () => {
  const result = analyzeBeam(
    { span: 5, width: 300, depth: 500 },
    { type: 'concrete', fc: 30, fy: 420 },
    [{ type: 'dead', value: 20, direction: 'down' }],
    simpleSupports,
  );
  closeTo(result.reactions.Ra, 50, 1e-9, 'service reaction');
  closeTo(result.maximumMoment, 62.5, 0.01, 'service moment');
  closeTo(result.designLoads.maximumMoment, 87.5, 0.02, '1.4D moment');
  assert.equal(result.diagrams.length, 201);
  assert.equal(typeof result.checks.deflection, 'boolean');
});

test('invalid support layouts and load locations are rejected', () => {
  const geometry = { span: 5, width: 300, depth: 500 };
  assert.throws(
    () => calculateReactions(geometry, [{ type: 'point', value: 10, position: 6 }], simpleSupports),
    /within the span/,
  );
  assert.throws(
    () => calculateReactions(geometry, [{ type: 'dead', value: 10 }], [
      { position: 'left', type: 'fixed' }, { position: 'right', type: 'roller' },
    ]),
    /Supports must define/,
  );
});
