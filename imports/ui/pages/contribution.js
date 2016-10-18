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
  if (Session.get('isECParamsSet') !== true) {
    FlowRouter.go('/');
  }
});


Template.contribution.helpers({
  getCoinbase() {
    return Session.get('coinBase');
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
});


Template.contribution.events({
});
