import * as THREE from "three";

export function waterlitMaterial(
  options,
  clock,
  { sway = false, rock = false } = {},
) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.84,
    ...options,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.oceanTime = clock;
    shader.vertexShader = `uniform float oceanTime; varying vec3 oceanWorld;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      ${sway ? "float h = max(0.,position.y); transformed.x += sin(oceanTime*.46+h*.24+position.z*.13)*h*.055; transformed.z += cos(oceanTime*.31+h*.3)*h*.035;" : ""}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      vec4 oceanP = vec4(transformed,1.);
      #ifdef USE_INSTANCING
      oceanP = instanceMatrix * oceanP;
      #endif
      oceanWorld=(modelMatrix*oceanP).xyz;
      #include <project_vertex>`,
    );
    shader.fragmentShader = `uniform float oceanTime; varying vec3 oceanWorld;
      float oceanHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float oceanNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(oceanHash(i),oceanHash(i+vec3(1,0,0)),f.x),mix(oceanHash(i+vec3(0,1,0)),oceanHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(oceanHash(i+vec3(0,0,1)),oceanHash(i+vec3(1,0,1)),f.x),mix(oceanHash(i+vec3(0,1,1)),oceanHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float grain=oceanNoise(oceanWorld*13.);
      float large=oceanNoise(oceanWorld*${rock ? ".72" : "1.8"});
      diffuseColor.rgb *= ${rock ? ".66+large*.58+grain*.2" : ".86+large*.18+grain*.13"};
      ${rock ? "diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.58,.76,.42),smoothstep(.52,.85,large)*.38);" : ""}
      vec2 c=oceanWorld.xz*1.12+vec2(sin(oceanWorld.z*.43+oceanTime*.38),cos(oceanWorld.x*.38-oceanTime*.3))*1.1;
      float net=abs(sin(c.x+c.y*.63+oceanTime*.26)*cos(c.y-c.x*.38-oceanTime*.21));
      float caustic=pow(1.-net,22.)*exp(min(0.,oceanWorld.y)*.031);
      diffuseColor.rgb+=vec3(.105,.19,.125)*caustic;`,
    );
    if (rock)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
      float oceanBump=oceanNoise(oceanWorld*3.1)*.06+oceanNoise(oceanWorld*17.)*.011;
      vec3 oceanDx=dFdx(oceanWorld),oceanDy=dFdy(oceanWorld);
      vec3 oceanTx=normalize(dFdx(-vViewPosition)),oceanTy=normalize(dFdy(-vViewPosition));
      normal=normalize(normal-oceanTx*dFdx(oceanBump)/max(length(oceanDx),.001)-oceanTy*dFdy(oceanBump)/max(length(oceanDy),.001));`,
      );
  };
  material.customProgramCacheKey = () => `water-${sway}-${rock}`;
  return material;
}

export function makeSurface(clock) {
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      oceanTime: clock,
      waterFog: { value: new THREE.Color(0x155d65) },
    },
    vertexShader: `uniform float oceanTime;varying vec3 wp;varying float waterDistance;void main(){vec3 p=position;p.z+=sin(p.x*.1+oceanTime*.5)*.35+sin(p.y*.15-oceanTime*.3)*.23;wp=(modelMatrix*vec4(p,1.)).xyz;vec4 mv=modelViewMatrix*vec4(p,1.);waterDistance=length(mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float oceanTime;uniform vec3 waterFog;varying vec3 wp;varying float waterDistance;void main(){vec2 p=wp.xz;float w=sin(p.x*.45+sin(p.y*.2+oceanTime*.5))*sin(p.y*.61+sin(p.x*.17-oceanTime*.4));float glitter=pow(abs(w),14.);float sun=exp(-length(p-vec2(-35.,25.))*.013);vec3 col=mix(vec3(.035,.16,.14),vec3(.27,.46,.30),w*.25+.4);col+=vec3(.46,.51,.30)*glitter*sun;float mist=1.-exp(-waterDistance*.018);col=mix(col,waterFog,mist);float alpha=.92*exp(-pow(waterDistance/210.,2.));gl_FragColor=vec4(col,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600, 100, 100),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.15;
  return mesh;
}

export function makeSunRays(clock) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { oceanTime: clock },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float oceanTime;varying vec2 vUv;void main(){float a=pow(sin(vUv.x*3.14159),3.)*sin(vUv.y*3.14159)*.044*(.82+.18*sin(oceanTime*.4+vUv.y*7.));gl_FragColor=vec4(.47,.73,.61,a);}`,
  });
  for (let i = 0; i < 16; i++) {
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3 + (i % 4) * 0.8, 65),
      mat,
    );
    beam.position.set((i % 6) * 13 - 32, -24, 45 - Math.floor(i / 6) * 35);
    beam.rotation.z = -0.25;
    beam.rotation.y = (i % 3) * 0.8;
    group.add(beam);
  }
  return group;
}

export function makeAtmosphere(color) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { waterFog: { value: color.clone() } },
    vertexShader: `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 waterFog;varying vec3 direction;void main(){vec3 d=normalize(direction);float up=smoothstep(-.3,.8,d.y);float sun=pow(max(0.,dot(d,normalize(vec3(-.35,.65,.45)))),12.);vec3 col=waterFog*(.74+up*.55)+waterFog*sun*.65;gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 24, 16),
    material,
  );
  sphere.renderOrder = -1000;
  sphere.frustumCulled = false;
  return sphere;
}
