const fs = require('fs');
const code = fs.readFileSync('tests/aa.js', 'utf8');

// Find the string array
let match = code.match(/function _0x[a-f0-9]+\(\)\{const _0x[a-f0-9]+=\[([^\]]+)\];return/);
if (match) {
    let strings = match[1].split(',').map(s => {
        try {
            return eval(s);
        } catch(e) { return s; }
    });
    console.log("Strings found:", strings.length);
    console.log(strings.filter(s => typeof s === 'string' && (s.toLowerCase().includes("crypto") || s.length === 64 || s.toLowerCase().includes("hash"))));
} else {
    console.log("No string array found.");
}
