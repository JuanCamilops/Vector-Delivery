import * as THREE from 'three';
import { VectorMathEngine } from './mathEngine.js';
import { DronePhysics } from './dronePhysics.js';
import { ProceduralAudioEngine } from './audioEngine.js';
import { InputController } from './controls.js';
import { LEVELS } from './levels.js';

const PROFESSOR_PRESETS = {
  vortex: {
    px: '-0.48 * z',
    qy: '2.0 * sin(0.2 * x)',
    rz: '0.48 * x',
    pot: '200 - 0.2 * (x^2 + (y - 20)^2 + z^2)'
  },
  source: {
    px: '12 * x / sqrt(x^2 + (y - 15)^2 + z^2 + 25)',
    qy: '12 * (y - 15) / sqrt(x^2 + (y - 15)^2 + z^2 + 25)',
    rz: '12 * z / sqrt(x^2 + (y - 15)^2 + z^2 + 25)',
    pot: '150 - 0.25 * (x^2 + (y - 15)^2 + z^2)'
  },
  sink: {
    px: '-0.35 * x',
    qy: '-0.35 * (y - 15)',
    rz: '-0.35 * z',
    pot: '250 - 0.3 * (x^2 + (y - 15)^2 + z^2)'
  },
  helical: {
    px: '-0.4 * z + 2.5 * cos(t)',
    qy: '1.8 * sin(0.25 * x + t)',
    rz: '0.4 * x + 2.5 * sin(t)',
    pot: '200 - 0.2 * (x^2 + (y - 18)^2 + z^2)'
  },
  saddle: {
    px: '0.35 * x',
    qy: '-0.2 * (y - 14)',
    rz: '-0.35 * z',
    pot: '180 + 0.15 * (x^2 - z^2) - 0.2 * (y - 14)^2'
  }
};

class VectorDeliveryGame {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.mathEngine = new VectorMathEngine();
    this.audio = new ProceduralAudioEngine();

    this.currentLevelIdx = 0;
    this.levelConfig = LEVELS[0];
    this.isPaused = false;
    this.showVectorGrid = true;
    this.simTime = 0;
    this.cameraShake = 0;

    // Estado de misión y física
    this.dronePhysics = null;
    this.droneRadius = 1.35;
    this.hasPackage = false;
    this.accumulatedFlux = 0;
    this.delivered = false;
    this.towerColliders = [];
    this.vortexMeshes = [];

    this._initThree();
    this._initLightingAndEnvironment();
    this._initDroneAndArrows();
    this._initStreamlineParticles();
    this._initVectorGrid();

    this.input = new InputController(this.renderer.domElement, {
      onFirstInteraction: () => this.audio.init(),
      onToggleGrid: () => this.toggleVectorGrid(),
      onTogglePause: () => this.toggleAcademicPause(),
      onResetLevel: () => this.loadLevel(this.currentLevelIdx),
      onSelectLevel: (idx) => {
        if (idx >= 0 && idx < LEVELS.length) {
          this.loadLevel(idx);
        }
      }
    });

    this._bindUI();
    this._bindProfessorMode();
    this.loadLevel(0);

    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  _initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a12);
    this.scene.fog = new THREE.FogExp2(0x060a12, 0.0082);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initLightingAndEnvironment() {
    const ambient = new THREE.AmbientLight(0x94a3b8, 0.85);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.45);
    dirLight.position.set(30, 60, 40);
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xf43f5e, 0.75);
    rimLight.position.set(-40, 20, -30);
    this.scene.add(rimLight);

    // Plano base de referencia cartesiana (y = 0)
    const gridHelper = new THREE.GridHelper(140, 28, 0x1e293b, 0x0f172a);
    this.scene.add(gridHelper);

    // Ejes cartesianos X, Y, Z en el origen
    const axesHelper = new THREE.AxesHelper(8);
    this.scene.add(axesHelper);
  }

  _initDroneAndArrows() {
    this.droneGroup = new THREE.Group();

    const bodyGeo = new THREE.OctahedronGeometry(1.1, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.25
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(1.2, 0.65, 1.2);
    this.droneGroup.add(bodyMesh);

    // Anillo estabilizador
    const ringGeo = new THREE.TorusGeometry(1.5, 0.08, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    this.droneGroup.add(ringMesh);

    // Indicador visual del paquete transportado debajo del dron
    const pkgGeo = new THREE.BoxGeometry(0.75, 0.75, 0.75);
    const pkgMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.65
    });
    this.carriedPackageMesh = new THREE.Mesh(pkgGeo, pkgMat);
    this.carriedPackageMesh.position.set(0, -1.15, 0);
    this.carriedPackageMesh.visible = false;
    this.droneGroup.add(this.carriedPackageMesh);

    this.scene.add(this.droneGroup);

    // Flechas 3D en tiempo real sobre el dron: Velocidad (Cian), Campo F (Magenta), Gradiente ∇f (Dorado)
    this.arrowVel = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 2, 0x38bdf8, 0.6, 0.35);
    this.arrowField = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 2, 0xf43f5e, 0.6, 0.35);
    this.arrowGrad = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 2, 0xfacc15, 0.6, 0.35);

    this.scene.add(this.arrowVel);
    this.scene.add(this.arrowField);
    this.scene.add(this.arrowGrad);

    // Estela paramétrica r(t)
    this.trailPoints = [];
    this.maxTrailPoints = 140;
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
    this.trailLine = new THREE.Line(trailGeo, trailMat);
    this.scene.add(this.trailLine);
  }

  _initStreamlineParticles() {
    this.particleCount = 340;
    const positions = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 84;
      positions[i * 3 + 1] = 2 + Math.random() * 34;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 84;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xf43f5e,
      size: 0.45,
      transparent: true,
      opacity: 0.72
    });

    this.streamParticles = new THREE.Points(geo, mat);
    this.scene.add(this.streamParticles);
  }

  _initVectorGrid() {
    this.vectorGridGroup = new THREE.Group();
    const arrows = [];

    for (let x = -30; x <= 30; x += 15) {
      for (let y = 6; y <= 30; y += 12) {
        for (let z = -30; z <= 30; z += 15) {
          const origin = new THREE.Vector3(x, y, z);
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            origin,
            3.2,
            0x64748b,
            0.7,
            0.4
          );
          this.vectorGridGroup.add(arrow);
          arrows.push({ arrow, origin });
        }
      }
    }

    this.gridArrows = arrows;
    this.scene.add(this.vectorGridGroup);
  }

  _updateVectorGridVisuals() {
    if (!this.showVectorGrid) return;
    this.gridArrows.forEach(({ arrow, origin }) => {
      const f = this.mathEngine.evaluateField(origin, this.levelConfig, this.simTime);
      const mag = f.length();
      if (mag > 0.01) {
        arrow.setDirection(f.clone().normalize());
        arrow.setLength(Math.min(5.5, 1.5 + mag * 0.42), 0.75, 0.4);
      }
    });
  }

  /**
   * Construye un objeto proxy del nivel que respeta tanto la configuración base
   * como cualquier ecuación personalizada ingresada en el Modo Profesor.
   */
  _getEffectiveLevelData() {
    const base = this.levelConfig;
    const override = this.mathEngine.customFieldOverride;
    const activeFieldFn = (override && override.fieldFn)
      ? override.fieldFn
      : (base.fieldFn || base.F);

    return {
      ...base,
      fieldFn: activeFieldFn,
      F: activeFieldFn
    };
  }

  loadLevel(index) {
    this.currentLevelIdx = index;
    this.levelConfig = LEVELS[index];

    if (this.levelObjectsGroup) {
      this.scene.remove(this.levelObjectsGroup);
    }
    this.levelObjectsGroup = new THREE.Group();
    this.scene.add(this.levelObjectsGroup);

    this.towerColliders = [];
    this.vortexMeshes = [];

    // Inicializar DronePhysics con la posición inicial y carga eléctrica del nivel
    this.dronePhysics = new DronePhysics({
      startPosition: this.levelConfig.startPos,
      cargoCharge: this.levelConfig.cargoCharge || 0
    });

    this.hasPackage = false;
    this.accumulatedFlux = 0;
    this.delivered = false;
    this.carriedPackageMesh.visible = false;
    this.trailPoints = [];

    // 1. Torres sólidas (Rascacielos con colisión AABB y daño)
    const bldgGeo = new THREE.BoxGeometry(1, 1, 1);
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x082f49,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.8
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25 });

    (this.levelConfig.towers || []).forEach(([x, y, z, w, h, d]) => {
      const mesh = new THREE.Mesh(bldgGeo, bldgMat);
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      this.levelObjectsGroup.add(mesh);

      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(bldgGeo), edgeMat);
      wire.position.set(x, y, z);
      wire.scale.set(w, h, d);
      this.levelObjectsGroup.add(wire);

      this.towerColliders.push({
        min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
      });
    });

    // 2. Plataforma de Recogida (Alfa)
    const pickupGeo = new THREE.CylinderGeometry(3.2, 3.6, 0.8, 24);
    const pickupMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.5 });
    this.pickupPad = new THREE.Mesh(pickupGeo, pickupMat);
    this.pickupPad.position.copy(this.levelConfig.pickupPos);
    this.levelObjectsGroup.add(this.pickupPad);

    // Paquete flotante sobre Plataforma Alfa
    const boxGeo = new THREE.BoxGeometry(1.35, 1.35, 1.35);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 0.7 });
    this.worldPackageMesh = new THREE.Mesh(boxGeo, boxMat);
    this.worldPackageMesh.position.copy(this.levelConfig.pickupPos).add(new THREE.Vector3(0, 1.6, 0));
    this.levelObjectsGroup.add(this.worldPackageMesh);

    // 3. Plataforma Destino (Beta / Omega)
    const destGeo = new THREE.CylinderGeometry(3.8, 4.2, 0.8, 24);
    const destMat = new THREE.MeshStandardMaterial({ color: 0x059669, emissive: 0x047857, emissiveIntensity: 0.5 });
    this.deliveryPad = new THREE.Mesh(destGeo, destMat);
    this.deliveryPad.position.copy(this.levelConfig.deliveryPos);
    this.levelObjectsGroup.add(this.deliveryPad);

    // 4. Escudo Omega (Nivel 3)
    this.shieldMesh = null;
    if (this.levelConfig.hasShield) {
      const shGeo = new THREE.SphereGeometry(5.2, 24, 24);
      const shMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        wireframe: true,
        transparent: true,
        opacity: 0.55
      });
      this.shieldMesh = new THREE.Mesh(shGeo, shMat);
      this.shieldMesh.position.copy(this.levelConfig.deliveryPos).add(new THREE.Vector3(0, 2, 0));
      this.levelObjectsGroup.add(this.shieldMesh);
    }

    // 5. Zonas de Divergencia (Fuentes y Sumideros)
    (this.levelConfig.divergenceZones || []).forEach((zone) => {
      const zGeo = new THREE.SphereGeometry(zone.radius, 20, 20);
      const isSource = zone.type === 'source';
      const zMat = new THREE.MeshBasicMaterial({
        color: isSource ? 0xf43f5e : 0xa855f7,
        wireframe: true,
        transparent: true,
        opacity: 0.34
      });
      const zMesh = new THREE.Mesh(zGeo, zMat);
      zMesh.position.copy(zone.pos);
      this.levelObjectsGroup.add(zMesh);
    });

    // 6. Anillos de Flujo Superficial (Nivel 3)
    this.ringMeshes = [];
    (this.levelConfig.fluxRings || []).forEach((ring) => {
      ring.collected = false;
      const rGeo = new THREE.TorusGeometry(ring.radius, 0.25, 16, 36);
      const rMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8
      });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.position.copy(ring.pos);

      const nArrow = new THREE.ArrowHelper(ring.normal.clone().normalize(), ring.pos, 3.5, 0x34d399, 0.8, 0.45);
      this.levelObjectsGroup.add(rMesh);
      this.levelObjectsGroup.add(nArrow);
      this.ringMeshes.push({ mesh: rMesh, data: ring });
    });

    // 7. Vórtices Rotacionales ∇ × F (Nivel 4)
    (this.levelConfig.vortices || []).forEach((v) => {
      const vGeo = new THREE.TorusGeometry(v.radius * 0.72, 0.26, 12, 36);
      const vMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.78
      });
      const vMesh = new THREE.Mesh(vGeo, vMat);
      vMesh.rotation.x = Math.PI / 2;
      vMesh.position.copy(v.pos);
      vMesh.userData.spin = v.spin;
      this.levelObjectsGroup.add(vMesh);
      this.vortexMeshes.push(vMesh);
    });

    // 8. Corredor Magnético B(x,y,z) para Fuerza de Lorentz (Nivel 4)
    if (this.levelConfig.magneticZone) {
      const { center, size } = this.levelConfig.magneticZone;
      const magGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const magMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        wireframe: true,
        transparent: true,
        opacity: 0.32
      });
      const magMesh = new THREE.Mesh(magGeo, magMat);
      magMesh.position.copy(center);
      this.levelObjectsGroup.add(magMesh);
    }

    // Actualizar HUD
    const eqText = (this.mathEngine.customFieldOverride && this.mathEngine.customFieldOverride.equationText)
      ? this.mathEngine.customFieldOverride.equationText
      : this.levelConfig.equationText;

    document.getElementById('level-subtitle').textContent = this.levelConfig.name;
    document.getElementById('active-equation').textContent = eqText;
    document.getElementById('level-select').value = String(index);
    document.getElementById('level-modal').classList.add('hidden');
    this._updateMissionText();
    this._updateVectorGridVisuals();
  }

  _bindUI() {
    document.getElementById('level-select').addEventListener('change', (e) => {
      this.loadLevel(parseInt(e.target.value, 10));
    });

    document.getElementById('btn-grid').addEventListener('click', () => this.toggleVectorGrid());
    document.getElementById('btn-pause').addEventListener('click', () => this.toggleAcademicPause());
    document.getElementById('btn-reset').addEventListener('click', () => this.loadLevel(this.currentLevelIdx));

    document.getElementById('btn-touch-toggle').addEventListener('click', () => {
      const mc = document.getElementById('mobile-controls');
      mc.classList.toggle('force-visible');
    });

    document.getElementById('btn-next-level').addEventListener('click', () => {
      const next = (this.currentLevelIdx + 1) % LEVELS.length;
      this.loadLevel(next);
    });

    document.getElementById('btn-replay-level').addEventListener('click', () => {
      this.loadLevel(this.currentLevelIdx);
    });
  }

  _bindProfessorMode() {
    const profPanel = document.getElementById('professor-panel');
    const btnProf = document.getElementById('btn-professor');
    const btnClose = document.getElementById('btn-close-prof');
    const presetSelect = document.getElementById('prof-preset');
    const btnApply = document.getElementById('btn-apply-field');
    const btnRestore = document.getElementById('btn-restore-level-field');
    const feedback = document.getElementById('prof-feedback');

    if (btnProf && profPanel) {
      btnProf.addEventListener('click', () => {
        profPanel.classList.toggle('hidden');
        btnProf.classList.toggle('active', !profPanel.classList.contains('hidden'));
      });
    }

    if (btnClose && profPanel) {
      btnClose.addEventListener('click', () => {
        profPanel.classList.add('hidden');
        if (btnProf) btnProf.classList.remove('active');
      });
    }

    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const preset = PROFESSOR_PRESETS[e.target.value];
        if (!preset) return;
        document.getElementById('input-px').value = preset.px;
        document.getElementById('input-qy').value = preset.qy;
        document.getElementById('input-rz').value = preset.rz;
        document.getElementById('input-pot').value = preset.pot;
      });
    }

    if (btnApply) {
      btnApply.addEventListener('click', () => {
        const px = document.getElementById('input-px').value;
        const qy = document.getElementById('input-qy').value;
        const rz = document.getElementById('input-rz').value;
        const pot = document.getElementById('input-pot').value;

        try {
          const compiled = this.mathEngine.compileCustomExpressions(px, qy, rz, pot);
          this.mathEngine.setCustomField(compiled);
          document.getElementById('active-equation').textContent = compiled.equationText;
          this._updateVectorGridVisuals();

          if (feedback) {
            feedback.className = 'prof-feedback success';
            feedback.textContent = '✓ Campo vectorial compilado y activo en R³.';
          }
        } catch (err) {
          if (feedback) {
            feedback.className = 'prof-feedback error';
            feedback.textContent = `✕ ${err.message}`;
          }
        }
      });
    }

    if (btnRestore) {
      btnRestore.addEventListener('click', () => {
        this.mathEngine.clearCustomField();
        document.getElementById('active-equation').textContent = this.levelConfig.equationText;
        this._updateVectorGridVisuals();
        if (feedback) {
          feedback.className = 'prof-feedback';
          feedback.textContent = 'Campo original del nivel restaurado.';
        }
      });
    }
  }

  toggleVectorGrid() {
    this.showVectorGrid = !this.showVectorGrid;
    this.vectorGridGroup.visible = this.showVectorGrid;
    document.getElementById('btn-grid').classList.toggle('active', this.showVectorGrid);
  }

  toggleAcademicPause() {
    this.isPaused = !this.isPaused;
    document.getElementById('btn-pause').classList.toggle('active', this.isPaused);
    document.getElementById('inspection-banner').classList.toggle('hidden', !this.isPaused);
  }

  _triggerDamageFlash() {
    const vignette = document.getElementById('damage-vignette');
    if (!vignette) return;
    vignette.classList.add('active');
    clearTimeout(this._vignetteTimer);
    this._vignetteTimer = setTimeout(() => vignette.classList.remove('active'), 220);
  }

  _updateMissionText() {
    const box = document.getElementById('mission-status');
    if (!box) return;
    if (!this.hasPackage) {
      box.innerHTML = '<strong>Paso 1:</strong> Vuela hacia <span class="highlight-cyan">Plataforma Alfa</span> para recoger el paquete.';
    } else if (this.levelConfig.hasShield && this.accumulatedFlux < this.levelConfig.requiredFlux) {
      box.innerHTML = `<strong>Paso 2:</strong> Cruza los anillos alineado con n̂ para sumar flujo Φ (${this.accumulatedFlux.toFixed(0)}/${this.levelConfig.requiredFlux} Wb).`;
    } else {
      box.innerHTML = '<strong>Paso Final:</strong> Lleva el paquete a <span class="highlight-green">Plataforma Destino</span>.';
    }
  }

  _stepSimulation(dt) {
    this.simTime += dt;
    this.input.update();

    // Dirección de empuje relativa a la cámara
    const forward = new THREE.Vector3(-Math.sin(this.input.cameraYaw), 0, -Math.cos(this.input.cameraYaw));
    const right = new THREE.Vector3(Math.cos(this.input.cameraYaw), 0, -Math.sin(this.input.cameraYaw));

    const thrustPower = 24.0;
    const controlForce = new THREE.Vector3()
      .addScaledVector(right, this.input.moveX * thrustPower)
      .addScaledVector(forward, -this.input.moveZ * thrustPower)
      .add(new THREE.Vector3(0, this.input.moveY * thrustPower, 0));

    // Evaluar campo y gradiente
    const pos = this.dronePhysics.position;
    const fieldForce = this.mathEngine.evaluateField(pos, this.levelConfig, this.simTime);
    const gradVec = this.mathEngine.computeGradient(pos, this.levelConfig);

    // Fuerza de Gancho de Gradiente [E]
    const gradientForce = new THREE.Vector3();
    if (this.input.gradientHookActive && gradVec.length() > 0.01) {
      gradientForce.copy(gradVec).normalize().multiplyScalar(22.0);
    }

    const totalPlayerThrust = new THREE.Vector3().add(controlForce).add(gradientForce);
    const effectiveLevel = this._getEffectiveLevelData();

    // Ejecutar paso de física avanzada (Rotacional, Lorentz, Slingshot, Trabajo)
    this.dronePhysics.step(dt, totalPlayerThrust, new THREE.Vector3(), effectiveLevel, this.simTime);

    // Límites del espacio aéreo y piso sólido (y >= 1.5)
    pos.x = Math.max(-48, Math.min(48, pos.x));
    if (pos.y < 1.5) {
      pos.y = 1.5;
      if (this.dronePhysics.velocity.y < 0) this.dronePhysics.velocity.y = 0;
    } else if (pos.y > 45) {
      pos.y = 45;
      if (this.dronePhysics.velocity.y > 0) this.dronePhysics.velocity.y = 0;
    }
    pos.z = Math.max(-48, Math.min(48, pos.z));

    // Colisiones sólidas contra torres (AABB)
    for (const box of this.towerColliders) {
      const hit = this.mathEngine.resolveSphereAABBCollision(
        pos,
        this.dronePhysics.velocity,
        this.droneRadius,
        box.min,
        box.max
      );
      if (hit) {
        const damage = Math.max(8, Math.min(28, hit.impactSpeed * 1.4));
        this.dronePhysics.battery = Math.max(0, this.dronePhysics.battery - damage);
        this.cameraShake = 0.45;
        this._triggerDamageFlash();
        this.audio.playCollision();
      }
    }

    // Zonas de divergencia (daño por turbulencia extrema)
    const divVal = this.mathEngine.computeDivergence(pos, this.levelConfig, this.simTime);
    (this.levelConfig.divergenceZones || []).forEach((zone) => {
      const dist = pos.distanceTo(zone.pos);
      if (dist < zone.radius) {
        this.dronePhysics.battery = Math.max(0, this.dronePhysics.battery - 16 * dt);
        if (Math.random() < 0.08) this.audio.playWarning();
      }
    });

    if (this.dronePhysics.battery <= 0) {
      this.loadLevel(this.currentLevelIdx);
      return;
    }

    // Recoger paquete en Plataforma Alfa
    if (!this.hasPackage) {
      this.worldPackageMesh.rotation.y += dt * 2.2;
      if (pos.distanceTo(this.worldPackageMesh.position) < 3.4) {
        this.hasPackage = true;
        this.worldPackageMesh.visible = false;
        this.carriedPackageMesh.visible = true;
        this.audio.playPickup();
        this._updateMissionText();
      }
    }

    // Cruzar anillos de flujo superficial Φ = ∬(F·n)dS
    this.ringMeshes.forEach((item) => {
      if (item.data.collected) return;
      const dist = pos.distanceTo(item.data.pos);
      if (dist < item.data.radius) {
        const flux = Math.abs(this.mathEngine.computeSurfaceFlux(fieldForce, item.data.normal, 8.5));
        this.accumulatedFlux += Math.max(45, flux);
        item.data.collected = true;
        item.mesh.material.color.setHex(0x34d399);
        item.mesh.material.emissive.setHex(0x10b981);
        this.audio.playFluxRing();
        this._updateMissionText();

        if (this.shieldMesh && this.accumulatedFlux >= this.levelConfig.requiredFlux) {
          this.shieldMesh.visible = false;
        }
      }
    });

    // Verificar entrega en Plataforma Destino
    if (this.hasPackage && !this.delivered) {
      const shieldBlocking = this.levelConfig.hasShield && this.accumulatedFlux < this.levelConfig.requiredFlux;
      const distDest = pos.distanceTo(this.levelConfig.deliveryPos);

      if (distDest < 4.2 && !shieldBlocking) {
        this.delivered = true;
        this.audio.playVictory();
        this._showVictoryModal();
      }
    }

    // Si el campo es temporal (t) en Modo Profesor, actualizar flechas de malla
    if (this.mathEngine.customFieldOverride) {
      this._updateVectorGridVisuals();
    }

    this._updateVisuals(dt, fieldForce, gradVec, divVal);
  }

  _updateVisuals(dt, fieldForce, gradVec, divVal) {
    const pos = this.dronePhysics.position;
    const v = this.dronePhysics.velocity;
    const t = this.dronePhysics.telemetry;

    this.droneGroup.position.copy(pos);

    // Combinar rotación física por cuaterniones (torque del rotacional) + inclinación de vuelo
    const tiltQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(v.z * 0.022, 0, -v.x * 0.022)
    );
    this.droneGroup.quaternion.copy(this.dronePhysics.quaternion).multiply(tiltQuat);

    // Animar anillos de vórtice (Nivel 4)
    for (const vMesh of this.vortexMeshes) {
      vMesh.rotation.z += (vMesh.userData.spin || 1) * 1.9 * dt;
    }

    // Actualizar Flechas Vectoriales 3D sobre el dron
    this.arrowVel.position.copy(pos);
    if (v.length() > 0.15) {
      this.arrowVel.visible = true;
      this.arrowVel.setDirection(v.clone().normalize());
      this.arrowVel.setLength(Math.min(6, 1 + v.length() * 0.35), 0.65, 0.35);
    } else {
      this.arrowVel.visible = false;
    }

    this.arrowField.position.copy(pos);
    if (fieldForce.length() > 0.15) {
      this.arrowField.visible = true;
      this.arrowField.setDirection(fieldForce.clone().normalize());
      this.arrowField.setLength(Math.min(6, 1 + fieldForce.length() * 0.4), 0.65, 0.35);
    } else {
      this.arrowField.visible = false;
    }

    this.arrowGrad.position.copy(pos);
    if (gradVec.length() > 0.15) {
      this.arrowGrad.visible = true;
      this.arrowGrad.setDirection(gradVec.clone().normalize());
      this.arrowGrad.setLength(Math.min(5.5, 1.2 + gradVec.length() * 0.18), 0.65, 0.35);
    } else {
      this.arrowGrad.visible = false;
    }

    // Estela paramétrica r(t)
    this.trailPoints.push(pos.clone());
    if (this.trailPoints.length > this.maxTrailPoints) {
      this.trailPoints.shift();
    }
    this.trailLine.geometry.setFromPoints(this.trailPoints);

    // Advectar partículas de líneas de corriente
    const pAttr = this.streamParticles.geometry.getAttribute('position');
    for (let i = 0; i < this.particleCount; i++) {
      let px = pAttr.getX(i);
      let py = pAttr.getY(i);
      let pz = pAttr.getZ(i);

      const f = this.mathEngine.evaluateField(new THREE.Vector3(px, py, pz), this.levelConfig, this.simTime);
      px += f.x * dt * 1.3;
      py += f.y * dt * 1.3;
      pz += f.z * dt * 1.3;

      if (Math.abs(px) > 46 || py < 1 || py > 42 || Math.abs(pz) > 46) {
        px = (Math.random() - 0.5) * 84;
        py = 2 + Math.random() * 34;
        pz = (Math.random() - 0.5) * 84;
      }

      pAttr.setXYZ(i, px, py, pz);
    }
    pAttr.needsUpdate = true;

    // Audio del propulsor
    this.audio.updateThruster(v.length() / 18, this.isPaused);

    // Telemetría HUD principal
    document.getElementById('val-pos').textContent = `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
    document.getElementById('val-vel').textContent = `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}) [${v.length().toFixed(1)}]`;
    document.getElementById('val-field').textContent = `(${fieldForce.x.toFixed(1)}, ${fieldForce.y.toFixed(1)}, ${fieldForce.z.toFixed(1)}) [${fieldForce.length().toFixed(1)}]`;

    let divLabel = 'Incompresible';
    if (divVal > 0.25) divLabel = 'Fuente (+)';
    else if (divVal < -0.25) divLabel = 'Sumidero (-)';
    document.getElementById('val-div').textContent = `${divVal.toFixed(2)} (${divLabel})`;

    document.getElementById('val-grad').textContent = `(${gradVec.x.toFixed(1)}, ${gradVec.y.toFixed(1)}, ${gradVec.z.toFixed(1)})`;

    const fluxPct = this.levelConfig.requiredFlux > 0
      ? Math.min(100, (this.accumulatedFlux / this.levelConfig.requiredFlux) * 100)
      : 100;
    document.getElementById('bar-flux').style.width = `${fluxPct}%`;
    document.getElementById('val-flux').textContent = `${this.accumulatedFlux.toFixed(1)} / ${this.levelConfig.requiredFlux || 135} Wb`;

    const energyBar = document.getElementById('bar-energy');
    energyBar.style.width = `${this.dronePhysics.battery}%`;
    energyBar.classList.toggle('low', this.dronePhysics.battery < 30);
    document.getElementById('val-energy').textContent = `${Math.round(this.dronePhysics.battery)}%`;

    // Telemetría de Operadores Avanzados (Rotacional, Lorentz, Integral de Línea)
    document.getElementById('val-curl').textContent = t.curlMagnitude.toFixed(3);
    document.getElementById('val-conservative').textContent = t.isConservative
      ? 'Conservativo (∇×F ≈ 0)'
      : 'No Conservativo';
    document.getElementById('val-lorentz').textContent = `${t.lorentzMagnitude.toFixed(2)} N`;
    document.getElementById('val-work').textContent = `${t.lineIntegralWork.toFixed(2)} J`;

    const slingshotEl = document.getElementById('val-slingshot');
    if (slingshotEl) {
      slingshotEl.classList.toggle('hidden', !t.slingshotActive);
    }
  }

  _updateCamera(dt) {
    const camDist = 14.5;
    const target = this.dronePhysics.position.clone().add(new THREE.Vector3(0, 1.2, 0));

    const offsetX = camDist * Math.sin(this.input.cameraYaw) * Math.cos(this.input.cameraPitch);
    const offsetY = camDist * Math.sin(this.input.cameraPitch);
    const offsetZ = camDist * Math.cos(this.input.cameraYaw) * Math.cos(this.input.cameraPitch);

    this.camera.position.copy(target).add(new THREE.Vector3(offsetX, offsetY, offsetZ));

    if (this.cameraShake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    }

    this.camera.lookAt(target);
  }

  _showVictoryModal() {
    const modal = document.getElementById('level-modal');
    const t = this.dronePhysics.telemetry;
    document.getElementById('modal-title').textContent = `¡${this.levelConfig.name} Completado!`;
    document.getElementById('modal-desc').textContent = this.levelConfig.description;
    document.getElementById('modal-stats').innerHTML = `
      Integridad Restante: <b>${Math.round(this.dronePhysics.battery)}%</b><br/>
      Flujo Superficial Φ: <b>${this.accumulatedFlux.toFixed(1)} Wb</b><br/>
      Trabajo de Campo ∫ F·dr: <b>${t.lineIntegralWork.toFixed(2)} J</b><br/>
      Posición Final: <b>(${this.dronePhysics.position.x.toFixed(1)}, ${this.dronePhysics.position.y.toFixed(1)}, ${this.dronePhysics.position.z.toFixed(1)})</b>
    `;
    modal.classList.remove('hidden');
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.isPaused && !this.delivered) {
      this._stepSimulation(dt);
    } else {
      this.audio.updateThruster(0, true);
    }

    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new VectorDeliveryGame();
});
