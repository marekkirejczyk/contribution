import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';

import './contribution_summary.html';


let ETHER_CAP = 227000; // Expected Value

String.prototype.toDDHHMMSS = function () {
    let sec_num = parseInt(this, 10); // don't forget the second param
    let weeks   = Math.floor(sec_num / 604800);
    sec_num -= weeks * 604800;

    let days    = Math.floor(sec_num / 86400);
    let hours   = Math.floor((sec_num - (days * 86400)) / 3600);
    let minutes = Math.floor((sec_num - (days * 86400) - (hours * 3600)) / 60);
    let seconds = sec_num - (days * 86400) - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    if (days === 0) return hours + 'h' + minutes + 'm' + seconds + 's';
    return days+'d, '+ hours + 'h' + minutes + 'm' + seconds + 's';
}


Template.contribution_summary.onCreated(() => {});

Template.contribution_summary.helpers({
  currentPrice() {
    if (Session.get('timeLeft') === -2) return 'Waiting for contract deployment';
    if (Session.get('timeLeft') === -1) return 'Not started yet';
    if (Session.get('timeLeft') === 0) return 'Contribution has ended';
    return `${Session.get('currentPrice')} MLN/ETH`;
  },
  timeLeft() {
    if (Session.get('timeLeft') === -2) return 'Waiting for contract deployment';
    if (Session.get('timeLeft') === -1) return 'Not started yet';    
    if (Session.get('timeLeft') === 0) return 'Contribution has ended';
    return String(Session.get('timeLeft')).toDDHHMMSS();
  },
  etherRaised() {
    if (Session.get('timeLeft') === -2) return 'Waiting for contract deployment';
    if (Session.get('timeLeft') === 0) return 'Contribution has ended';
    return `${Session.get('etherRaised')} / ${ETHER_CAP}`;
  },
});


Template.contribution_summary.onRendered(() => {});
