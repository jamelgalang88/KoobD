window.KOOBD_PLATFORMER_BLOCKS = [
  { id: 'block1', label: 'Block 1', w: 16, h: 16, color: '#55c7a4', img: '' },
  { id: 'block2', label: 'Block 2', w: 30, h: 6, color: '#6394e8', img: '' },
  { id: 'block3', label: 'Block 3', w: 22, h: 12, color: '#f0b84b', img: '' },
  { id: 'block4', label: 'Block 4', w: 14, h: 14, color: '#dc7184', img: '' }
];

window.KOOBD_PLATFORMER_COLLISION = {
  readImageParts(img) {
    const maxDimension = 1024;
    const alphaThreshold = 1;
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create canvas context for block collision mask.');
    context.drawImage(img, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const complete = [];
    let active = new Map();

    for (let y = 0; y < height; y++) {
      const next = new Map();
      let x = 0;
      while (x < width) {
        while (x < width && pixels[(y * width + x) * 4 + 3] < alphaThreshold) x++;
        if (x === width) break;
        const left = x;
        while (x < width && pixels[(y * width + x) * 4 + 3] >= alphaThreshold) x++;
        const right = x;
        const key = `${left}:${right}`;
        const part = active.get(key) || { left, right, top: y, bottom: y };
        part.bottom = y + 1;
        next.set(key, part);
      }
      active.forEach((part, key) => {
        if (!next.has(key)) complete.push(part);
      });
      active = next;
    }
    active.forEach((part) => complete.push(part));
    return complete.map((part) => ({
      left: part.left / width,
      right: part.right / width,
      top: part.top / height,
      bottom: part.bottom / height
    }));
  },

  platformGeometry(platform, viewportWidth, viewportHeight, worldWidth, worldHeight, imageParts, hasImage) {
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const width = clamp(Number(platform.width) || 28, 0.5, 1000);
    const height = clamp(Number(platform.height) || 7, 0.5, 300);
    const rotation = (Number(platform.rotation) || 0) * Math.PI / 180;
    const rawX = Number(platform.x);
    const rawY = Number(platform.y);
    const centerX = clamp(Number.isFinite(rawX) ? rawX : 50, 0, worldWidth);
    const centerY = clamp(Number.isFinite(rawY) ? rawY : 270, 0, worldHeight);
    const halfWidthPx = (width / 100) * viewportWidth / 2;
    const halfHeightPx = (height / 100) * viewportHeight / 2;
    const centerPxX = (centerX / 100) * viewportWidth;
    const centerPxY = (centerY / 100) * viewportHeight;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const transform = (x, y) => ({
      x: ((centerPxX + x * cos - y * sin) / viewportWidth) * 100,
      y: ((centerPxY + x * sin + y * cos) / viewportHeight) * 100
    });
    const corners = [
      transform(-halfWidthPx, -halfHeightPx),
      transform(halfWidthPx, -halfHeightPx),
      transform(halfWidthPx, halfHeightPx),
      transform(-halfWidthPx, halfHeightPx)
    ];
    const parts = (hasImage ? (Array.isArray(imageParts) ? imageParts : []) : [
      { left: 0, right: 1, top: 0, bottom: 1 }
    ]).map((part) => ({
      corners: [
        transform((part.left * 2 - 1) * halfWidthPx, (part.top * 2 - 1) * halfHeightPx),
        transform((part.right * 2 - 1) * halfWidthPx, (part.top * 2 - 1) * halfHeightPx),
        transform((part.right * 2 - 1) * halfWidthPx, (part.bottom * 2 - 1) * halfHeightPx),
        transform((part.left * 2 - 1) * halfWidthPx, (part.bottom * 2 - 1) * halfHeightPx)
      ]
    }));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      rotation,
      cx: centerX,
      cy: centerY,
      hw: width / 2,
      hh: height / 2,
      corners,
      parts
    };
  }
};
