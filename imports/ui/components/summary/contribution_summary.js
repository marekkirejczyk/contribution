import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';

import Contribution from '/imports/lib/assets/contracts/Contribution.sol.js';
import MelonToken from '/imports/lib/assets/contracts/MelonToken.sol.js';

import './contribution_summary.html';

// Creation of contract object
Contribution.setProvider(web3.currentProvider);
//TODO fix default
const contributionContract = Contribution.at(Contribution.all_networks['default'].address);
MelonToken.setProvider(web3.currentProvider);

console.log(contributionContract.address)

let ETHER_CAP = 0;
let melonContract;
let startTime = 0;
let endTime = 0;
let currentPrice = 0;

String.prototype.toHHMMSS = function () {
    var sec_num = parseInt(this, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    return hours+':'+minutes+':'+seconds;
}

Template.contribution_summary.onCreated(() => {
  contributionContract.etherRaised()
    .then((result) => {
      Session.set('etherRaised', web3.fromWei(result.toNumber(), 'ether'));
    });
  contributionContract.ETHER_CAP()
    .then((result) => {
      ETHER_CAP = web3.fromWei(result.toNumber(), 'ether');
    });
  contributionContract.priceRate()
    .then((result) => {
      Session.set('currentPrice', result.toNumber() / 1000);
    });

  contributionContract.melonToken()
    .then((result) => {
      melonContract = MelonToken.at(result);
      return melonContract.minter();
    }).then((result) => {
      console.log(result);
      return melonContract.melonport();
    }).then((result) => {
      console.log(result);
      return melonContract.startTime();
    }).then((result) => {
      startTime = result.toNumber();
      return melonContract.endTime();
    }).then((result) => {
      // TODO if starttime > now
      endTime = result.toNumber();
      Session.set('timeLeft', endTime - Math.floor(Date.now() / 1000));
    });
});

Template.contribution_summary.helpers({
  etherRaised() {
    return Session.get('etherRaised') + ' / ' + ETHER_CAP;
  },
  timeLeft() {
    return String(Session.get('timeLeft')).toHHMMSS();
  },
  currentPrice() {
    return String(Session.get('currentPrice'));
  },
});


Template.contribution_summary.onRendered(() => {
});
