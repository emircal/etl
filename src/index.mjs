// Entry point for the ETL process
// Author: emir.calabuch@mongodb.com

// Imports
import { readFileSync } from 'fs';
import MongoClient from 'mongodb';
import Bucket from './tokenbucket.mjs';
import Scheduler from './updatesched.mjs';
import { getSailings } from './requests.mjs';

// Read configuration data
var conf = JSON.parse(readFileSync('config.json', 'utf8'));

let mongo;
let consumes = {};
let handleFeeder;
let handleUpdater;

async function init() {
  mongo = await MongoClient.connect(conf.mdbServerUri, { useUnifiedTopology: true });

  let coll = mongo.db(conf.tokenBucketDatabase).collection(conf.tokenBucketCollection);

  // Initialize token bucket
  let bucket = new Bucket(conf.bucketName, coll, conf.initialTokens, conf.ratePerSecond, conf.bucketLimit);
  await bucket.init();

  // Initialize schedule calculator
  let schedule = new Scheduler(conf.rulebook);
  console.log(schedule.rulebook);

  // Initialize data, download list of sailings and update sailing collection
  await getSailings(conf, schedule, mongo);

  // Calculate next sync timestamp for sailings with no sync timestamp (new) or in the past (after restart)
  

  // Start token feeding process
  handleFeeder = setInterval(async () => {
    let r = await bucket.feed(1);
  }, 200);

  // Start price update process
  handleUpdater = setInterval(async () => {
    let r = await bucket.consume(1);
    if (r) {
      let sec = Math.floor(new Date().getTime() / 1000);
      consumes[sec] = consumes.hasOwnProperty(sec) ? consumes[sec] + 1 : 1;
      await mongo.db(conf.tokenBucketDatabase).collection("counts").updateOne({ _id: sec }, {
        $set: {count: consumes[sec] }}, { upsert: true });

    }
  }, 50);

  // set a watch on the bucket collection and emit a signal when a token is available for consumption
}

// Set a handler for termination event that suspends schedules
// and closes the connection
process.on('SIGINT', (code) => {
  // Clear intervals
  clearInterval(handleFeeder);
  clearInterval(handleUpdater);
  mongo.close();
  console.log('Exiting');
});

init();
