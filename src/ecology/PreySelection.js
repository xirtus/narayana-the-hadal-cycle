import * as THREE from "three";

const offset = new THREE.Vector3();
// Range is measured from the mouth to the prey centre, in world metres.
export function scorePrey(
  prey,
  mouth,
  forward,
  { range = 3.2, coneCos = 0.05 } = {},
) {
  offset.subVectors(prey, mouth);
  const distance = offset.length();
  if (distance > range) return null;
  const alignment =
    distance < 0.001 || !forward || forward.lengthSq() < 0.001
      ? 1
      : offset.dot(forward) / (distance * forward.length());
  if (alignment < coneCos) return null;
  return { distance, alignment, score: distance + (1 - alignment) * 0.65 };
}
