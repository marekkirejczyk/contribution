import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';

import './contribution_summary.html';


let ETHER_CAP = 250000; // Expected Value

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
    return days+'d, '+hours+':'+minutes+':'+seconds;
}


Template.contribution_summary.onCreated(() => {
});

Template.contribution_summary.helpers({
  etherRaised() {
    return `${Session.get('etherRaised')} / ${ETHER_CAP}`;
  },
  timeLeft() {
    return String(Session.get('timeLeft')).toDDHHMMSS();
  },
  currentPrice() {
    return String(Session.get('currentPrice'));
  },
});


Template.contribution_summary.onRendered(() => {
});
