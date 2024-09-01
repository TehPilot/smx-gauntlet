const axios = require("axios");
const cron  = require("node-cron");
const fs    = require("fs");
const {Client, Intents} = require('discord.js');

// Discord client intents
const client = new Client({
	intents: [
		Intents.FLAGS.GUILD_MESSAGES
	],
	partials: ['MESSAGE', 'CHANNEL']
});

var charts = require("./data/chart-data.js");
var songs  = require("./data/song-data.js");
var leaderboard = require("./data/leaderboard.js");
var rerates = require("./data/rerates.js");
const secrets = require("./data/secrets.js");

var events = [];

// get a player's score for a given chart ID.
// parameter asc=1 sorts by date ascending; it is implicitly assumed the first result from this call
// will be the player's first submitted score in the period
async function getScore(wStart, wEnd, cId, player) {
    let requestUrl = `http://smx.573.no/api/scores?from=${wStart}&to=${wEnd}&user=${player}&chart_ids=${cId}&asc=1`
    let response = null;

    await axios.get(requestUrl).then((res) => {
            response = res.data;
        }
    );

    return response;
}

// basic function to send a message to a Discord channel.
// event is parameterized here to simplify calls to the discord channel ID stored in an event
async function sendDiscordMessage(eventRef, messageText) {

    // wait for the channel reference
    let channelRef = await client.channels.fetch(eventRef.discordChannel);

    // just in case our message is huge, split it up and batch send
    let messageChunks = messageText.match(/(.|[\r\n]){1,1950}/g);
    for (let message of messageChunks) {
        channelRef.send({
            content: message
        });

        // a mimir
        await new Promise(r => setTimeout(r, 1000));
    }
    return;
}

async function sendDiscordMessageId(channelId, messageText) {
    // wait for the channel reference
    let channelRef = await client.channels.fetch(channelId);

    // just in case our message is huge, split it up and batch send
    let messageChunks = messageText.match(/(.|[\r\n]){1,1950}/g);
    for (let message of messageChunks) {
        channelRef.send({
            content: message
        });

        // a mimir
        await new Promise(r => setTimeout(r, 1000));
    }
    return;
}

// converts a date string to a Unix timestamp, in whole seconds
function getUnixTimestamp(dateString) {
    return new Date(dateString).getTime() / 1000;
}

// loads event data from text file
async function loadEventData() {
    let eDataString = fs.readFileSync("./save/events.txt", "utf8");
    if (eDataString === undefined || eDataString === "") {
        return [];
    } else {
        return JSON.parse(eDataString);
    }
}

// writes event data from text file
async function writeEventData() {
    var eDataString = JSON.stringify(events);
    fs.writeFile("./save/events.txt", eDataString, (err) => {
        if (err) {
            console.log("An error occurred when writing event data to file.");
            return console.log(err);
        }
    });
}

// loads new events in
async function importEventData() {
    let newEventFiles = fs.readdirSync("./events/new/");

    let newEvents = false;

    for (let file of newEventFiles) {
        console.log(`Loading event from file ${file}...`);
        let eData = JSON.parse(fs.readFileSync(`./events/new/${file}`));
        events = events.concat(eData);
        console.log("New event loaded");

        // move file by copying it to a new location and then deleting the original
        fs.copyFileSync(`./events/new/${file}`, `./events/old/${file}`);
        fs.unlinkSync(`./events/new/${file}`);

        newEvents = true;
    }

    // immediately commit the change if a new event was loaded
    if (newEvents) {
        await writeEventData();
    }
}

// calculates dance point / leaderboard point value of a score
function calculateLeaderboardScore(score, diff) {
    return Math.floor((score * diff * diff) / 1000);
}

// calculates max rounds (approx.) for an event
function getMaxRounds(players) {
    let w = Math.ceil(Math.log2(players));
    return w + Math.ceil(Math.log2(w)) + 1;
}

// capitalize (lol)
async function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

// all cron schedules in one place for modifying.
// remove the last asterisk in each one to switch from per-second to per-hour processing
const schedules = {
    eventInitialize:    "0,20,40 */1 * * * *",
    periodStart:        "3,23,43 */1 * * * *",
    periodEnd:          "6,26,46 */1 * * * *",
    eventAdvance:       "9,29,49 */1 * * * *",
    importEvent:        "55 * * * * *",
    updateGameData:     "56 23 * * 7"
}

// control flags that make sure if a scheduled job is already running,
// we don't start another one (legitimate concurrency issues happened in test)
var jobRunning = {
    eventInitialize:    false,
    periodStart:        false,
    periodEnd:          false,
    eventAdvance:       false,
    importEvent:        false,
    gameDataUpdate:     false
}

// task schedulers to be fired on discord login
client.login(secrets.discordToken).then(async () => {

    events = await loadEventData();
    await importEventData();
    console.log("Ready");

    // initialize an event if not ongoing
    cron.schedule(schedules.eventInitialize, async () => {

        if (jobRunning.eventInitialize || jobRunning.gameDataUpdate) {
            return;
        }
        jobRunning.eventInitialize = true;

        console.log("Running routine: event initialization");

        let eUpdated = false;

        // check all events
        for (let e of events) {

            // if an event hasn't started, kick it off
            if (!e.started && !e.completed) {
                e.started = true;

                var eStartDate = getUnixTimestamp(e.periods[0].start);
                var eParticipants = e.participants.reduce((a, v) => { return a.concat(v.tag) }, []).join(", ");

                await sendDiscordMessage(e, `# ${e.name} has begun!\nThe first round is scheduled to begin <t:${eStartDate}>.\n\n**Participants**: ${eParticipants}`);
                eUpdated = true;
            }
        }

        if (eUpdated) {
            await writeEventData();
        }

        jobRunning.eventInitialize = false;

    });

    // start a period
    cron.schedule(schedules.periodStart, async () => {

        if (jobRunning.periodStart || jobRunning.gameDataUpdate) {
            return;
        }
        jobRunning.periodStart = true;

        console.log("Running routine: event period beginning");

        let eUpdated = false;

        // check all active events
        for (let e of events) {
            if (e.started && !e.completed) {

                // get the current period of the event
                let activePeriod = e.periods[e.currentPeriod];
                let eStartTime = getUnixTimestamp(activePeriod.start);
                let currentTime = getUnixTimestamp(new Date().getTime());

                if (!activePeriod.started && currentTime >= eStartTime) {

                    let dMessageText = "";

                    // start the event period
                    activePeriod.started = true;

                    dMessageText += `# ${e.name} - Round ${e.currentPeriod + 1}\n`;
                    dMessageText += `ends <t:${getUnixTimestamp(activePeriod.end)}>\n\nPlay the following charts:\n`;

                    // run card draw
                    for (let draw of activePeriod.draws) {

                        // filter all valid charts down to ones in the specified difficulty and level range.
                        // also exclude anything we've already drawn (no duplicates)
                        // also somehow I got removed song charts, so I have to filter those too ...
                        let cardDraw = charts.data.filter((c) =>                   
                            draw.difficulty.toLowerCase().includes(c.difficulty_display.replace("+", "").toLowerCase())     // difficulty name matches
                            && c.difficulty >= draw.lower                                                                   // in bound for difficulty range
                            && c.difficulty <= draw.upper
                            && c.is_enabled                                                                                 // chart is enabled (doesn't belong to a disabled song)
                            && !e.excludeCharts.includes(c._id)                                                             // not in the event-wide exclusion list
                            && !activePeriod.excludeCharts.includes(c._id)                                                  // not in the period-specific exclusion list
                            && getUnixTimestamp(c.created_at) < getUnixTimestamp(new Date().toString()) - 2592000           // is at least 30 days old (at time of draw)
                        );

                        // this basically shuffles all valid charts in a range
                        cardDraw = cardDraw.map(v => ({ v, sort: Math.random()}))
                        cardDraw = cardDraw.sort((a, b) => a.sort - b.sort)
                        cardDraw = cardDraw.map(({v}) => v)

                        // take only what we need from the valid charts
                        // first entries from a randomly shuffled list, so basically a random amt equal to draw.quantity
                        cardDraw = cardDraw.slice(0, Math.min(draw.quantity, cardDraw.length));

                        // for everything in the draw, incl. it in the post here
                        for (card of cardDraw) {
                            // push the retrieved chart IDs from the draw into the period's chart list
                            activePeriod.charts.push(card);

                            // also push the chart ID into the exclusion list (so they don't appear multiple times)
                            e.excludeCharts.push(card._id);

                            // looks up the song data so we can show the users the title and artist
                            // ... for some reason the API calls Beginner "Basic" so we do a transformation here
                            let songRef = songs.data.find((s) => s._id === card.song_id);
                            dMessageText += `\> **${songRef.title}** by ${songRef.artist} (${await capitalize(card.difficulty_display)} ${card.difficulty})\n`
                        }
                        
                    }

                    dMessageText += `\nYour first score registered on the StepManiaX servers for each given chart between <t:${getUnixTimestamp(activePeriod.start)}> and <t:${getUnixTimestamp(activePeriod.end)}> (server time) will be counted as your submission.`;

                    await sendDiscordMessage(e, dMessageText);
                    eUpdated = true;
                } else {
                    /*
                    if (activePeriod.started) {
                        console.log("Event already started");
                    } else {
                        console.log(`Period not started yet - current time: ${currentTime} | start time: ${eStartTime} `);
                    }
                    */
                }
            }
        }

        if (eUpdated) {
            await writeEventData();
        }

        jobRunning.periodStart = false;
    });

    // end a period and tabulate results
    cron.schedule(schedules.periodEnd, async() => {
        if (jobRunning.periodEnd || jobRunning.gameDataUpdate) {
            return;
        }
        jobRunning.periodEnd = true;
        
        console.log("Running routine: event period completion");

        let eUpdated = false;

        // run for all active events
        for (let e of events) {
            if (e.started && !e.completed) {

                console.log(`Processing event ${e.name}`);

                // get the current period of the event
                let activePeriod = e.periods[e.currentPeriod];
                let eEndTime = getUnixTimestamp(activePeriod.end);
                let currentTime = getUnixTimestamp(new Date().getTime());

                // only tabulate scores if the event period is over
                if (activePeriod.started && !activePeriod.completed && currentTime >= eEndTime) {
                    
                    console.log(`Event period ended; beginning processing loop`);

                    let roundData = [];
                    let currentTime = getUnixTimestamp(new Date());
                    
                    // filter out players who have been eliminated (2 losses)
                    let validParticipants = e.participants.filter((vP) => vP.losses < 2);

                    // set up the table to sort players by round end results
                    for (let p of validParticipants) {
                        let pRank = leaderboard[e.leaderboard].find((r) => r.tag === p.tag);
                        pRank = (pRank === undefined ? 99999 : pRank.rank);
                        roundData.push({
                            player: p.tag,
                            points: 0,
                            totalScore: 0,
                            rank: pRank
                        });
                    }

                    console.log(`Leaderboard retrieved (mode: ${e.leaderboard})`);

                    // go through each chart in the draw
                    for (let c of activePeriod.charts) {
                        console.log(`Reviewing chart ${c._id}`);
                        var roundChartScores = [];

                        // get each player's score
                        for (let p of validParticipants) {

                            // default values
                            let pScore = 0;
                            let pDate = currentTime;
                            // let pRank = roundData.find((sD) => sD.player === p.tag).rank;

                            let pScores = await getScore(activePeriod.start, activePeriod.end, c._id, p.tag);
                            let pScoreId = "N/A";
                            if (pScores.length > 0) {
                                pScore = pScores[0].score;
                                pScoreId = pScores[0]._id.toString();
                                pDate = getUnixTimestamp(new Date(pScores[0].created_at));
                            }

                            console.log(`Player ${p.tag}'s result on ${c._id}: ${pScore} (score ID: ${pScoreId})`);

                            // push each player's score into the table
                            roundChartScores.push({
                                player: p.tag,
                                score: pScore,
                                time: pDate,
                                points: 0
                            });
                        }

                        // sort the scores, highest to lowest
                        // tiebreak: first submission, then leaderboard rank
                        
                        let chartLeaderboard = c.difficulty_display.replace('+', '').replace("basic", "beginner");
                        roundChartScores.sort((a,b) => {
                            if (b.score === a.score) {
                                if (b.time === a.time) {
                                    
                                    let aRank = leaderboard[chartLeaderboard].find((r) => r.tag === a.player);
                                    aRank = (aRank === undefined ? 99999 : aRank.rank);
                                    let bRank = leaderboard[chartLeaderboard].find((r) => r.tag === b.player);
                                    bRank = (bRank === undefined ? 99999 : bRank.rank);
                                    
                                    return aRank - bRank;
                                }
                                return a.time - b.time;
                            }
                            return b.score - a.score;
                        });

                        // award points based on position
                        for (let i = 0; i < roundChartScores.length; i++) {
                            roundChartScores[i].points += e.prixPoints[Math.min(i, e.prixPoints.length - 1)];
                        }

                        let songRef = songs.data.find((s) => s._id === c.song_id);
                        var chartResultsString = `### ${e.name} - Round ${e.currentPeriod + 1} Chart Results\nfor **${songRef.title}** by ${songRef.artist} (${await capitalize(c.difficulty_display)} ${c.difficulty})\n\n`;

                        // tally up points
                        let index = 1;
                        for (let roundChartScore of roundChartScores) {
                            let pointTotal = roundChartScore.points;
                            let scoreTotal = roundChartScore.score;

                            for (rdPlayer of roundData) {
                                if (rdPlayer.player === roundChartScore.player) {
                                    rdPlayer.points += pointTotal;
                                    rdPlayer.totalScore += scoreTotal;
                                }
                            }

                            chartResultsString += `#${index}: ${roundChartScore.player} - ${scoreTotal} (+${pointTotal} point${(pointTotal === 1 ? "" : "s")})\n`;

                            index++;
                        }

                        await sendDiscordMessage(e, chartResultsString);
                    }
                    
                    // sort on points to determine round winners
                    // tiebreak: money score, then leaderboard rank
                    roundData.sort((a, b) => {
                        if (b.points == a.points) {
                            if (b.totalScore == a.totalScore) {
                                return a.rank - b.rank;
                            }
                            return b.totalScore - a.totalScore;
                        }
                        return b.points - a.points;
                    });
                    
                    let roundResultsString = `## ${e.name} - Round ${e.currentPeriod + 1} Summary\n\n`;
                    let index = 1;
                    for (let rounds of roundData) {

                        // distribute points to players
                        let pIndex = e.participants.findIndex((e) => {
                            return e.tag === rounds.player;
                        });

                        let pRef = e.participants[pIndex];
                        pRef.points += rounds.points;

                        roundResultsString += `#${index}: ${rounds.player} - ${rounds.points} point${(rounds.points === 1 ? "" : "s")}\n-# (s: ${rounds.totalScore}; r: ${(rounds.rank !== 99999 ? rounds.rank : "N/A")})\n`;
                        index++;
                    }

                    await sendDiscordMessage(e, roundResultsString);

                    let dMessageText = `# ${e.name} - Round ${e.currentPeriod + 1} Results\n\n`;

                    // top slice: winners
                    var winners = roundData.slice(0, Math.floor(roundData.length / 2)).reduce((a, v) => {
                        return a.concat(v.player)
                    }, []);
                    dMessageText += `**Winners:**\n${winners.join("\n")}\n`;

                    // bottom slide: losers
                    var losers = roundData.slice(Math.floor(roundData.length / 2), roundData.length).reduce((a, v) => {
                        return a.concat(v.player)
                    }, []);
                    dMessageText += `**\nLosers:**\n${losers.join("\n")}`;

                    // award the winners a victory
                    for (w of winners) {
                        let pIndex = e.participants.findIndex((e) => {
                            return e.tag === w;
                        });
                
                        let pRef = e.participants[pIndex];
                        if (pRef !== undefined) {
                            pRef.wins += 1;
                        }
                    }

                    await sendDiscordMessage(e, dMessageText);
                
                    let elimMessageText = `## :warning: Eliminations\n`;
                    let eliminatedTotal = 0;

                    // hand the losers a loss and note if they have been eliminated
                    for (l of losers) {
                        let pIndex = e.participants.findIndex((e) => {
                            return e.tag === l;
                        });
                        let pRef = e.participants[pIndex];
                        if (pRef !== undefined) {
                            pRef.losses += 1;
                            if (pRef.losses >= 2) {
                                eliminatedTotal += 1;
                                elimMessageText += `${l} has been eliminated.\n-# Final score: ${pRef.wins} W - ${pRef.losses} L, ${pRef.points} point${(pRef.points === 1 ? "" : "s")}\n`;
                            }
                        }
                    }

                    if (eliminatedTotal > 0) {
                        await sendDiscordMessage(e, elimMessageText);
                    }
                
                    // close out the week
                    activePeriod.completed = true;
                    eUpdated = true;
                } else {
                    /*
                    if (activePeriod.completed) {
                        console.log("Event already ended");
                    } else {
                        console.log(`Period not over yet - current time: ${currentTime} | end time: ${eEndTime} `);
                    }
                    */
                }
            }
        }

        if (eUpdated) {
            writeEventData();
        }

        jobRunning.periodEnd = false;
    });

    // begin a new event period
    cron.schedule(schedules.eventAdvance, async() => {
        if (jobRunning.eventAdvance || jobRunning.gameDataUpdate) {
            return;
        }
        jobRunning.eventAdvance = true;

        console.log("Running routine: event period ending");

        let eUpdated = false;

        for (let e of events) {
            if (e.started && !e.completed) {

                // check that our active event period is resolved;
                // both flags set indicates scoring has been done
                let activePeriod = e.periods[e.currentPeriod];
                if (activePeriod.started && activePeriod.completed) {

                    // award the win if down to a single player,
                    // otherwise advance to the next round
                    let remainingPlayers = e.participants.filter((rP) => rP.losses < 2);
                    if (remainingPlayers.length == 1) {
                        await sendDiscordMessage(e, `# :trophy: Congratulations ${remainingPlayers[0].tag}!\n**${remainingPlayers[0].tag}** is the winner of ${e.name}!`);
                        
                        // show full results
                        e.participants.sort((a,b) => {
                            if (b.wins === a.wins) {
                                if (a.losses === b.losses) {
                                    return b.points - a.points;
                                }
                                return a.losses - b.losses;
                            }
                            return b.wins - a.wins;
                        });

                        let fullResultsMessageText = `## Full Results\n`;
                        let index = 1;
                        for (let player of e.participants) {
                            fullResultsMessageText += `#${index}: ${player.tag}\n-# ${player.wins} W - ${player.losses} L, ${player.points} point${(player.points === 1 ? "" : "s")}\n`;

                            index += 1;
                        }

                        await sendDiscordMessage(e, fullResultsMessageText);

                        e.completed = true;

                    } else {
                        e.currentPeriod += 1;
                    }

                    eUpdated = true;
                }
            }
        }

        // remove events from the save data if they've been completed.
        // imperative to walk the array backwards to not screw up indices
        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].completed) {

                // write event data to a file for postmortem review
                let timestamp = Math.floor(((new Date()).getTime() / 1000).toString());
                try {
                    fs.writeFileSync(`./events/finished/${events[i].discordChannel}_${timestamp}.txt`, JSON.stringify(events[i], null, 4), "utf-8");
                    events.splice(i, 1);
                    eUpdated = true;
                } catch (e) {
                    console.error(e);
                }                
            }
        }

        if (eUpdated) {
            writeEventData();
        }

        jobRunning.eventAdvance = false;
    });

    // daily: run the import mechanism
    cron.schedule(schedules.importEvent, async() => {
        if (jobRunning.importEvent) {
            return;
        }
        jobRunning.importEvent = true;

        await importEventData();

        jobRunning.importEvent = false;
    });

    // every Sunday, late at night: update chart data
    cron.schedule(schedules.updateGameData, async() => {
        
        jobRunning.updateGameData = true;

        let totalCharts = charts.data.length;
        let totalSongs = songs.data.length;
        console.log(`Total song count: ${totalSongs} // Total chart count: ${totalCharts}`);

        console.log("Reloading rerate data...");
        delete require.cache[require.resolve("./data/rerates.js")];
        rerates = require("./data/rerates.js");
        console.log("Done");

        console.log("Downloading updated chart data...");
        await axios.get("http://smx.573.no/api/charts").then((res) => {
            
            // officials (is_edit = false, is_enabled = 1)
            let officials = res.data.filter((c) => (c.is_edit != true && c.is_enabled === 1)); {

                // apply rerates not reflected in the official data
                for (let chart in officials) {
                    if (rerates[officials[chart]._id] !== undefined) {
                        if (rerates[officials[chart]._id].app === officials[chart].difficulty) {
                            officials[chart].difficulty = rerates[officials[chart]._id].game;
                            console.log(`Rerate applied to chart ID ${officials[chart]._id}`);
                        }
                    }
                }

                // write to file
                fs.writeFileSync("./data/chart-data.js", `module.exports = {\n\n\tdata: ${JSON.stringify(officials, null, 4)}\n\n}`, 'utf-8');
                console.log("Done (officials)");
            }
        
            // reload the module chart data is stored in
            delete require.cache[require.resolve("./data/chart-data.js")];
            charts = require("./data/chart-data.js");

            // incl. here to notify when the underlying chart data has changed
            console.log(`New data total charts: ${charts.data.length}`);
            if (totalCharts != charts.data.length) {
                sendDiscordMessageId(secrets.maintenanceChannelId, `:speech_balloon: New chart data has been downloaded.`);
                console.log("Chart data has changed!");
            } else {
                sendDiscordMessageId(secrets.maintenanceChannelId, `:speech_balloon: Chart data has been refreshed.`);
                console.log("Chart data was re-downloaded");
            }
        });

        console.log("Downloading updated song data...");
        await axios.get("http://smx.573.no/api/songs").then((res) => {

            // get all songs (is_enabled = true)
            let songs = res.data.filter((s) => (s.is_enabled)); {
                fs.writeFileSync("./data/song-data.js", `module.exports = {\n\n\tdata: ${JSON.stringify(songs, null, 4)}\n\n}`, 'utf-8');
                console.log("Done (songs)");
            }

            // reload the module song data is stored in
            delete require.cache[require.resolve("./data/song-data.js")];
            songs = require("./data/song-data.js");

            // incl. here to notify when underlying song data has changed
            console.log(`New data total songs: ${songs.data.length}`);
            if (totalSongs != songs.data.length) {
                sendDiscordMessageId(secrets.maintenanceChannelId, `:speech_balloon: New song data has been downloaded.`);
                console.log("Song data has changed!");
            } else {
                sendDiscordMessageId(secrets.maintenanceChannelId, `:speech_balloon: Song data has been refreshed.`);
                console.log("Song data was re-downloaded");
            }

        });

        // reload the leaderboard
        console.log("Reloading leaderboard file...");
        delete require.cache[require.resolve("./data/leaderboard.js")];
        leaderboard = require("./data/leaderboard.js");
        console.log("Done");

        fs.stat("./data/leaderboard.js", function(e, s) {
            let mTime = s.mtime;
            sendDiscordMessageId(secrets.maintenanceChannelId, `:speech_balloon: Leaderboard data reloaded (local file last modified: ${mTime}).`);
        });

        jobRunning.updateGameData = false;

    });

});