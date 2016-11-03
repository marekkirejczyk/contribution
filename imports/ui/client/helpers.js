import { Session } from 'meteor/session';

Template.registerHelper('isConnected', () => Session.get('isConnected'));
Template.registerHelper('isServerConnected', () => Session.get('isServerConnected'));
Template.registerHelper('latestBlock', () => Session.get('latestBlock'));
