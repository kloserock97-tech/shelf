/* Demo content for both pages: four made-up product cases and their cover art, drawn in SVG (viewBox 320×200).
   A plain script, so the pages can render before their first paint. */
window.PROJECTS = [
  {
    id: 'ledger', title: 'Ledger', kicker: 'Invoicing for freelancers', year: '2025',
    role: 'Lead product designer', team: '2 designers, 5 engineers', time: '5 months',
    lede: 'Freelancers dreaded month-end. Sending an invoice went from six minutes of form-filling to one screen they finish before the kettle boils.',
    stats: [['48 s', 'median time to send an invoice, from 6 min'], ['3×', 'more invoices sent from a phone'], ['−62%', 'support tickets about VAT']],
    sections: [
      ['The problem', 'Every invoice started from a blank form with 23 fields. Most matched last month’s, and VAT rules changed with the client’s country, so people copied old PDFs and fixed them by hand.'],
      ['What changed', 'An invoice now starts from the last one for that client. VAT is worked out from the client’s country and explained in a sentence, not a code. Sending, reminding and marking as paid live on the same screen.']
    ]
  },
  {
    id: 'harbor', title: 'Harbor', kicker: 'Berth planning for a container port', year: '2024',
    role: 'Senior product designer', team: '1 designer, 1 researcher, 8 engineers', time: '8 months',
    lede: 'Berth planners juggled three systems and a whiteboard. One live map of the quay now shows who is docked, who is late and where the next ship fits.',
    stats: [['−35%', 'idle berth hours'], ['12 → 1', 'screens a planner keeps open'], ['4.6 / 5', 'planner rating after rollout']],
    sections: [
      ['The problem', 'Arrivals lived in one system, cranes in another, and the real plan on a whiteboard photographed at every shift change. Delays were found out by phone.'],
      ['What changed', 'A single map of the quay, refreshed from ship positions every minute. Late ships drift into a queue at the side; dropping one onto a berth checks cranes and crews before it confirms.']
    ]
  },
  {
    id: 'fieldnote', title: 'Fieldnote', kicker: 'Research repository for product teams', year: '2023',
    role: 'Product designer', team: '3 designers, 4 engineers', time: '6 months',
    lede: 'Interviews ended up in forty folders nobody opened twice. Fieldnote turns every note into a quotable fact with its source attached.',
    stats: [['2,400', 'notes tagged in the first quarter'], ['4×', 'studies that cite earlier research'], ['9 min', 'to answer “have we heard this before?”']],
    sections: [
      ['The problem', 'Findings were locked in slide decks. New studies started from zero because nobody could find what the last team learned, or trust a quote without its context.'],
      ['What changed', 'A note is the smallest unit: a quote, who said it, when, and in which study. Clusters form from tags, and every insight links back to the words it came from.']
    ]
  },
  {
    id: 'tandem', title: 'Tandem', kicker: 'Bike sharing for two', year: '2022',
    role: 'Product designer', team: '2 designers, 6 engineers', time: '4 months',
    lede: 'Riding together meant two accounts, two unlocks and two receipts. Now one person unlocks a bike for a friend and the ride is split afterwards.',
    stats: [['+28%', 'weekend rides with two bikes or more'], ['1 tap', 'to add a friend’s bike'], ['−41%', 'unlocks abandoned at the dock']],
    sections: [
      ['The problem', 'Friends gave up at the dock: the second person had to install the app, sign up and add a card while the first waited with a bike already running.'],
      ['What changed', 'The first rider can unlock up to three bikes. Guests ride without an account, and the cost is split with a link after the ride, not before it.']
    ]
  }
];

window.projectArt = function projectArt(id, label, attrs = '') {
  const rows = (x, y0, widths) => widths.map((w, i) => {
    const y = y0 + i * 26;
    return `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="var(--m-line)"/><rect x="270" y="${y}" width="34" height="6" rx="3" fill="var(--m-line)"/><rect x="${x}" y="${y + 15}" width="${304 - x}" height="0.75" fill="var(--m-line)"/>`;
  }).join('');
  const notes = (ox, oy, spots, strong) => spots.map(([x, y], i) =>
    `<rect x="${ox + x}" y="${oy + y}" width="26" height="26" rx="4" fill="${i === strong ? 'var(--ink)' : 'var(--ink-soft)'}"/>`).join('');
  const art = {
    ledger: `<rect width="320" height="200" fill="var(--m-surface)"/>
      <rect width="64" height="200" fill="var(--m-side)"/>
      <rect x="14" y="16" width="22" height="22" rx="6" fill="var(--ink)"/>
      <rect x="14" y="54" width="36" height="5" rx="2.5" fill="var(--ink)"/>
      <rect x="14" y="70" width="30" height="5" rx="2.5" fill="var(--m-line)"/><rect x="14" y="86" width="34" height="5" rx="2.5" fill="var(--m-line)"/><rect x="14" y="102" width="26" height="5" rx="2.5" fill="var(--m-line)"/>
      <text x="82" y="31" class="t-sub">Invoice 0142 · Studio Nord</text>
      <text x="82" y="60" class="t-big">€4,280.00</text>
      <rect x="238" y="18" width="66" height="24" rx="12" fill="var(--ink)"/><text x="271" y="34" class="t-btn">Send</text>
      ${rows(82, 84, [96, 120, 80, 104])}
      <rect x="208" y="178" width="96" height="16" rx="8" fill="var(--ink-soft)"/><text x="256" y="189.5" class="t-pill">Due in 14 days</text>`,
    harbor: `<rect width="320" height="200" fill="var(--m-surface)"/>
      <text x="16" y="28" class="t-sub">Berths · today</text>
      <text x="16" y="54" class="t-big">31 ships</text>
      <rect x="16" y="68" width="190" height="118" rx="10" fill="var(--ink-soft)"/>
      <rect x="40" y="68" width="8" height="86" fill="var(--m-surface)"/><rect x="100" y="68" width="8" height="86" fill="var(--m-surface)"/><rect x="160" y="68" width="8" height="86" fill="var(--m-surface)"/>
      <rect x="52" y="76" width="16" height="46" rx="5" fill="var(--ink)"/><rect x="24" y="84" width="12" height="36" rx="4" fill="var(--m-sub)"/>
      <rect x="112" y="76" width="16" height="60" rx="5" fill="var(--ink)"/><rect x="172" y="80" width="14" height="40" rx="4" fill="var(--m-sub)"/>
      <rect x="136" y="160" width="46" height="14" rx="5" fill="var(--ink)" opacity="0.55"/>
      <circle cx="228" cy="78" r="4" fill="var(--ink)"/><rect x="240" y="75" width="64" height="6" rx="3" fill="var(--m-line)"/>
      <circle cx="228" cy="98" r="4" fill="var(--ink)"/><rect x="240" y="95" width="48" height="6" rx="3" fill="var(--m-line)"/>
      <circle cx="228" cy="118" r="4" fill="var(--m-sub)"/><rect x="240" y="115" width="56" height="6" rx="3" fill="var(--m-line)"/>
      <path d="M222 178 238 168l16 4 16-16 16 5 18-17" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    fieldnote: `<rect width="320" height="200" fill="var(--m-surface)"/>
      <rect x="16" y="14" width="288" height="26" rx="13" fill="var(--m-side)"/>
      <circle cx="33" cy="26" r="5" fill="none" stroke="var(--m-sub)" stroke-width="1.6"/><path d="m37 30 4 4" stroke="var(--m-sub)" stroke-width="1.6" stroke-linecap="round"/>
      <text x="48" y="31" class="t-sub">onboarding drop-off</text>
      ${notes(20, 54, [[0, 0], [30, 0], [0, 30], [30, 30], [60, 14]], 1)}
      ${notes(124, 56, [[0, 6], [30, 0], [60, 8], [30, 30]], 3)}
      ${notes(226, 52, [[0, 0], [30, 4], [14, 32], [44, 34]], 0)}
      <rect x="16" y="140" width="288" height="48" rx="10" fill="var(--m-side)"/><rect x="16" y="140" width="4" height="48" fill="var(--ink)"/>
      <text x="30" y="160" class="t-quote">“I didn’t know the trial had started.”</text>
      <text x="30" y="177" class="t-sub">P7 · interview, week 2</text>`,
    tandem: `<rect width="320" height="200" fill="var(--ink-soft)"/>
      <path d="M0 60h320M0 140h320M80 0v200M212 0v200M0 196 150 0" stroke="var(--m-surface)" stroke-width="9" opacity="0.8"/>
      <rect x="226" y="74" width="80" height="54" rx="10" fill="var(--m-surface)" opacity="0.45"/>
      <path d="M40 170 80 140V60h132V30" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="40" cy="170" r="6" fill="var(--m-surface)" stroke="var(--ink)" stroke-width="3"/>
      <circle cx="212" cy="30" r="12" fill="var(--ink)"/><circle cx="207" cy="32" r="3.2" fill="none" stroke="var(--m-surface)" stroke-width="1.6"/><circle cx="217" cy="32" r="3.2" fill="none" stroke="var(--m-surface)" stroke-width="1.6"/>
      <rect x="192" y="146" width="116" height="42" rx="10" fill="var(--m-surface)"/>
      <text x="204" y="163" class="t-card">2 bikes · 3 min</text><text x="204" y="178" class="t-sub">Ride together</text>`
  }[id];
  return `<svg ${attrs} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">${art}</svg>`;
};
