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
