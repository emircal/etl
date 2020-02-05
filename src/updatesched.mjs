// Scheduler for price updates from ESL
// Author: emir.calabuch@mongodb.com

// Imports
import parse from 'parse-duration';
import query from 'query';

/**
 * The scheduler takes care of determining what is the order in which sailing prices
 * are updated from ESL. It behaves like a queue that returns the next sailing to
 * update, taking into consideration the update frequency of all sailings.
 * 
 * Whenever a sailing price is updated, the timestamp for its next update is calculated
 * based on the update rules specified for the sailing. The ETL will pick the sailing that
 * has the closest update date.
 * 
 * Update rules are matched by priority. The rule with the highest priority that matches
 * the sailing being processed will be used to calculate its next update timestamp.
 */
export default class Scheduler {

  /**
   * Reloads the rulebook. Calculates frequencies and sorts rules by order of precedence.
   * 
   * @param rulebook the rulebook to use
   */
  reload(rulebook) {
    let mapped = rulebook.map( (r) => {
      if ('updateEvery' in r)
        r.updateEveryMs = parse(r.updateEvery);
      else
        r.updateEveryMs = 0;
      if (!('default' in r))
        r.default = false;
      return r;
    });
    // Sort by frequency, leaving defaults for the end
    let result = mapped.sort((a, b) => a.default && !b.default ? 1 : (b.default && !a.default ? -1 : a.updateEveryMs - b.updateEveryMs));
    // Sanitize the rulebook, add a fallback default at the end and remove all defaults except the first
    result.push({ "default": true, "updateEveryMs": 0 });
    for (let i = result.length - 2; i > 0; i--) {
      if (!result[i].default) break;
      result.pop();
    }
    this.rulebook = result;
  }

  /**
   * Initialize the schedule calculator.
   * 
   * @param rulebook the rulebook to use
   */
  constructor(rulebook) {
    this.reload(rulebook);
  }

  /**
   * Calculates the next update for an object, based on the rulebook definitions.
   * 
   * @param obj the object for which the next update is to be calculated
   * @returns the date at which the object should be updated the next time
   */
  apply(obj) {
    let interval = 0;
    for (let i = 0; i < this.rulebook.length; i++) {
      console.log(i);
      if (!this.rulebook[i].default) {
        // If rule is not a default, verify if it matches
        if (query.satisfies(obj, this.rulebook[i].match, undotSafe)) {
          interval = this.rulebook[i].updateEveryMs;
          break;
        }
      } else {
        // Rule is a default so we have not matched another rule previously, assign.
        interval = this.rulebook[i].updateEveryMs;
      }
    }
    console.log('Interval calculated: ', interval);
    return interval > 0 ? new Date(new Date().getTime() + interval) : 0;
  }
}

const undotSafe = function (obj, key) {
  var keys = key.split('.'), sub = obj;
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] in sub)
      sub = sub[keys[i]]
    else return undefined;
  }
  return sub;
};
