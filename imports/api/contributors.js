import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check } from 'meteor/check';
import { BigNumber } from 'bignumber.js';

export const Contributors = new Mongo.Collection('contributors');

import Contribution from '/imports/lib/assets/contracts/Contribution.sol.js';
import MelonToken from '/imports/lib/assets/contracts/MelonToken.sol.js';

// Creation of contract object
Contribution.setProvider(web3.currentProvider);
MelonToken.setProvider(web3.currentProvider);
const contributionContract = Contribution.at('0x446BC4cAAcFC0Faaf2f3c0af6a665cDe5c4cCd7d');
const melonContract = MelonToken.at('0x231fA21e58d7658593cfF50883e3Ee4D6e4E4b78');

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
    if (now < startTime) {
      timeLeft = 'Not started yet';
    } else if (now >= endTime) {
      timeLeft = 'Contribution ended';
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


Meteor.methods({
  'isServerConnected'() {
    return web3.isConnected();
  },
  'sign'(value) {
    check(value, String);
    // Sign value with coinbase account
    const signer = web3.eth.coinbase;
    return web3.eth.sign(signer, value);
  },
  'etherRaised'() {
    return etherRaised;
  },
  'priceRate'() {
    return priceRate;
  },
  'timeLeft'() {
    return timeLeft;
  },
  'ipaddress'() {
    // Return IP as seen from the Server
    return this.connection.clientAddress;
  },
  'contributors.insert'(address) {
    check(address, String);
    Contributors.insert({
      ip: this.connection.clientAddress,
      address,
      createdAt: new Date(),
    });
  },
});
