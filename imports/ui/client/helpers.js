import { Session } from 'meteor/session';

Template.registerHelper('isClientConnected', () => Session.get('isClientConnected'));
Template.registerHelper('isServerConnected', () => Session.get('isServerConnected'));
Template.registerHelper('latestBlock', () => Session.get('latestBlock'));
Template.registerHelper('clientAddress', () => Session.get('address'));
