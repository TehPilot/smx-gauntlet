const fs = require("fs");
const axios = require("axios");

axios.get("http://smx.573.no/api/songs").then((res) => {
    let songs = res.data.filter((s) => (s.is_enabled)); {
        fs.writeFileSync("song-data.js", `module.exports = {\n\n\tdata: ${JSON.stringify(songs, null, 4)}\n\n}`, 'utf-8');
        console.log("Done (songs)");
    }
});