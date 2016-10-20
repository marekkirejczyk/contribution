import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Session } from 'meteor/session';
import { $ } from 'meteor/jquery';

import { async } from 'async';
import { assert } from 'assert';
import { BigNumber } from 'bignumber.js';
var sha256 = require('js-sha256').sha256;

import web3 from '/imports/lib/client/ethereum/web3.js'

import './contribution.html';


Template.contribution.onCreated(function contributionOnCreated() {
  Session.set('isECParamsSet', false);
});


Template.contribution.helpers({
  isConnected() {
    return Session.get('isConnected');
  },
  isTermsAccepted() {
    return Session.get('citizenChecked') && Session.get('melon-terms') ;
  },
  isDocumentsRead() {
    return Session.get('melon-whitepaper') && Session.get('melon-ethcore-service-agreement') && Session.get('ethcore-whitepaper');
  },
  isAllAccepted() {
    const numAllTerms = 5;
    const numAccTerms =
      Session.get('citizenChecked') +
      Session.get('melon-whitepaper') +
      Session.get('melon-terms') +
      Session.get('melon-ethcore-service-agreement') +
      Session.get('ethcore-whitepaper');
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

  // Insert into collection
  const address = '0x7ed7d68befa84c9e955e183379e1b33760858263';
  const hash = '0x' + sha256(new Buffer(address.slice(2),'hex'));
  Meteor.call('contributors.insert', address);
  Meteor.call('sign', address, hash, function (error, result) {
      console.log(error);
      console.log(result);
    }
  );
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
      if (template.$('input')[i].id == 'citizen') {
        Session.set('citizenChecked', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'melon-whitepaper') {
        Session.set('melon-whitepaper', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'melon-terms') {
        Session.set('melon-terms', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'melon-ethcore-service-agreement') {
        Session.set('melon-ethcore-service-agreement', template.$('input')[i].checked);
      } else if (template.$('input')[i].id == 'ethcore-whitepaper') {
        Session.set('ethcore-whitepaper', template.$('input')[i].checked);
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

    // Proof of only allowed IPs
    Meteor.call('contributors.insert', address);
    if (web3.isAddress(address) === false) {
      Materialize.toast('Invalid contribution address', 8000, 'blue');
      return;
    }

    const hash = '0x' + sha256(new Buffer(address.slice(2),'hex'));

    // Server (=signer) address signs off contribution address
    sign(web3, SIGNER, hash, (err, sig) => {
      if (!err) {
        Session.set('contributionAddress', address);
        Session.set('sig.v', sig.v);
        Session.set('sig.r', sig.r);
        Session.set('sig.s', sig.s);
        Session.set('isECParamsSet', true);
        Materialize.toast('Signature successfully generated', 8000, 'green');
      } else {
        Materialize.toast('Ethereum node seems to be down, please contact: team@melonport.com. Thanks.', 12000, 'red');
      }
    });
  },
});
