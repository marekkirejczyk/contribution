import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';

export const Contributors = new Mongo.Collection('contributors');

import Contribution from '/imports/lib/assets/contracts/Contribution.sol.js';
import MelonToken from '/imports/lib/assets/contracts/MelonToken.sol.js';

// Creation of contract object
Contribution.setProvider(web3.currentProvider);
MelonToken.setProvider(web3.currentProvider);
const contributionContract = Contribution.at('0x244a87ed365e5524d602265ba794a0c055fa7c2b');
const melonContract = MelonToken.at('0xbba8ac4a82e64607ec18e64dcaed9184af9cce4b');

let etherRaised = 0;
let priceRate = 0;
let timeLeft = 0;

// Parse Contribution Contracts
function parseContracts() {
  contributionContract.etherRaised()
    .then((result) => {
      etherRaised = web3.fromWei(result.toNumber(), 'ether');
    });
  contributionContract.priceRate()
    .then((result) => {
      priceRate = result.toNumber() / 1000;
    });

  let startTime = 0;
  let endTime = 0;

  melonContract.startTime()
  .then((result) => {
    startTime = result.toNumber();
    return melonContract.endTime();
  })
  .then((result) => {
    endTime = result.toNumber();
    const now = Math.floor(Date.now() / 1000);

    if (startTime === 0 || endTime === 0) {
      timeLeft = -2;
    } else if (now < startTime) {
      timeLeft = -1;
    } else if (now >= endTime) {
      timeLeft = 0;
    } else {
      timeLeft = endTime - now;
    }
  });
}

/**
 * Startup code
 */
Meteor.startup(() => {
  Meteor.setInterval(parseContracts, 3000);
});


let ip = '0.0.0.0';


Meteor.methods({
  isServerConnected: () => web3.isConnected(),
  sign: (value) => {
    check(value, String);
    // Sign value with coinbase account
    const signer = web3.eth.coinbase;
    return web3.eth.sign(signer, value);
  },
  etherRaised: () => etherRaised,
  priceRate: () => priceRate,
  timeLeft: () => timeLeft,
  // ipaddress: () => this.connection.clientAddress,
  'contributors.insert': (address, ip) => {
    check(address, String);
    check(ip, String);

    Contributors.insert({
      address,
      ip,
      createdAt: new Date(),
    });
  },
  getIP: function(){
      var ip = this.connection.clientAddress;
      return ip;
  }
});
