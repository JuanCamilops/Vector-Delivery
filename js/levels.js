import * as THREE from 'three';

/**
 * Definición de los 4 Niveles Progresivos de Vector Delivery (v2.6 Hardcore)
 * Cada nivel integra:
 * - Plataforma Alfa (recogida de paquete) y Plataforma Destino (entrega)
 * - Torres sólidas (AABB colliders) que restan integridad al chocar
 * - Campo vectorial F(x, y, z, t), potencial escalar f(x, y, z) y campo magnético B(x, y, z)
 */
export const LEVELS = [
  // =========================================================================
  // NIVEL 1: VÓRTICE INTENSO Y TORRES SÓLIDAS
  // =========================================================================
  {
    id: 0,
    name: 'Nivel 1: Vórtice Intenso y Torres',
    equationText: 'F(x, y, z) = (-0.48z, 2.0·sin(0.2x), 0.48x)',
    description: 'Navega el vórtice rotacional intenso entre los rascacielos. Recoge el paquete en Plataforma Alfa y llévalo a Destino sin chocar.',
    startPos: new THREE.Vector3(0, 7, 38),
    pickupPos: new THREE.Vector3(-18, 9, 14),
    deliveryPos: new THREE.Vector3(20, 15, -34),
    requiredFlux: 0,
    hasShield: false,
    cargoCharge: 0,
    towers: [
      [-10, 13, 24, 7, 26, 7],
      [12, 15, 16, 8, 30, 8],
      [0, 16, 0, 9, 32, 9],
      [-16, 14, -14, 8, 28, 8],
      [14, 15, -18, 7, 30, 7],
      [-32, 13, 18, 8, 26, 8],
      [32, 16, -12, 9, 32, 9]
    ],
    fieldFn: (x, y, z) => {
      const vx = -0.48 * z;
      const vy = 2.0 * Math.sin(0.2 * x);
      const vz = 0.48 * x;
      return new THREE.Vector3(vx, vy, vz);
    },
    get F() { return this.fieldFn; },
    B: () => new THREE.Vector3(0, 0, 0),
    scalarPotentialFn: (x, y, z) => {
      const dx = x - 20;
      const dy = y - 16;
      const dz = z + 34;
      return 200 - 0.2 * (dx * dx + dy * dy + dz * dz);
    },
    divergenceZones: [],
    fluxRings: [],
    vortices: [],
    magneticZone: null
  },

  // =========================================================================
  // NIVEL 2: GRADIENTE ∇f Y ZONAS DE REPULSIÓN (DIVERGENCIA)
  // =========================================================================
  {
    id: 1,
    name: 'Nivel 2: Gradiente ∇f y Repulsión',
    equationText: '∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z) | Fuentes ∇·F > 0',
    description: 'Mantén presionado [E] o [∇f GANCHO] para escalar siguiendo el gradiente hacia la torre alta, esquivando fuentes de divergencia y edificios.',
    startPos: new THREE.Vector3(-24, 6, 34),
    pickupPos: new THREE.Vector3(-14, 8, 12),
    deliveryPos: new THREE.Vector3(16, 29, -30),
    requiredFlux: 0,
    hasShield: false,
    cargoCharge: 0,
    towers: [
      [-6, 14, 20, 7, 28, 7],
      [-22, 12, 2, 7, 24, 7],
      [8, 16, 4, 8, 32, 8],
      [-8, 17, -18, 8, 34, 8],
      [24, 15, -10, 7, 30, 7],
      [16, 14, -30, 10, 28, 10] // Torre soporte de Plataforma Destino alta
    ],
    fieldFn: (x, y, z) => {
      let fx = 4.2 * Math.sin(0.14 * z);
      let fy = -0.65;
      let fz = -2.2;

      // Fuente repulsiva intensa en (0, 15, -6) -> ∇·F > 0
      const dx1 = x - 0;
      const dy1 = y - 15;
      const dz1 = z + 6;
      const r1Sq = dx1 * dx1 + dy1 * dy1 + dz1 * dz1 + 10;
      const strength1 = 210 / r1Sq;
      fx += dx1 * strength1;
      fy += dy1 * strength1;
      fz += dz1 * strength1;

      return new THREE.Vector3(fx, fy, fz);
    },
    get F() { return this.fieldFn; },
    B: () => new THREE.Vector3(0, 0, 0),
    scalarPotentialFn: (x, y, z) => {
      const dx = x - 16;
      const dy = y - 31;
      const dz = z + 30;
      return 260 - 0.24 * (dx * dx + dy * dy + dz * dz);
    },
    divergenceZones: [
      { pos: new THREE.Vector3(0, 15, -6), radius: 6.8, type: 'source', label: 'Fuente (∇·F > 0)' },
      { pos: new THREE.Vector3(11, 21, -16), radius: 5.8, type: 'sink', label: 'Sumidero (∇·F < 0)' }
    ],
    fluxRings: [],
    vortices: [],
    magneticZone: null
  },

  // =========================================================================
  // NIVEL 3: CAÑÓN DE FLUJO ∬(F·n)dS Y ESCUDO OMEGA
  // =========================================================================
  {
    id: 2,
    name: 'Nivel 3: Cañón de Flujo y Escudo Omega',
    equationText: 'Φ = ∬_S (F · n) dS ≥ 135 Wb para desactivar Escudo Omega',
    description: 'Atraviesa los 3 anillos de flujo en el cañón de torres alineado con n̂ para sumar Φ ≥ 135 Wb y desactivar el Escudo Omega.',
    startPos: new THREE.Vector3(0, 9, 40),
    pickupPos: new THREE.Vector3(0, 10, 22),
    deliveryPos: new THREE.Vector3(0, 19, -38),
    requiredFlux: 135,
    hasShield: true,
    cargoCharge: 0,
    towers: [
      [-14, 16, 12, 9, 32, 10],
      [14, 16, 12, 9, 32, 10],
      [-15, 18, -8, 10, 36, 10],
      [15, 18, -8, 10, 36, 10],
      [-13, 18, -26, 9, 36, 10],
      [13, 18, -26, 9, 36, 10]
    ],
    fieldFn: (x, y, z) => {
      const fx = -0.24 * y + 2.2 * Math.sin(0.15 * z);
      const fy = 0.24 * x;
      const vz = -6.8 - 1.8 * Math.cos(0.15 * x);
      return new THREE.Vector3(fx, fy, vz);
    },
    get F() { return this.fieldFn; },
    B: () => new THREE.Vector3(0, 0, 0),
    scalarPotentialFn: (x, y, z) => {
      const dx = x;
      const dy = y - 21;
      const dz = z + 38;
      return 220 - 0.22 * (dx * dx + dy * dy + dz * dz);
    },
    divergenceZones: [
      { pos: new THREE.Vector3(-6, 14, -14), radius: 5.0, type: 'source', label: 'Turbulencia ∇·F > 0' }
    ],
    fluxRings: [
      { pos: new THREE.Vector3(0, 11, 8), normal: new THREE.Vector3(0, 0, -1), radius: 4.5, collected: false },
      { pos: new THREE.Vector3(5, 15, -10), normal: new THREE.Vector3(0, 0, -1), radius: 4.5, collected: false },
      { pos: new THREE.Vector3(-4, 18, -25), normal: new THREE.Vector3(0, 0, -1), radius: 4.5, collected: false }
    ],
    vortices: [],
    magneticZone: null
  },

  // =========================================================================
  // NIVEL 4 (NUEVO): ROTACIONAL (∇ × F), CAMPO NO CONSERVATIVO Y LORENTZ
  // =========================================================================
  {
    id: 3,
    name: 'Nivel 4: Vórtices (∇×F) y Fuerza de Lorentz',
    equationText: 'τ ∝ ∇×F (Slingshot) | F_L = 1.35·(v × B) | W = ∫_C F·dr',
    description: 'Paquete cargado (q=1.35): aprovecha los vórtices como honda gravitacional (Slingshot) y corrige el desvío magnético lateral.',
    startPos: new THREE.Vector3(0, 8, 40),
    pickupPos: new THREE.Vector3(-12, 9, 24),
    deliveryPos: new THREE.Vector3(0, 14, -40),
    requiredFlux: 0,
    hasShield: false,
    cargoCharge: 1.35, // Activa Fuerza de Lorentz F_L = q * (v × B)
    towers: [
      [-24, 14, 10, 8, 28, 8],
      [24, 14, 10, 8, 28, 8],
      [-22, 15, -14, 8, 30, 8],
      [22, 15, -14, 8, 30, 8],
      [-16, 16, -32, 7, 32, 7],
      [16, 16, -32, 7, 32, 7]
    ],
    fieldFn: (x, y, z) => {
      // Restitución vertical suave hacia altura de crucero y = 11
      const fy = -0.18 * (y - 11);
      let fx = 0;
      let fz = 0;

      // Vórtice 1 (antihorario en XZ centrado en x = -9, z = 8)
      const dx1 = x + 9;
      const dz1 = z - 8;
      const r1Sq = dx1 * dx1 + dz1 * dz1;
      const w1 = 3.2 * Math.exp(-r1Sq / 220);
      fx += -dz1 * w1 * 0.22;
      fz += dx1 * w1 * 0.22;

      // Vórtice 2 (horario en XZ centrado en x = 9, z = -10)
      const dx2 = x - 9;
      const dz2 = z + 10;
      const r2Sq = dx2 * dx2 + dz2 * dz2;
      const w2 = 3.4 * Math.exp(-r2Sq / 220);
      fx += dz2 * w2 * 0.22;
      fz += -dx2 * w2 * 0.22;

      return new THREE.Vector3(fx, fy, fz);
    },
    get F() { return this.fieldFn; },
    // Campo magnético B = (0, 1.45, 0) en el corredor final z ∈ [-38, -18]
    B: (x, y, z) => {
      const inMagneticCorridor = (z <= -18 && z >= -38) ? 1.0 : 0.0;
      return new THREE.Vector3(0, 1.45 * inMagneticCorridor, 0);
    },
    scalarPotentialFn: (x, y, z) => {
      const dx = x;
      const dy = y - 15;
      const dz = z + 40;
      return 220 - 0.2 * (dx * dx + dy * dy + dz * dz);
    },
    divergenceZones: [],
    fluxRings: [],
    vortices: [
      { pos: new THREE.Vector3(-9, 10, 8), radius: 10, spin: 1 },
      { pos: new THREE.Vector3(9, 11, -10), radius: 10, spin: -1 }
    ],
    magneticZone: {
      center: new THREE.Vector3(0, 12, -28),
      size: new THREE.Vector3(36, 18, 20)
    }
  }
];
