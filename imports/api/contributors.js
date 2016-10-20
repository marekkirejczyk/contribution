import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';

import { Web3 } from 'meteor/ethereum:web3';

// Specifically not use mist/meta mask, as this is needed for server side signing.
// set the provider you want from Web3.providers
// web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));


export const Contributors = new Mongo.Collection('contributors');

Meteor.methods({
  'sign' (value) {
    check(value, String);
    // By definition signer is coinbase account
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
