/* Demo: the diorama on its own transparent canvas over a dusk background. The entrance plays once the scene is
 * built; Replay runs it again (presence 0 → 1), the cursor turns the whole composition a little. */
import { createBoardScene } from "./board";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const scene = createBoardScene(canvas);
addEventListener("resize", () => scene.stage.resize());
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  scene.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
});
document.querySelector(".replay")!.addEventListener("click", () => {
  scene.setPresence(0);
  requestAnimationFrame(() => requestAnimationFrame(() => scene.setPresence(1)));
});
/* the scene stops drawing on a hidden tab */
document.addEventListener("visibilitychange", () => (document.hidden ? scene.pause() : scene.resume()));
await scene.ready;
if (new URLSearchParams(location.search).get("still") === "1") scene.still();
else scene.setPresence(1);
document.body.classList.add("is-ready");
