/* Defaults, presets, and the address bar.
 *
 * Every setting that changes the picture is a plain number or string here, so a look can travel:
 * the panel writes the ones that differ from the defaults into the URL hash, and opening that link
 * reproduces the cloud exactly. Short keys keep the link readable. */

export const DEFAULTS = {
    count: 80000,
    spread: 96,
    radius: 0.85,
    frequency: 0.5,
    speed: 6,
    spray: 0.05,
    steps: 3,
    probes: 6,
    focus: 6.2,
    fstop: 3.2,
    pointScale: 2,
    opacity: 1,
    color: "#ffffff",
    background: "#06070a",
    autoRotate: true,
    rotateSpeed: 0.35,
    paused: false,
};

/* Looks the field can take without touching anything else. They are not modes: each one is just a
   handful of the same sliders in a different place. */
export const PRESETS = {
    bubble: {},
    nebula: { frequency: 0.3, spray: 0.35, fstop: 1.8, speed: 3, opacity: 0.85, count: 70000, radius: 0.72, color: "#cfe3ff" },
    /* Threads come from a small seed spread and more trace steps: neighbours start close in the noise
       and walk the same streamline, so they draw a line together instead of scattering. */
    threads: { frequency: 0.35, spray: -0.1, steps: 4, fstop: 5.6, speed: 4, count: 90000, spread: 32, pointScale: 1.6 },
    ember: { frequency: 0.7, spray: 0.2, fstop: 2.4, speed: 5, color: "#ffb47a", background: "#140b06", pointScale: 1.8, radius: 0.8 },
    ink: { frequency: 0.4, spray: -0.2, fstop: 4, speed: 2, color: "#101014", background: "#f1f0ea", opacity: 0.7, pointScale: 1.6 },
};

const KEYS = {
    count: "n", spread: "sp", radius: "r", frequency: "fq", speed: "s", spray: "sy", steps: "st",
    probes: "p", focus: "f", fstop: "fs", pointScale: "ps", opacity: "op", color: "col",
    background: "bg", autoRotate: "ar", rotateSpeed: "rs", paused: "pa",
};

const FROM_KEY = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [key, name]));

export function readUrl()
{
    const out = {};
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));

    for(const [key, raw] of params)
    {
        const name = FROM_KEY[key];
        if(name === undefined) continue;

        const fallback = DEFAULTS[name];

        if(typeof fallback === "number") { const value = Number(raw); if(Number.isFinite(value)) out[name] = value; }
        else if(typeof fallback === "boolean") out[name] = raw === "1";
        else if(/^#?[0-9a-f]{3,8}$/i.test(raw)) out[name] = raw.startsWith("#") ? raw : `#${raw}`;
    }

    return out;
}

export function writeUrl(settings)
{
    const params = new URLSearchParams();

    for(const [name, key] of Object.entries(KEYS))
    {
        const value = settings[name];
        if(value === DEFAULTS[name]) continue;

        if(typeof value === "boolean") params.set(key, value ? "1" : "0");
        else if(typeof value === "number") params.set(key, String(Math.round(value * 1000) / 1000));
        else params.set(key, String(value).replace(/^#/, ""));
    }

    const hash = params.toString();
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}
