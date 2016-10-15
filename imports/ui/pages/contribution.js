import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { $ } from 'meteor/jquery';

import { async } from 'async';
import { assert } from 'assert';
import { BigNumber } from 'bignumber.js';
var sha256 = require('js-sha256').sha256;

import './contribution.html';


const SIGNER = '0xcc08de98cc59a6c2b3d73697a8528c6cd2c2c2e6';


function sign(web3, address, value, callback) {
  web3.eth.sign(address, value, (err, sig) => {
    if (!err) {
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
        callback(undefined, {r: r, s: s, v: v});
      } catch (err) {
        callback(err, undefined);
      }
    } else {
      callback(err, undefined);
    }
  });
}


Template.contribution.onCreated(function walletManageOnCreated() {
  web3.eth.getCoinbase(function(error, result){
      if(!error) {
        Session.set('coinBase', result);
      }
      else
          console.error(error);
  });
});


Template.contribution.helpers({
  getCoinbase() {
    return Session.get('coinBase');
  },
  isTermsAccepted() {
    return Session.get('citizenChecked');
  },
  isDocumentsRead() {
    return Session.get('melon-whitepaper') && Session.get('melon-terms') && Session.get('melon-ethcore-service-agreement') && Session.get('ethcore-whitepaper');
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
});


Template.contribution.onRendered(function contributionOnRendered() {
  // initialize
  $('input#input_text').characterCounter();
  $('select').material_select();
});


Template.contribution.events({
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
  'submit .signature'(event, instance) {
    // Prevent default browser form submit
    event.preventDefault();

    // Get value from form element
    const target = event.target;
    const input_address = target.input_text.value
    console.log(target.input_text.value);

    const hash = sha256(new Buffer(input_address.slice(2),'hex'));
    sign(web3, SIGNER, hash, (err, sig) => {
      console.log(
        sig.v +
        sig.r +
        sig.s
      )
    });
  },
});
