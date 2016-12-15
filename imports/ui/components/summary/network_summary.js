import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import web3 from '/imports/lib/client/ethereum/web3.js'

import './network_summary.html';


Template.network_summary.onCreated(() => {
});

Template.network_summary.helpers({
  isMainNetwork() {
    return Session.get('network') === 'main';
  },
  isMordenNetwork() {
    return Session.get('network') === 'morden';
  },
  isRopstenNetwork() {
    return Session.get('network') === 'ropsten';
  },
  getNetwork() {
    return Session.get('network');
  },
  isSynced() {
    return Session.get('syncing') === false;
  },
  currentBlock() {
    return Session.get('currentBlock');
  },
});


Template.network_summary.onRendered(() => {
});
