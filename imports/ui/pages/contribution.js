import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Session } from 'meteor/session';
import { Toast } from 'meteor/fourquet:jquery-toast';

import Contribution from '/imports/lib/assets/contracts/Contribution.sol.js';
import MelonToken from '/imports/lib/assets/contracts/MelonToken.sol.js';

import './contribution.html';

const sha256 = require('js-sha256').sha256;


// Creation of contract object
Contribution.setProvider(web3.currentProvider);
MelonToken.setProvider(web3.currentProvider);
const contributionContract = Contribution.at('0x3BF541f87056D134E0109BE1Be92978b26Cb09e0');
const melonContract = MelonToken.at('0xBEB9eF514a379B997e0798FDcC901Ee474B6D9A1');

Template.contribution.onCreated(() => {
  Session.set('isECParamsSet', false);
  Session.set('isServerConnected', true);
  Meteor.call('isServerConnected', (err, result) => {
    if (!err) {
      Session.set('isServerConnected', result);
    } else {
      console.log(err);
    }
  });
  Meteor.call('isUS', (err, result) => {
    if(!err) {
      Session.set('isUS', result);
      console.log(`Is from US: ${Session.get('isUS')}`);
    } else {
      console.log(err);
    }
  });
  Meteor.call('clientIp', (err, result) => {
    if (!err) {
      Session.set('clientIp', result);
      console.log(`Your ip is: ${Session.get('clientIp')}`);
    } else {
      console.log(err);
    }
  });
  Toast.options = {
    closeButton: false,
    progressBar: false,
    positionClass: 'toast-bottom-full-width',
    showEasing: 'swing',
    hideEasing: 'linear',
    showMethod: 'fadeIn',
    hideMethod: 'fadeOut',
    timeOut: 8000,
  };
});


Template.contribution.helpers({
  isStarted() {
    return Session.get('melon-terms');
  },
  isTermsAccepted() {
    return Session.get('melon-terms') &&
      Session.get('no-equity') &&
      Session.get('workshop') &&
      Session.get('citizenChecked');
  },
  isDocumentsRead() {
    return Session.get('melon-greenpaper') && Session.get('melon-specifications');
  },
  isAllAccepted() {
    const numAllTerms = 6;
    const numAccTerms =
      Session.get('melon-terms') +
      Session.get('no-equity') +
      Session.get('workshop') +
      Session.get('citizenChecked') +
      Session.get('melon-greenpaper') +
      Session.get('melon-specifications');
    return numAccTerms === numAllTerms;
  },
  isECParamsSet() {
    return Session.get('isECParamsSet');
  },
  whenECParamsSet() {
    if (Session.get('isECParamsSet')) return 'disabled';
    return '';
  },
  getContributionAddress() {
    return Session.get('contributionAddress');
  },
  getTxData: () => Session.get('tx.data'),
  isRopstenNetwork() {
    return Session.get('network') === 'Ropsten';
  },
  isMainNetwork() {
    return Session.get('network') === 'Main';
  },
  isBetweenStartAndEndTime() {
    if (Session.get('timeLeft') === -2) return false; //'Waiting for contract deployment';
    if (Session.get('timeLeft') === -1) return false; //'Not started yet';
    if (Session.get('timeLeft') === 0) return false; //'Contribution has ended';
    return true;
  },
  timeUntillStart() {
    const now = Math.floor(Date.now() / 1000);
    const startTime = 1487156400;
    return String(startTime - now).toDDHHMMSS();
  },
  isSending() {
    return Session.get('isSending');
  },
});


Template.contribution.onRendered(function contributionOnRendered() {
  this.$('input#contribution_address').characterCounter();
  this.$('.scrollspy').scrollSpy();
});


Template.contribution.events({
  'input #contribution_address': (event, templateInstance) => {
    const template = templateInstance;
    if (web3.isAddress(event.currentTarget.value) === false) {
      template.find('#contribution-text').innerHTML = '';
      template.find('#success-message').innerHTML = '';
      template.find('#error-message').innerHTML = 'Ethereum Address is invalid.';
    } else {
      template.find('#contribution-text').innerHTML = '';
      template.find('#error-message').innerHTML = '';
      template.find('#success-message').innerHTML = 'Ethereum Address is valid.';
    }
  },
  'click input': (event, templateInstance) => {
    const template = templateInstance;
    for (let i = 0; i < template.$('input').length; i += 1) {
      if (template.$('input')[i].id === 'melon-terms') {
        Session.set('melon-terms', template.$('input')[i].checked);
      } else if (template.$('input')[i].id === 'workshop') {
        Session.set('workshop', template.$('input')[i].checked);
      } else if (template.$('input')[i].id === 'no-equity') {
        Session.set('no-equity', template.$('input')[i].checked);
      } else if (template.$('input')[i].id === 'citizen') {
        Session.set('citizenChecked', template.$('input')[i].checked);
      } else if (template.$('input')[i].id === 'melon-greenpaper') {
        Session.set('melon-greenpaper', template.$('input')[i].checked);
      } else if (template.$('input')[i].id === 'melon-specifications') {
        Session.set('melon-specifications', template.$('input')[i].checked);
      }
    }
  },
  'click .disabled': (event) => {
    // Prevent default browser form submit
    event.preventDefault();
    Toast.info('Not all terms and conditions accepted.');
  },
  'submit .signature': (event) => {
    // Prevent default browser form submit
    event.preventDefault();

    if (Session.get('isUS') === false) {
      // Get value from form element
      const target = event.target;
      const address = target.contribution_address.value;

      // Check Address is valid, proof of only allowed IPs
      if (web3.isAddress(address) === false) {
        Toast.info('Invalid contribution address');
        return;
      }

      Meteor.call('contributors.insert', address);
      // Sign Hash of Address, i.e. confirming User agreed to terms and conditions.
      const hash = `0x${sha256(new Buffer(address.slice(2), 'hex'))}`;
      Meteor.call('sign', hash, (errCall, sig) => {
        if (!errCall) {
          try {
            let r = sig.slice(0, 66);
            let s = `0x${sig.slice(66, 130)}`;
            let v = parseInt(`0x${sig.slice(130, 132)}`, 16);
            if (sig.length < 132) {
              // web3.eth.sign shouldn't return a signature of length<132, but if it does...
              const shortSig = sig.slice(2);
              r = `0x${shortSig.slice(0, 64)}`;
              s = `0x00${shortSig.slice(64, 126)}`;
              v = parseInt(`0x${shortSig.slice(126, 128)}`, 16);
            }
            if (v !== 27 && v !== 28) v += 27;
            // Generate Transaction data string
            const sha3Hash = web3.sha3('buy(uint8,bytes32,bytes32)');
            const methodId = `${sha3Hash.slice(2, 10)}`;
            // Big-endian encoding of uint, padded on the higher-order (left) side with zero-bytes such that the length is a multiple of 32 bytes
            const vHex = web3.fromDecimal(v).slice(2);
            const data = `0x${methodId}${'0'.repeat(64 - vHex.length)}${vHex}${r.slice(2)}${s.slice(2)}`;
            // Store data in Sessions
            Session.set('contributionAddress', address);
            Session.set('tx.data', data);
            Session.set('sig.v', v);
            Session.set('sig.r', r);
            Session.set('sig.s', s);
            Session.set('tx.data', data);
            Session.set('isECParamsSet', true);
            // Console output of Signature
            console.log(`\nSig.v:\n${v}\nSig.r:\n${r}\nSig.s:\n${s}`);
            // Let user know
            Toast.success('Signature successfully generated');
            FlowRouter.go('#results');
          } catch (tryErr) {
            Toast.error('Ethereum node seems to be down, please contact: team@melonport.com. Thanks.', tryErr);
          }
        } else {
          console.log(err);
        }
      });
    } else {
      Toast.info('Unfortunately this contribution is for non-US citizen only');
      return;
    }
  },
  'submit .amount': (event, templateInstance) => {
    // Prevent default browser form submit
    event.preventDefault();
    const template = templateInstance;

    // Get value from form element
    const target = event.target;
    const etherAmount = target.ether_amount.value;

    template.find('#txStatus').innerHTML =
      'Sending of funds initiated. Please confirm the transaction and wait a few seconds for it to process.';
    contributionContract.buy(
      Session.get('sig.v'),
      Session.get('sig.r'),
      Session.get('sig.s'),
      { from: Session.get('contributionAddress'), value: web3.toWei(etherAmount, 'ether') })
    .then(() => {
      template.find('#txStatus').innerHTML = 'Funds have been sent.';
      return melonContract.balanceOf(Session.get('contributionAddress'));
    }).then((result) => {
      const melonsBought = web3.fromWei(result.toNumber(), 'ether');
      template.find('#txStatus').innerHTML =
        `Funds have been sent! You own: ${melonsBought} MLN. Thank you for your contribution.`;
    });
  },
});
