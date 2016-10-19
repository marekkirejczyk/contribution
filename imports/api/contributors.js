import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';


export const Contributors = new Mongo.Collection('contributors');


if (Meteor.isServer) {
  // This code only runs on the server
  Meteor.publish('contributors', function contributorsPublication() {
    // Public information
    return Contributors.find({});
  });
}


Meteor.methods({
  'contributors.insert'(ip, address) {
    check(address, String);
    check(ip, Number);

    Contributors.insert({
      address,
      ip,
      createdAt: new Date(),
    });
  },
});
