# smx-gauntlet 🦵

This is a work-in-progress program which runs a gauntlet-style event. It is intended for remote StepManiaX (SMX) tournaments and uses the score browser API maintained by DesktopMan (https://smx.573.no/) to retrieve scores.

This repository is for the main program file, package definition, and some useful utilities for maintaining the data necessary to run the program. It is here for competitors and interested parties to audit functionality and confirm tournament integrity; it is not a complete package to run your own events with at this time. It is currently dependent on leveraging a Discord bot to output useful information and event updates to competitors.

Not included in this repository:
- the raw chart and song data files (pulled in via modules)
- the directories necessary for data persistence and event loading/maintenance
- (some) test files, scripts, and ancillary programs I've used to test or validate certain functionality

## Changes ⌚

Changes to the software are listed in [changes.md](changes.md).

## Features 🧰

- Very basic card draw, with assurances that no charts are duplicated throughout an event's run, and support for excluding charts in specific rounds (focused on restricting newer content drops from draw until enough time has elapsed)
- Pulls player scores, tallies them, and assigns wins/losses per round (and eliminating players accordingly). The only supported logic at this time is first-score only submissions, and (as of 21 July 2024) a Grand Prix-style scoring system that awards points based on relative performance per chart.
- Ability to run multiple events concurrently, with the intent being for multiple divisions to be executed in parallel (e.g. lower and upper level singles, singles and doubles, etc. with separate competitors).
- Data persistence (if the program crashes, it picks an event up where it left off on next run) and side-loading new events (via dropping a file defining the rounds + deadlines on the server).
- Discord bot output for event updates, results, and key notices.

## Utilities 🛠️

The following utilities are included in this repository:

**`get-chart-data.js`**: used to get chart data from the endpoint available in DesktopMan's API. It produces two separate module files with chart data: one for official charts (determined by the `is_edit` flag and checking that the song is enabled via `is_enabled`), and one for published edits.

**`get-song-data.js`**: used to retrieve song data (title, artist, etc.) from the endpoint available in DesktopMan's API. It produces a single module file with the song data.

**`get-statmaniax-leaderboards.js`**: used to retrieve all mode leaderboards from StatManiaX (https://statmaniax.com/ranking/). Unlike the other API endpoints which return JSON, this is a static webpage served by StatMX which I am scraping and formatting into an object I can call from a module file. It requires a sizeable amount of available memory to run.

## License 🕺

This code is provided with no license or warranty and is made available for evaluation/audit only; please reach out to me privately if there is an aspect of this you wish to adopt or leverage in your own solution.