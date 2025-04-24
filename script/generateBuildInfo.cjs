// generateBuildInfo.cjs
const fs = require('fs');

const assets = fs.readdirSync("dist/assets");

const buildInfo = {
    buildTime: `${Date.now()}`,
    assets,
};
fs.writeFileSync("dist/latest.json", JSON.stringify(buildInfo, null, 2));

const data = fs.readFileSync("dist/index.html", 'utf8');
const updatedContent = data.replace('%buildTime%', buildInfo.buildTime);
fs.writeFileSync("dist/index.html", updatedContent, 'utf8');

console.log("Version file generated.")