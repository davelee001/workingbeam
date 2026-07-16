// Beam Analysis Calculations

export interface BeamGeometry {
  span: number; // Length in meters
  width: number; // Width in mm
  depth: number; // Depth in mm
}

export interface MaterialProperties {
  type: 'concrete' | 'steel';
  fc?: number; // Concrete compressive strength (MPa)
  fy?: number; // Steel yield strength (MPa)
  E?: number; // Modulus of elasticity (GPa)
}

export interface Load {
  type: 'point' | 'distributed' | 'dead' | 'live';
  value: number;
  position?: number; // Position from left support
  direction: 'down' | 'up';
}

export interface SupportCondition {
  position: 'left' | 'right' | 'middle';
  type: 'pin' | 'roller' | 'fixed';
}

// Calculate reactions
export function calculateReactions(
  geometry: BeamGeometry,
  loads: Load[],
  supports: SupportCondition[]
): { Ra: number; Rb: number } {
  const span = geometry.span;
  let totalLoad = 0;
  let momentAboutA = 0;

  loads.forEach((load) => {
    const factor = load.direction === 'down' ? 1 : -1;
    totalLoad += load.value * factor;
    if (load.position !== undefined) {
      momentAboutA += load.value * factor * load.position;
    }
  });

  // Assuming simple support
  const Ra = (momentAboutA * -1) / span;
  const Rb = totalLoad - Ra;

  return { Ra, Rb };
}

// Calculate shear force diagram
export function calculateShearForce(
  geometry: BeamGeometry,
  loads: Load[],
  reactions: { Ra: number; Rb: number }
): number[] {
  const span = geometry.span;
  const points = [];
  const step = span / 100;

  let shear = reactions.Ra;
  for (let i = 0; i <= span; i += step) {
    points.push(shear);
    // TODO: Update shear based on loads at position i
  }

  return points;
}

// Calculate bending moment diagram
export function calculateBendingMoment(
  geometry: BeamGeometry,
  loads: Load[],
  reactions: { Ra: number; Rb: number }
): number[] {
  const span = geometry.span;
  const points = [];
  const step = span / 100;

  let moment = 0;
  for (let i = 0; i <= span; i += step) {
    // TODO: Calculate moment at each position
    points.push(moment);
  }

  return points;
}

// Calculate deflection
export function calculateDeflection(
  geometry: BeamGeometry,
  materials: MaterialProperties,
  loads: Load[],
  reactions: { Ra: number; Rb: number }
): number {
  // TODO: Implement deflection calculation using moment-area method or other
  return 0;
}

// Design checks
export function flexuralCheck(
  Mu: number, // Factored moment
  Mr: number, // Nominal moment resistance
  phi: number = 0.9
): boolean {
  return Mu <= phi * Mr;
}

export function shearCheck(
  Vu: number, // Factored shear
  Vr: number, // Nominal shear resistance
  phi: number = 0.75
): boolean {
  return Vu <= phi * Vr;
}

export function deflectionCheck(
  deltaMax: number, // Maximum deflection
  deltaAllowable: number
): boolean {
  return Math.abs(deltaMax) <= deltaAllowable;
}
