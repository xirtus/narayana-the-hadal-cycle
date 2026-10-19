import * as THREE from "three";

export class MarineSnow {
  constructor(scene, clock, count = 2200) {
    this.count = count;
    const geometry = new THREE.BufferGeometry();
    const points = new Float32Array(count * 3),
      seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      points[i * 3] = (Math.random() - 0.5) * 140;
      points[i * 3 + 1] = (Math.random() - 0.5) * 90;
      points[i * 3 + 2] = (Math.random() - 0.5) * 140;
      seeds[i] = Math.random();
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        oceanTime: clock,
        focus: { value: new THREE.Vector3() },
        brightness: { value: 0.5 },
      },
      vertexShader: `uniform float oceanTime;uniform vec3 focus;attribute float seed;varying float alpha;void main(){vec3 p=position;p.x+=sin(oceanTime*.14+seed*62.)*.8;p.y-=oceanTime*(.03+seed*.06);p=mod(p-focus+vec3(70.,45.,70.),vec3(140.,90.,140.))-vec3(70.,45.,70.)+focus;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((.5+seed*1.6)*95./-mv.z,.8,3.7);alpha=(.08+seed*.22)*smoothstep(90.,6.,length(mv.xyz));}`,
      fragmentShader: `uniform float brightness;varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.55,.85,.76,alpha*(1.-r*r)*brightness);}`,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(position, depth) {
    this.material.uniforms.focus.value.copy(position);
    this.material.uniforms.brightness.value = depth > 300 ? 0.85 : 0.6;
  }
  setQuality(quality) {
    this.points.geometry.setDrawRange(
      0,
      quality === "low" ? 600 : quality === "medium" ? 1200 : this.count,
    );
  }
  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
