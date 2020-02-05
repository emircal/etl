// MongoDB-backed implementation of a distributed token bucket
// Author: emir.calabuch@mongodb.com

/**
 * A Bucket object provides distributed token bucket semantics. Buckets are counters that
 * decrease on each call to consume() and increase on each call to feed(). Tokens are
 * added to the bucket regularly. Processes synchronizing on the bucket need to check that
 * a token can be consumed before proceeding.
 */
export default class Bucket {

  /**
   * Constructs the token bucket.
   * 
   * @param {string} name name for the token bucket.
   * @param {import("mongodb").Collection} collection the token bucket collection object.
   * @param {number} rate tokens per second to feed into the bucket. Defaults to 10.
   * @param {number} initial tokens that are added to a bucket at creation. Defaults to 
   * @param {number} limit maximum number of tokens that can be in the bucket if not consumed. unlimited if not specified.
   */
  constructor(name, collection, initial = 10, rate = 10, limit = Infinity) {
    this.name = `${name}.bucket`;
    this.collection = collection;
    this.rate = rate;
    this.limit = limit;
    this.initial = initial;
  }

  init() {
    // If the bucket document exists, acquire it. If it does not exist, insert it.
    // nextFeed date initialization: set only if record is inserted as it could have been
    // set by another thread to a time in the future.
    return this.collection.findOneAndUpdate(
      { '_id': this.name },
      {
        '$set': { 'rate': this.rate, 'limit': this.limit, 'initial': this.initial },
        '$setOnInsert': { 'count': this.initial, 'nextFeed': new Date() }
      }, { upsert: true });
  }

  /**
   * Adds tokens to the bucket up to the token limit. Sets the next feed cycle time.
   *
   * @param tokens indicates how many tokens to feed into the bucket, defaults to 1 if not specified.
   * @returns the total number of tokens in the bucket after addition.
   */
  feed (tokens = 1) {
    // TODO: Possibly need to fetch $$NOW from MongoDB to get cluster time ?
    let now = new Date();
    return this.collection.findOneAndUpdate(
        { '_id': this.name, 'nextFeed': { '$lte': now } },
        [
          { '$set': {
            'count': { '$min': [ { '$add': [ '$count', tokens ]}, '$limit' ] },
            'nextFeed': { '$add': [ '$$NOW', 200 ] }
          }}
        ])
      .then((result) => (result.value == null ) ? 0 : result.value.count);
  }
  
  /**
   * Consumes tokens from the bucket.
   *
   * @param tokens indicates how many tokens to consume, defaults to 1 if not specified.
   * @returns true if the token was consumed, false otherwise.
   */
  consume (tokens = 1) {
    return this.collection.updateOne(
        { _id: this.name, count: { $gte: tokens } },
        { $inc: { count: -tokens } }
      ).then((result) => {
        if (result.modifiedCount > 0) {
          // If the update count is greater than 0, we were able to consume the tokens
          return true;
        }
        else {
          // No rows updated so the token could not be consumed.
          return false;
        }
      });
  }
}