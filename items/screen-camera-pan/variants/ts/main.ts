/* Demo wiring: three scenes over two states of one dashboard. */
import { mountDemos } from "./demoRunner";
import { screenMarkup, screenPlay, type Scene } from "./screenMotion";

const scenes: Scene[] = [
  { src: "orders.svg", caption: "Today's orders at a glance", focus: "overview" },
  { src: "orders.svg", caption: "Late orders and refund requests stand out in the list", focus: "late" },
  { src: "orders-refund.svg", caption: "A refund asks for one clear confirmation", focus: "refund" },
];

const replay = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M4 3.5V7h3.5"/></svg>`;
const host = document.getElementById("demo");
if (host) {
  host.innerHTML = `<figure class="dm-wrap" data-demo="orders" aria-label="Interface walkthrough">
    <div class="dm-stage">${screenMarkup(scenes, { alt: "Orders dashboard" })}</div>
    <figcaption><span class="dm-live"><i></i>Interface walkthrough</span><button type="button" class="dm-replay">${replay}Play again</button></figcaption>
  </figure>`;
  mountDemos(host, { orders: (stage, run) => screenPlay(stage, scenes, run) });
}
