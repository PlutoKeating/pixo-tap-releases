const DEFAULT_TEXTURE_SIZE = 128;
const CAMERA_NODE_NAMES = new Set(['柱体', 'Cylinder']);

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function createCameraLensPixels(size = DEFAULT_TEXTURE_SIZE) {
  const safeSize = Math.max(16, Math.round(size));
  const pixels = new Uint8Array(safeSize * safeSize * 4);

  for (let y = 0; y < safeSize; y += 1) {
    for (let x = 0; x < safeSize; x += 1) {
      const nx = ((x + 0.5) / safeSize) * 2 - 1;
      const ny = ((y + 0.5) / safeSize) * 2 - 1;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const highlight = Math.exp(-(((nx + 0.3) ** 2) + ((ny + 0.32) ** 2)) / 0.018);
      let red;
      let green;
      let blue;

      if (radius >= 0.95) {
        red = 38;
        green = 34;
        blue = 36;
      } else if (radius >= 0.72) {
        const edgeLight = 158 + (1 - ny) * 26 + highlight * 32;
        red = edgeLight + 12;
        green = edgeLight + 5;
        blue = edgeLight;
      } else {
        const glass = 13 + radius * 42;
        red = glass + highlight * 142;
        green = glass + 4 + highlight * 151;
        blue = glass + 10 + highlight * 165;
      }

      const offset = (y * safeSize + x) * 4;
      pixels[offset] = clampByte(red);
      pixels[offset + 1] = clampByte(green);
      pixels[offset + 2] = clampByte(blue);
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

export function findCameraLensMesh(model) {
  let lens = null;
  model?.traverse?.(object => {
    if (lens || !object?.isMesh) return;
    if (CAMERA_NODE_NAMES.has(object.name) || /^(?:柱体|Cylinder)(?:\.\d+)?$/.test(object.name)) {
      lens = object;
    }
  });
  return lens;
}

export function applyCameraLensTexture(THREE, model) {
  const lens = findCameraLensMesh(model);
  if (!lens) return null;

  const texture = new THREE.DataTexture(
    createCameraLensPixels(DEFAULT_TEXTURE_SIZE),
    DEFAULT_TEXTURE_SIZE,
    DEFAULT_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.name = 'PIXO Camera Lens Texture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  lens.material = new THREE.MeshPhysicalMaterial({
    name: 'PIXO Camera Lens',
    color: 0xffffff,
    map: texture,
    metalness: 0.72,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  });
  lens.userData.pixoCameraLens = true;
  return lens;
}
