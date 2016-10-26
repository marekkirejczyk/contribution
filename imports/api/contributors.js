import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';

export const Contributors = new Mongo.Collection('contributors');


Meteor.methods({
  'sign' (value) {
    check(value, String);
    // Sign value with coinbase account
    this.unblock();
    const signer = web3.eth.coinbase;
    return web3.eth.sign(signer, value);
  },
  'ipaddress'() {
    // Return IP as seen from the Server
    return this.connection.clientAddress;
  },
  'contributors.insert' (address) {
    check(address, String);

    Contributors.insert({
      ip: this.connection.clientAddress,
      address,
      createdAt: new Date(),
    });
  },
});
