import { Web3 } from 'meteor/ethereum:web3';

if (typeof web3 !== 'undefined') {
  web3 = new Web3(web3.currentProvider);
} else {
  // set the provider you want from Web3.providers
  web3 = new Web3(new Web3.providers.HttpProvider('http://95.85.7.96:8545'));
}

export default web3;
