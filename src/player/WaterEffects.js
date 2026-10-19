import * as THREE from "three";

export class WaterEffects {
  constructor(scene) {
    this.scene = scene;
    this.pulses = [];
    this.inkClouds = [];
    this.bubbles = [];
    this.wakeEmission = 0;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(206,247,240,.65)");
    grad.addColorStop(0.5, "rgba(188,239,238,.2)");
    grad.addColorStop(0.8, "rgba(231,255,253,.04)");
    grad.addColorStop(1, "rgba(187,236,235,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.bubbleTexture = new THREE.CanvasTexture(canvas);
    this.bubbleGeometry = new THREE.BufferGeometry();
    this.bubblePositions = new Float32Array(360 * 3);
    this.bubbleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.bubblePositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.bubbleMaterial = new THREE.PointsMaterial({
      map: this.bubbleTexture,
      size: 0.04,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0xd0f9ee,
      blending: THREE.AdditiveBlending,
    });
    this.bubblePoints = new THREE.Points(
      this.bubbleGeometry,
      this.bubbleMaterial,
    );
    this.bubblePoints.frustumCulled = false;
    this.bubbleGeometry.setDrawRange(0, 0);
    scene.add(this.bubblePoints);
    this.sphere = new THREE.SphereGeometry(1, 20, 14);
    this.inkTexture = this.makeInkTexture();
  }
  makeInkTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 5, 64, 64, 63);
    g.addColorStop(0, "rgba(9,16,27,.75)");
    g.addColorStop(0.3, "rgba(10,17,31,.6)");
    g.addColorStop(0.65, "rgba(14,23,36,.3)");
    g.addColorStop(1, "rgba(12,24,34,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  pulse(position) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { fade: { value: 1 } },
      vertexShader:
        "varying vec3 n;varying vec3 v;void main(){n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);v=-mv.xyz;gl_Position=projectionMatrix*mv;}",
      fragmentShader:
        "uniform float fade;varying vec3 n;varying vec3 v;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),4.);gl_FragColor=vec4(.48,.9,.75,rim*.16*fade);}",
    });
    const mesh = new THREE.Mesh(this.sphere, material);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.pulses.push({ mesh, age: 0 });
  }
  ink(position, velocity) {
    const group = new THREE.Group();
    group.position.copy(position);
    const sprites = [];
    for (let i = 0; i < 24; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.inkTexture,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        rotation: Math.random() * 6,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.3,
        (Math.random() - 0.5) * 1.5,
      );
      sprite.scale.setScalar(0.8 + Math.random());
      group.add(sprite);
      sprites.push({
        sprite,
        dir: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.3) * 0.3,
          (Math.random() - 0.5) * 0.4,
        ),
      });
    }
    this.scene.add(group);
    this.inkClouds.push({
      group,
      sprites,
      age: 0,
      velocity: velocity.clone().multiplyScalar(0.14),
    });
  }
  update(dt, time, player, world) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.age += dt;
      p.mesh.scale.setScalar(1 + p.age * 23);
      p.mesh.material.uniforms.fade.value = Math.max(0, 1 - p.age / 2.5);
      if (p.age > 2.5) {
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
        this.pulses.splice(i, 1);
      }
    }
    for (let i = this.inkClouds.length - 1; i >= 0; i--) {
      const c = this.inkClouds[i];
      c.age += dt;
      const current =
        world.getCurrent(c.group.position, time, new THREE.Vector3()) ||
        new THREE.Vector3();
      c.group.position
        .addScaledVector(current, dt * 0.8)
        .addScaledVector(c.velocity, dt);
      for (const { sprite, dir } of c.sprites) {
        sprite.position.addScaledVector(dir, dt);
        sprite.scale.setScalar(
          (1.2 + c.age * 0.35) * (1 + Math.sin(dir.x * 14) * 0.2),
        );
        sprite.material.opacity = Math.max(0, 0.8 * (1 - c.age / 12));
      }
      if (c.age > 12) {
        c.group.removeFromParent();
        c.sprites.forEach((s) => s.sprite.material.dispose());
        this.inkClouds.splice(i, 1);
      }
    }
    // Suspended particles reveal water expelled from the articulated siphon.
    if (player.jetAmount > 0.2)
      this.wakeEmission += dt * 240 * player.jetAmount;
    while (this.wakeEmission >= 1) {
      this.wakeEmission--;
      const p = player
        .getJetOutlet(new THREE.Vector3())
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.08,
            (Math.random() - 0.5) * 0.08,
            (Math.random() - 0.5) * 0.08,
          ),
        );
      const v = player
        .getJetDirection(new THREE.Vector3())
        .multiplyScalar(2 + player.jetAmount * 4)
        .addScaledVector(player.velocity, 0.25);
      this.bubbles.push({ p, v, age: 0 });
    }
    this.bubbles = this.bubbles.filter((b) => b.age < 2.2).slice(-360);
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.age += dt;
      b.p.addScaledVector(b.v, dt);
      b.v.y += dt * 0.15;
      this.bubblePositions.set(b.p.toArray(), i * 3);
    }
    this.bubbleGeometry.attributes.position.needsUpdate = true;
    this.bubbleGeometry.setDrawRange(0, this.bubbles.length);
  }
}
