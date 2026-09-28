import * as THREE from "three/webgpu";
import { Fn, mix, pass, renderOutput, screenUV, smoothstep, uniform, vec2, vec3, vec4 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { hashBlur } from "three/addons/tsl/display/hashBlur.js";

/* The chain after the scene: bloom, a band blur and lens flares.
 *
 * The blur is a cheap stand-in for depth of field that works by screen height: a sharp band through the
 * middle of the frame, softening towards top and bottom. In a composed landscape shot that is where the
 * focus falls anyway, and it costs a handful of taps instead of a depth-aware pass.
 *
 * Lens flares are drawn, not extracted. Blurring and mirroring the frame would put every bright pixel
 * into the ghosts, foam included. Here the source is given: the scene projects the core onto the screen
 * every frame, and nothing else feeds the flare. */

const GHOSTS = 5;

export function createPost({ renderer, scene, camera })
{
    const pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");

    const bloomPass = bloom(sceneColor);
    bloomPass.threshold.value = 1;
    bloomPass.strength.value = 0.25;
    bloomPass.radius.value = 0;
    bloomPass.smoothWidth.value = 1;

    const band = {
        start: uniform(0.2),   // half height of the sharp band, in screen heights
        end: uniform(0.95),
        amount: uniform(0.003),
    };

    const flare = {
        position: uniform(vec2(0.5, 0.5)),
        intensity: uniform(0),
        aspect: uniform(1.777),
        ghostSpacing: uniform(0.32),
        ghostSize: uniform(0.12),
        haloRadius: uniform(0.31),
        haloWidth: uniform(0.085),
        streak: uniform(0.55),
        burst: uniform(0.45),
        tint: uniform(new THREE.Color(0.72, 0.84, 1)),
    };

    const graded = renderOutput(scenePass);
    const strength = smoothstep(band.start, band.end, screenUV.y.sub(0.5).abs());
    const blurred = mix(graded, hashBlur(graded, strength.mul(band.amount), { repeats: 25, premultipliedAlpha: true }), strength);

    /* A lens is a stack of glass; a bright source bounces between the surfaces and lands mirrored through
       the middle of the frame, further out with every extra pair. Hence a chain of ghosts on a line through
       the centre, each weaker than the last. */
    const flareNode = Fn(() =>
    {
        const stretch = vec2(flare.aspect, 1);
        const here = screenUV.sub(0.5).mul(stretch).toVar();
        const light = flare.position.sub(0.5).mul(stretch).toVar();
        const toLight = light.sub(here).toVar();
        const distance = toLight.length().toVar();
        const total = vec3(0).toVar();

        for(let i = 1; i <= GHOSTS; i++)
        {
            const toGhost = here.sub(light.negate().mul(flare.ghostSpacing.mul(i))).length();
            const size = flare.ghostSize.mul(1 + i * 0.35);
            const disc = toGhost.div(size).oneMinus().clamp(0, 1).pow(2.2);
            const ring = toGhost.div(size).sub(0.62).abs().mul(4).oneMinus().clamp(0, 1).pow(1.6);

            total.addAssign(disc.mul(0.55).add(ring.mul(0.45)).mul(1 / i));
        }

        /* A ring at a fixed radius around the source: the reflection off the front element. */
        total.addAssign(distance.sub(flare.haloRadius).abs().div(flare.haloWidth).oneMinus().clamp(0, 1).pow(2).mul(0.5));

        /* Anamorphic streak: distance squashed vertically, so it runs sideways. */
        const streak = vec2(toLight.x.mul(0.12), toLight.y.mul(3.2)).length();
        total.addAssign(streak.mul(3).oneMinus().clamp(0, 1).pow(2.4).mul(flare.streak));

        /* A star of spikes from the source itself. */
        const spikes = toLight.y.atan(toLight.x).mul(6).cos().abs().pow(9);
        total.addAssign(spikes.mul(distance.mul(2.2).oneMinus().clamp(0, 1).pow(2)).mul(flare.burst));

        /* A source outside the frame gives no flare. */
        const inside = flare.position.sub(0.5).abs().toVar();
        const visible = inside.x.mul(2).oneMinus().clamp(0, 1).smoothstep(0, 0.25).mul(inside.y.mul(2).oneMinus().clamp(0, 1).smoothstep(0, 0.25));

        return total.mul(visible).mul(flare.intensity);
    });

    const combined = blurred.add(bloomPass).toVar();
    pipeline.outputNode = vec4(combined.rgb.add(flare.tint.mul(flareNode())), combined.a);

    /* Flare shape from two numbers. At rest the ring and ghosts sit out at the edges of the frame; a smaller
       spread pulls the whole pattern in towards the column, the way a real lens rescales its flare when the
       aperture changes. The seven values are tied; driven apart they give a broken flare, not another one. */
    const shapeFlare = (spread) =>
    {
        const m = (wide, tight) => wide * spread + tight * (1 - spread);

        flare.haloRadius.value = m(0.82, 0.17);
        flare.haloWidth.value = m(0.13, 0.055);
        flare.ghostSpacing.value = m(0.52, 0.21);
        flare.ghostSize.value = m(0.13, 0.085);
        flare.streak.value = m(0.1, 0.7);
        flare.burst.value = m(0.04, 0.55);
    };

    return { pipeline, bloom: bloomPass, band, flare, shapeFlare };
}
