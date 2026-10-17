# From Operator to Supervisor — Robot Vacuum App Prototype

An interactive prototype of a robot vacuum companion app, built for the thesis
*From Operator to Supervisor*. It explores how an app can let people supervise an
autonomous robot instead of operating it step by step.

Open `index.html` in any browser. It works best on a phone, where it fills the screen.
All robot data is simulated.

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

- Single self-contained HTML file. three.js and fonts load from public CDNs.
- Refresh the page to start again from the intro screen.
