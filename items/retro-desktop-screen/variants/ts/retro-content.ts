/* What the home page on the retro screen says. Data only: edit it without touching the drawing code.
   The person is made up; the portrait is a drawn placeholder, not a photo. */
export type RetroIcon = "game" | "cube" | "spark";
export type RetroContent = {
  windowTitle: string;
  address: string;
  /** the button of the window on the taskbar */
  site: string;
  tagline: string;
  /** the small line under the name on the first screen */
  heroLine: string;
  /** three buttons of the first screen; each one scrolls the page to its section (about, hobbies, contact) */
  heroButtons: [string, string, string];
  sections: [string, string, string, string];
  /** the first row is the name: it is also the big title of the first screen */
  profile: [string, string][];
  hello: string;
  now: string[];
  hobbies: { icon: RetroIcon; text: string }[];
  quote: string;
  contacts: [string, string][];
  visitors: string;
  footer: [string, string];
};

export const SAMPLE_CONTENT: RetroContent = {
  windowTitle: "Noa Linden | Home Page",
  address: "http://www.example.com/~noa/index.htm",
  site: "Noa's Home Page",
  tagline: "Interface Designer",
  heroLine: "Digital products  •  Interfaces  •  Systems",
  heroButtons: ["About", "Projects", "Contact"],
  sections: ["About me", "What I'm doing now", "Hobbies", "Contact"],
  profile: [
    ["Name", "Noa Linden"],
    ["Occupation", "Interface Designer"],
    ["Languages", "English, Dutch, a little Japanese"],
  ],
  hello: "Hi there! I'm Noa. I design calm software: forms that forgive typos, dashboards that fit on one screen and settings pages nobody has to read twice.",
  now: [
    "Right now I'm redrawing a train timetable app so it works with one thumb on a crowded platform.",
    "In the evenings: a tiny game about a lighthouse keeper, built one Saturday at a time.",
  ],
  hobbies: [
    { icon: "game", text: "Pixel art and small games. One of them is almost finished." },
    { icon: "cube", text: "3D in Blender. Mostly teapots, honestly." },
    { icon: "spark", text: "Collecting interface manuals from the nineties." },
  ],
  quote: "If it needs a manual, it needs another sketch.",
  contacts: [
    ["E-mail", "hello@example.com"],
    ["Homepage", "www.example.com/~noa"],
    ["Webring", "Calm Interfaces Ring"],
  ],
  visitors: "000026",
  footer: ["Best viewed at 1024×768 · Last updated: September 2026", "Made with Notepad and a lot of patience"],
};
