import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { web3 } from '/imports/lib/client/ethereum/web3.js'

import './network_summary.html';


Template.network_summary.onCreated(() => {
});


Template.network_summary.helpers({
  isConnected() {
    return Session.get('isConnected') === true;
  },
  isSynced() {
    return Session.get('syncing') === false;
  },
  snycingCurrentBlock() {
    return Session.get('currentBlock');
  },
  snycingHighestBlock() {
    return Session.get('highestBlock');
  },
  snychingBlockProgress() {
    const startingBlock = Session.get('startingBlock');
    const currentBlock = Session.get('currentBlock');
    const highestBlock = Session.get('highestBlock');
    return (currentBlock - startingBlock) /
      (highestBlock - startingBlock) * 100;
  },
  currentBlock() {
    return Session.get('latestBlock');
  },
  isTestnet() {
    return Session.get('network') === '2';
  },
});


Template.network_summary.onRendered(() => {
});
