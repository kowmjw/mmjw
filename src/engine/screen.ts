// 逻辑分辨率与 MD 一致：320×224。所有绘制都用逻辑坐标，再整体放大到实际像素。
export const VW = 320;
export const VH = 224;

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** 一个逻辑像素对应多少实际像素 */
  scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    this.ctx = ctx;
  }

  /** 按给定的 CSS 宽度设置画布（高度按 320:224 算），实际分辨率乘上设备像素比，文字才清晰。 */
  setCssWidth(cssW: number) {
    const cssH = (cssW * VH) / VW;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round((this.canvas.width * VH) / VW);
    this.scale = this.canvas.width / VW;
  }

  begin() {
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  toVirtual(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * VW, y: ((clientY - r.top) / r.height) * VH };
  }
}
