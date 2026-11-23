/**
 * 3D anchor points for callouts, in each model's normalised frame (height 2, centred, facing +Z).
 * The patient's left side is +X, which appears on the viewer's right.
 */
export const anchors = {
  body: {
    eyes: [-0.035, 0.885, 0.11] as [number, number, number],
    eyesRight: [0.035, 0.885, 0.11] as [number, number, number],
    ear: [-0.1, 0.86, 0] as [number, number, number],
    heart: [0.06, 0.47, 0.11] as [number, number, number],
  },
  heart: {
    aorta: [0.0, 0.75, 0.1] as [number, number, number],
    pulmonary: [0.25, 0.6, 0.2] as [number, number, number],
    venaCava: [-0.4, 0.5, 0.0] as [number, number, number],
  },
};
