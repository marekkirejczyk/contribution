import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Session } from 'meteor/session';
import { $ } from 'meteor/jquery';

import { async } from 'async';
import { assert } from 'assert';
import { BigNumber } from 'bignumber.js';
var sha256 = require('js-sha256').sha256;

import './contribution.html';


Template.contribution.onCreated(function contributionOnCreated() {
  Session.set('isECParamsSet', false);
  Session.set('isConnected', true);
  Meteor.call('isConnected', (err, result) => {
    if(!err) {
      Session.set('isConnected', result);
    } else {
      console.log(err);
    }
  });
});


Template.contribution.helpers({
  isConnected() {
    return Session.get('isConnected');
  },
  isTermsAccepted() {
    return Session.get('melon-terms') &&
      Session.get('no-equity') &&
      Session.get('workshop') &&
      Session.get('citizenChecked');
  },
  isDocumentsRead() {
    return Session.get('melon-whitepaper') && Session.get('melon-parity-service-agreement') && Session.get('parity-whitepaper');
  },
  isAllAccepted() {
    const numAllTerms = 7;
    const numAccTerms =
      Session.get('melon-terms') +
      Session.get('no-equity') +
      Session.get('workshop') +
      Session.get('citizenChecked') +
      Session.get('melon-whitepaper') +
      Session.get('melon-parity-service-agreement') +
      Session.get('parity-whitepaper');
    return numAccTerms == numAllTerms;
  },
  isECParamsSet() {
    return Session.get('isECParamsSet');
  },
  getContributionAddress() {
    return Session.get('contributionAddress');
  },
  getSigV() {
    return Session.get('sig.v');
  },
  getSigR() {
    return Session.get('sig.r');
  },
  getSigS() {
    return Session.get('sig.s');
  },
});


Template.contribution.onRendered(function contributionOnRendered() {
  this.$('input#contribution_address').characterCounter();
  this.$('.scrollspy').scrollSpy();
});


Template.contribution.events({
  'input #contribution_address'(event, template) {
    if (web3.isAddress(event.currentTarget.value) === false) {
      template.find('#contribution-text').innerHTML = '';
      template.find('#success-message').innerHTML = '';
      template.find('#error-message').innerHTML = 'Contribution Address is invalid.';
    } else {
      template.find('#contribution-text').innerHTML = '';
      template.find('#error-message').innerHTML = '';
      template.find('#success-message').innerHTML = 'Contribution Address is valid.';
    }
  },
  'click input'(event, template) {
    for (var i = 0; i < template.$('input').length; ++i) {
      if (template.$('input')[i].id == 'melon-terms') {
        Session.set('melon-terms', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'workshop') {
        Session.set('workshop', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'no-equity') {
        Session.set('no-equity', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'citizen') {
        Session.set('citizenChecked', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'melon-whitepaper') {
        Session.set('melon-whitepaper', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'melon-parity-service-agreement') {
        Session.set('melon-parity-service-agreement', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'parity-whitepaper') {
        Session.set('parity-whitepaper', template.$('input')[i].checked);
      }
    }
  },
  'click .disabled'(event, instance) {
    // Prevent default browser form submit
    event.preventDefault();

    Materialize.toast('Not all terms and conditions accepted.', 8000, 'blue');
  },
  'submit .signature'(event, instance) {
    // Prevent default browser form submit
    event.preventDefault();

    // Get value from form element
    const target = event.target;
    const address = target.contribution_address.value

    // Check Address is valid, proof of only allowed IPs
    if (web3.isAddress(address) === false) {
      Materialize.toast('Invalid contribution address', 8000, 'blue');
      return;
    }
    Meteor.call('contributors.insert', address);

    // Sign Hash of Address, i.e. confirming User agreed to terms and conditions.
    const hash = '0x' + sha256(new Buffer(address.slice(2),'hex'));
    Meteor.call('sign', hash, (err, result) => {
      if(!err) {
        let sig = result;
        try {
          var r = sig.slice(0, 66);
          var s = '0x' + sig.slice(66, 130);
          var v = parseInt('0x' + sig.slice(130, 132), 16);
          if (sig.length<132) {
            //web3.eth.sign shouldn't return a signature of length<132, but if it does...
            sig = sig.slice(2);
            r = '0x' + sig.slice(0, 64);
            s = '0x00' + sig.slice(64, 126);
            v = parseInt('0x' + sig.slice(126, 128), 16);
          }
          if (v!=27 && v!=28) v+=27;
          // Let user know
          Session.set('contributionAddress', address);
          Session.set('sig.v', v);
          Session.set('sig.r', r);
          Session.set('sig.s', s);
          Session.set('isECParamsSet', true);
          Materialize.toast('Signature successfully generated', 8000, 'green');
        } catch (err) {
          Materialize.toast('Ethereum node seems to be down, please contact: team@melonport.com. Thanks.', 12000, 'red');
        }
      } else {
        console.log(err);
      }
    });
  },
});
