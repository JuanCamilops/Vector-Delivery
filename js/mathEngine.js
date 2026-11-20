import * as THREE from 'three';

/**
 * Motor Matemático Explícito para Cálculo Vectorial en R³
 * - Evalúa campos vectoriales F(x,y,z,t) (niveles o personalizados en Modo Profesor)
 * - Calcula Divergencia ∇·F = ∂P/∂x + ∂Q/∂y + ∂R/∂z
 * - Calcula Gradiente ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z)
 * - Calcula Flujo Superficial Φ = ∬(F·n)dS
 * - Integra dinámica de Newton y colisiones sólidas Esfera-Caja (AABB)
 */
export class VectorMathEngine {
  constructor() {
    this.epsilon = 0.05;
    this.customFieldOverride = null; // { fieldFn, scalarPotentialFn, equationText }
  }

  setCustomField(overrideObj) {
    this.customFieldOverride = overrideObj;
  }

  clearCustomField() {
    this.customFieldOverride = null;
  }

  /**
   * Compila expresiones matemáticas ingresadas por el usuario/profesor
   * en funciones seguras para evaluar en R³.
   */
  compileCustomExpressions(pExpr, qExpr, rExpr, potExpr = '') {
    const compileScalar = (rawExpr, label) => {
      const cleaned = (rawExpr || '0').trim().replace(/\^/g, '**');
      if (!cleaned) {
        throw new Error(`La expresión para ${label} no puede estar vacía.`);
      }

      const forbidden = /(window|document|globalThis|eval|Function|fetch|XMLHttpRequest|localStorage|alert|console)/i;
      if (forbidden.test(cleaned)) {
        throw new Error(`Expresión no permitida en ${label}.`);
      }

      let fn;
      try {
        fn = new Function(
          'x', 'y', 'z', 't',
          `"use strict";
           const { sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, sqrt, abs, exp, log, pow, min, max, sign, PI, E } = Math;
           return (${cleaned});`
        );
      } catch (err) {
        throw new Error(`Error de sintaxis en ${label}: ${err.message}`);
      }

      const testVal = fn(1.0, 2.0, 3.0, 0.5);
      if (typeof testVal !== 'number' || Number.isNaN(testVal)) {
        throw new Error(`La expresión de ${label} no devuelve un número válido.`);
      }

      return (x, y, z, t = 0) => {
        try {
          const val = fn(x, y, z, t);
          if (!Number.isFinite(val)) return 0;
          return Math.max(-45, Math.min(45, val));
        } catch {
          return 0;
        }
      };
    };

    const pFn = compileScalar(pExpr, 'P(x,y,z,t)');
    const qFn = compileScalar(qExpr, 'Q(x,y,z,t)');
    const rFn = compileScalar(rExpr, 'R(x,y,z,t)');

    let scalarPotentialFn = null;
    if (potExpr && potExpr.trim().length > 0) {
      const potCompiled = compileScalar(potExpr, 'f(x,y,z)');
      scalarPotentialFn = (x, y, z) => potCompiled(x, y, z, 0);
    }

    return {
      fieldFn: (x, y, z, t = 0) => new THREE.Vector3(pFn(x, y, z, t), qFn(x, y, z, t), rFn(x, y, z, t)),
      scalarPotentialFn,
      equationText: `F(x, y, z) = (${pExpr.trim()}, ${qExpr.trim()}, ${rExpr.trim()})`
    };
  }

  /**
   * Evalúa el campo vectorial F(x, y, z, t) activo (Modo Profesor o Nivel actual)
   */
  evaluateField(pos, levelConfig, time = 0) {
    if (this.customFieldOverride && this.customFieldOverride.fieldFn) {
      return this.customFieldOverride.fieldFn(pos.x, pos.y, pos.z, time);
    }
    const fn = levelConfig ? (levelConfig.fieldFn || levelConfig.F) : null;
    if (!fn) {
      return new THREE.Vector3(0, 0, 0);
    }
    return fn(pos.x, pos.y, pos.z, time);
  }

  /**
   * Calcula la Divergencia ∇ · F = ∂P/∂x + ∂Q/∂y + ∂R/∂z
   */
  computeDivergence(pos, levelConfig, time = 0) {
    const h = this.epsilon;
    const fxp = this.evaluateField(new THREE.Vector3(pos.x + h, pos.y, pos.z), levelConfig, time);
    const fxm = this.evaluateField(new THREE.Vector3(pos.x - h, pos.y, pos.z), levelConfig, time);

    const fyp = this.evaluateField(new THREE.Vector3(pos.x, pos.y + h, pos.z), levelConfig, time);
    const fym = this.evaluateField(new THREE.Vector3(pos.x, pos.y - h, pos.z), levelConfig, time);

    const fzp = this.evaluateField(new THREE.Vector3(pos.x, pos.y, pos.z + h), levelConfig, time);
    const fzm = this.evaluateField(new THREE.Vector3(pos.x, pos.y, pos.z - h), levelConfig, time);

    const dPdx = (fxp.x - fxm.x) / (2 * h);
    const dQdy = (fyp.y - fym.y) / (2 * h);
    const dRdz = (fzp.z - fzm.z) / (2 * h);

    return dPdx + dQdy + dRdz;
  }

  /**
   * Calcula el Gradiente ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z)
   */
  computeGradient(pos, levelConfig) {
    const fn = (this.customFieldOverride && this.customFieldOverride.scalarPotentialFn)
      ? this.customFieldOverride.scalarPotentialFn
      : (levelConfig ? levelConfig.scalarPotentialFn : null);

    if (!fn) {
      return new THREE.Vector3(0, 0, 0);
    }
    const h = this.epsilon;

    const dfdx = (fn(pos.x + h, pos.y, pos.z) - fn(pos.x - h, pos.y, pos.z)) / (2 * h);
    const dfdy = (fn(pos.x, pos.y + h, pos.z) - fn(pos.x, pos.y - h, pos.z)) / (2 * h);
    const dfdz = (fn(pos.x, pos.y, pos.z + h) - fn(pos.x, pos.y, pos.z - h)) / (2 * h);

    return new THREE.Vector3(dfdx, dfdy, dfdz);
  }

  /**
   * Calcula el Flujo Instantáneo Φ ≈ (F(r) · n) * Área
   */
  computeSurfaceFlux(fieldVec, normalVec, area = 10.0) {
    const unitNormal = normalVec.clone().normalize();
    return fieldVec.dot(unitNormal) * area;
  }

  /**
   * Colisión física sólida Esfera (Dron) vs Caja AABB (Torre / Edificio)
   */
  resolveSphereAABBCollision(position, velocity, radius, boxMin, boxMax) {
    const closestX = Math.max(boxMin.x, Math.min(position.x, boxMax.x));
    const closestY = Math.max(boxMin.y, Math.min(position.y, boxMax.y));
    const closestZ = Math.max(boxMin.z, Math.min(position.z, boxMax.z));

    const dx = position.x - closestX;
    const dy = position.y - closestY;
    const dz = position.z - closestZ;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq >= radius * radius) {
      return null;
    }

    const dist = Math.sqrt(distSq);
    const normal = new THREE.Vector3();
    let penetration = 0;

    if (dist > 0.0001) {
      normal.set(dx / dist, dy / dist, dz / dist);
      penetration = radius - dist;
    } else {
      const overlapLeft = Math.abs(position.x - boxMin.x);
      const overlapRight = Math.abs(boxMax.x - position.x);
      const overlapBottom = Math.abs(position.y - boxMin.y);
      const overlapTop = Math.abs(boxMax.y - position.y);
      const overlapBack = Math.abs(position.z - boxMin.z);
      const overlapFront = Math.abs(boxMax.z - position.z);

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapBottom, overlapTop, overlapBack, overlapFront);
      if (minOverlap === overlapLeft) normal.set(-1, 0, 0);
      else if (minOverlap === overlapRight) normal.set(1, 0, 0);
      else if (minOverlap === overlapBottom) normal.set(0, -1, 0);
      else if (minOverlap === overlapTop) normal.set(0, 1, 0);
      else if (minOverlap === overlapBack) normal.set(0, 0, -1);
      else normal.set(0, 0, 1);

      penetration = radius + minOverlap;
    }

    position.addScaledVector(normal, penetration + 0.05);

    const vn = velocity.dot(normal);
    const impactSpeed = Math.abs(vn);
    if (vn < 0) {
      const restitution = 0.65;
      velocity.addScaledVector(normal, -(1 + restitution) * vn);
    }

    if (velocity.dot(normal) < 7.5) {
      velocity.addScaledVector(normal, 7.5 - velocity.dot(normal));
    }

    return { impactSpeed, normal };
  }
}

/**
 * Calcula el rotacional (∇ × F) usando diferencias finitas centradas
 */
export function computeCurl(pos, fieldFn, h = 0.02) {
  const inv2h = 1 / (2 * h);

  const Fx_plus = fieldFn(pos.x + h, pos.y, pos.z);
  const Fx_minus = fieldFn(pos.x - h, pos.y, pos.z);

  const Fy_plus = fieldFn(pos.x, pos.y + h, pos.z);
  const Fy_minus = fieldFn(pos.x, pos.y - h, pos.z);

  const Fz_plus = fieldFn(pos.x, pos.y, pos.z + h);
  const Fz_minus = fieldFn(pos.x, pos.y, pos.z - h);

  const dFz_dy = (Fy_plus.z - Fy_minus.z) * inv2h;
  const dFy_dz = (Fz_plus.y - Fz_minus.y) * inv2h;

  const dFx_dz = (Fz_plus.x - Fz_minus.x) * inv2h;
  const dFz_dx = (Fx_plus.z - Fx_minus.z) * inv2h;

  const dFy_dx = (Fx_plus.y - Fx_minus.y) * inv2h;
  const dFx_dy = (Fy_plus.x - Fy_minus.x) * inv2h;

  return new THREE.Vector3(
    dFz_dy - dFy_dz,
    dFx_dz - dFz_dx,
    dFy_dx - dFx_dy
  );
}

/**
 * Devuelve true si el campo es localmente conservativo (||∇ × F|| ≈ 0)
 */
export function isLocallyConservative(curlVector, tolerance = 1e-3) {
  return curlVector.lengthSq() < tolerance * tolerance;
}

/**
 * Calcula la fuerza de Lorentz: F_L = q * (v × B)
 */
export function computeLorentzForce(velocity, pos, magneticFieldFn, cargoCharge = 0) {
  if (cargoCharge === 0 || !magneticFieldFn) {
    return new THREE.Vector3(0, 0, 0);
  }
  const B = magneticFieldFn(pos.x, pos.y, pos.z);
  return new THREE.Vector3().crossVectors(velocity, B).multiplyScalar(cargoCharge);
}

/**
 * Calcula el diferencial de trabajo dW = F_prom · dr en cada frame
 */
export function computeWorkStep(prevPos, currentPos, prevForce, currentForce) {
  const dr = new THREE.Vector3().subVectors(currentPos, prevPos);
  const avgForce = new THREE.Vector3().addVectors(prevForce, currentForce).multiplyScalar(0.5);
  return avgForce.dot(dr);
}
