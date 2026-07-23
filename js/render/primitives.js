export function pixelRect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

export function pixelEllipse(ctx, x, y, radiusX, radiusY, color) {
  const centerX = Math.round(x);
  const centerY = Math.round(y);
  const rx = Math.max(1, Math.round(radiusX));
  const ry = Math.max(1, Math.round(radiusY));
  ctx.fillStyle = color;
  for (let row = -ry; row <= ry; row += 1) {
    const normalized = row / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - normalized * normalized)));
    ctx.fillRect(centerX - half, centerY + row, half * 2 + 1, 1);
  }
}

export function pixelRing(ctx, x, y, radiusX, radiusY, color, thickness = 1) {
  pixelEllipse(ctx, x, y, radiusX, radiusY, color);
  pixelEllipse(ctx, x, y, Math.max(1, radiusX - thickness), Math.max(1, radiusY - thickness), ctx.__ringCutout ?? "#000");
}

export function polygon(ctx, points, color) {
  if (!points?.length) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0].x), Math.round(points[0].y));
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(Math.round(points[index].x), Math.round(points[index].y));
  }
  ctx.closePath();
  ctx.fill();
}

export function pixelLine(ctx, from, to, width, color) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * width / 2;
  const ny = dx / length * width / 2;
  polygon(ctx, [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
  ], color);
  pixelRect(ctx, from.x - width / 2, from.y - width / 2, width, width, color);
  pixelRect(ctx, to.x - width / 2, to.y - width / 2, width, width, color);
}

export function outlinedPixelLine(ctx, from, to, width, color, outline) {
  pixelLine(ctx, from, to, width + 2, outline);
  pixelLine(ctx, from, to, width, color);
}

export function withAlpha(ctx, alpha, callback) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  callback();
  ctx.restore();
}

export function scalePoint(point, originX, originY, scale = 1) {
  return {
    x: Math.round(originX + point.x * scale),
    y: Math.round(originY + point.y * scale),
  };
}

export function hashNoise(value) {
  const sine = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return sine - Math.floor(sine);
}
