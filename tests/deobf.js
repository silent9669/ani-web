const fs = require('fs');
const code = fs.readFileSync('tests/aa.js', 'utf8');

// Find the string array
let match = code.match(/function _0x[a-f0-9]+\(\)\{const _0x[a-f0-9]+=\[([^\]]+)\];return/);
if (match) {
    let strings = match[1].split(',').map(s => s.replace(/^'|'$/g, '').replace(/\\x[0-9a-f]{2}/gi, (m) => String.fromCharCode(parseInt(m.slice(2), 16))));
    console.log("Strings found:", strings.length);
    console.log(strings.filter(s => s.toLowerCase().includes("crypto") || s.length == 64));
}
