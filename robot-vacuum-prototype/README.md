# From Operator to Supervisor — Robot Vacuum App Prototype

An interactive prototype of a robot vacuum companion app, built for the thesis
*From Operator to Supervisor*. It explores how an app can let people supervise an
autonomous robot instead of operating it step by step.

Open `index.html` in any browser. It works best on a phone, where it fills the screen.
Opened this way (or with `?demo=1`), all robot data is simulated. To use a real robot through
Home Assistant, see [Live mode](#live-mode-with-home-assistant).

## What it covers

- **Four automation levels**: Manual, Assist, Auto + notify, Full auto. Each level changes how the robot handles events.
- **Live map** in 2D and 3D (three.js), with a realistic cleaning path.
- **Event explanations** with a picture, one question, and large choices; details under "Why did this happen?".
- **Selective intervention**: change one decision without taking over the whole task.
- **Uncleaned areas**: retry, clean later, skip, or mark as a no-go zone. Retries can succeed or fail.
- **Object recognition**: confident labels are added silently; unsure ones are checked after cleaning; every label can be corrected.
- **Problems and recovery**: command failure, disconnection, stuck robot, failed retry (triggered at random).
- **Review**: Automation Report, Decision Timeline, and Activity history.
- **Settings**: automation level, saved preferences, no-go zones, schedules, notifications.

## Notes

- The demo is one HTML file. three.js and fonts load from public CDNs. `ha-model.js` and `ha-live.js` do nothing in the demo.
- In the demo, refresh the page to start again from the intro screen.

## Live mode with Home Assistant

Live mode keeps every screen and user flow of the demo. Real robot data replaces the simulator wherever
Home Assistant has it; the supervision events still run as a labelled study layer on top.

### Run it

1. Home Assistant runs at `http://127.0.0.1:8124` with the Roborock integration, and the
   `roborock_obstacles` reader custom component installed (it exposes the map calibration, robot position,
   path, no-go areas and obstacles from the integration's map cache).
2. `python3 server.py` in this folder (Python 3.9+, no packages). Set `PORT` or `HA_URL` to change the defaults.
3. Open `http://127.0.0.1:8787`. On first use the app asks for a Home Assistant long-lived access token
   (Profile → Security). You can also set `HA_TOKEN` for the server.

The bridge binds to loopback only, keeps the token in the git-ignored `.ha-local.json` (owner-only), never returns
it to the page, serves only the app files, accepts writes only from its own origin, and forwards only these
commands: start/resume, pause, return to dock, and a spot clean of at most 4 × 4 m.

### What is real and what is simulated

| Part of the app | Live mode |
|---|---|
| Status, battery, errors, stuck notice, offline banner | Real, from the robot's entities. Offline keeps the last snapshot. |
| Start, Pause, Resume, End and return | Real commands. Success is shown only after the robot's state changes (30 s limit), otherwise the original failure card with Try again. |
| Cleaning tasks, Activity, reports, timeline | A task starts when the robot starts cleaning (from the app or anywhere else) and ends when it docks. Kept in this browser. The robot's own last cleaning is shown as a "Robot record". |
| Map | The robot's map: mapped floor, outline, no-go zones, robot position and heading. "Cleaned" uses the demo's 0.5 m grid: a cell turns blue when the robot's real path passes through it. Study-event spots are 2 × 2 cells and show Needs review, Skipped or No-go as in the demo. Progress is cleaned area against the largest full-home cleaning (an estimate, marked as one). 3D tilts the same map. |
| Objects | The robot's obstacles at their real positions. Known types keep the robot's label, unknown types ask "What is this?". Corrections and "Nothing there" are stored in this app; they don't change the robot. |
| Rooms and zones | Not available: Home Assistant gives no room data for this map, so only Entire home can be started. |
| Supervision events (floor type, cable, tight spot, extra pass) | **Study scenario.** Simulated at the robot's real position during real cleanings and labelled on the event page. Choose the scenario or show the next event from Settings → Study scenario. |
| Automation levels | Apply to the study events as in the demo. In Manual the real robot is paused until you choose. |
| Event choices | Retry, "I've cleared it", Rug and Hard floor send the real robot back to that spot (its 2 × 2 cells) after the cleaning ends; success comes from the robot docking without an error. Pause is real. Avoid, later, skip, no-go and saved preferences are recorded in the app. |
| Schedules, notification switches | App only, as in the demo. |

### Tests

```bash
node --test tests/*.test.cjs
python3 -m unittest discover -s tests
```
