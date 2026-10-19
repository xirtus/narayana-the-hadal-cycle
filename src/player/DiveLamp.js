import * as THREE from "three";
export class DiveLamp {
  constructor(scene) {
    this.enabled = false;
    this.scene = scene;
    this.light = new THREE.SpotLight(0xc4e9ed, 0, 105, Math.PI / 8, 0.65, 1.35);
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.001;
    this.light.shadow.normalBias = 0.08;
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.far = 105;
    this.light.castShadow = true;
    scene.add(this.light, this.light.target);
    const geometry = new THREE.ConeGeometry(14, 65, 40, 1, true);
    geometry.translate(0, -32.5, 0);
    geometry.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { opacity: { value: 0.045 } },
        vertexShader:
          "varying vec3 local; void main(){local=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "uniform float opacity;varying vec3 local;void main(){float d=abs(local.z)/65.;gl_FragColor=vec4(.45,.78,.9,opacity*(1.-d)*(1.-d));}",
      }),
    );
    this.beam.visible = false;
    scene.add(this.beam);
  }
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
  update(position, forward, world, quality = "high") {
    this.light.visible = this.enabled;
    this.beam.visible = this.enabled;
    if (!this.enabled) return;
    this.light.position
      .copy(position)
      .addScaledVector(forward, 1.6)
      .add(new THREE.Vector3(0, 0.65, 0));
    this.light.target.position
      .copy(this.light.position)
      .addScaledVector(forward, 60);
    this.light.intensity = 260;
    this.light.castShadow = quality !== "low";
    const hit = world.findAnchor?.(this.light.position, forward, 65),
      length = Math.max(0.5, Math.min(65, hit?.distance || 65));
    this.beam.position.copy(this.light.position);
    this.beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      forward,
    );
    this.beam.scale.setScalar(length / 65);
  }
  dispose() {
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.light.dispose();
    this.beam.removeFromParent();
    this.beam.geometry.dispose();
    this.beam.material.dispose();
  }
}
