// Demo: a mail inbox. Refresh brings new mail, New opens a draft, Search opens the field and filters the list.
import { multiPull } from '../variants/html/multi-pull.js';

const MAIL = [
  ['Maren Visser', '09:24', 'Moodboard for the Linden rebrand', 'Dropped the three directions into the shared folder. I lean towards the second one, the one with the warmer greys.', true],
  ['Paperline Invoices', '08:02', 'Invoice INV-2291 is ready', 'Your September invoice for €48.00 is attached. It will be charged to the card ending 4417 on 3 October.', true],
  ['Jonas Berg', 'Yesterday', 'Re: Thursday workshop', 'Works for me. I’ll bring the printed flows and some tape, we can do the wall exercise again if people are up for it.'],
  ['Northwind Studio', 'Yesterday', 'Your build is live', 'Version 2.4 is on the staging link. Changes: faster search, the empty state for new teams, and the fixed date picker.'],
  ['Aisha Rahman', 'Yesterday', 'Coffee next week?', 'I’m in Amsterdam from Tuesday to Friday and would love to hear how the new role is going. Any morning works.'],
  ['Calendar', 'Monday', 'Updated: Design critique', 'Design critique moved to Friday, 14:00 to 15:00, room Keizer. Your reply was kept.'],
  ['Lotte de Wit', 'Monday', 'Photos from the offsite', 'Here are the ones from the boat. The one of you trying to steer is my favourite so far.'],
  ['Tomás Silva', 'Sunday', 'Research notes, round two', 'Seven interviews done. Short version: people don’t trust the autofill and retype everything anyway.'],
  ['City Library', 'Saturday', 'Your hold is ready', '“Thinking in Systems” is waiting at the front desk until 8 October.'],
  ['Ruth Anand', 'Saturday', 'Tickets for Saturday', 'Got two for the late show at De Kade. Doors at 21:30, I’ll meet you by the canal.'],
  ['Amsterdam UX Meetup', 'Friday', 'This month: accessible motion', 'Three short talks on motion that respects reduced-motion settings, then drinks. RSVP by Wednesday.'],
  ['Figtree Bank', '26 Sep', 'Your September statement', 'Your statement is ready in the app. Nothing needs your attention this month.']
];
const INCOMING = [
  [['Maren Visser', 'Now', 'Re: Moodboard for the Linden rebrand', 'One more thought: the second direction also works in dark mode, see the last page.', true],
    ['Postbode Parcels', 'Now', 'Your parcel is on its way', 'Delivery between 14:00 and 16:00 today. You can pick a neighbour or a safe place in the app.', true]],
  [['Jonas Berg', 'Now', 'Room booked', 'Got the big room for Thursday. There is a whiteboard, but bring the tape anyway.', true]]
];

const list = document.getElementById('mail');
const app = document.getElementById('app');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const row = ([who, when, subj, prev, unread], isNew) =>
  `<li class="${unread ? 'is-unread' : ''}${isNew ? ' is-new' : ''}"><div class="top"><span class="who">${esc(who)}</span><span class="when">${when}</span></div><div class="subj">${esc(subj)}</div><div class="prev">${esc(prev)}</div></li>`;
list.innerHTML = MAIL.map((m) => row(m)).join('');

// ---------- toast ----------
const toastEl = document.querySelector('.toast');
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('is-on'), 1800);
}

// ---------- search ----------
const scroller = document.querySelector('.mp__scroller');
const search = document.querySelector('.search');
const field = search.querySelector('input');
function openSearch() {
  scroller.scrollTop = 0;
  scroller.classList.add('is-searching');
  search.inert = false;
  field.focus({ preventScroll: true });
}
function closeSearch() {
  scroller.classList.remove('is-searching');
  search.inert = true;
  field.value = '';
  filter();
  scroller.focus({ preventScroll: true });
}
function filter() {
  const q = field.value.trim().toLowerCase();
  let shown = 0;
  for (const li of list.children) {
    if (li.classList.contains('empty')) continue;
    const hit = !q || li.textContent.toLowerCase().includes(q);
    li.hidden = !hit;
    shown += hit;
  }
  list.querySelector('.empty')?.remove();
  if (!shown) list.insertAdjacentHTML('beforeend', `<li class="empty">No messages match “${esc(field.value.trim())}”.</li>`);
}
field.addEventListener('input', filter);
field.addEventListener('keydown', (e) => e.key === 'Escape' && closeSearch());
search.querySelector('.search__cancel').addEventListener('click', closeSearch);

// ---------- compose ----------
const compose = document.querySelector('.compose');
const to = compose.querySelector('input[type="email"]');
const send = compose.querySelector('[data-send]');
let returnFocus = null;
function openCompose() {
  returnFocus = document.activeElement;
  app.classList.add('composing');
  setTimeout(() => to.focus({ preventScroll: true }), 60);
}
function closeCompose(sent) {
  app.classList.remove('composing');
  compose.querySelectorAll('input, textarea').forEach((f) => (f.value = ''));
  send.disabled = true;
  (returnFocus?.isConnected ? returnFocus : scroller).focus({ preventScroll: true });
  if (sent) toast('Message sent');
}
to.addEventListener('input', () => (send.disabled = !to.value.includes('@')));
compose.querySelector('[data-close]').addEventListener('click', () => closeCompose(false));
send.addEventListener('click', () => closeCompose(true));
document.querySelector('.scrim').addEventListener('click', () => closeCompose(false));
compose.addEventListener('keydown', (e) => e.key === 'Escape' && closeCompose(false));

// ---------- refresh ----------
let batch = 0;
function refresh() {
  return new Promise((done) => setTimeout(() => {
    const next = INCOMING[batch++];
    if (next) {
      list.insertAdjacentHTML('afterbegin', next.map((m) => row(m, true)).join(''));
      toast(next.length === 1 ? '1 new message' : `${next.length} new messages`);
    } else {
      toast('No new mail');
    }
    document.getElementById('updated').textContent = 'Updated just now';
    done();
  }, 1100));
}

// ---------- the pull ----------
const SOUND_KEY = 'shelf.multi-pull.sound';
let soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch { /* storage blocked */ }
const soundBtn = document.getElementById('sound');
const drawSound = () => {
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.innerHTML = `<svg class="i" viewBox="0 0 24 24"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/>${soundOn ? '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>' : '<path d="m16 9.5 5 5M21 9.5l-5 5"/>'}</svg>`;
};
drawSound();

const pull = multiPull(document.querySelector('.mp'), {
  sound: soundOn,
  onAction: (name) => {
    if (name === 'refresh') return refresh();
    if (name === 'new') openCompose();
    if (name === 'search') openSearch();
  }
});
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch { /* storage blocked */ }
  drawSound();
  pull.setSound(soundOn);
});

// ?shot=1: frozen mid-pull, all three open, the thumb drifted back to New
if (new URLSearchParams(location.search).get('shot')) {
  pull.freeze(204, 1);
  const r = scroller.getBoundingClientRect();
  const f = document.createElement('i');
  f.className = 'finger';
  f.style.left = `${r.width / 2 - 34}px`;
  f.style.top = `${98 + 204 + 150}px`;
  app.append(f);
}
