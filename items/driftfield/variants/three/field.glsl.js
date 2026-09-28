/* The flow field and the lens, as shader source.
 *
 * Both stages are plain GLSL strings so the interesting part of the project sits in one file you can
 * read top to bottom. The number of trace steps and the number of curl probes arrive as #defines:
 * changing them rebuilds the program once and keeps the inner loops fully unrolled. */

export const vertexShader = /* glsl */ `
precision highp float;

attribute vec3 aSeed;

uniform float uTime;        // field time, already scaled by speed on the CPU side
uniform float uFrequency;   // field scale: low is broad sheets, high is fine tangles
uniform float uSpray;       // how far points are thrown off the shell, can go negative to pull them in
uniform float uRadius;      // cloud size in world units
uniform float uFocus;       // distance from the camera to the plane of focus
uniform float uFStop;       // f-number, 1.4 to 16: small numbers mean a wide aperture and heavy blur
uniform float uScreenScale; // viewport height / (2 tan(fov/2)): world units to pixels at depth 1
uniform float uPointScale;  // user multiplier on top of the optical size

varying float vLight;

/* Focal length of the virtual lens in world units. With the camera about six units away this behaves
   like a short telephoto: enough blur to see the depth, not so much that everything melts. */
const float FOCAL = 0.35;

/* Smallest visible dot, in world units at the focus distance. Everything else is measured against it. */
const float GRAIN = 0.0021;

vec3 hash33(vec3 p)
{
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));

    return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

/* Gradient noise with a quintic fade. Values land in roughly -1 to 1. */
float gnoise(vec3 p)
{
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    return mix(mix(mix(dot(hash33(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
                       dot(hash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
                   mix(dot(hash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
                       dot(hash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
               mix(mix(dot(hash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
                       dot(hash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
                   mix(dot(hash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
                       dot(hash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}

/* A vector potential: three decorrelated noise channels. */
vec3 potential(vec3 p)
{
    return vec3(gnoise(p), gnoise(p + vec3(19.19, 7.31, 3.77)), gnoise(p - vec3(11.53, 23.07, 5.41)));
}

/* Curl of the potential, by finite differences.
 *
 * A velocity field built as a curl is divergence-free: it has no sources and no sinks, so points
 * flowing through it never bunch up and never drain away. The derivatives are taken per axis; with
 * PROBES 6 they are central differences, with PROBES 3 they are one-sided against a single sample
 * at the centre, which is about a third cheaper and a little softer. */
vec3 curl(vec3 p)
{
    const float h = 0.08;

    #if PROBES == 3
        vec3 c = potential(p);
        vec3 dx = (potential(p + vec3(h, 0.0, 0.0)) - c) / h;
        vec3 dy = (potential(p + vec3(0.0, h, 0.0)) - c) / h;
        vec3 dz = (potential(p + vec3(0.0, 0.0, h)) - c) / h;
    #else
        vec3 dx = (potential(p + vec3(h, 0.0, 0.0)) - potential(p - vec3(h, 0.0, 0.0))) / (2.0 * h);
        vec3 dy = (potential(p + vec3(0.0, h, 0.0)) - potential(p - vec3(0.0, h, 0.0))) / (2.0 * h);
        vec3 dz = (potential(p + vec3(0.0, 0.0, h)) - potential(p - vec3(0.0, 0.0, h))) / (2.0 * h);
    #endif

    return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x);
}

/* Where a point that started at "seed" is right now.
 *
 * 1. Landing. The direction of the field at the seed, normalised, is a point on the unit sphere.
 *    That normalisation is the only reason the cloud is round.
 * 2. Tracing. From there the point follows the field for a few short strides, each one shorter than
 *    the last and sampled at a finer scale, the way you would integrate a streamline. Neighbours that
 *    land close together walk the same path, which is what draws threads instead of noise.
 * 3. Spray. A slow noise over the sphere decides how far each patch sits from the shell. It is left
 *    unclamped on purpose: where it dips below zero the points sink inside, where it peaks they are
 *    thrown out, and the silhouette tears instead of staying a clean ball. */
vec3 place(vec3 seed)
{
    vec3 flow = vec3(uTime * 0.61, uTime, uTime * -0.37);
    vec3 dir = normalize(curl(seed * uFrequency + flow));

    vec3 p = dir;
    float stride = 0.34;
    float scale = 1.7;

    for(int i = 0; i < STEPS; i++)
    {
        vec3 v = curl(p * uFrequency * scale + flow * 0.5 + float(i) * 4.1);
        p += normalize(v) * stride;
        stride *= 0.57;
        scale *= 1.9;
    }

    float lift = gnoise(dir * 2.3 + flow * 0.3);
    float radius = max(0.02, 1.0 + (lift + uSpray) * 0.65);

    return normalize(p) * radius;
}

void main()
{
    vec3 local = place(aSeed) * uRadius;

    vec4 viewPosition = modelViewMatrix * vec4(local, 1.0);
    float depth = max(-viewPosition.z, 0.01);

    /* Thin-lens circle of confusion. The aperture diameter is focal length over f-number; the blur
       disc grows with how far the point is from the plane of focus, relative to its own distance. */
    float aperture = FOCAL / uFStop;
    float coc = aperture * abs(depth - uFocus) / depth * (FOCAL / max(uFocus - FOCAL, 0.01)) * 18.0;

    float sharp = GRAIN * uRadius;
    float size = (sharp + coc * uRadius) * uPointScale;

    /* The light a point carries is fixed; spread over a bigger disc it gets dimmer by the ratio of the
       areas. A floor keeps the far haze from vanishing completely. */
    vLight = clamp(pow(sharp / (sharp + coc * uRadius), 2.0) * 1.15, 0.03, 1.0);

    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(size * uScreenScale / depth, 1.0, 220.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uOpacity;

varying float vLight;

void main()
{
    /* A round disc with a soft rim: bokeh takes the shape of the aperture, and apertures are round. */
    vec2 offset = gl_PointCoord * 2.0 - 1.0;
    float disc = 1.0 - smoothstep(0.78, 1.0, length(offset));

    float alpha = disc * vLight * uOpacity;
    if(alpha <= 0.002) discard;

    gl_FragColor = vec4(uColor, alpha);
}
`;
