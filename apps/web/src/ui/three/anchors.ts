/**
 * 3D anchor points for callouts, in each model's normalised frame (height 2, centred, facing +Z).
 * Computed from the BodyParts3D geometry; the patient's left side is +X (the viewer's right).
 */
export const anchors = {
  body: {
    eyes: [-0.03, 0.861, 0.109] as [number, number, number],
    eyesRight: [0.03, 0.861, 0.109] as [number, number, number],
    ear: [-0.105, 0.854, -0.028] as [number, number, number],
    heart: [0.038, 0.525, 0.13] as [number, number, number],
  },
  heart: {
    aorta: [0.069, 0.793, -0.177] as [number, number, number],
    pulmonary: [0.222, 0.394, 0.347] as [number, number, number],
    venaCava: [-0.373, 0.638, 0.06] as [number, number, number],
  },
};
