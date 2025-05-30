"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countMatches = countMatches;
exports.parse = parse;
const console_1 = require("console");
/**
 * Count the number of instance of the regex in the string
 * @param text the string
 * @param re the regular expression (must have global flag!!)
 * @returns
 */
function countMatches(text, re) {
    return (text.match(re) || []).length;
}
function parse(result, RXDict) {
    (0, console_1.debug)("Responded");
    //const result =  xhttp.responseText;
    const labelRX = /class .*?def/gs;
    const ruleRX = /rule = re\.compile\(r\'\.*\'\)/;
    const res = [];
    let count = 0;
    let m;
    while (m = labelRX.exec(result)) {
        //debug(m[0]);
        // TODO: Account for comments at end of lines?
        let noComments = m[0].replace(/^\s*\#.*\n/gm, "");
        //debug("\n\nnoComments: \n" + noComments);
        let start = noComments.indexOf("rule = re.compile(r'");
        if (start === -1) {
            continue;
        }
        let end = noComments.indexOf("\n", start);
        //debug(m[0].substring(start,end));
        let rx = noComments.substring(start, end);
        //debug("RX: " + rx);
        // This is the raw regex string, excluding additions for IF statements, etc.
        rx = rx.replace("rule = re.compile(r'", "").replace(/'.*?$/, "");
        rx = rx.replace("rule = re.compile(r\"\"\"", "").replace(/\"\"\".*?$/, "");
        // const openPar = rx.split("(");
        // const closePar = rx.split(")");
        // const c = openPar.length - closePar.length;
        // if (c > 0) {
        // 	rx = "(".repeat(Math.abs(c)) + rx;
        // } else {
        // 	rx = rx + ")".repeat(Math.abs(c));		
        // }
        //debug(rx);
        let className = noComments.replace(/(\(\w+\)){0,1}:.*/, "").replace(/class /, "");
        //debug("ClassName: " + className);
        try {
            const rxe = pyre(rx);
            //debug(rxe);
            const ret = {
                name: className,
                rx: rxe
            };
            RXDict.set(className, rxe);
            //debug(className);
            //debug(RXDict.get(className));
        }
        catch (e) {
            //debug(m[0]);
            //debug(e as string);
            // Kinda don't actually care if there's a failure here.
        }
        count += 1;
        //if (count > 50) {break;}
    }
    return RXDict;
}
/**
 * Returns a JavaScript RegExp instance from the given Python-like string.
 *
 * An empty array may be passsed in as the second argument, which will be
 * populated with the "named capture group" names as Strings in the Array,
 * once the RegExp has been returned.
 *
 * @param {String} pattern - Python-like regexp string to compile to a JS RegExp
 * @return {import("./types").PyreRegExp} returns a JavaScript RegExp from the given `pattern`,
 *  with an additional function `pyreReplace` for Python-like replacement
 * @public
 */
function pyre(pattern) {
    pattern = String(pattern || '').trim();
    //debug(pattern);
    // populate namedCaptures array and removed named captures from the `pattern`
    let namedCaptures = [];
    let namedCaptureValues = [];
    var numGroups = 0;
    pattern = replaceCaptureGroups(pattern, function (group) {
        //var match = /^\(\?P[<]([^>]+)[>]([^\)]+)\)$/.exec(group);
        var match = /^\(\?P[<]([^>]+)[>](.*?)\)$/.exec(group);
        if (/^\(\?P[<]/.test(group)) {
            if (match === null) {
                //debug(group);
                return group;
            }
            // Python-style "named capture"
            // It is possible to name a subpattern using the syntax (?P<name>pattern).
            // This subpattern will then be indexed in the matches array by its normal
            // numeric position and also by name.
            if (namedCaptures) {
                //debug(match);
                namedCaptures[numGroups] = match[1];
                namedCaptureValues[numGroups] = match[2];
                //debug(match[1]);
            }
            numGroups++;
            return '(' + match[2] + ')';
        }
        else if ('(?P=' === group.substring(0, 4)) {
            for (const i in namedCaptures) {
                if (group === '(?P=' + namedCaptures[i] + ")") {
                    //debug(namedCaptures[i]);
                    return '(' + namedCaptureValues[i] + ')';
                }
            }
            // previously named group, replace with applicable capture group.
        }
        else if ('(?:' === group.substring(0, 3)) {
            // non-capture group, leave untouched
            return group;
        }
        else {
            // regular capture, leave untouched
            numGroups++;
            return group;
        }
        numGroups++;
        return group;
    });
    //debug(pattern);
    // for (const i in namedCaptures) {
    // pattern.replace('',
    // }
    var regexp = new RegExp(pattern);
    //   regexp.pyreReplace = function(source:string, replacement:string) {
    //     var jsReplacement = pyreReplacement(replacement, namedCaptures);
    //     return source.replace(this, jsReplacement);
    //   }
    return regexp;
}
function pyreReplacement(replacement, namedCaptures) {
    var jsReplacement = "";
    var i = 0;
    var replacementLength = replacement.length;
    while (i < replacementLength) {
        var cur = replacement[i];
        if (cur == '\\' && i != (replacementLength - 1)) {
            var next = replacement[i + 1];
            var inext = -1;
            if (next == '\\') {
                jsReplacement += '\\';
                i += 2;
            }
            else if (next == 'g' && i < (replacementLength - 3)) {
                var closeIndex = null;
                for (var j = i + 3; j < replacementLength; j++) {
                    if (replacement[j] == ">") {
                        closeIndex = j;
                        break;
                    }
                }
                if (replacement[i + 2] == "<" && closeIndex) {
                    var group = replacement.substring(i + 3, closeIndex);
                    var igroup = -1;
                    //if(isNaN(group)) {
                    for (var k = 0; k < namedCaptures.length; k++) {
                        if (group == namedCaptures[k]) {
                            igroup = k + 1;
                            break;
                        }
                    }
                    //}
                    if (igroup > -1) {
                        group = igroup.toString();
                    }
                    jsReplacement += "$" + group;
                    i = closeIndex + 1;
                }
                else if (replacement[i + 2] == "<") {
                    throw Error("No close for regular expression replacement group \\g<");
                }
                else {
                    jsReplacement += cur;
                    i++;
                }
            }
            else if (next == '0') {
                jsReplacement += '$&';
                i += 2;
            }
            else if (inext > -1) {
                jsReplacement += '$' + next;
                i += 2;
            }
            else {
                jsReplacement += cur;
                i++;
            }
        }
        else if (cur == '$' && i != (replacement.length - 1)) {
            jsReplacement += '$$';
            i++;
        }
        else {
            jsReplacement += cur;
            i++;
        }
    }
    return jsReplacement;
}
/**
 * Invokes `fn` for each "capture group" encountered in the PCRE `pattern`,
 * and inserts the returned value into the pattern instead of the capture
 * group itself.
 *
 * @private
 */
function replaceCaptureGroups(pattern, fn) {
    var start = 0;
    var depth = 0;
    var escaped = false;
    for (var i = 0; i < pattern.length; i++) {
        var cur = pattern[i];
        if (escaped) {
            // skip this letter, it's been escaped
            escaped = false;
            continue;
        }
        switch (cur) {
            case '(':
                // we're only interested in groups when the depth reaches 0
                if (0 === depth) {
                    start = i;
                }
                depth++;
                break;
            case ')':
                if (depth > 0) {
                    depth--;
                    // we're only interested in groups when the depth reaches 0
                    if (0 === depth) {
                        var end = i + 1;
                        var l = start === 0 ? '' : pattern.substring(0, start);
                        var r = pattern.substring(end);
                        var v = String(fn(pattern.substring(start, end)));
                        pattern = l + v + r;
                        i = start;
                    }
                }
                break;
            case '\\':
                escaped = true;
                break;
        }
    }
    return pattern;
}
//# sourceMappingURL=rx.js.map