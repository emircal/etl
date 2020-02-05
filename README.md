# Royal Caribbean ETL Process PoC

The present Node.JS project showcases the architecture and solutions put forth during the MongoDB consult session of 01/28-01/31/2020 to implement the Cruise Search ETL process.

This process implements a shared token bucket (backed by a MongoDB collection) to provide rate-limited requests to the ESL service and update the price for sailings.

> :warning: **This code makes use of features available only on MongoDB ver 4.2.x**

## Refresh frequency rulebook

The refresh frequency rulebook allows the ETL process to determine how frequently to update the price of a sailing. Update rules are applied to sailings in the following situations:

1. At ETL startup, all sailings without an update time, or with an update time in the past.
2. Whenever a price is updated.
3. Whenever a new sailing is added.

You can specify arbitrary filters that determine what sailings belong to a specific update frequency.

If more than one rule applies to any sailing, the rule with the lowest update frequency will be used.

### Defining rules

Update cycle rules are defined as a JSON data structure. The format of a rule is:

```json
{
  "name": "<rule name>",
  "match": { <rule filter> },
  "updateEvery": "<frequency>"
}
```

To inhibit price updates for some sailings, it is possible to omit the `updateEvery` field, or set it to a value of `0`.

Additionally, you can define a default rule that applies to sailings for which no other named rule matches. The default rule is specified as follows:

```json
{
  "default": true,
  "updateEvery": "<frequency>"
}
```

If no default rule is specified, sailings that do not match a rule will never be updated.

### Rule filter

The rule filter determines whether the rule applies to a specific sailing. It consists of MongoDB-like expressions that are applied to a sailing document. If the sailing document matches the filter, then the rule applies to it.

You can use any of the following operators: `$lt`, `$lte`, `$gt`, `$gte`, `$eq`, `$ne`, `$in`, `$nin`, `$regex`, `$and`, `$or`, `$nor`, `$not`, `$exists`.

It is possible to refer to sub-document properties using the dot operator as in MongoDB, for example `address.city`.

### Update frequency

You can specify an update frequency using natural language, for example `1 hour` or `60 minutes`. You can also use compound notation as in `1 hour 30 minutes` and use abbreviations (`hr` or `h` for hours, `m` or `min` for minutes, etc.)

## Refresh cycle

Prices are refreshed periodically via a call to ESL. The frequency of update is calculated for each sailing and depends on the rules defined.
