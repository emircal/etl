import axios from "axios";

// Handles HTTP requests to third party services
// Author: emir.calabuch@mongodb.com

/**
 * Updates the list of sailings from ESL.
 * 
 * @param conf job configuration to use
 * @param sched scheduler to calculate update intervals
 * @param mongo MongoClient to connect to database
 */
export function getSailings(conf, sched, mongo) {
  // Request the list of sailings from ESL
  let lastSync = new Date();
  return axios.get(conf.sailingsUpdateUrl)
    .then(response => {
      if (response.status < 200 || response.status > 400) {
        console.log('Error processing sailing update', response);
        return Promise.reject('Error processing sailing update');
      } else if (!('header' in response.data) || !('status' in response.data.header) || response.data.header.status !== "Success") {
        console.log('Error processing sailing update', response);
        return Promise.reject('Error processing sailing update');
      } else if (!('resultsByPackage' in response.data) || !('packageSummaryWithClassLevelPricing' in response.data.resultsByPackage)) {
        console.log('Error processing sailing update', response);
        return Promise.reject('Error processing sailing update');
      }
      return Promise.resolve(response.data.resultsByPackage.packageSummaryWithClassLevelPricing);
    })
    .then(results => {
      // Upsert results into sailings collection in a bulk write op
      let coll = mongo.db(conf.sailingsDatabase).collection(conf.sailingsCollection);
      let bulk = coll.initializeUnorderedBulkOp();
      for (let i = 0; i < results.length; i++) {
        let sailing = results[i];
        // Update the sailing, append lastSync and update timestamp
        let ts = sched.apply(sailing);
        let code = sailing.packageReference.groupId;
        delete sailing._id;
        bulk.find({ "_id": code }).upsert().updateOne({
          '$set': Object.assign(sailing, { "etl": { "lastSync": lastSync, "nextUpdate": ts }})
        });
      }
      console.log("Updated sailing list");
      return bulk.execute();
    })
    .then(results => {
      // Delete sailings that were no longer synced or have no etl property
      let coll = mongo.db(conf.sailingsDatabase).collection(conf.sailingsCollection);
      return coll.deleteMany({ "$or": [{ "etl.lastSync": { "$lt": lastSync } }, { "etl": { "$exists": false } } ] });
    });
}

/**
 * Updates the price for a sailing.
 * 
 * @param conf job configuration to use
 * @param sched scheduler to use for update interval calculations
 * @param mongo MongoClient to connect to database
 */
export function getPrice(conf, sched, mongo) {
  return axios.get(conf.priceUpdateUrl)
    .then(response => {
      // Filter invalid response scenarios
    })
    .then(sailing => {
      // Update price and next schedule
      let ts = sched.apply(sailing);
      let coll = mongo.db(conf.sailingsDatabase).collection(conf.sailingsCollection);
      return coll.updateOne({ _id: refCode }, { "nextUpdate": ts });
    })
}
