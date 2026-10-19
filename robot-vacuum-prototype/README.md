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

Settings → Robot data switches between the real robot and the fully simulated demo; the choice is remembered.
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
commands: start/resume, pause, return to dock, a spot clean of at most 4 × 4 m, zoned cleaning of up to 5 rooms or zones (each at most 15 × 15 m), the robot's cleaning mode
(vacuum / vacuum and mop), its no-go zones, notifications, and schedule automations it created itself (ids starting `robot_app_`).

### What is real and what is simulated

| Part of the app | Live mode |
|---|---|
| Status, battery, offline banner | Real, from the robot's entities. Offline keeps the last snapshot. |
| Robot problems | Every error the robot reports (jammed wheel, trapped, dock not found, failed return to dock, … all codes Home Assistant lists), and problem states (not charging, locked, updating), get a banner, a notification and an event page like the study events: what happened, what to do, and buttons that act on the robot (I fixed it, resume / Send it to the dock / Leave it). The event resolves itself when the robot clears the error. The app also raises "Cleaning stopped early" for runs under 2 minutes it didn't stop (often a failed relocalisation) and "Map not updating" when Home Assistant's map is older than the running cleaning. |
| Start, Pause, Resume, End and return | Real commands. Success is shown only after the robot's state changes (30 s limit), otherwise the original failure card with Try again. |
| Cleaning tasks, Activity, reports, timeline | A task starts when the robot starts cleaning (from the app or anywhere else) and ends when it docks. Kept in this browser. The robot's own last cleaning is shown as a "Robot record". |
| Map | The robot's map: mapped floor, outline, no-go zones, robot position and heading. "Cleaned" uses the demo's 0.5 m grid: a cell turns blue when the robot's real path passes through it, using a map Home Assistant sent after the current cleaning started and the robot's live position (`roborock.get_vacuum_current_position`, read every few seconds while it works), so cells fill in real time even when the map image is old. The robot marker uses the live position and faces the way it last moved. If the robot's coordinates no longer match the saved map (for example after a failed relocalisation), Settings → Align map with the robot lines them up with two taps on its real position (one tap shifts only). The alignment moves the robot, its trail and event spots onto the map, and spot retries, room/zone cleaning and drawn no-go zones are converted back into the robot's coordinates. It resets when the robot's map changes. Study-event spots are 2 × 2 cells and show Needs review, Skipped or No-go as in the demo. Progress is cleaned area against the largest full-home cleaning (an estimate, marked as one). 3D is the demo's three.js scene built from the real map: floor, walls along the mapped edge, cells, objects, events and the robot. |
| Objects | The robot's obstacles at their real positions, remembered by the app across cleanings and matched by type and position. Known types keep the robot's label; unknown types ask "What is this?". Unsure objects you haven't labelled are cleared when the next cleaning starts. Sure and labelled ones stay until a cleaning covering that area no longer finds them; then they are removed and the timeline says so. Corrections don't change the robot. |
| Rooms and zones | Drawn in this app (Settings → Rooms and zones) by dragging rectangles on the robot's map, snapped to the 0.5 m grid; a room can have up to 5 parts. Rooms are coloured and named on the 2D and 3D maps, objects and events show their room, and the status says which room the robot is in. Start cleaning → Rooms or Zone sends the rectangles to the robot as one zoned cleaning (at most 5). Stored in this browser; the robot's own map isn't changed. No-go zones can be drawn there too. |
| Supervision events (floor type, cable, tight spot, extra pass) | **Study scenario.** Simulated at the robot's real position during real cleanings and labelled on the event page. They are off by default; turn them on (and choose the scenario, or show the next event) in Settings → Study scenario. |
| Automation levels | Apply to the study events as in the demo. In Manual the real robot is paused until you choose. When the robot decides a study event by itself (Auto + notify, Full auto, a saved preference), the outcome is simulated and the real robot is not sent anywhere; only your own choices move it. Home shows when study events are on. |
| Event choices | Retry and "I've cleared it" send the real robot to that spot (its 2 × 2 cells). During a cleaning you choose Go now or After this cleaning (Settings → Retries sets the default used when the robot decides by itself); success comes from the robot docking without an error. Roborock drops a running cleaning for a spot clean, so afterwards the app starts the same cleaning again (Entire home, or the same rooms/zone); it starts the route from the beginning. Ending the cleaning cancels all of this. Rug and Hard floor first switch the robot to vacuum only or vacuum and mop, then set it back. "Keep the extra pass" sends the robot over the spot again. Pause is real. Avoid, later and skip need no command: the robot isn't going there. |
| No-go zones | "Never clean here" writes the zone to the robot (Roborock `save_map`) together with the zones already on it; removing it in Saved preferences writes the list again. Saved preferences shows when the robot's map confirms it. Virtual walls and no-mop zones set in the Roborock app may be reset by a save. |
| Schedules | Saved in Home Assistant as automations that start the robot at that time, even when the app is closed. Entire home only. |
| Notifications | The three switches now apply. Sent to Home Assistant, and to phones paired with the Home Assistant app, while the app is open. |

### Use it on a phone

By default the bridge only answers this Mac. To open the app on a phone on the same Wi-Fi, start it with a PIN of at least 6 characters:

```bash
LAN=1 APP_PIN=482915 python3 server.py
```

It prints the address to open on the phone. The phone asks for the PIN once (it is remembered until the bridge restarts; 10 wrong PINs lock it for 10 minutes). The connection is not encrypted, so use it on a home network you trust.

### Tests

```bash
npm install        # once: jsdom, used only by the tests
npm test
```

`tests/live.test.cjs` loads the real app in jsdom against a fake bridge and checks live mode end to end: tasks follow the robot, retries go now or after the cleaning, ending cancels them, study events never move the robot on their own, robot errors become events, opening the app sends nothing, and with no bridge it falls back to the simulation. It cannot reach Home Assistant or the robot. `tests/test_bridge.py` covers the bridge, including the phone PIN; `tests/ha-model.test.cjs` covers the data model.

## Round 2 changes (from the P1–P7 study)

- **Change any decision, in one step.** Your own choices show "Change it?" too, not only the robot's. Every app-only choice shows Undo for a few seconds. "Remember" saves straight away, with its scope written next to the box; edit it in Saved preferences.
- **Automation level from Home.** The level on Home is a button that opens all four levels, each saying which notices you'll get. A level can be set for 1 hour or until the cleaning ends, then it switches back by itself.
- **Fewer checks.** Common objects are labelled by the robot; only odd ones are asked about. Unsure objects are grouped per room ("Living room: 2 items") with All look right, Change, or Ignore these for now.
- **Failures explain themselves.** A failed retry says what the robot still detects and what to do; after two failures it stops suggesting another retry and suggests no-go or skip. A stuck robot says why a person is needed. The simulation fails a retry at most once.
- **Notification switches apply.** Needs-review banners, finish banners, and decisions in Full auto follow Settings → Notifications.
- **Live mode watches behaviour the robot doesn't report as an error:** working in one spot for 2 minutes, no new area for 4 minutes, a sudden position jump (lost its place), mapping instead of cleaning, going back to charge mid-cleaning (the cleaning isn't ended), a slow return to the dock, and an empty map in Home Assistant (the app and the bridge keep the last good copy, marked as such).

## Round 3 changes (P1 items 5–8)

- **Inbox** replaces Activity: everything that still needs you (calls, robot problems, objects to check, reminders, clean later), with a count badge; past cleanings sit below it with a summary ("3 robot decided · 1 your call"). Object checks open full screen.
- **Notifications by type:** needs your call, robot problems, finished, every decision, unusual behaviour. **Pause for 1 hour** holds them and shows one summary afterwards. **Ask me later** on any open question (30 min, 1 hour, after this cleaning); in Manual the robot carries on meanwhile. **Leave the app (lock screen)** in Settings → Testing shows notices as phone notifications for studies.
- **How it decided:** "Why did this happen?" shows what the robot measured; the legend has Extra pass, whose area can be tapped; the app says "Robot decided" or "Needs your call" throughout.
- **Where the map comes from:** a "This is your home's map" onboarding step, "Map updated …" with Update map on the Map tab, and a "Map updated: furniture moved" notice (demo) or when the real robot's map changes.
- **Live extras:** robot paused on its own, maintenance counters running low, an empty water tank or missing mop before a vacuum-and-mop start (offers vacuum only), and schedules inside the robot's Do Not Disturb.

## Round 4 changes

- Study events are off by default; when the robot decides one by itself it never moves the real robot. Home shows when they are on.
- The automation-level illustrations are image files (`img/`), so the page is about half the size.
- Live times keep counting past midnight, so a late cleaning stays in order.
- Simulation: Settings → Testing → *Reminders use real time*, for studies where "remind me in 30 minutes" should mean 30 real minutes.
- After the robot's map changes (or comes back after having none), the app asks you to check rooms, zones, no-go zones and alignment.
- Phone access over Wi-Fi with a PIN (above), and end-to-end tests for live mode.

## Study panel (for usability sessions)

A panel at the top left, beside the phone, that the participant uses during a session. Nothing appears inside the app itself. Open it with `?study` in the address, **Shift+S**, or Settings → Testing → Study log.

1. **Participant and Start.** In the simulation, Start resets the app to onboarding and turns the study events on.
2. **Background and opening task**, with **End**. This part is one cleaning: they set up, start a cleaning (any kind) and use the app however they like. It ends by itself when the cleaning ends (finished or stopped). If they start another cleaning before doing anything in the next part, it carries on. End is there in case the end isn't picked up.
3. **Guided tasks after the cleaning**, one at a time, each with **Skip** and **End**: change a robot decision, find what the robot did, check found objects, Full auto for an hour, find what needs you. Only the ones they didn't reach on their own are shown, and only if they apply (no decisions to change → not shown). Each also ends by itself when its goal is reached.
4. **Results.** After "That's everything. Thank you!", the panel shows the session's results for the researcher: every goal reached while exploring (with the time into exploration) and every guided task (result, seconds, taps against the fewest needed, detours). Download CSV gives a summary and a full tap and screen log; Copy summary and Copy taps put the same tables on the clipboard (the only option on the published web version, which can't save files). End session ends early.

A goal counts however they get there: only the end state is checked (for example, Full auto counts whether it was set from Home or in Settings, for an hour or for good). The route and the choice are recorded in the `how` column, and the screens in `path`.

Data stays in this browser until exported. Edit `SCRIPT` and `TASKS` in `study-log.js` to change the wording or the tasks. With the real robot, starting a cleaning moves the robot.
