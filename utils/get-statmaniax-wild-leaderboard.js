const axios = require("axios");
const jsdom = require("jsdom");
const fs = require("fs");

const {JSDOM} = jsdom;

var req = axios.get("https://statmaniax.com/ranking/wild").then((res) => {
    let body = res.data;
    let dom  = new JSDOM(body);

    let leaderboard = dom.window.document.querySelectorAll(".userlist-ui .userlist-user");
    let ranking = [];

    let rankVar = 1;
    for (player of leaderboard) {
        let rawData = player.textContent.trim();
        rawData = rawData.split(":")[1].trim().split("\n")[0].trim();
        ranking.push({
            tag: rawData,
            rank: rankVar++
        });
    }

    fs.writeFileSync("./leaderboard.js", `module.exports = {\n\n\twild: ${JSON.stringify(ranking, null, 4)}\n\n}`);

    // console.log(ranking.find((p) => p.tag === "Pilot").rank);

});