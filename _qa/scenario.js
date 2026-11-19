module.exports = async (page, shot) => {
  const stub = () => { window.Android = { toast() {}, vibrate() { window.__vib = (window.__vib || 0) + 1; }, share: t => { window.__shared = t; } }; };
  await page.addInitScript(stub);
  await page.evaluate(stub);
  const wait = (ms = 450) => page.waitForTimeout(ms);
  const expect = async (cond, msg) => { if (!(await cond)) throw new Error('Assertion failed: ' + msg); };

  // 1. Add Biscuit
  await page.click('#wAdd'); await wait();
  await page.click('#pSave'); await wait(200);
  await expect(page.evaluate(() => !localStorage.getItem('gooddays.v1') || JSON.parse(localStorage.getItem('gooddays.v1')).pets.length === 0), 'empty name must not save');
  await page.fill('#favIn', '   '); await page.click('[data-s="favAdd"]');
  await expect(page.locator('.fav-ed').count().then(c => c === 0), 'blank favorite must not be added');
  await page.fill('#pName', 'Biscuit');
  await page.fill('#favIn', 'Greeting at the door'); await page.click('[data-s="favAdd"]');
  await page.fill('#favIn', 'Chasing the ball'); await page.click('[data-s="favAdd"]');
  await page.fill('#favIn', 'Begging at dinner'); await page.click('[data-s="favAdd"]');
  await shot('add-pet');
  await page.click('#pSave'); await wait(600);
  await expect(page.textContent('#question').then(t => t.includes("Biscuit's day")), 'question text');
  await shot('today-empty');

  // 2. Rate good then bad
  await page.click('#rate-good'); await wait();
  await expect(page.$eval('#rate-good', e => e.classList.contains('on')), 'good selected');
  await expect(page.textContent('#toast').then(t => t.includes('Good day logged')), 'toast confirms');
  await expect(page.evaluate(() => window.__vib > 0), 'vibrated');
  await page.reload(); await wait();
  await expect(page.$eval('#rate-good', e => e.classList.contains('on')), 'persist after reload');
  await page.click('#rate-bad'); await wait();
  await expect(page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gooddays.v1')).days[JSON.parse(localStorage.getItem('gooddays.v1')).pets[0].id]).length === 1), 'no duplicate');

  // 3. Backfill 14 days: 4 good, 3 meh, 7 bad incl 3 in a row (today = bad)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gooddays.v1')); const pid = s.pets[0].id;
    const pat = ['good', 'meh', 'bad', 'good', 'bad', 'meh', 'good', 'bad', 'bad', 'meh', 'good', 'bad', 'bad', 'bad'];
    const pad = n => String(n).padStart(2, '0');
    pat.forEach((r, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; s.days[pid][k] = { rating: r, note: i === 8 ? "Wouldn't climb stairs" : '', updatedAt: Date.now() }; });
    localStorage.setItem('gooddays.v1', JSON.stringify(s));
  });
  await page.reload(); await wait();
  await page.click('#win14'); await wait();
  await expect(page.textContent('#status').then(t => t.includes('outnumbering')), 'bad outnumbering');
  await expect(page.$('#streak'), 'streak notice');
  await shot('today-14day-gauge');

  // 4. Calendar
  await page.click('.tabs button[data-tab="calendar"]'); await wait();
  await shot('calendar');
  const calBad = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gooddays.v1')); const pid = s.pets[0].id; const bad = [];
    document.querySelectorAll('.cd[data-k]').forEach(el => { const d = s.days[pid][el.dataset.k];
      if (d && !el.classList.contains('r-' + d.rating)) bad.push(el.dataset.k);
      if (d && d.note && !el.querySelector('.dot')) bad.push('dot ' + el.dataset.k); });
    return bad; });
  if (calBad.length) throw new Error('calendar colors wrong: ' + calBad.join(','));
  // tap the earliest bad day
  const past = await page.$$eval('.cd.r-bad', els => els.map(e => e.dataset.k));
  await page.click(`.cd[data-k="${past[0]}"]`); await wait();
  await page.click('[data-s="r"][data-r="good"]'); await page.click('#dSave'); await wait();
  await expect(page.$eval(`.cd[data-k="${past[0]}"]`, e => e.classList.contains('r-good')), 'calendar edit applied');
  await page.click('.tabs button[data-tab="today"]'); await wait();
  const tinyTxt = await page.textContent('#gauge .tiny');
  if (!/Good 5 ·/.test(tinyTxt)) throw new Error('gauge did not update after calendar edit: ' + tinyTxt);

  // 5. Weekly checks 42 then 31
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gooddays.v1')); const p = s.pets[0];
    const pad = n => String(n).padStart(2, '0'); const d = new Date(); d.setDate(d.getDate() - 7);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const seen = {}; p.favorites.forEach(f => { seen[f.id] = true; });
    s.checks.push({ id: 'c1', petId: p.id, date: k, scores: { hurt: 6, hunger: 6, hydration: 6, hygiene: 6, happiness: 6, mobility: 6, moreGood: 6 }, total: 42, favoritesSeen: seen });
    localStorage.setItem('gooddays.v1', JSON.stringify(s));
  });
  await page.reload(); await wait();
  await page.click('.tabs button[data-tab="check"]'); await wait();
  const set = async (k, v) => page.$eval('#sl-' + k, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await set('hurt', 5); await set('hunger', 5); await set('hydration', 5); await set('hygiene', 5); await set('happiness', 5); await set('mobility', 1); await set('moreGood', 5);
  await expect(page.textContent('#totNum').then(t => t.trim() === '31'), 'total 31');
  await page.locator('.fav').nth(1).locator('button.n').click();
  await page.locator('.fav').nth(0).locator('button.y').click();
  await page.locator('.fav').nth(2).locator('button.y').click();
  await shot('weekly-check');
  await page.click('#saveCheck'); await wait(600);
  await expect(page.textContent('#biggestDrop').then(t => t.includes('Mobility')), 'mobility biggest drop');
  await expect(page.textContent('#favSeen').then(t => t.includes('Not seen since')), 'fav not seen');
  await wait(2600); await shot('trends');

  // 7. Vet summary
  await page.click('.tabs button[data-tab="summary"]'); await wait();
  const sum = await page.textContent('#sumText');
  for (const s of ['Biscuit', 'Good:', 'Longest run', 'Latest: 31', 'Chasing the ball', "Wouldn't climb stairs"]) await expect(Promise.resolve(sum.includes(s)), 'summary has ' + s);
  await page.click('#shareSum'); await wait(200);
  await expect(page.evaluate(() => !!window.__shared), 'share bridge');
  await shot('vet-summary');

  // 8. Second pet Miso
  await page.click('[data-act="addPet"].chip'); await wait();
  await page.fill('#pName', 'Miso'); await page.click('[data-s="sp"][data-v="cat"]');
  await page.click('#pSave'); await wait(600);
  await expect(page.$eval('#rate-good', e => !e.classList.contains('on')), 'Miso empty');
  await page.click('#rate-good'); await wait();
  await shot('second-pet');
  await page.click('.chip:not(.add) >> nth=0'); await wait();
  await expect(page.$eval('#rate-bad', e => e.classList.contains('on')), 'Biscuit still bad today after Miso logged');
  await page.click('.chip:not(.add) >> nth=1'); await wait();
  await expect(page.$eval('#rate-good', e => e.classList.contains('on')), 'Miso good today');

  // 9. Export / reset / import
  const json = await page.evaluate(() => localStorage.getItem('gooddays.v1'));
  await page.click('#btnSettings'); await wait();
  await page.click('[data-s="export"]'); await wait();
  await shot('export');
  await page.click('.layer-wrap:last-child [data-s="close"]'); await wait();
  await page.click('[data-s="reset"]'); await wait();
  await page.click('.dlg [data-s="ok"]'); await wait(600);
  await expect(page.$eval('#welcome', e => !e.hidden), 'welcome after reset');
  await page.click('#wRestore'); await wait();
  await page.fill('#importText', json);
  await page.click('#impGo'); await wait();
  await page.click('.dlg [data-s="ok"]'); await wait(600);
  await expect(page.$$eval('.chip:not(.add)', e => e.length === 2), 'two pets restored');

  // 10. Memorial for Biscuit
  await page.click('.chip:not(.add) >> nth=0'); await wait();
  await page.click('#btnSettings'); await wait();
  await page.click('[data-s="edit"] >> nth=0'); await wait();
  await page.click('#memSwitch'); await wait();
  await page.click('.dlg [data-s="ok"]'); await wait();
  await page.click('#pSave'); await wait(400);
  await page.click('.layer-wrap [data-s="close"]'); await wait(500);
  await expect(page.$('#rate-good').then(e => !e), 'checkin hidden');
  await wait(2600); await shot('memorial');
  await page.click('.tabs button[data-tab="calendar"]'); await wait();
  await expect(page.locator('.cd.r-bad').count().then(c => c > 0), 'memorial history viewable');
  await page.click('.cd.r-bad >> nth=0'); await wait();
  await expect(page.locator('.layer-wrap.open [data-s="r"]').count().then(c => c === 0), 'memorial day read-only');
  await page.evaluate(() => window.onAndroidBack()); await wait();
  await expect(page.locator('.layer-wrap').count().then(c => c === 0), 'back closes sheet');
  const backRes = await page.evaluate(() => window.onAndroidBack()); await wait();
  if (backRes !== true) throw new Error('back from calendar should go to today');
  await expect(page.$eval('.tabs button[data-tab="today"]', e => e.classList.contains('on')), 'back navigated to today');
  const backRoot = await page.evaluate(() => window.onAndroidBack());
  if (backRoot !== false) throw new Error('back on today root should return false');
  await page.click('.chip:not(.add) >> nth=1'); await wait();
  await expect(page.locator('#rate-good').count().then(c => c === 1), 'Miso unaffected by memorial');

  // 11. Edit note on a logged day, then immediately tap another rating (blur + click)
  await page.fill('#note', 'Sleepy all afternoon');
  await page.click('#rate-meh'); await wait();
  const st = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('gooddays.v1')); const pid = s.settings.activePetId; const k = Object.keys(s.days[pid]).sort().pop(); return s.days[pid][k]; });
  if (st.rating !== 'meh') throw new Error('rating tap after note edit was lost: ' + JSON.stringify(st));
  if (st.note !== 'Sleepy all afternoon') throw new Error('note lost: ' + JSON.stringify(st));

  // 12. Rapid taps: no duplicates, final state wins
  for (let i = 0; i < 8; i++) await page.click(['#rate-good', '#rate-bad', '#rate-meh'][i % 3], { delay: 0 });
  await wait();
  const cnt = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('gooddays.v1')); return Object.keys(s.days[s.settings.activePetId]).length; });
  if (cnt !== 1) throw new Error('rapid taps created duplicate days: ' + cnt);
  await expect(page.$eval('#rate-bad', e => e.classList.contains('on')), 'last rapid tap wins');

  // 13. Very long text is capped and layout doesn't overflow
  await page.fill('#note', 'x'.repeat(400)); await page.press('#note', 'Enter'); await wait();
  if ((await page.$eval('#note', e => e.value.length)) > 140) throw new Error('note not capped');
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('horizontal overflow');
  await page.click('[data-act="addPet"].chip'); await wait();
  await page.fill('#pName', 'Supercalifragilisticexpia W'); await page.click('#pSave'); await wait(600);
  await page.fill('#note', 'Wouldnt climb the stairs and slept by the door most of the evening, ate half of dinner, seemed restless around midnight again ok');
  await page.press('#note', 'Enter'); await wait(300);
  await page.click('#rate-meh'); await wait(2600);
  await shot('long-name');
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('#question, .card, .chips')].filter(e => !e.classList.contains('chips')).some(e => e.scrollWidth > e.clientWidth + 1));
  if (ov2) throw new Error('long pet name overflows');

  // 14. Bad import is rejected without data loss
  const before = await page.evaluate(() => localStorage.getItem('gooddays.v1'));
  await page.click('#btnSettings'); await wait();
  await page.click('[data-s="import"]'); await wait();
  await page.fill('#importText', 'not json {'); await page.click('#impGo'); await wait();
  await page.fill('#importText', '{"foo":1}'); await page.click('#impGo'); await wait();
  if (before !== await page.evaluate(() => localStorage.getItem('gooddays.v1'))) throw new Error('bad import changed data');
  await page.evaluate(() => { window.onAndroidBack(); window.onAndroidBack(); }); await wait(500);
  if (await page.locator('.layer-wrap').count()) throw new Error('back did not close stacked sheets');

  // 15. Malformed stored entries don't break rendering
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('gooddays.v1')); const pid = s.settings.activePetId; const d = new Date(); d.setDate(d.getDate() - 2); const k = d.toISOString().slice(0, 10); s.days[pid][k] = { note: 'no rating' }; s.days.bogus = 'x'; s.checks.push({ id: 'z', petId: pid, date: k, scores: { hurt: 3 }, total: 999 }); localStorage.setItem('gooddays.v1', JSON.stringify(s)); });
  await page.reload(); await wait();
  for (const t of ['calendar', 'trends', 'summary', 'today']) {
    await page.click(`.tabs button[data-tab="${t}"]`); await wait(300);
    const txt = await page.evaluate(() => document.body.innerText + document.body.innerHTML.match(/r-undefined|NaN/g));
    if (/undefined|NaN|999/.test(txt.replace(/null$/, ''))) throw new Error('malformed data leaked into UI on ' + t);
  }

  // 16. Persistence across reload
  await page.reload(); await wait();
  await expect(page.$$eval('.chip:not(.add)', e => e.length === 3), 'pets persist after reload');
  await shot('final');
};
