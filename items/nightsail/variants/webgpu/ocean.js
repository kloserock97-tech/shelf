import * as THREE from "three/webgpu";
import { cameraPosition, color, float, Fn, mix, mx_fractal_noise_float, normalize, positionLocal, positionWorld, smoothstep, uniform, varying, vec2, vec3 } from "three/tsl";

/* A stormy sea under the light.
 *
 * The swell is a sum of four directional sines with sharpened crests, not noise. The reason is the boat:
 * the same height has to be computed on the CPU to float it, and four sines are written once in the
 * shader (`heightNode`) and repeated line for line in `heightAt`. With noise there would be two
 * implementations to keep from drifting apart.
 *
 * Crests are sharpened with a power. A clean sine reads as a gentle swell; a storm is narrow crests and
 * wide troughs between them. */

/* direction x, direction z, wavelength, height, speed */
const WAVES = [
    [0.96, 0.28, 34, 1.0, 0.55],
    [0.55, -0.84, 21, 0.62, 0.8],
    [-0.42, 0.91, 13, 0.34, 1.15],
    [0.8, 0.6, 7, 0.16, 1.7],
];

/* Ripples only bend the normal and never move the surface. Without them the water between crests stays
 * mirror-smooth and the sky lies on it as a flat patch; with them the reflection breaks into glints.
 * They stay out of the height on purpose: the boat would shake with them.
 *
 * direction x, direction z, wavelength, steepness, speed */
const RIPPLES = [
    [0.71, 0.7, 4.2, 0.055, 2.1],
    [-0.62, 0.78, 2.6, 0.038, 2.8],
    [0.94, -0.34, 1.5, 0.022, 3.6],
];

const SEGMENTS = 200;

export function createOcean({ size, level, air, sky, clock, light })
{
    const settings = {
        amplitude: uniform(1.05),
        sharpness: uniform(1.7),

        /* Colours come from the palette of the frame, cold green-grey (G >= B > R). Blue water would read
           as a sticker on it. */
        deep: uniform(color("#0a1114")),
        crest: uniform(color("#1e2a2d")),

        reflect: uniform(0.9),
        ripple: uniform(1.0),
        sss: uniform(0.9),
        sssColor: uniform(color("#4a6468")),

        foam: uniform(color("#d8e2e2")),
        foamStart: uniform(0.62),
        foamAmount: uniform(0.55),
        glint: uniform(1.6),
        gloss: uniform(90),

        glow: uniform(0.35),
        mist: uniform(0.08),
        mistCeiling: uniform(1.1),

        /* 0 hides the sea in the fog colour, 1 shows it. */
        appear: uniform(1),
    };

    const levelUniform = uniform(level);
    const time = clock.shader;

    const heightNode = (worldXZ) =>
    {
        const height = float(0).toVar();

        for(const [dirX, dirZ, length, waveHeight, speed] of WAVES)
        {
            const k = (Math.PI * 2) / length;
            const phase = worldXZ.x.mul(dirX * k).add(worldXZ.y.mul(dirZ * k)).add(time.mul(speed));
            const crest = phase.sin().mul(0.5).add(0.5).pow(settings.sharpness);

            height.addAssign(crest.mul(2).sub(1).mul(settings.amplitude.mul(waveHeight)));
        }

        return height;
    };

    /* The derivative of a sine is known, so the ripple slope is written out instead of sampled. */
    const rippleGradient = (worldXZ) =>
    {
        const gradient = vec2(0).toVar();

        for(const [dirX, dirZ, length, steepness, speed] of RIPPLES)
        {
            const k = (Math.PI * 2) / length;
            const phase = worldXZ.x.mul(dirX * k).add(worldXZ.y.mul(dirZ * k)).add(time.mul(speed));
            const slope = phase.cos().mul(steepness * k);

            gradient.addAssign(vec2(slope.mul(dirX), slope.mul(dirZ)));
        }

        return gradient;
    };

    const geometry = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI * 0.5);

    const material = new THREE.MeshBasicNodeMaterial();

    material.positionNode = Fn(() =>
    {
        const position = positionLocal.toVar();
        position.y.addAssign(heightNode(positionLocal.xz));
        return position;
    })();

    /* The normal is taken per vertex from two finite differences of the same wave function. Screen-space
       derivatives make smooth water faceted: the grid is coarse and the crests are narrow. */
    const surface = varying(Fn(() =>
    {
        const point = positionLocal.xz.toVar();
        const step = float(0.8);

        const here = heightNode(point).toVar();
        const alongX = heightNode(point.add(vec2(step, 0)));
        const alongZ = heightNode(point.add(vec2(0, step)));

        return vec3(here.sub(alongX), step, here.sub(alongZ));
    })());

    material.colorNode = Fn(() =>
    {
        const wave = positionWorld.y.sub(levelUniform).toVar();

        const base = surface.div(surface.y).toVar();
        const slope = vec2(base.x, base.z).toVar();
        const steepness = slope.length().toVar();

        slope.subAssign(rippleGradient(positionWorld.xz).mul(settings.ripple));

        const normal = normalize(vec3(slope.x, 1, slope.y)).toVar();

        /* The column stands in the middle of the scene, just above the water. */
        const toLight = normalize(vec3(positionWorld.x.negate(), levelUniform.add(3).sub(positionWorld.y), positionWorld.z.negate()));
        const facing = normal.dot(toLight).max(0).toVar();
        const toCamera = normalize(cameraPosition.sub(positionWorld)).toVar();

        const amplitude = settings.amplitude.mul(1.4);
        const crestAmount = smoothstep(amplitude.negate(), amplitude, wave).toVar();

        const water = mix(settings.deep, settings.crest, crestAmount.mul(0.65).add(facing.mul(0.35))).toVar();

        /* Reflection of the same panorama that sits behind the sea, read along the reflected ray, so the
           picture on the water matches the picture above it. Schlick fresnel; 0.02 is water head-on. */
        const incident = toCamera.negate();
        const reflected = incident.sub(normal.mul(incident.dot(normal).mul(2)));
        const skyColor = sky.sample(reflected).toVar();

        const grazing = float(1).sub(normal.dot(toCamera).max(0)).clamp(0, 1);
        const fresnel = float(0.02).add(grazing.pow(5).mul(0.98)).toVar();
        water.assign(mix(water, skyColor, fresnel.mul(settings.reflect)));

        /* Light through a thin crest. Without it the crests are as dark as the troughs and the storm
           reads as plasticine. */
        const through = toCamera.dot(toLight.negate()).max(0).pow(3.5);
        const thickness = crestAmount.mul(steepness.clamp(0, 1));
        water.addAssign(settings.sssColor.mul(through.mul(thickness).mul(settings.sss)));

        /* Glint on the half vector: this is what draws the path of light from the column to the viewer. */
        const half = normalize(toLight.add(toCamera));
        water.addAssign(light.color.mul(normal.dot(half).max(0).pow(settings.gloss).mul(settings.glint)));

        /* Foam follows the slope, not the height: it is born where the surface breaks, on the lee cheek
           of a crest, not as a cap on top of every wave. */
        const drift = time.mul(0.25);
        const foamNoise = mx_fractal_noise_float(vec3(positionWorld.x.mul(0.35).add(drift), positionWorld.z.mul(0.35), drift), 3).mul(0.5).add(0.5);
        const breaking = steepness.mul(crestAmount.mul(0.6).add(0.4));
        const foam = smoothstep(settings.foamStart, settings.foamStart.add(0.5), breaking.mul(foamNoise.mul(0.7).add(0.55)));
        water.assign(mix(water, settings.foam, foam.mul(settings.foamAmount)));

        /* Air glowing around the column. */
        const axis = positionWorld.xz.length().toVar();
        water.addAssign(light.color.mul(smoothstep(air.scatterRadius, 0, axis).pow(2).mul(air.scatter).mul(settings.glow)));

        /* Mist lies in the troughs and does not reach the crests, measured from the wave, not the sea level. */
        const mist = smoothstep(settings.mistCeiling, settings.mistCeiling.negate(), wave)
            .mul(smoothstep(air.mistRadius, 0, axis).pow(0.8))
            .mul(settings.mist)
            .clamp(0, 1);
        water.assign(mix(water, air.mistColor, mist));

        const distance = positionWorld.sub(vec3(0, levelUniform, 0)).length();
        const fog = smoothstep(air.fogNear, air.fogFar, distance).max(settings.appear.oneMinus());

        return mix(water, air.fogColor, fog);
    })();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = level;
    mesh.frustumCulled = false;

    /* The tide: a slow rise and fall of the whole sea on top of the swell. It is what lets the statue
       drown and surface again, so it lives on the CPU and is handed to the shader as the level. */
    const tide = { height: 6.5, period: 18 };

    const ocean = { mesh, settings, level, tide, levelNow: level, levelUniform, heightNode };

    ocean.update = (time) =>
    {
        ocean.levelNow = level + Math.sin((time / Math.max(tide.period, 0.5)) * Math.PI * 2) * tide.height;
        levelUniform.value = ocean.levelNow;
        mesh.position.y = ocean.levelNow;
    };

    ocean.heightAt = (x, z) =>
    {
        const t = clock.shaderSeconds;
        const sharpness = settings.sharpness.value;
        const amplitudeValue = settings.amplitude.value;
        let height = 0;

        for(const [dirX, dirZ, length, waveHeight, speed] of WAVES)
        {
            const k = (Math.PI * 2) / length;
            const crest = Math.pow(Math.sin(x * dirX * k + z * dirZ * k + t * speed) * 0.5 + 0.5, sharpness);
            height += (crest * 2 - 1) * amplitudeValue * waveHeight;
        }

        return height;
    };

    ocean.slopeAt = (x, z, step = 0.8) => ({
        x: (ocean.heightAt(x + step, z) - ocean.heightAt(x - step, z)) / (step * 2),
        z: (ocean.heightAt(x, z + step) - ocean.heightAt(x, z - step)) / (step * 2),
    });

    return ocean;
}
