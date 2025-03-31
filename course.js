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
const secrets = require("./data/secrets.js");

var coursePlayers = ["Pilot", "SenPi"];
var courseData = [];

var updateChannel = "1278586384294088816";

async function getPlayerScores(wStart, wEnd, player, skip = 0) {
    let requestUrl = `https://api.smx.573.no/scores?q={"updated_at":{"gte":"${wStart}","lte":"${wEnd}"},"gamer.username":"${player}","_skip":${skip},"_order":"asc"}`;
    let response = null;

    await axios.get(requestUrl).then((res) => {
        response = res.data;
    });

    return response;
}

// basic function to send a message to a Discord channel.
// event is parameterized here to simplify calls to the discord channel ID stored in an event
async function sendDiscordMessage(channelID, messageText) {

    // wait for the channel reference
    let channelRef = await client.channels.fetch(channelID);

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

// loads event data from text file
async function loadEventData() {
    let eDataString = fs.readFileSync("./save/course_data.json", "utf8");
    if (eDataString === undefined || eDataString === "") {
        return [];
    } else {
        return JSON.parse(eDataString);
    }
}

// writes event data to text file
async function writeEventData() {
    var eDataString = JSON.stringify(courseData, null, 4);
    fs.writeFile("./save/course_data.json", eDataString, (err) => {
        if (err) {
            console.log("An error occurred when writing event data to file.");
            return console.log(err);
        }
    });
}

client.login(secrets.discordToken).then(async () => {

    courseData = await loadEventData();

    // 8:05am UTC
    cron.schedule("5 8 * * *", async () => {

        // for each course:
        for (let course of courseData) {

            console.log(`Analyzing course ${course.course_name} ...`);

            let lastUpdatedDate = new Date(course.course_last_calculated);
            let currentTime = new Date();

            console.log(`Course was last updated on ${lastUpdatedDate}`);

            // if the last update was over a day old
            if (currentTime - lastUpdatedDate > 86400000) {     // if (currentTime - lastUpdatedDate > 86400000) {

                console.log(`Updating scores for course ${course.course_name}`);
                let newUpdatedDate = new Date(lastUpdatedDate.getTime() + (1000 * 60 * 60 * 24));
                let courseUpdated = false;

                // for each player in the course:
                for (let player of coursePlayers) {

                    console.log(`Checking player ${player}'s performance on course ${course.course_name}`);
                    // set their base score if it's not defined
                    if (course.pbs[player] === undefined) {
                        course.pbs[player] = 0;
                    }

                    // retrieve all their scores for the period (uses a loop in case a player has 100+ scores/day)
                    let playerScores = [];
                    let playerScoresIndex = 0;
                    let playerScoresFinished = false;

                    while (!playerScoresFinished) {
                        let scoreBatch = await getPlayerScores(lastUpdatedDate.toISOString(), newUpdatedDate.toISOString(), player, playerScoresIndex);

                        playerScoresIndex += scoreBatch.length;
                        playerScores = playerScores.concat(scoreBatch);
                        if (scoreBatch.length === 0) {
                            playerScoresFinished = true;
                        }
                    }

                    console.log(`Scores for player ${player} retrieved for day beginning ${lastUpdatedDate}`);

                    // at this point we have all their scores for the day.
                    // start checking for course compliance
                    let courseSongIndex = 0;
                    let courseScoreTotal = 0;
                    let courseScoreIDs = [];

                    // iterate through every score that day:
                    for (var i = 0; i < playerScores.length; i++) {

                        // if the song played is in the course:
                        console.log(`Course song index: ${courseSongIndex}`);
                        if (playerScores[i].song._id === course.course_songs[courseSongIndex] && courseSongIndex < course.course_songs.length) {
                            
                            let runValid = true;

                            // invalidate a course run if there's too much time between songs (>5 min, expressed as 300 seconds)
                            if (courseScoreIndex > 0) {
                                if ((new Date(playerScores[i].created_at) - new Date(playerScores[i - 1]) / 1000) > 240) {
                                    runValid = false;
                                    console.log("RUN INVALID: time between two songs is too long");
                                }
                            }

                            // invalidate a course run if it's QR code scanned (protection against cheating)
                            if (playerScores[i].max_combo === -1) {
                                runValid = false;
                                console.log("RUN INVALID: QR code score");
                            }

                            if (runValid) {
                                console.log(`Played song in course (ID: ${playerScores[i].song._id})`);
                                courseSongIndex++;
                                courseScoreTotal += (playerScores[i].score * (playerScores[i].chart.difficulty * playerScores[i].chart.difficulty)) / 1000;
                                courseScoreIDs.push(playerScores[i]._id);

                                // if the player failed the chart, terminate the course early
                                if (!playerScores[i].cleared) {
                                    courseSongIndex == course.course_songs.length;
                                }
                            } else {
                                courseSongIndex = 0;
                                courseScoreTotal = 0;
                                courseScoreIDs = [];
                            }

                        }
                        else if (courseSongIndex > 0) {
                            console.log(`Course broken against ID ${playerScores[i].song._id}`);
                            courseSongIndex = 0;
                            courseScoreTotal = 0;
                            courseScoreIDs = [];

                            i -= 1;
                        } else {
                            console.log(`Song played is not part of course (ID: ${playerScores[i].song._id})`);
                            courseSongIndex = 0;
                        }

                        if (courseSongIndex === course.course_songs.length) {
                            if (courseScoreTotal > course.pbs[player]) {
                                course.pbs[player] = Math.floor(courseScoreTotal);
                                console.log(`New course PB for player ${player}: ${course.pbs[player]}`);
                                await sendDiscordMessage(updateChannel, `:medal: **${player}** has set a new personal best for course **${course.course_name}**: ${course.pbs[player]} pts\n-# ${courseScoreIDs.filter((s) => s > 0).map((s) => `[${s}](<https://scores.stepmaniax.com/${s}>)`).join(", ")}`);
                                courseUpdated = true;
                            }
                            courseSongIndex = 0;
                            courseScoreTotal = 0;
                            courseScoreIDs = [];
                        }
                    }

                }

                course.course_last_calculated = newUpdatedDate.toISOString().replace(".000", "");
                console.log(`Course ${course.course_name} given new revision datestamp: ${course.course_last_calculated}`);

                if (courseUpdated) {
                    let courseScoresOrdered = [];
                    for (let p in course.pbs) {
                        courseScoresOrdered.push([p, course.pbs[p]]);
                    }
                    courseScoresOrdered.sort((a,b) => {
                        return b[1] - a[1];
                    });

                    let leaderboardText = "";
                    let medalImages = [":first_place:", ":second_place:", ":third_place:", "medal"];
                    for (let s = 0; s < courseScoresOrdered.length; s++) {
                        leaderboardText += `${medalImages[Math.min(s, medalImages.length - 1)]} ${courseScoresOrdered[s][0]} (${courseScoresOrdered[s][1]} pts)\n`;
                    }

                    console.log(courseScoresOrdered);
                    await sendDiscordMessage(updateChannel, `# ${course.course_name} - Current Leaderboard\n${leaderboardText}`);
                }

            }
            console.log(`Done analyzing course ${course.course_name}`);
        }
        writeEventData();

        console.log("Done");

    });

});