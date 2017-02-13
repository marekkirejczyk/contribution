import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { HTTP } from 'meteor/http';
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

let clientIp = '0.0.0.0';
let clientData;
let isUS = true;
Meteor.onConnection((connection) => {
  clientIp = connection.clientAddress;
  console.log(clientIp);
  HTTP.get(`http://ipinfo.io/${clientIp}`, (e, res) => {
    if (!e) {
      if (clientIp === '0.0.0.0') return;
      if (res.statusCode !== 200) return;
      const data = res.data;
      clientData = data;
      console.log(data)
      if (data.country === 'US') isUS = true;
      else isUS = false;
    }
  });
});

Meteor.methods({
  isServerConnected: () => web3.isConnected(),
  clientIp: () => clientIp,
  isUS: () => isUS,
  sign: (value) => {
    check(value, String);
    // Sign value with coinbase account
    const signer = web3.eth.coinbase;
    return web3.eth.sign(signer, value);
  },
  etherRaised: () => etherRaised,
  priceRate: () => priceRate,
  timeLeft: () => timeLeft,
  'contributors.insert': (address) => {
    check(address, String);
    Contributors.insert({
      address,
      isUS,
      clientData,
      createdAt: new Date(),
    });
  },
});
