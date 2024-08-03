const axios = require("axios");
const jsdom = require("jsdom");
const fs = require("fs");

const {JSDOM} = jsdom;

const leaderboards = ["beginner", "easy", "hard", "wild", "dual", "full", "total"];
let lbData = {};

async function getLeaderboards() {
    for (leaderboard of leaderboards) {
        var req = await axios.get(`https://statmaniax.com/ranking/${leaderboard}`).then((res) => {
            let body = res.data;
            let dom  = new JSDOM(body);

            let board = dom.window.document.querySelectorAll(".userlist-ui .userlist-user");
            let ranking = [];

            let rankVar = 1;
            for (player of board) {
                let rawData = player.textContent.trim();
                rawData = rawData.split(": ")[1].split("\n")[0];
                ranking.push({
                    tag: rawData,
                    rank: rankVar++
                });
            }
            lbData[leaderboard] = ranking;
        });
    }

    fs.writeFileSync("./leaderboard.js", `module.exports = ${JSON.stringify(lbData, null, 4)}`);
}
getLeaderboards();

// console.log(lbData["dual"].find((p) => p.tag === "Pilot").rank);