/**
 * Builds the round 2 post-test survey from the copy of the round 1 form.
 * Run setUpRound2Survey() once in Google Apps Script (script.new). It only edits the form with FORM_ID.
 *
 * What it does:
 *  - Title and intro say Round 2.
 *  - Adds a section "Using the app" with the System Usability Scale (SUS, Brooke 1996): 10 items, 1–5, standard wording.
 *  - In "Your experience with the app", keeps the 4 round-1 items used for comparison (5, 7, 9, 10) and removes the rest.
 *  - Background (sections 2–4) and the last questions stay exactly as in round 1.
 */
const FORM_ID = '1Y6XUTN30sPrz_cdLY0zAMtCwZH5eMFct29cQczxno_Y';

const SUS = [
  'I think that I would like to use this app frequently.',
  'I found the app unnecessarily complex.',
  'I thought the app was easy to use.',
  'I think that I would need the support of a technical person to be able to use this app.',
  'I found the various functions in this app were well integrated.',
  'I thought there was too much inconsistency in this app.',
  'I would imagine that most people would learn to use this app very quickly.',
  'I found the app very cumbersome to use.',
  'I felt very confident using the app.',
  'I needed to learn a lot of things before I could get going with this app.',
];
// round 1 items kept for comparison (titles start with these numbers)
const KEEP = ['5.', '7.', '9.', '10.'];

function setUpRound2Survey() {
  const form = FormApp.openById(FORM_ID);
  form.setTitle('Robot Vacuum App – Post-Test Survey · Round 2');
  form.setDescription('Thank you for taking part. This survey takes about 5 minutes. There are no right or wrong answers.');

  const items = form.getItems();
  const experience = items.find(i => i.getType() === FormApp.ItemType.PAGE_BREAK && i.getTitle() === 'Your experience with the app');
  if (!experience) throw new Error('Section "Your experience with the app" not found');
  if (items.some(i => i.getType() === FormApp.ItemType.PAGE_BREAK && i.getTitle() === 'Using the app')) throw new Error('Already set up: the SUS section exists');

  // remove the round 1 items that SUS replaces, keep the 4 for comparison
  const start = experience.getIndex();
  const next = items.find(i => i.getIndex() > start && i.getType() === FormApp.ItemType.PAGE_BREAK);
  const end = next ? next.getIndex() : items.length;
  const removed = [];
  items.filter(i => i.getIndex() > start && i.getIndex() < end && i.getType() === FormApp.ItemType.SCALE)
    .filter(i => !KEEP.some(k => i.getTitle().startsWith(k + ' ')))
    .forEach(i => { removed.push(i.getTitle()); form.deleteItem(i); });
  // renumber the kept items 1–4
  let n = 0;
  form.getItems().filter(i => i.getType() === FormApp.ItemType.SCALE && KEEP.some(k => i.getTitle().startsWith(k + ' ')))
    .forEach(i => i.setTitle((++n) + '. ' + i.getTitle().replace(/^\d+\.\s*/, '')));
  experience.setHelpText('Each line has two opposite words. Pick the number that best matches your impression. Decide quickly — your first impression counts. Please answer every line.');

  // SUS section, placed right before "Your experience with the app"
  const at = form.getItems().find(i => i.getTitle() === 'Your experience with the app').getIndex();
  const page = form.addPageBreakItem().setTitle('Using the app')
    .setHelpText('For each statement, pick how much you agree. Answer every one, and go with your first reaction.');
  form.moveItem(page.getIndex(), at);
  SUS.forEach((q, k) => {
    const item = form.addScaleItem().setTitle((k + 1) + '. ' + q).setBounds(1, 5)
      .setLabels('Strongly disagree', 'Strongly agree').setRequired(true);
    form.moveItem(item.getIndex(), at + 1 + k);
  });

  Logger.log('Removed: ' + removed.join(' | '));
  Logger.log('Edit: ' + form.getEditUrl());
}

/**
 * Second pass: shorter background, and a round 1 question with no skipping.
 *  - Section "About you" keeps age, gender, comfort with technology, comfort with devices deciding, and owning a robot vacuum.
 *  - Sections "Your robot vacuum" and "About robot vacuums" are removed (asked in round 1).
 *  - Adds "Did you take part in the first round?" after the participant ID. Everyone answers every section.
 */
const DROP = ['Occupation', 'Who do you live with?', 'Pets at home', 'Home type', 'Which smart home devices do you use?'];
const DROP_SECTIONS = ['Your robot vacuum', 'About robot vacuums'];

function trimBackground() {
  const form = FormApp.openById(FORM_ID);
  const removed = [];
  // the ownership question may send people to the sections being removed: make it a plain question
  const own = form.getItems().find(i => i.getTitle() === 'Do you own or use a robot vacuum?');
  if (own) { const mc = own.asMultipleChoiceItem(); mc.setChoiceValues(mc.getChoices().map(c => c.getValue())); }
  form.getItems().filter(i => DROP.includes(i.getTitle())).forEach(i => { removed.push(i.getTitle()); form.deleteItem(i); });
  DROP_SECTIONS.forEach(title => {
    const items = form.getItems();
    const page = items.find(i => i.getType() === FormApp.ItemType.PAGE_BREAK && i.getTitle() === title);
    if (!page) return;
    const next = items.find(i => i.getIndex() > page.getIndex() && i.getType() === FormApp.ItemType.PAGE_BREAK);
    items.filter(i => i.getIndex() > page.getIndex() && (!next || i.getIndex() < next.getIndex()))
      .forEach(i => { removed.push(title + ' › ' + i.getTitle()); form.deleteItem(i); });
    removed.push('section ' + title); form.deleteItem(page);
  });
  if (!form.getItems().some(i => i.getTitle() === 'Did you take part in the first round?')) {
    const q = form.addMultipleChoiceItem().setTitle('Did you take part in the first round?')
      .setHelpText('The first round was a few weeks ago, with an earlier version of this app.')
      .setChoiceValues(['Yes', 'No', 'Not sure']);
    q.setRequired(true); // set on its own: chained after setChoiceValues it didn't stick
    const id = form.getItems().find(i => i.getTitle() === 'Participant ID');
    form.moveItem(q.getIndex(), id.getIndex() + 1);
  }
  Logger.log('Removed: ' + removed.join(' | '));
}

/**
 * Third pass: every round 1 item runs negative (left, 1) → positive (right, 7), so a quick reader can't misread one.
 * Round 1 had items 2 and 4 the other way round: when comparing, reverse those round 1 answers (8 − score).
 */
const FLIP = {
  "I trusted the robot's decisions": ["I distrusted the robot's decisions", "I trusted the robot's decisions"],
  'Effortless to keep track of': ['Demanding to keep track of', 'Effortless to keep track of'],
};
function flipReversedItems() {
  const form = FormApp.openById(FORM_ID);
  const done = [];
  form.getItems(FormApp.ItemType.SCALE).forEach(i => {
    const s = i.asScaleItem(), pair = FLIP[s.getLeftLabel()];
    if (!pair) return;
    const num = (i.getTitle().match(/^\d+\.\s*/) || [''])[0];
    s.setLabels(pair[0], pair[1]);
    i.setTitle(num + pair[0] + ' ←→ ' + pair[1]);
    done.push(i.getTitle());
  });
  Logger.log('Flipped: ' + done.join(' | '));
}
