# 2 August 2024
- Cleaned up then event finalization routine slightly.
- Finished events now have their raw data dumped to a file upon completion.

# 31 July 2024
- Added support for multiple difficulties in card draw.
- Replaced `get-statmaniax-wild-leaderboard.js` with `get-statmaniax-leaderboards.js`, a more generic utility that retrieves data for all seven discrete leaderboards hosted on StatManiaX.
- Event data now includes a new parameter: `leaderboard` to specify what leaderboard should be used to break ties.

# 21 July 2024
- Switched to a Grand Prix-style score accumulation method.
- Reformatted many messages output by the bot.
- Modules are now hot-reloadable, so data can be updated without having to reset the program.
- The functionality of utilities `get-chart-data.js` and `get-song-data.js` are now part of a scheduled task run by the program.
- Discord messages are now batched, so violations of Discord's maximum message length (2000 characters) are avoided.
- Event data now includes new parameters: `participants[].points` to track a participant's point total over multiple rounds, and `prixPoints` to indicate how many points are awarded for placements earned on individual charts.
- Cleaned up some console logging and code comments at my discretion.