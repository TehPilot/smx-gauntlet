const fs = require("fs");
const axios = require("axios");
const charts = require("./chart-data_edits.js");

axios.get("http://smx.573.no/api/charts").then((res) => {

    let officials = res.data.filter((c) => (c.is_edit != true && c.is_enabled === 1)); {
        fs.writeFileSync("chart-data.js", `module.exports = {\n\n\tdata: ${JSON.stringify(officials, null, 4)}\n\n}`, 'utf-8');
        console.log("Done (officials)");
    }

    let edits = res.data.filter((c) => (c.is_edit)); {
        fs.writeFileSync("chart-data_edits.js", `module.exports = {\n\n\tdata: ${JSON.stringify(edits, null, 4)}\n\n}`, 'utf-8');
        console.log("Done (edits)");
    }
});