# 26 August 2024
- Added a new data file, `data/rerates.js`. This includes a list of rating differences between the official game and the data shown in the mobile application.
- Added logic in the function which reloads game data to correct the inconsistencies between ratings in the chart data and ratings in the game proper.

# 25 August 2024
- When tiebreaking for individual scores in an event's round, the leaderboard rank of players pertinent to that chart specifically will be used to break ties.
  - As an example: if two players have an exact score tie on a Hard chart, the players' rank on the Hard leaderboard will be used to break ties. If there is another exact score tie on a Wild chart in the same event, the players' rank on the Wild leaderboard will be used to break that tie.
  - Tie resolution for overall placement in an entire round will still use the `leaderboard` parameter defined in the event itself.
- Addressed unintended behavior when evaluating a player's leaderboard rank if they are not placed on the leaderboard at all.
- Added support for a "system updates" notification feed. Updates to song and chart data (in primitive fashion) are now broadcast to the event Discord server. This is controlled by a secret parameter.
- Fixed a bug with writing files for finished event data.

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