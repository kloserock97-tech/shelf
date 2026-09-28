import * as THREE from "three";

/* A polaroid: one plane with its own CanvasTexture. A cream frame with a wide bottom margin, the photo a little warm
   and faded like an instant print, a strip of tape on top and, if given, a caption by hand on the bottom margin.
   The photo can be a URL or anything drawImage takes (an image, a canvas). */

const W = 512, H = 616;
const SIDE = 30, PHOTO = W - SIDE * 2;

export function createPolaroid(photo, { caption = "", font = "Caveat", onReady } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let img = null;

  const paint = () => {
    const g = canvas.getContext("2d");
    /* paper */
    const paper = g.createLinearGradient(0, 0, W, H);
    paper.addColorStop(0, "#fbf8f0");
    paper.addColorStop(1, "#efeadd");
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    if (img) {
      g.drawImage(img, SIDE, SIDE, PHOTO, PHOTO);
      /* instant print: a little warm, lifted shadows, a soft vignette */
      g.globalCompositeOperation = "soft-light";
      g.fillStyle = "rgba(255, 214, 160, 0.35)";
      g.fillRect(SIDE, SIDE, PHOTO, PHOTO);
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(255, 250, 235, 0.08)";
      g.fillRect(SIDE, SIDE, PHOTO, PHOTO);
      const v = g.createRadialGradient(W / 2, SIDE + PHOTO / 2, PHOTO * 0.3, W / 2, SIDE + PHOTO / 2, PHOTO * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(40,20,0,0.28)");
      g.fillStyle = v;
      g.fillRect(SIDE, SIDE, PHOTO, PHOTO);
    } else {
      g.fillStyle = "#cfd6c4";
      g.fillRect(SIDE, SIDE, PHOTO, PHOTO);
    }
    /* a thin shadow along the inner edge of the photo */
    g.strokeStyle = "rgba(0,0,0,0.12)";
    g.lineWidth = 2;
    g.strokeRect(SIDE + 1, SIDE + 1, PHOTO - 2, PHOTO - 2);
    /* tape on top, slightly askew; a faint edge keeps it readable on cream paper */
    g.save();
    g.translate(W / 2, 10);
    g.rotate(-0.06);
    g.fillStyle = "rgba(246, 238, 206, 0.78)";
    g.fillRect(-70, -18, 140, 40);
    g.strokeStyle = "rgba(120, 100, 60, 0.12)";
    g.lineWidth = 1.5;
    g.strokeRect(-70, -18, 140, 40);
    g.restore();
    /* caption by hand in the middle of the bottom margin */
    if (caption) {
      g.save();
      g.translate(W / 2, SIDE + PHOTO + (H - SIDE - PHOTO) / 2);
      g.rotate(-0.025);
      g.fillStyle = "rgba(38, 42, 58, 0.86)";
      g.font = `600 58px ${font}, "Segoe Print", "Comic Sans MS", cursive`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(caption, 0, 2);
      g.restore();
    }
    tex.needsUpdate = true;
    onReady?.(tex);
  };

  paint();
  if (typeof photo === "string") {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { img = im; paint(); };
    im.src = photo;
  } else if (photo) {
    img = photo;
    paint();
  }
  /* the handwriting font may arrive after the first paint */
  if (caption && document.fonts) document.fonts.load(`600 58px ${font}`).then(paint, () => {});

  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, envMapIntensity: 0.6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, H / W), mat);
  mesh.name = "polaroid";
  return mesh;
}
