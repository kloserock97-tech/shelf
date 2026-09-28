import * as THREE from "three/webgpu";
import { exp, Fn, positionWorld, smoothstep, uniform, uv, vec3 } from "three/tsl";
import { curl } from "./curl.js";
import { CORE } from "./light.js";

/* Two sets of particles in one instanced mesh.
 *
 * The core is a mesh that keeps falling apart: points are sampled on the surface of an icosphere and fly
 * out along their normal, fast, sinking at the end of their life. Phases differ, so the break-up never
 * stops and the core reads as a boiling lump rather than a cloud.
 *
 * Dust is a sparse set of sparks through the whole cone above, slowly settling towards the column.
 *
 * Layout is computed on the CPU. A few thousand matrices a frame cost a fraction of a millisecond. */

export function createSparks({ clock, light })
{
    const core = {
        rate: uniform(0.31),     // break-ups per second per particle
        radius: uniform(1.7),
        expand: uniform(0.15),
        burst: uniform(0.5),
        sink: uniform(8),
        /* Small sparks: the core should read as a dense cloud of grains, not a handful of blobs. */
        size: uniform(0.26),
        stretch: uniform(0.7),
        /* Points sit exactly on a sphere; pushing each along its own normal by a random share tears the outline. */
        ragged: uniform(0.42),
        /* The curl field carries the sparks, so they wind into threads instead of flying out like fireworks. */
        flow: uniform(2.6),
        flowScale: uniform(0.16),
        flowSpeed: uniform(0.35),
    };

    const dust = {
        speed: uniform(0.015),
        radius: uniform(19),  // cloud radius at the top
        waist: uniform(8.6),  // and at the bottom, where it is drawn into the column
        height: uniform(43),
        base: uniform(2.5),
        size: uniform(0.2),
        swirl: uniform(0),
        /* Distance from the axis at which a spark is dark. Not zero at the edge: a spark that vanishes
           outright pops out of the frame. */
        reach: uniform(26),
    };

    const coreCount = 5400;
    const dustCount = 260;
    const count = coreCount + dustCount;

    const source = new THREE.IcosahedronGeometry(1, 3);
    const surface = sampleSurface(source, coreCount);
    source.dispose();

    const coreParticles = surface.map((point) => ({
        origin: point,
        direction: point.clone().normalize(),
        seed: Math.random(),
        speed: 0.35 + Math.random() * Math.random() * 1.9,
        scale: 0.3 + Math.random() * Math.random() * 2.1,
        wobble: 0.6 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
        /* Cubed so most points stay near the surface and only a few are pushed far out. */
        rag: Math.pow(Math.random(), 3) - 0.35,
    }));

    const dustParticles = Array.from({ length: dustCount }, () => ({
        seed: Math.random(),
        angle: Math.random() * Math.PI * 2,
        radial: Math.pow(Math.random(), 0.55),
        wobble: 0.5 + Math.random() * 1.6,
        scale: 0.25 + Math.random() * Math.random() * 1.5,
    }));

    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.blending = THREE.AdditiveBlending;

    /* A soft dot, dimmed by distance from the column's axis: in this air only what the light reaches glows.
       The core sits on the axis and keeps its full brightness. */
    material.colorNode = Fn(() =>
    {
        const r = uv().sub(0.5).length().mul(2);
        const dot = exp(r.mul(r).mul(5.5).negate()).mul(smoothstep(1, 0.6, r));
        const lit = smoothstep(dust.reach, 0, positionWorld.xz.length()).pow(1.5).mul(0.92).add(0.08);

        return vec3(1).mul(light.color).mul(dot.mul(lit));
    })();

    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const drift = new THREE.Vector3();

    function update(camera)
    {
        const time = clock.elapsed;
        quaternion.copy(camera.quaternion);

        for(let i = 0; i < coreCount; i++)
        {
            const p = coreParticles[i];

            const life = (p.seed + time * core.rate.value) % 1;
            const grow = (1 + life * core.expand.value) * (1 + p.rag * core.ragged.value);
            const flight = life * life * core.burst.value * p.speed;
            const swim = Math.sin(time * p.wobble + p.phase) * 0.5 * life;
            const radius = core.radius.value * grow;

            position.set(
                p.origin.x * radius + p.direction.x * flight + swim,
                CORE + p.origin.y * radius * core.stretch.value + p.direction.y * flight - life * life * core.sink.value,
                p.origin.z * radius + p.direction.z * flight,
            );

            /* The field is read at the spark's current position instead of being accumulated: life loops,
               and accumulated drift would have to be reset every cycle, visibly. */
            if(core.flow.value > 0)
            {
                const s = core.flowScale.value;
                const shift = time * core.flowSpeed.value;

                curl(position.x * s + shift, position.y * s, position.z * s - shift, drift);
                position.addScaledVector(drift, core.flow.value * life * life);
            }

            /* Flares up instantly, fades slowly: a spark, not a ball. */
            const fade = Math.min(life / 0.05, 1) * Math.min((1 - life) / 0.55, 1);
            scale.setScalar(Math.max(core.size.value * p.scale * fade, 0.0001));

            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(i, matrix);
        }

        for(let i = 0; i < dustCount; i++)
        {
            const p = dustParticles[i];

            const life = (p.seed - (time * dust.speed.value) % 1 + 1) % 1;
            const rise = dust.base.value + life * dust.height.value;
            const spread = dust.waist.value + (dust.radius.value - dust.waist.value) * Math.pow(life, 0.7);
            const angle = p.angle + time * dust.swirl.value * (0.2 + p.radial * 0.5) * (1 - life * 0.6);
            const wobble = Math.sin(time * p.wobble + p.angle * 3) * spread * 0.12;

            position.set(Math.cos(angle) * spread * p.radial + wobble, rise, Math.sin(angle) * spread * p.radial);

            const fade = Math.min(life / 0.12, 1) * Math.min((1 - life) / 0.25, 1);
            scale.setScalar(Math.max(dust.size.value * p.scale * fade, 0.0001));

            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(coreCount + i, matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
    }

    return { mesh, core, dust, update };
}

/* Points on a mesh surface: cumulative triangle areas, a binary search over them, a barycentric point
 * inside the chosen triangle. The standard way to turn a mesh into particles, written out here so the
 * project does not pull a second copy of the three core through an addon. */
function sampleSurface(geometry, count)
{
    const position = geometry.attributes.position;
    const index = geometry.index;
    const faces = index ? index.count / 3 : position.count / 3;

    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
    const at = (face, corner) => (index ? index.getX(face * 3 + corner) : face * 3 + corner);

    const cumulative = new Float32Array(faces);
    let total = 0;

    for(let face = 0; face < faces; face++)
    {
        a.fromBufferAttribute(position, at(face, 0));
        b.fromBufferAttribute(position, at(face, 1));
        c.fromBufferAttribute(position, at(face, 2));
        total += normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).length() * 0.5;
        cumulative[face] = total;
    }

    const points = [];

    for(let i = 0; i < count; i++)
    {
        const target = Math.random() * total;
        let low = 0, high = faces - 1;

        while(low < high)
        {
            const middle = (low + high) >> 1;
            if(cumulative[middle] < target) low = middle + 1;
            else high = middle;
        }

        a.fromBufferAttribute(position, at(low, 0));
        b.fromBufferAttribute(position, at(low, 1));
        c.fromBufferAttribute(position, at(low, 2));
        ab.subVectors(b, a);
        ac.subVectors(c, a);

        /* Folded barycentrics, otherwise points crowd the first vertex. */
        let u = Math.random(), v = Math.random();
        if(u + v > 1) { u = 1 - u; v = 1 - v; }

        points.push(new THREE.Vector3(a.x + ab.x * u + ac.x * v, a.y + ab.y * u + ac.y * v, a.z + ab.z * u + ac.z * v));
    }

    return points;
}
