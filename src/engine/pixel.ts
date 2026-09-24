export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D 不可用');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** 给像素图描一圈深色轮廓（只描在透明像素上）。 */
export function outline(c: HTMLCanvasElement, color: [number, number, number] = [20, 12, 8]) {
  const ctx = ctx2d(c);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const src = new Uint8ClampedArray(img.data);
  const { width: w, height: h, data } = img;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        const i = (y * w + x) * 4;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 生成去色版本（已行动的单位用）。 */
export function grayscale(c: HTMLCanvasElement) {
  const out = makeCanvas(c.width, c.height);
  const ctx = ctx2d(out);
  ctx.drawImage(c, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.75 + 20;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** 生成纯白剪影（受击闪白用）。 */
export function silhouette(c: HTMLCanvasElement, color = '#ffffff') {
  const out = makeCanvas(c.width, c.height);
  const ctx = ctx2d(out);
  ctx.drawImage(c, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return out;
}

export function flipX(c: HTMLCanvasElement) {
  const out = makeCanvas(c.width, c.height);
  const ctx = ctx2d(out);
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(c, 0, 0);
  return out;
}
