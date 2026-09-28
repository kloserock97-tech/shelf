/* Display typograph for Russian and English: puts non-breaking spaces where a line must not break.
   It only touches what goes into markup; the source texts stay as they are.

   Rules:
   1) after a one- or two-letter word (в, и, на, не, по, a, I, of, to…) the space is non-breaking;
   2) before the particles «же», «бы», «ли», «б», «ж»;
   3) before a dash, so the dash never starts a line;
   4) between a number and the next word (9 месяцев, 38 %), and around an arrow between numbers (6 → 0);
   5) the last two words of a paragraph stay together when the last one is shorter than six characters,
      so a paragraph never ends with an orphan.

   No lookbehind in any regular expression: old Safari fails to parse the whole file because of it. */
const NB = " ";

const SHORT = /(^|[\s («„“"'])([A-Za-zА-Яа-яЁё]{1,2}) (?=\S)/g;
const PARTICLE = / (же|бы|ли|б|ж)(?=[\s.,;:!?»)]|$)/g;
const DASH = / ([—–])/g;
const NUMBER = /(\d[\d.,]*%?) (?=[A-Za-zА-Яа-яЁё%→₽$€])/g;
/* The arrow is glued on both sides only between numbers («6 → 0»). In a chain of words
   («new → review → approved») only the space before the arrow is non-breaking: otherwise the whole chain
   becomes one unbreakable word and breaks in the middle of a letter on a phone. */
const ARROW = /[  ]?→[  ]?(\d)?/g;
const TAIL = / (\S{1,5})$/;

export function tidy(text: string): string {
  if (!text || text.indexOf(" ") < 0) return text;
  let s = text;
  /* twice: in «и в доме» the second preposition starts with the space the first match has eaten */
  s = s.replace(SHORT, `$1$2${NB}`).replace(SHORT, `$1$2${NB}`);
  s = s.replace(PARTICLE, `${NB}$1`);
  s = s.replace(DASH, `${NB}$1`);
  s = s.replace(NUMBER, `$1${NB}`);
  s = s.replace(ARROW, (_m, digit?: string) => (digit !== undefined ? `${NB}→${NB}${digit}` : `${NB}→ `));
  if (s.length > 40) s = s.replace(TAIL, `${NB}$1`);
  return s;
}
