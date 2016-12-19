import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';

import './network_summary.html';


Template.network_summary.onCreated(() => {
});

Template.network_summary.helpers({
  isMainNetwork() {
    return Session.get('network') === 'Main';
  },
  isMordenNetwork() {
    return Session.get('network') === 'Morden';
  },
  isRopstenNetwork() {
    return Session.get('network') === 'Ropsten';
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
