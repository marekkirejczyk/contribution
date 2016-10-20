import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';

import { Web3 } from 'meteor/ethereum:web3';

// Specifically not use mist/meta mask, as this is needed for server side signing.
// set the provider you want from Web3.providers
// web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
web3 = new Web3(new Web3.providers.HttpProvider('http://95.85.7.96:8545'));


export const Contributors = new Mongo.Collection('contributors');

Meteor.methods({
  'sign' (address, value) {
    check(address, String);
    check(value, String);
    return true;
    // web3.eth.sign(address, value, (err, sig) => {
    //   if (!err) {
    //     try {
    //       var r = sig.slice(0, 66);
    //       var s = '0x' + sig.slice(66, 130);
    //       var v = parseInt('0x' + sig.slice(130, 132), 16);
    //       if (sig.length<132) {
    //         //web3.eth.sign shouldn't return a signature of length<132, but if it does...
    //         sig = sig.slice(2);
    //         r = '0x' + sig.slice(0, 64);
    //         s = '0x00' + sig.slice(64, 126);
    //         v = parseInt('0x' + sig.slice(126, 128), 16);
    //       }
    //       if (v!=27 && v!=28) v+=27;
    //       console.log({r: r, s: s, v: v});
    //       return {r: r, s: s, v: v};
    //     } catch (err) {
    //       return false;
    //     }
    //   } else {
    //     return false;
    //   }
    // });
  },
  'contributors.insert'(address) {
    check(address, String);

    Contributors.insert({
      address,
      ip: this.connection.clientAddress,
      createdAt: new Date(),
    });
  },
});
