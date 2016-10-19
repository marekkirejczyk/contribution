/* eslint-env mocha */

import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { assert } from 'meteor/practicalmeteor:chai';

import { Contributors } from './contributors.js';

if (Meteor.isServer) {
  describe('Contributors', () => {
    describe('methods', () => {
      const userId = Random.id();
      let contributorId;

      beforeEach(() => {
        Contributors.remove({});
        contributorId = Contributors.insert({
          text: 'test contributor',
          createdAt: new Date(),
          owner: userId,
          username: 'tmeasday',
        });
      });

      it('can delete owned contributor', () => {
        // Find the internal implementation of the contributor method so we can
        // test it in isolation
        const deleteContributor = Meteor.server.method_handlers['contributors.remove'];

        // Set up a fake method invocation that looks like what the method expects
        const invocation = { userId };

        // Run the method with `this` set to the fake invocation
        deleteContributor.apply(invocation, [contributorId]);

        // Verify that the method does what we expected
        assert.equal(Contributors.find().count(), 0);
      });
    });
  });
}
