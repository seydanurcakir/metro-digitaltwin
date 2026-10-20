// Camera state shared with scene components that need it every frame (level of detail, label sizes).
// Written by the controls in Scene.tsx; read in useFrame. Not React state, so it never triggers re-renders.
export const CAM = {
  zoom: 4.2,
  x: 0,
  z: 0,
};

/** Detail levels: crowds and doors only make sense when people are at least a pixel or two wide */
export const LOD = {
  crowd: 1.1,
  heat: 0.35,
  labelsAll: 0.07,
} as const;
