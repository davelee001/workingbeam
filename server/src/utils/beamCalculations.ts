/**
 * Linear-elastic analysis and strength checks for prismatic beams.
 *
 * Units used by the public API:
 *   length: m, section dimensions: mm, force: kN, moment: kN-m,
 *   stress/modulus: MPa (material E may also be supplied in GPa; see getModulus).
 *
 * Analysis is limited to a simply-supported span or a cantilever with one fixed
 * end.  This is intentional: returning statics-only answers for indeterminate
 * support arrangements would be unsafe.
 */

export interface BeamGeometry {
  span: number;
  width: number;
  depth: number;
  /** Gross second moment of area; defaults to width * depth^3 / 12. */
  Ix?: number;
  /** Elastic and plastic section moduli used by the steel check. */
  Sx?: number;
  Zx?: number;
  /** Steel section dimensions used for local-buckling/shear checks. */
  webThickness?: number;
  flangeWidth?: number;
  flangeThickness?: number;
  /** Laterally unbraced length in m. Omit/zero only for a continuously braced beam. */
  unbracedLength?: number;
  Cb?: number;
}

export interface MaterialProperties {
  type: 'concrete' | 'steel';
  fc?: number;
  fy?: number;
  /** GPa when <= 1000, otherwise MPa. */
  E?: number;
  /** Concrete density modifier (lambda), normally 1.0. */
  lambda?: number;
}

export interface Load {
  type: 'point' | 'distributed' | 'dead' | 'live';
  /** kN for point loads, kN/m otherwise. */
  value: number;
  /** Point location, or start of a partial UDL; defaults to 0 for UDLs. */
  position?: number;
  /** End of a partial UDL; defaults to the span end. */
  endPosition?: number;
  direction?: 'down' | 'up';
}

export interface SupportCondition {
  position: 'left' | 'right' | 'middle';
  type: 'pin' | 'roller' | 'fixed';
}

export interface Reactions {
  /** Upward reactions in kN. */
  Ra: number;
  Rb: number;
  /** Counter-clockwise fixed-end reactions in kN-m. */
  Ma?: number;
  Mb?: number;
}

export interface DiagramPoint {
  position: number;
  shear: number;
  moment: number;
  deflection: number;
}

export interface ConcreteDesignResult {
  code: 'ACI 318-19';
  effectiveDepth: number;
  beta1: number;
  requiredSteelArea: number;
  minimumSteelArea: number;
  maximumSteelArea: number;
  providedSteelArea: number;
  barDiameter: number;
  barCount: number;
  phiMn: number;
  phiVc: number;
  stirrup: null | {
    barDiameter: number;
    legs: number;
    spacing: number;
    requiredAvOverS: number;
    providedAvOverS: number;
  };
  flexurePass: boolean;
  shearPass: boolean;
  warnings: string[];
}

export interface SteelDesignResult {
  code: 'AISC 360-22 LRFD';
  sectionClassification: 'compact' | 'noncompact' | 'slender' | 'rectangular-fallback';
  phiMn: number;
  phiVn: number;
  flexurePass: boolean;
  shearPass: boolean;
  lateralTorsionalBucklingChecked: boolean;
  warnings: string[];
}

export interface BeamAnalysisResult {
  reactions: Reactions;
  diagrams: DiagramPoint[];
  maximumShear: number;
  maximumMoment: number;
  maximumDeflection: number;
  allowableDeflection: number;
  designLoads: { maximumShear: number; maximumMoment: number };
  checks: { flexure: boolean; shear: boolean; deflection: boolean };
  design: ConcreteDesignResult | SteelDesignResult;
}

type NormalizedLoad = {
  kind: 'point' | 'udl';
  magnitude: number; // positive downward
  start: number;
  end: number;
};

const EPS = 1e-9;

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
}

function validateGeometry(geometry: BeamGeometry): void {
  assertFinitePositive(geometry.span, 'geometry.span');
  assertFinitePositive(geometry.width, 'geometry.width');
  assertFinitePositive(geometry.depth, 'geometry.depth');
}

function normalizeLoads(span: number, loads: Load[]): NormalizedLoad[] {
  return loads.map((load, index) => {
    if (!Number.isFinite(load.value) || load.value < 0) {
      throw new Error(`loads[${index}].value must be a non-negative finite number`);
    }
    const magnitude = load.value * (load.direction === 'up' ? -1 : 1);
    if (load.type === 'point') {
      if (load.position === undefined || load.position < 0 || load.position > span) {
        throw new Error(`loads[${index}].position must be within the span for a point load`);
      }
      return { kind: 'point', magnitude, start: load.position, end: load.position };
    }
    const start = load.position ?? 0;
    const end = load.endPosition ?? span;
    if (start < 0 || end > span || end <= start) {
      throw new Error(`loads[${index}] distributed-load range must satisfy 0 <= start < end <= span`);
    }
    return { kind: 'udl', magnitude, start, end };
  });
}

function supportSystem(supports: SupportCondition[]): 'simple' | 'cantilever-left' | 'cantilever-right' {
  const left = supports.find((s) => s.position === 'left');
  const right = supports.find((s) => s.position === 'right');
  const middle = supports.some((s) => s.position === 'middle');
  if (middle) throw new Error('Middle/continuous supports are not supported by this single-span solver');
  if (left?.type === 'fixed' && !right) return 'cantilever-left';
  if (right?.type === 'fixed' && !left) return 'cantilever-right';
  if (left && right && left.type !== 'fixed' && right.type !== 'fixed') return 'simple';
  throw new Error('Supports must define a pin/roller simple span or one fixed-end cantilever');
}

function resultant(load: NormalizedLoad): { force: number; location: number } {
  if (load.kind === 'point') return { force: load.magnitude, location: load.start };
  return { force: load.magnitude * (load.end - load.start), location: (load.start + load.end) / 2 };
}

export function calculateReactions(
  geometry: BeamGeometry,
  loads: Load[],
  supports: SupportCondition[] = [
    { position: 'left', type: 'pin' },
    { position: 'right', type: 'roller' },
  ]
): Reactions {
  validateGeometry(geometry);
  const normalized = normalizeLoads(geometry.span, loads);
  const system = supportSystem(supports);
  const totals = normalized.map(resultant);
  const totalForce = totals.reduce((sum, item) => sum + item.force, 0);
  const momentAboutLeft = totals.reduce((sum, item) => sum + item.force * item.location, 0);

  if (system === 'simple') {
    const Rb = momentAboutLeft / geometry.span;
    return { Ra: totalForce - Rb, Rb };
  }
  if (system === 'cantilever-left') return { Ra: totalForce, Rb: 0, Ma: momentAboutLeft };
  const momentAboutRight = totals.reduce(
    (sum, item) => sum + item.force * (geometry.span - item.location),
    0
  );
  return { Ra: 0, Rb: totalForce, Mb: -momentAboutRight };
}

function loadEffectsAt(x: number, loads: NormalizedLoad[]): { shear: number; moment: number } {
  let shear = 0;
  let moment = 0;
  for (const load of loads) {
    if (load.kind === 'point') {
      if (x + EPS >= load.start) shear -= load.magnitude;
      if (x > load.start) moment -= load.magnitude * (x - load.start);
    } else {
      const loadedLength = Math.max(0, Math.min(x, load.end) - load.start);
      if (loadedLength > 0) {
        const force = load.magnitude * loadedLength;
        shear -= force;
        moment -= force * (x - (load.start + loadedLength / 2));
      }
    }
  }
  return { shear, moment };
}

function rawDiagrams(
  geometry: BeamGeometry,
  loads: Load[],
  reactions: Reactions,
  supports: SupportCondition[],
  divisions: number
): Array<{ position: number; shear: number; moment: number }> {
  const normalized = normalizeLoads(geometry.span, loads);
  const system = supportSystem(supports);
  const count = Math.max(2, Math.floor(divisions));
  const points: Array<{ position: number; shear: number; moment: number }> = [];
  for (let i = 0; i <= count; i += 1) {
    const x = (geometry.span * i) / count;
    const effects = loadEffectsAt(x, normalized);
    let shear = effects.shear + reactions.Ra;
    let moment = effects.moment + reactions.Ra * x;
    if (system === 'cantilever-left') moment -= reactions.Ma ?? 0;
    if (system === 'cantilever-right') {
      // Left-segment equilibrium is already represented by the load effects.
      shear = effects.shear;
      moment = effects.moment;
    }
    points.push({ position: x, shear, moment });
  }
  return points;
}

export function calculateShearForce(
  geometry: BeamGeometry,
  loads: Load[],
  reactions: Reactions,
  supports: SupportCondition[] = [
    { position: 'left', type: 'pin' },
    { position: 'right', type: 'roller' },
  ],
  divisions = 100
): number[] {
  return rawDiagrams(geometry, loads, reactions, supports, divisions).map((point) => point.shear);
}

export function calculateBendingMoment(
  geometry: BeamGeometry,
  loads: Load[],
  reactions: Reactions,
  supports: SupportCondition[] = [
    { position: 'left', type: 'pin' },
    { position: 'right', type: 'roller' },
  ],
  divisions = 100
): number[] {
  return rawDiagrams(geometry, loads, reactions, supports, divisions).map((point) => point.moment);
}

function getModulus(materials: MaterialProperties): number {
  if (materials.E !== undefined) {
    assertFinitePositive(materials.E, 'materials.E');
    return materials.E <= 1000 ? materials.E * 1000 : materials.E;
  }
  if (materials.type === 'steel') return 200_000;
  assertFinitePositive(materials.fc ?? 0, 'materials.fc');
  return 4700 * Math.sqrt(materials.fc as number);
}

function getInertia(geometry: BeamGeometry): number {
  const inertia = geometry.Ix ?? (geometry.width * geometry.depth ** 3) / 12;
  assertFinitePositive(inertia, 'geometry.Ix');
  return inertia;
}

function integrateDeflection(
  diagram: Array<{ position: number; moment: number }>,
  geometry: BeamGeometry,
  materials: MaterialProperties,
  supports: SupportCondition[]
): number[] {
  const E = getModulus(materials); // N/mm2
  const I = getInertia(geometry); // mm4
  const system = supportSystem(supports);
  const slopes = new Array<number>(diagram.length).fill(0);
  const deflections = new Array<number>(diagram.length).fill(0);

  // M(kN-m) is numerically equal to N-mm / 1e6; x increments are converted to mm.
  for (let i = 1; i < diagram.length; i += 1) {
    const dx = (diagram[i].position - diagram[i - 1].position) * 1000;
    const k0 = (diagram[i - 1].moment * 1e6) / (E * I);
    const k1 = (diagram[i].moment * 1e6) / (E * I);
    slopes[i] = slopes[i - 1] + ((k0 + k1) * dx) / 2;
    deflections[i] = deflections[i - 1] + ((slopes[i - 1] + slopes[i]) * dx) / 2;
  }

  if (system === 'simple') {
    const lengthMm = geometry.span * 1000;
    const correctionSlope = -deflections[deflections.length - 1] / lengthMm;
    return deflections.map((value, i) => value + correctionSlope * diagram[i].position * 1000);
  }
  if (system === 'cantilever-right') {
    // Integration began at the free end. Enforce slope and displacement zero at x=L.
    const endSlope = slopes[slopes.length - 1];
    const endDeflection = deflections[deflections.length - 1];
    return deflections.map((value, i) => {
      const distanceFromEnd = (diagram[i].position - geometry.span) * 1000;
      return value - endDeflection - endSlope * distanceFromEnd;
    });
  }
  return deflections;
}

export function calculateDeflection(
  geometry: BeamGeometry,
  materials: MaterialProperties,
  loads: Load[],
  reactions: Reactions,
  supports: SupportCondition[] = [
    { position: 'left', type: 'pin' },
    { position: 'right', type: 'roller' },
  ],
  divisions = 400
): number {
  const diagram = rawDiagrams(geometry, loads, reactions, supports, divisions);
  const values = integrateDeflection(diagram, geometry, materials, supports);
  return values.reduce((maximum, value) => (Math.abs(value) > Math.abs(maximum) ? value : maximum), 0);
}

function beta1For(fc: number): number {
  return Math.max(0.65, 0.85 - Math.max(0, fc - 28) * (0.05 / 7));
}

export function designConcreteReinforcement(
  geometry: BeamGeometry,
  materials: MaterialProperties,
  Mu: number,
  Vu: number
): ConcreteDesignResult {
  validateGeometry(geometry);
  const fc = materials.fc ?? 0;
  const fy = materials.fy ?? 0;
  assertFinitePositive(fc, 'materials.fc');
  assertFinitePositive(fy, 'materials.fy');
  const b = geometry.width;
  const d = geometry.depth;
  const beta1 = beta1For(fc);
  const phiFlexure = 0.9;
  const phiShear = 0.75;
  const MuNmm = Math.abs(Mu) * 1e6;
  const coefficient = fy ** 2 / (2 * 0.85 * fc * b);
  const discriminant = (fy * d) ** 2 - 4 * coefficient * (MuNmm / phiFlexure);
  const warnings: string[] = [];
  const calculatedAs = discriminant >= 0 ? (fy * d - Math.sqrt(discriminant)) / (2 * coefficient) : Infinity;
  const AsMin = Math.max((0.25 * Math.sqrt(fc) * b * d) / fy, (1.4 * b * d) / fy);
  const cOverD = 0.003 / (0.003 + 0.005);
  const AsMax = (0.85 * fc * b * beta1 * cOverD * d) / fy;
  const requiredAs = Math.max(calculatedAs, AsMin);
  const barDiameter = 20;
  const oneBarArea = (Math.PI * barDiameter ** 2) / 4;
  const barCount = Number.isFinite(requiredAs) ? Math.max(2, Math.ceil(requiredAs / oneBarArea)) : 0;
  const providedAs = barCount * oneBarArea;
  const a = providedAs > 0 ? (providedAs * fy) / (0.85 * fc * b) : 0;
  const phiMn = (phiFlexure * providedAs * fy * (d - a / 2)) / 1e6;
  if (!Number.isFinite(calculatedAs) || requiredAs > AsMax) {
    warnings.push('Demand exceeds the tension-controlled singly reinforced section limit; enlarge or redesign the section.');
  }

  const lambda = materials.lambda ?? 1;
  const rho = providedAs / (b * d);
  const lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * d)));
  const VcNoStirrups = Math.min(
    0.66 * lambdaS * lambda * Math.cbrt(Math.max(rho, EPS)) * Math.sqrt(fc) * b * d,
    0.42 * lambda * Math.sqrt(fc) * b * d
  ) / 1000;
  let phiVc = phiShear * VcNoStirrups;
  let stirrup: ConcreteDesignResult['stirrup'] = null;
  let shearPass = Math.abs(Vu) <= phiVc + EPS;

  if (!shearPass) {
    const Vc = (0.17 * lambda * Math.sqrt(fc) * b * d) / 1000;
    phiVc = phiShear * Vc;
    const requiredAvOverS = Math.max(
      ((Math.abs(Vu) / phiShear - Vc) * 1000) / (fy * d),
      (0.062 * Math.sqrt(fc) * b) / fy,
      (0.35 * b) / fy
    );
    const stirrupBarDiameter = 10;
    const legs = 2;
    const Av = legs * Math.PI * stirrupBarDiameter ** 2 / 4;
    const requiredVs = Math.max(0, (Math.abs(Vu) / phiShear - Vc) * 1000);
    const highShear = requiredVs > 0.33 * Math.sqrt(fc) * b * d;
    const maximumSpacing = highShear ? Math.min(d / 4, 300) : Math.min(d / 2, 600);
    const rawSpacing = Math.min(Av / requiredAvOverS, maximumSpacing);
    const spacing = Math.max(25, Math.floor(rawSpacing / 25) * 25);
    const providedAvOverS = Av / spacing;
    const phiVn = phiShear * (Vc + (providedAvOverS * fy * d) / 1000);
    shearPass = Math.abs(Vu) <= phiVn + EPS && spacing <= maximumSpacing + EPS;
    stirrup = { barDiameter: stirrupBarDiameter, legs, spacing, requiredAvOverS, providedAvOverS };
    if (Math.abs(Vu) > phiShear * (Vc + (0.66 * Math.sqrt(fc) * b * d) / 1000)) {
      shearPass = false;
      warnings.push('Shear demand exceeds the maximum concrete web strength limit.');
    }
  }

  return {
    code: 'ACI 318-19', effectiveDepth: d, beta1,
    requiredSteelArea: requiredAs, minimumSteelArea: AsMin, maximumSteelArea: AsMax,
    providedSteelArea: providedAs, barDiameter, barCount, phiMn, phiVc, stirrup,
    flexurePass: Number.isFinite(requiredAs) && requiredAs <= AsMax && Math.abs(Mu) <= phiMn + EPS,
    shearPass, warnings,
  };
}

export function checkSteelSection(
  geometry: BeamGeometry,
  materials: MaterialProperties,
  Mu: number,
  Vu: number
): SteelDesignResult {
  validateGeometry(geometry);
  const Fy = materials.fy ?? 0;
  assertFinitePositive(Fy, 'materials.fy');
  const E = getModulus(materials);
  const warnings: string[] = [];
  const Sx = geometry.Sx ?? (geometry.width * geometry.depth ** 2) / 6;
  const Zx = geometry.Zx ?? (geometry.width * geometry.depth ** 2) / 4;
  const tw = geometry.webThickness ?? geometry.width;
  const Aw = tw * geometry.depth;
  let classification: SteelDesignResult['sectionClassification'] = 'rectangular-fallback';
  let Mn = Math.min(Fy * Zx, 1.6 * Fy * Sx);

  if (geometry.webThickness && geometry.flangeWidth && geometry.flangeThickness) {
    const clearWeb = Math.max(0, geometry.depth - 2 * geometry.flangeThickness);
    const webSlenderness = clearWeb / geometry.webThickness;
    const flangeSlenderness = (geometry.flangeWidth - geometry.webThickness) / (2 * geometry.flangeThickness);
    const webCompactLimit = 3.76 * Math.sqrt(E / Fy);
    const flangeCompactLimit = 0.38 * Math.sqrt(E / Fy);
    const webSlenderLimit = 5.70 * Math.sqrt(E / Fy);
    const flangeSlenderLimit = Math.sqrt(E / Fy);
    classification = webSlenderness <= webCompactLimit && flangeSlenderness <= flangeCompactLimit
      ? 'compact'
      : webSlenderness <= webSlenderLimit && flangeSlenderness <= flangeSlenderLimit
        ? 'noncompact' : 'slender';
    if (classification !== 'compact') {
      // Conservative elastic-yield cap; a full Chapter F check needs shape-specific J, Cw, ry, rts and Lp/Lr.
      Mn = Math.min(Mn, 0.7 * Fy * Sx);
      warnings.push('Noncompact/slender elements use a conservative elastic-yield cap; provide a selected AISC shape for a complete Chapter F check.');
    }
  } else {
    warnings.push('No flange/web properties supplied; capacities use a solid rectangular-section fallback.');
  }

  const Lb = geometry.unbracedLength ?? 0;
  const lateralTorsionalBucklingChecked = Lb <= EPS;
  if (!lateralTorsionalBucklingChecked) {
    warnings.push('Lateral-torsional buckling capacity requires shape torsion/warping properties and is not verified.');
  }

  const h = Math.max(geometry.depth - 2 * (geometry.flangeThickness ?? 0), EPS);
  const hOverTw = h / tw;
  const kv = 5.34;
  const limit1 = 1.10 * Math.sqrt((kv * E) / Fy);
  const limit2 = 1.37 * Math.sqrt((kv * E) / Fy);
  const Cv1 = hOverTw <= limit1 ? 1 : hOverTw <= limit2
    ? limit1 / hOverTw
    : (1.51 * kv * E) / (hOverTw ** 2 * Fy);
  const phiMn = (0.9 * Mn) / 1e6;
  const phiVn = (0.6 * Fy * Aw * Cv1) / 1000;
  return {
    code: 'AISC 360-22 LRFD', sectionClassification: classification, phiMn, phiVn,
    flexurePass: lateralTorsionalBucklingChecked && Math.abs(Mu) <= phiMn + EPS,
    shearPass: Math.abs(Vu) <= phiVn + EPS,
    lateralTorsionalBucklingChecked, warnings,
  };
}

export function flexuralCheck(Mu: number, Mr: number, phi = 0.9): boolean {
  return Math.abs(Mu) <= phi * Math.abs(Mr) + EPS;
}

export function shearCheck(Vu: number, Vr: number, phi = 0.75): boolean {
  return Math.abs(Vu) <= phi * Math.abs(Vr) + EPS;
}

export function deflectionCheck(deltaMax: number, deltaAllowable: number): boolean {
  return Math.abs(deltaMax) <= Math.abs(deltaAllowable) + EPS;
}

function scaledLoads(loads: Load[], deadFactor: number, liveFactor: number): Load[] {
  return loads.map((load) => ({
    ...load,
    value: load.value * (load.type === 'dead' ? deadFactor : load.type === 'live' ? liveFactor : 1),
  }));
}

function demandFor(
  geometry: BeamGeometry,
  loads: Load[],
  supports: SupportCondition[]
): { maximumShear: number; maximumMoment: number } {
  const reactions = calculateReactions(geometry, loads, supports);
  const diagram = rawDiagrams(geometry, loads, reactions, supports, 400);
  return {
    maximumShear: Math.max(...diagram.map((point) => Math.abs(point.shear))),
    maximumMoment: Math.max(...diagram.map((point) => Math.abs(point.moment))),
  };
}

export function analyzeBeam(
  geometry: BeamGeometry,
  materials: MaterialProperties,
  loads: Load[],
  supports: SupportCondition[]
): BeamAnalysisResult {
  validateGeometry(geometry);
  if (!Array.isArray(loads) || loads.length === 0) throw new Error('At least one load is required');
  const reactions = calculateReactions(geometry, loads, supports);
  const raw = rawDiagrams(geometry, loads, reactions, supports, 200);
  const deflections = integrateDeflection(raw, geometry, materials, supports);
  const diagrams = raw.map((point, index) => ({ ...point, deflection: deflections[index] }));
  const maximumShear = Math.max(...diagrams.map((point) => Math.abs(point.shear)));
  const maximumMoment = Math.max(...diagrams.map((point) => Math.abs(point.moment)));
  const maximumDeflection = Math.max(...deflections.map(Math.abs));
  const allowableDeflection = (geometry.span * 1000) / 360;

  // ASCE-style gravity combinations used for member strength: 1.4D and 1.2D+1.6L.
  // Loads explicitly typed point/distributed are treated as already combined and factor 1.0.
  const combinations = [scaledLoads(loads, 1.4, 0), scaledLoads(loads, 1.2, 1.6)];
  const demands = combinations.map((combination) => demandFor(geometry, combination, supports));
  const designLoads = {
    maximumShear: Math.max(...demands.map((item) => item.maximumShear)),
    maximumMoment: Math.max(...demands.map((item) => item.maximumMoment)),
  };
  const design = materials.type === 'concrete'
    ? designConcreteReinforcement(geometry, materials, designLoads.maximumMoment, designLoads.maximumShear)
    : checkSteelSection(geometry, materials, designLoads.maximumMoment, designLoads.maximumShear);
  return {
    reactions, diagrams, maximumShear, maximumMoment, maximumDeflection, allowableDeflection,
    designLoads,
    checks: {
      flexure: design.flexurePass,
      shear: design.shearPass,
      deflection: deflectionCheck(maximumDeflection, allowableDeflection),
    },
    design,
  };
}
