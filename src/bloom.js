import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// EffectComposer llama setSize al agregar el pase y al cambiar la resolución.
// Mantener la escala también ahí: pasar solo un tamaño chico al constructor no alcanza.
export class ScaledBloomPass extends UnrealBloomPass {
  constructor(resolution, scale, strength, radius, threshold) {
    super(resolution.clone().multiplyScalar(scale), strength, radius, threshold);
    this.resolutionScale = scale;
  }

  setSize(width, height) {
    super.setSize(
      Math.max(1, Math.round(width * this.resolutionScale)),
      Math.max(1, Math.round(height * this.resolutionScale)),
    );
  }
}
