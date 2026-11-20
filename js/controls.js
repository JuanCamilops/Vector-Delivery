/**
 * Controlador Unificado: Escritorio (Teclado + Ratón) y Móvil (Joystick + Flechas Verticales)
 * Ignora atajos de teclado cuando el usuario está escribiendo ecuaciones en el Modo Profesor.
 */
export class InputController {
  constructor(domElement, callbacks = {}) {
    this.domElement = domElement;
    this.callbacks = callbacks;

    this.moveX = 0;
    this.moveZ = 0;
    this.moveY = 0;
    this.gradientHookActive = false;

    this.keys = new Set();

    // Joystick táctil
    this.joystickVector = { x: 0, y: 0 };
    this.joystickTouchId = null;

    // Flechas verticales táctiles
    this.touchUpActive = false;
    this.touchDownActive = false;

    // Órbita de Cámara
    this.cameraYaw = 0;
    this.cameraPitch = 0.38;
    this.isMouseDragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.cameraTouchId = null;

    this._bindKeyboard();
    this._bindMouseOrbit();
    this._bindMobileJoystick();
    this._bindMobileVerticalButtons();
    this._bindMobileActionButtons();
  }

  _triggerAudioUnlock() {
    if (this.callbacks.onFirstInteraction) {
      this.callbacks.onFirstInteraction();
    }
  }

  _isTypingInInput(event) {
    const tag = event.target && event.target.tagName ? event.target.tagName.toUpperCase() : '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this._isTypingInInput(e)) return;
      this._triggerAudioUnlock();
      const code = e.code;
      this.keys.add(code);

      if (code === 'KeyE') {
        this.gradientHookActive = true;
      } else if (code === 'KeyV' && this.callbacks.onToggleGrid) {
        this.callbacks.onToggleGrid();
      } else if (code === 'KeyP' && this.callbacks.onTogglePause) {
        this.callbacks.onTogglePause();
      } else if (code === 'KeyR' && this.callbacks.onResetLevel) {
        this.callbacks.onResetLevel();
      } else if (code === 'Digit1' && this.callbacks.onSelectLevel) {
        this.callbacks.onSelectLevel(0);
      } else if (code === 'Digit2' && this.callbacks.onSelectLevel) {
        this.callbacks.onSelectLevel(1);
      } else if (code === 'Digit3' && this.callbacks.onSelectLevel) {
        this.callbacks.onSelectLevel(2);
      } else if (code === 'Digit4' && this.callbacks.onSelectLevel) {
        this.callbacks.onSelectLevel(3);
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      this.keys.delete(code);
      if (code === 'KeyE') {
        this.gradientHookActive = false;
      }
    });
  }

  _bindMouseOrbit() {
    this.domElement.addEventListener('mousedown', (e) => {
      this._triggerAudioUnlock();
      this.isMouseDragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };

      this.cameraYaw -= dx * 0.0065;
      this.cameraPitch = Math.max(-0.35, Math.min(1.25, this.cameraPitch + dy * 0.0065));
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDragging = false;
    });

    this.domElement.addEventListener('touchstart', (e) => {
      this._triggerAudioUnlock();
      if (this.cameraTouchId !== null) return;
      const touch = e.changedTouches[0];
      this.cameraTouchId = touch.identifier;
      this.lastPointer = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });

    this.domElement.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.cameraTouchId) {
          const dx = t.clientX - this.lastPointer.x;
          const dy = t.clientY - this.lastPointer.y;
          this.lastPointer = { x: t.clientX, y: t.clientY };

          this.cameraYaw -= dx * 0.0075;
          this.cameraPitch = Math.max(-0.35, Math.min(1.25, this.cameraPitch + dy * 0.0075));
        }
      }
    }, { passive: true });

    const releaseCameraTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.cameraTouchId) {
          this.cameraTouchId = null;
        }
      }
    };
    this.domElement.addEventListener('touchend', releaseCameraTouch, { passive: true });
    this.domElement.addEventListener('touchcancel', releaseCameraTouch, { passive: true });
  }

  _bindMobileJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !base || !stick) return;

    const maxRadius = 42;

    const updateStick = (clientX, clientY) => {
      const rect = base.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      stick.style.transform = `translate(${dx}px, ${dy}px)`;

      const normX = dx / maxRadius;
      const normY = dy / maxRadius;
      this.joystickVector.x = Math.abs(normX) < 0.08 ? 0 : normX;
      this.joystickVector.y = Math.abs(normY) < 0.08 ? 0 : normY;
    };

    const resetStick = () => {
      this.joystickTouchId = null;
      this.joystickVector.x = 0;
      this.joystickVector.y = 0;
      stick.style.transform = 'translate(0px, 0px)';
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._triggerAudioUnlock();
      if (this.joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      this.joystickTouchId = touch.identifier;
      updateStick(touch.clientX, touch.clientY);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          updateStick(t.clientX, t.clientY);
        }
      }
    }, { passive: false });

    zone.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          resetStick();
        }
      }
    });

    zone.addEventListener('touchcancel', resetStick);
  }

  _bindMobileVerticalButtons() {
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');

    const bindHoldButton = (btn, setter) => {
      if (!btn) return;
      const start = (e) => {
        e.preventDefault();
        this._triggerAudioUnlock();
        setter(true);
        btn.classList.add('pressed');
      };
      const end = (e) => {
        e.preventDefault();
        setter(false);
        btn.classList.remove('pressed');
      };

      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('touchcancel', end, { passive: false });
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
    };

    bindHoldButton(btnUp, (val) => { this.touchUpActive = val; });
    bindHoldButton(btnDown, (val) => { this.touchDownActive = val; });
  }

  _bindMobileActionButtons() {
    const btnHook = document.getElementById('m-btn-hook');
    const btnGrid = document.getElementById('m-btn-grid');

    if (btnHook) {
      const startHook = (e) => {
        e.preventDefault();
        this._triggerAudioUnlock();
        this.gradientHookActive = true;
        btnHook.classList.add('active');
      };
      const endHook = (e) => {
        e.preventDefault();
        this.gradientHookActive = false;
        btnHook.classList.remove('active');
      };
      btnHook.addEventListener('touchstart', startHook, { passive: false });
      btnHook.addEventListener('touchend', endHook, { passive: false });
      btnHook.addEventListener('touchcancel', endHook, { passive: false });
      btnHook.addEventListener('mousedown', startHook);
      btnHook.addEventListener('mouseup', endHook);
    }

    if (btnGrid) {
      btnGrid.addEventListener('click', (e) => {
        e.preventDefault();
        this._triggerAudioUnlock();
        if (this.callbacks.onToggleGrid) this.callbacks.onToggleGrid();
      });
    }
  }

  update() {
    let kbX = 0;
    let kbZ = 0;
    let kbY = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kbX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kbX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kbZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kbZ += 1;

    if (this.keys.has('Space')) kbY += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) kbY -= 1;

    const touchY = (this.touchUpActive ? 1 : 0) - (this.touchDownActive ? 1 : 0);

    this.moveX = Math.max(-1, Math.min(1, kbX + this.joystickVector.x));
    this.moveZ = Math.max(-1, Math.min(1, kbZ + this.joystickVector.y));
    this.moveY = Math.max(-1, Math.min(1, kbY + touchY));
  }
}
