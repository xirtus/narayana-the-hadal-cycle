export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    this.sensitivity = 0.0018;
    this.pointerLocked = false;
    this.dragging = false;
    this.touchMove = { x: 0, y: 0 };
    window.addEventListener("keydown", (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (
        this.enabled &&
        [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Tab",
        ].includes(e.code)
      )
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      if (e.pointerType === "touch") {
        this.dragging = true;
        this.lastTouch = { x: e.clientX, y: e.clientY };
        return;
      }
      if (!this.pointerLocked) {
        canvas.requestPointerLock?.()?.catch?.(() => {});
      }
      this.keys.add(e.button === 2 ? "MouseRight" : "MouseLeft");
      this.pressed.add(e.button === 2 ? "MouseRight" : "MouseLeft");
    });
    window.addEventListener("pointerup", () => {
      this.keys.delete("MouseRight");
      this.keys.delete("MouseLeft");
      this.dragging = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.yaw += e.movementX * this.sensitivity;
        this.pitch -= e.movementY * this.sensitivity;
      } else if (this.dragging && this.lastTouch) {
        this.yaw += (e.clientX - this.lastTouch.x) * 0.005;
        this.pitch -= (e.clientY - this.lastTouch.y) * 0.005;
        this.lastTouch = { x: e.clientX, y: e.clientY };
      }
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  consume(code) {
    const v = this.pressed.has(code);
    this.pressed.delete(code);
    return v;
  }
  clear() {
    this.keys.clear();
    this.pressed.clear();
  }
  release() {
    document.exitPointerLock?.();
    this.clear();
  }
  frame(dt) {
    const k = this.keys;
    let moveX =
      Number(k.has("KeyD")) - Number(k.has("KeyA")) + this.touchMove.x;
    let moveZ =
      Number(k.has("KeyW")) - Number(k.has("KeyS")) - this.touchMove.y;
    let ascend =
      Number(k.has("Space")) -
      Number(k.has("KeyC") || k.has("ControlLeft") || k.has("ControlRight"));
    let jet = k.has("ShiftLeft") || k.has("ShiftRight");
    this.yaw +=
      (Number(k.has("ArrowRight")) - Number(k.has("ArrowLeft"))) * dt * 1.3;
    this.pitch +=
      (Number(k.has("ArrowUp")) - Number(k.has("ArrowDown"))) * dt * 0.8;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
    this.padAttack = false;
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    if (pad && this.enabled) {
      const dead = (v) => (Math.abs(v) > 0.13 ? v : 0);
      moveX += dead(pad.axes[0] || 0);
      moveZ -= dead(pad.axes[1] || 0);
      this.yaw += dead(pad.axes[2] || 0) * dt * 2;
      this.pitch -= dead(pad.axes[3] || 0) * dt * 1.4;
      ascend +=
        Number(pad.buttons[0]?.pressed) - Number(pad.buttons[1]?.pressed);
      jet ||= !!pad.buttons[7]?.pressed;
      this.padAttack = !!pad.buttons[6]?.pressed;
      for (const [i, key] of [
        [2, "KeyQ"],
        [3, "KeyE"],
        [4, "KeyR"],
        [5, "KeyF"],
        [10, "KeyZ"],
        [11, "KeyL"],
        [12, "KeyB"],
        [13, "KeyH"],
        [14, "KeyP"],
        [9, "Escape"],
      ]) {
        const down = pad.buttons[i]?.pressed;
        if (down && !this.padPrevious?.[i]) this.pressed.add(key);
      }
      this.padPrevious = pad.buttons.map((b) => b.pressed);
    }
    return {
      moveX: this.enabled ? moveX : 0,
      moveZ: this.enabled ? moveZ : 0,
      ascend: this.enabled ? ascend : 0,
      jet: this.enabled && jet,
      yaw: this.yaw,
      pitch: this.pitch,
      grab: this.enabled && k.has("MouseRight"),
      attack: this.enabled && k.has("MouseLeft"),
    };
  }
}
