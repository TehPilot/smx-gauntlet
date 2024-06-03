# smx-gauntlet

This is a work-in-progress program which runs a gauntlet-style event. It is intended for StepManiaX (SMX) tournaments and uses the score browser API maintained by DesktopMan (https://smx.573.no/) to retrieve scores.

Not included in this repository for evaluation:
- the raw chart and song data files (pulled in via modules)
- the directories necessary for data persistence and event loading/maintenance
- test files, scripts, and ancillary programs I've used to test or validate certain functionality

Features of this engine:
- very basic card draw, with assurances that no charts are duplicated throughout an event's run
- pulls player scores, tallies them, and assigns wins/losses per round (and eliminating players accordingly). Just money score sum currently, more advanced logic/tiebreakers to come.
- multiple events concurrently - hoping to do upper/lowers and singles/doubles in parallel from one program in a real-world run
- data persistence (if the program crashes, it picks an event up where it left off on next run) and side-loading new events (via dropping a file defining the rounds + deadlines on the server)
- outputs messages to Discord as events progress

This code is provided with no license or warranty and is made available for evaluation only; please reach out to me privately if there is an aspect of this you wish to adopt or leverage in your own solution. 🕺