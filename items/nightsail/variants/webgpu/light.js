import * as THREE from "three/webgpu";
import { color, exp, float, Fn, linearDepth, mix, mx_fractal_noise_float, smoothstep, uniform, uv, vec3, viewportLinearDepth } from "three/tsl";

/* The column of light and the halo around its core.
 *
 * The column is not a cone with faces but a single plane turned to the camera around the vertical axis.
 * The first version was an inverted cylinder and it read as a piece of white plastic: a mesh has a
 * silhouette and no amount of shader softness hides it. A plane has none, and brightness across it falls
 * off as a gaussian, which has no edge by definition. */

export const CORE = 28; // height of the core above the water plane's origin

export function createLight({ clock })
{
    const shared = {
        /* Tint of everything the light touches: column, halo, sparks, threads, glint on the water. */
        color: uniform(color("#ffffff")),
    };

    const beam = {
        /* Brightness and steepness are tied. Additive light past 1.0 clips to white, and where the clip
           runs the column gets an outline no light can have. Lower peak, longer falloff. */
        intensity: uniform(0.6),
        sharpness: uniform(3.1),
        groundWidth: uniform(0.385), // half width at the bottom, in halves of the plane
        coreWidth: uniform(0.052),   // at the core the column pinches to a point
        topWidth: uniform(0.035),    // and above it leaves as a thin thread
        fallDown: uniform(3.15),
        fallUp: uniform(3.95),
        texture: uniform(0.52),

        /* Soft intersection. The plane passes straight through the boat and the depth test cuts it with
           a hard vertical seam. Comparing its own depth with what is already drawn and fading as they
           meet removes the seam, the way soft particles do. */
        softness: uniform(0.0065),
    };

    const beamGeometry = new THREE.PlaneGeometry(1, 1);
    beamGeometry.translate(0, 0.5, 0);

    const beamMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    beamMaterial.blending = THREE.AdditiveBlending;

    beamMaterial.colorNode = Fn(() =>
    {
        const across = uv().x.sub(0.5).mul(2);
        const along = uv().y;
        const core = float(0.5);

        const below = core.sub(along).max(0).div(core);
        const above = along.sub(core).max(0).div(core.oneMinus());

        const halfWidth = beam.coreWidth
            .add(below.pow(0.85).mul(beam.groundWidth.sub(beam.coreWidth)))
            .add(above.pow(1.4).mul(beam.topWidth.sub(beam.coreWidth)))
            .max(0.002);

        const n = across.div(halfWidth);
        const radial = exp(n.mul(n).mul(beam.sharpness).negate());

        /* Brightest at the core: a long tail downwards, a short one upwards. */
        const dy = along.sub(core);
        const vertical = mix(exp(dy.mul(beam.fallDown)), exp(dy.mul(beam.fallUp).negate()), smoothstep(0, 0.02, dy));

        const edge = smoothstep(0, 0.04, along).mul(smoothstep(1, 0.86, along));

        /* Noise along the column, otherwise the gaussian reads as airbrush. */
        const drift = clock.shader.mul(0.06);
        const noise = mx_fractal_noise_float(vec3(across.mul(2.6), along.mul(3.4).sub(drift), 0), 3).mul(0.5).add(0.5);
        const textured = mix(float(1), noise.mul(1.7), beam.texture);

        const ahead = viewportLinearDepth.sub(linearDepth()).max(0);
        const soft = ahead.div(beam.softness).clamp(0, 1);

        return vec3(0.92, 0.95, 1).mul(shared.color).mul(radial.mul(vertical).mul(edge).mul(textured).mul(soft).mul(beam.intensity));
    })();

    const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
    beamMesh.scale.set(CORE * 2.3, CORE * 2, 1);
    beamMesh.renderOrder = 8;
    beamMesh.frustumCulled = false;

    /* The halo: two gaussian caps, a tight one and a wide one, on a camera-facing card. Real bloom would
       be a full-screen pass; this is one quad. In the tuned frame it is off, and a click flashes it. */
    const halo = {
        intensity: uniform(0),
        tight: uniform(16),
        wide: uniform(3.15),
        wideAmount: uniform(0.56),
        size: 44,
    };

    const haloMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    haloMaterial.blending = THREE.AdditiveBlending;

    haloMaterial.colorNode = Fn(() =>
    {
        const r = uv().sub(0.5).length().mul(2);
        const tight = exp(r.mul(r).mul(halo.tight).negate());
        const wide = exp(r.mul(r).mul(halo.wide).negate());
        /* The edge of the card must be exactly zero or additive blending shows a square. */
        const cut = smoothstep(1, 0.72, r);

        return vec3(0.95, 0.97, 1).mul(shared.color).mul(tight.add(wide.mul(halo.wideAmount)).mul(cut).mul(halo.intensity));
    })();

    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMaterial);
    haloMesh.scale.setScalar(halo.size);
    haloMesh.position.set(0, CORE, 0);
    haloMesh.renderOrder = 10;
    haloMesh.frustumCulled = false;

    const group = new THREE.Group();
    group.add(beamMesh, haloMesh);

    return {
        group,
        shared,
        color: shared.color,
        beam,
        halo,

        /* Both cards face the camera: a plane turned to the viewer has no silhouette. */
        face(camera)
        {
            beamMesh.rotation.y = Math.atan2(camera.position.x, camera.position.z);
            haloMesh.quaternion.copy(camera.quaternion);
            haloMesh.scale.setScalar(halo.size);
        },
    };
}
