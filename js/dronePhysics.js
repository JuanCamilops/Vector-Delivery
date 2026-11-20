import * as THREE from 'three';
import {
  computeCurl,
  isLocallyConservative,
  computeLorentzForce,
  computeWorkStep
} from './mathEngine.js';

export class DronePhysics {
  constructor(options = {}) {
    // Posición y velocidad lineal
    this.position = options.startPosition ? options.startPosition.clone() : new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.mass = options.mass || 1.1;
    this.damping = options.damping || 1.45;
    this.maxSpeed = options.maxSpeed || 26.0;

    // Rotación 3D (cuaterniones para evitar bloqueos de giro)
    this.quaternion = new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3();
    this.momentOfInertia = options.inertia || 0.85;
    this.curlTorqueFactor = options.curlTorqueFactor || 0.42;
    this.angularDamping = options.angularDamping || 2.4;

    // Carga eléctrica del paquete y energía
    this.cargoCharge = options.cargoCharge || 0; // q != 0 activa fuerza de Lorentz
    this.battery = 100;
    this.accumulatedWork = 0; // Integral de línea ∫ F · dr
    this.prevForce = new THREE.Vector3();
    this.initialized = false;

    // Datos listos para mostrar en el HUD
    this.telemetry = {
      forceMagnitude: 0,
      curlMagnitude: 0,
      isConservative: true,
      lorentzMagnitude: 0,
      slingshotActive: false,
      lineIntegralWork: 0
    };
  }

  /**
   * Ejecuta un paso de física en cada frame
   * @param {number} dt - Tiempo transcurrido (delta time)
   * @param {THREE.Vector3} thrustInput - Vector de empuje del jugador (incluye gancho ∇f si aplica)
   * @param {THREE.Vector3} torqueInput - Vector de estabilización manual
   * @param {Object} levelData - Configuración del nivel actual
   * @param {number} simTime - Tiempo acumulado de simulación
   */
  step(dt, thrustInput, torqueInput, levelData, simTime = 0) {
    const prevPos = this.position.clone();
    const evalF = (x, y, z) => {
      const fn = levelData.fieldFn || levelData.F;
      return fn ? fn(x, y, z, simTime) : new THREE.Vector3();
    };

    // 1. Evaluar campo de fuerza F(x, y, z, t) y su rotacional (∇ × F)
    const F_field = evalF(this.position.x, this.position.y, this.position.z);
    if (!this.initialized) {
      this.prevForce.copy(F_field);
      this.initialized = true;
    }

    const curl = computeCurl(this.position, evalF);
    const curlMag = curl.length();
    const isConservative = isLocallyConservative(curl);

    // 2. Fuerza de Lorentz: q * (v × B)
    const F_lorentz = computeLorentzForce(
      this.velocity,
      this.position,
      levelData.B,
      this.cargoCharge
    );

    // 3. Efecto Slingshot: impulso extra si aceleras a favor de un vórtice rotacional
    let effectiveThrust = thrustInput.clone();
    let slingshotActive = false;

    if (!isConservative && curlMag > 0.25 && thrustInput.lengthSq() > 0.01 && F_field.lengthSq() > 0.01) {
      const alignment = thrustInput.clone().normalize().dot(F_field.clone().normalize());
      if (alignment > 0.7) {
        const boostFactor = 1 + Math.min(curlMag * 0.25, 0.55) * alignment;
        effectiveThrust.multiplyScalar(boostFactor);
        slingshotActive = true;
      }
    }

    // 4. Movimiento lineal (F = m * a) con amortiguamiento aerodinámico estable
    const totalForce = new THREE.Vector3()
      .add(F_field)
      .add(F_lorentz)
      .add(effectiveThrust)
      .addScaledVector(this.velocity, -this.damping);

    const acceleration = totalForce.divideScalar(this.mass);
    this.velocity.addScaledVector(acceleration, dt);

    if (this.velocity.length() > this.maxSpeed) {
      this.velocity.setLength(this.maxSpeed);
    }

    this.position.addScaledVector(this.velocity, dt);

    // 5. Rotación por torque del rotacional (cuaterniones)
    const curlTorque = curl.clone().multiplyScalar(this.curlTorqueFactor);
    const dampingTorque = this.angularVelocity.clone().multiplyScalar(-this.angularDamping);
    const netTorque = new THREE.Vector3().add(curlTorque).add(torqueInput).add(dampingTorque);

    const angularAccel = netTorque.divideScalar(this.momentOfInertia);
    this.angularVelocity.addScaledVector(angularAccel, dt);

    const omegaMag = this.angularVelocity.length();
    if (omegaMag > 1e-5) {
      const axis = this.angularVelocity.clone().divideScalar(omegaMag);
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(axis, omegaMag * dt);
      this.quaternion.premultiply(deltaQ).normalize();
    }

    // 6. Integral de línea W = ∫ F · dr
    const dW = computeWorkStep(prevPos, this.position, this.prevForce, F_field);
    this.accumulatedWork += dW;
    this.prevForce.copy(F_field);

    // 7. Actualizar telemetría para el HUD
    this.telemetry = {
      forceMagnitude: F_field.length(),
      curlMagnitude: curlMag,
      isConservative,
      lorentzMagnitude: F_lorentz.length(),
      slingshotActive,
      lineIntegralWork: this.accumulatedWork
    };
  }
}
