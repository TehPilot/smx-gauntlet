const axios = require("axios");
const cron  = require("node-cron");
const fs    = require("fs");
const {Client, Intents, MessageAttachment} = require('discord.js');

// Discord client intents
const client = new Client({
	intents: [
		Intents.FLAGS.GUILD_MESSAGES
	],
	partials: ['MESSAGE', 'CHANNEL']
});

/*
intents: [
		Intents.FLAGS.DIRECT_MESSAGES,
		Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
		Intents.FLAGS.DIRECT_MESSAGE_TYPING,
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_BANS,
		Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
		Intents.FLAGS.GUILD_INTEGRATIONS,
		Intents.FLAGS.GUILD_INVITES,
		Intents.FLAGS.GUILD_MEMBERS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
		Intents.FLAGS.GUILD_MESSAGE_TYPING,
		Intents.FLAGS.GUILD_SCHEDULED_EVENTS,
		Intents.FLAGS.GUILD_VOICE_STATES,
		Intents.FLAGS.GUILD_WEBHOOKS
	],
*/

// const tourney = require("./tourney.js");
const charts = require("./data/chart-data.js");
const songs  = require("./data/song-data.js");
const secrets = require("./data/secrets.js");
const leaderboard = require("./data/leaderboard.js");

/* // API parameters for reference:
---------------------------------------------------------
date from:                          from=[yyyy-mm-dd]
date to:                            to=[yyyy-mm-dd]
player:                             user=[username]
artist:                             artist=[artist]
song name:                          title=[song name]
difficulty:                         difficulty_id=[id]
earliest score, chronologically:    asc=1
via chart ID:                       chart_ids=[chard_id]
----------------------------------------------------------
*/

/*
thoughts:
- scoring should go off leaderboard value, not score? or weight it according to difficulty somehow
- (just not "money score" alone, perhaps)
- track a player's total event average or so for tiebreak purposes
- look at querying statmx for rank data for authoritative tiebreak purposes
*/

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
// event is parameterized here to simply calls to the discord channel ID stored in an event
async function sendDiscordMessage(eventRef, messageText) {
    let channelRef = await client.channels.fetch(eventRef.discordChannel);
    channelRef.send({
        content: messageText
    });
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
        let eData = JSON.parse(fs.readFileSync(`./events/new/${file}`));
        events = events.concat(eData);
        console.log("New event loaded");

        // move file by copying it to a new location and then deleting the original
        fs.copyFileSync(`./events/new/${file}`, `./events/old/${file}`);
        fs.unlinkSync(`./events/new/${file}`);

        newEvents = true;
    }

    // immediately commit the change
    if (newEvents) {
        await writeEventData();
    }
}

// calculates dance point / leaderboard point value of a score
function calculateLeaderboardScore(score, diff) {
    return Math.floor((score * diff * diff) / 1000);
}

// all cron schedules in one place for modifying.
// remove the last asterisk in each one to switch from per-second to per-hour processing
const schedules = {
    eventInitialize:    "0,20,40 */1 * * *",
    periodStart:        "3,23,43 */1 * * *",
    periodEnd:          "6,26,46 */1 * * *",
    eventAdvance:       "9,29,49 */1 * * *",
    importEvent:        "55 4 * * *"
}

// control flags that make sure if a scheduled job is already running,
// we don't start another one (legitimate concurrency issues happened in test)
var jobRunning = {
    eventInitialize:    false,
    periodStart:        false,
    periodEnd:          false,
    eventAdvance:       false,
    importEvent:        false
}

// task schedulers to be fired on discord login
client.login(secrets.discordToken).then(async () => {

    events = await loadEventData();
    await importEventData();
    console.log("Ready");

    // initialize an event if not ongoing
    cron.schedule(schedules.eventInitialize, async () => {

        if (jobRunning.eventInitialize) {
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

        if (jobRunning.periodStart) {
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
                    console.log("Started event period " + e.currentPeriod + " for event " + e.name);
                    console.log("The following charts have been drawn:");

                    dMessageText += `# ${e.name} - Round ${e.currentPeriod + 1}\n`;
                    dMessageText += `ends <t:${getUnixTimestamp(activePeriod.end)}>\n\nPlay the following charts:\n`;

                    // run card draw
                    for (let draw of activePeriod.draws) {

                        // filter all valid charts down to ones in the specified difficulty and level range.
                        // also exclude anything we've already drawn (no duplicates)
                        // also somehow I got removed song charts, so I have to filter those too ...
                        let cardDraw = charts.data.filter((c) =>
                            c.difficulty_name.startsWith(draw.difficulty.toLowerCase())
                            && c.difficulty >= draw.lower
                            && c.difficulty <= draw.upper
                            && c.is_enabled
                            && !e.excludeCharts.includes(c._id)
                            && !activePeriod.excludeCharts.includes(c._id)
                        );

                        // this basically shuffles all valid charts in a range
                        cardDraw = cardDraw.map(v => ({ v, sort: Math.random()}))
                        cardDraw = cardDraw.sort((a, b) => a.sort - b.sort)
                        cardDraw = cardDraw.map(({v}) => v)

                        // take only what we need from the valid charts
                        // first entries from a randomly shuffled list, so basically a random amt equal to draw.quantity
                        cardDraw = cardDraw.slice(0, Math.min(draw.quantity, cardDraw.length));

                        for (card of cardDraw) {
                            // push the retrieved chart IDs from the draw into the period's chart list
                            activePeriod.charts.push(card);

                            // also push the chart ID into the exclusion list (so they don't appear multiple times)
                            e.excludeCharts.push(card._id);

                            // looks up the song data so we can show the users the title and artist
                            // ... for some reason the API calls Beginner "Basic" so we do a transformation here
                            let songRef = songs.data.find((s) => s._id === card.song_id);
                            dMessageText += `\> **${songRef.title}** by ${songRef.artist} (${draw.difficulty.replace("Basic", "Beginner")} ${card.difficulty})\n`
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
        if (jobRunning.periodEnd) {
            return;
        }
        jobRunning.periodEnd = true;
        
        console.log("Running routine: event period completion");

        let eUpdated = false;

        // run for all active events
        for (let e of events) {
            if (e.started && !e.completed) {

                // get the current period of the event
                let activePeriod = e.periods[e.currentPeriod];
                let eEndTime = getUnixTimestamp(activePeriod.end);
                let currentTime = getUnixTimestamp(new Date().getTime());

                // only tabulate scores if the event period is over
                if (activePeriod.started && !activePeriod.completed && currentTime >= eEndTime) {
                    
                    console.log(`Player results for event ${e.name}; period ${e.currentPeriod}:`);
                    let roundData = [];

                    // filter out players who have been eliminated (2 losses)
                    let validParticipants = e.participants.filter((vP) => vP.losses < 2);
                    for (p of validParticipants) {

                        // retrieve player's scores on charts and sum them up for round end total
                        let pFinalScore = 0;
                        for (c of activePeriod.charts) {
                            let pScores = await getScore(activePeriod.start, activePeriod.end, c._id, p.tag);
                            let pScore = 0;
                            if (pScores.length > 0) {
                                pScore = pScores[0].score;
                                pFinalScore += pScore;
                            }
                            console.log(`Player ${p.tag} on chart ${c._id}: ${pScore}`);
                        }

                        // push the player's results to a table to be reviewed
                        roundData.push({
                            player: p.tag,
                            score: pFinalScore,
                            rank: leaderboard.wild.find((r) => r.tag === p.tag).rank
                        });

                    }

                    // sort the table by score (used to determine winners and losers).
                    // tiebreak on saved wild data
                    roundData.sort(function(a, b) {
                        if (b.score === a.score) {
                            return a.rank - b.rank;
                        }
                        return b.score - a.score;
                    });
                    console.log(roundData);

                    // TODO: something else for showing score data. not ideal for a ton of participants due to Discord message size limits
                    await sendDiscordMessage(e, `**${e.name} - Round ${e.currentPeriod + 1} - Raw Results**\n\n\`\`\`${JSON.stringify(roundData, null, 4)}\`\`\``)

                    let dMessageText = `# ${e.name} - Round ${e.currentPeriod + 1} Results\n\n`;

                    // top slice: winners
                    var winners = roundData.slice(0, Math.floor(roundData.length / 2)).reduce((a, v) => {
                        return a.concat(v.player)
                    }, []);
                    console.log("This round's winners: " + winners.join(", "));
                    dMessageText += `**Winners**: ${winners.join(", ")}\n\n`;

                    // bottom slide: losers
                    var losers = roundData.slice(Math.floor(roundData.length / 2), roundData.length).reduce((a, v) => {
                        return a.concat(v.player)
                    }, []);
                    console.log("This round's losers: " + losers.join(", "));
                    dMessageText += `**Losers**: ${losers.join(", ")}\n\n`;

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
                
                    // hand the losers a loss and note if they have been eliminated
                    for (l of losers) {
                        let pIndex = e.participants.findIndex((e) => {
                            return e.tag === l;
                        });
                        let pRef = e.participants[pIndex];
                        if (pRef !== undefined) {
                            pRef.losses += 1;
                            if (pRef.losses >= 2) {
                                console.log(l + " has been eliminated!");
                                await sendDiscordMessage(e, `**${l}** has been eliminated from ${e.name}.`)
                            }
                        }
                    }
                
                    // close out the week
                    activePeriod.completed = true;
                    eUpdated = true;
                } else {
                    if (activePeriod.completed) {
                        console.log("Event already ended");
                    } else {
                        console.log(`Period not over yet - current time: ${currentTime} | end time: ${eEndTime} `);
                    }
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
        if (jobRunning.eventAdvance) {
            return;
        }
        jobRunning.eventAdvance = true;

        console.log("Running routine: event period ending");

        let eUpdated = false;
        let eOver = [];

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
                        console.log(`Congratulations ${remainingPlayers[0].tag} for winning ${e.name}!`);
                        await sendDiscordMessage(e, `# Congratulations ${remainingPlayers[0].tag}!\n**${remainingPlayers[0].tag}** is the winner of ${e.name}!`);
                        e.completed = true;
                    } else {
                        e.currentPeriod += 1;
                    }

                    eUpdated = true;
                }
            } else if (e.started && e.completed) {
                eOver.push(events.indexOf(e));
            }
        }

        // remove events from the save data if they've been completed.
        // TODO: maybe save the data to a file for future analysis if needed?
        // imperative to walk the array backwards to not screw up indices
        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].completed) {
                events.splice(i, 1);
                eUpdated = true;
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
    })

});