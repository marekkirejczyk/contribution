import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import web3 from '/imports/lib/client/ethereum/web3.js'

import './network_summary.html';


Template.network_summary.onCreated(() => {
  web3.version.getNetwork((error, result) => {
    if(!error) {
      Session.set('network', result)
    } else {
      console.error(error);
    }
  });

  web3.eth.getSyncing((error, result) => {
    if(!error) {
      Session.set('syncing', result)
    } else {
      console.error(error);
    }
  });

  web3.eth.getBlockNumber((error, result) => {
    if(!error) {
      Session.set('currentBlock', result)
    } else {
      console.error(error);
    }
  });
});


Template.network_summary.helpers({
  isConnected() {
    return web3.isConnected();
  },
  isTestnet() {
    return Session.get('network') === '2';
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
