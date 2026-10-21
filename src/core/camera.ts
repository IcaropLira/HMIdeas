// Câmera do canvas infinito. screen = world * zoom + (x, y)

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

export const defaultCamera = (): Camera => ({ x: 0, y: 0, zoom: 1 });

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function screenToWorld(cam: Camera, sx: number, sy: number) {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Zoom mantendo o ponto (cx, cy) da tela parado. */
export function zoomAt(cam: Camera, factor: number, cx: number, cy: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const k = zoom / cam.zoom;
  return { zoom, x: cx - (cx - cam.x) * k, y: cy - (cy - cam.y) * k };
}
