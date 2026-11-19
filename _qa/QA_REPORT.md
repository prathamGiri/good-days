# QA Report: Good Days

**Final status: PASS.** The Playwright scenario passes (`_qa/test/report.json` shows `"ok": true` with 0 JS errors), and `assembleRelease` builds `app-release.apk`.

## What was tested (`_qa/scenario.js`, 390×844 phone viewport)
All 10 `test_scenarios` from IDEA.json:
1. First launch shows the welcome screen. Saving with an empty name is blocked, and a blank favorite is not added. Adding "Biscuit" shows "How was Biscuit's day?" with 3 buttons.
2. Tapping Good selects it, shows a toast and vibrates (checked with a bridge stub). The rating survives a reload. Changing it to Bad does not create a duplicate entry.
3. Back-fill of 14 days (4 good, 3 meh, 7 bad, with 3 bad in a row): the 14-day gauge shows "outnumbering" and the streak notice appears.
4. Calendar: every logged day has the right color class, and the day with a note has a dot. Editing a past day in the sheet updates the Today gauge counts.
5. Weekly checks: 42, then 31. The live total reads 31, Trends highlights Mobility as the biggest drop, and the line dips below 35.
6. Favorites: "Chasing the ball" marked not seen shows "Not seen since" in Trends and in the Vet Summary.
7. Vet Summary contains the name, counts, longest run, latest total, the missing favorite and notes. Share calls `Android.share`.
8. Second pet "Miso": ratings stay separate in both directions.
9. Export, then reset (welcome screen returns), then import: both pets are restored.
10. Memorial for Biscuit: check-in is hidden, the calendar history is viewable and read-only, the wording is gentler, and Miso is unaffected.

Edge cases:
- Android back handler: closes a sheet, then goes from a tab back to Today, then returns `false` at the root. It also closes stacked sheets.
- Editing a note and then tapping a different rating straight away.
- 8 rapid rating taps: no duplicates, and the last tap wins.
- A 400-character note is capped at 140, and the page has no horizontal overflow.
- A very long pet name: no overflow in the cards or the question heading.
- Invalid import (bad JSON, or JSON without `pets`) is rejected and existing data is untouched.
- Malformed stored data (a day with no rating, a non-object `days` entry, a check with missing scores and a bogus total) does not show `undefined`, `NaN` or a wrong total on any tab.
- All 3 pets survive a final reload.

## Bugs found and fixed
1. **A rating tap was lost after editing a note (real data bug).** The note field's `change` handler re-rendered the whole view on blur. On a phone, tapping Meh/Bad right after typing a note blurred the field, the DOM was rebuilt, and the tap never reached the button. The note was saved but the rating change was silently dropped. **Fix:** the note is saved without re-rendering (`app.js`, `after.today`).
2. **Imported or stored data was not validated.** `normalize()` accepted any `days` and `checks` shapes. A hand-edited or corrupted backup could show `r-undefined` cells, an "undefined day" label or a wrong stored `total`. **Fix:** `normalize()` now keeps only valid `YYYY-MM-DD` days with a known rating, caps notes at 140 characters, clamps check scores to 0–10, recomputes `total`, and drops malformed favorites.
3. **A long pet name pushed the active chip off-screen.** **Fix:** chip names now cut off with an ellipsis at 150px, and the active chip is scrolled into view on every render.

## Build
- The first `assembleRelease` attempts failed because a stale Gradle daemon was holding a lock on `app/build/intermediates/incremental/packageRelease/tmp`. After `gradlew --stop` and deleting that temp folder, the build succeeded and produced `app/build/outputs/apk/release/app-release.apk`.
- `screenshots/` was refreshed from the latest run: welcome, today with the balance gauge, calendar heatmap, trends and vet summary.

## Known limitations
- Calendar swipe uses touch events and was not exercised in headless tests; the arrow buttons were tested.
- Copy uses the Clipboard API or an `execCommand` fallback, which can't be checked in headless Chromium. Share was checked through the bridge stub.
- Vibration and toasts were checked against a stubbed `window.Android` bridge, not on a real device.
- When the app is opened shortly after midnight, "today" rolls over only on the next `visibilitychange`.
