// Initialize web3 as global object for entire server side
import web3 from '/imports/lib/server/ethereum/web3.js'

// This defines all the collections, publications and methods that the application provides
// as an API to the client.
import '/imports/startup/server/register-apis.js';
