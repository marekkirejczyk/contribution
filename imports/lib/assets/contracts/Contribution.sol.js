var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("Contribution error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("Contribution error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("Contribution contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of Contribution: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to Contribution.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: Contribution not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "2": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "ETHER_CAP_LIQUID",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "signer",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "recipient",
            "type": "address"
          },
          {
            "name": "v",
            "type": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32"
          }
        ],
        "name": "buyLiquidRecipient",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "endTime",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "companyAllocated",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "halt",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "etherRaisedIced",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "melonToken",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "startTime",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "polkaDotToken",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newFounder",
            "type": "address"
          }
        ],
        "name": "changeFounder",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "recipient",
            "type": "address"
          },
          {
            "name": "v",
            "type": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32"
          }
        ],
        "name": "buyIcedRecipient",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "price",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "etherRaisedLiquid",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "v",
            "type": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32"
          }
        ],
        "name": "buyLiquid",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "halted",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "btcs",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "parity",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "unhalt",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "v",
            "type": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32"
          }
        ],
        "name": "buyIced",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ETHER_CAP",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ETHER_CAP_ICED",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "btcsBuyIced",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "allocateCompanyTokens",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "melonport",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "melonportInput",
            "type": "address"
          },
          {
            "name": "parityInput",
            "type": "address"
          },
          {
            "name": "btcsInput",
            "type": "address"
          },
          {
            "name": "signerInput",
            "type": "address"
          },
          {
            "name": "melonTokenInput",
            "type": "address"
          },
          {
            "name": "polkaDotInput",
            "type": "address"
          },
          {
            "name": "startTimeInput",
            "type": "uint256"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "tokens",
            "type": "uint256"
          }
        ],
        "name": "Buy",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          }
        ],
        "name": "AllocateCompanyTokens",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x6060604081905260006008819055600955600a805461ffff1916905560e080610f6b83396101406040819052915160805160a05160c0519351610100516101205160008054600160a060020a03199081168817825560018054821688179055600280548216871790556003805482168a17905560048390556249d4008301600555600680549091168517908190557ff46d1982000000000000000000000000000000000000000000000000000000008a52600160a060020a03308116610144526101648490529799969895979596949593949293169163f46d198291610184916044818387803b156100025760325a03f11561000257505060078054600160a060020a03191684179081905560048054604080517ff46d198200000000000000000000000000000000000000000000000000000000815230600160a060020a039081169482019490945260248101929092525192909116925063f46d198291604480830192600092919082900301818387803b156100025760325a03f1156100025750505050505050505050610dd2806101996000396000f3606060405236156101275760e060020a6000350463220c604e811461012c578063238ac9331461014257806324583d0a146101595780633197cbb61461024257806350921264146102505780635ed7ca5b1461026157806360854ed9146102845780636b915d431461029257806378e97925146102a95780638105ce7e146102b757806393c32e06146102ce5780639825d530146102f4578063a035b1fe146103dd578063b713beaa14610411578063b99b7f891461041f578063b9b8af0b14610437578063bb6322441461044e578063c38060ab14610465578063cb3e64fd1461047c578063e3f5f8ee1461049f578063e8303659146104b7578063e90ca755146104ce578063f2080ae5146104e4578063fc519ce314610507578063fd2227451461052a575b610002565b346100025761054169e4b2ead51ac33300000081565b3461000257610553600354600160a060020a031681565b61056f6004356024356044356064355b600083838360006002336000604051602001526040518082600160a060020a03166c010000000000000000000000000281526014019150506020604051808303816000866161da5a03f115610002575050604080518051600354600083815260208085018652938501819052845183815260ff8a1681860152808601899052606081018890529451929550600160a060020a03909116936001936080808301949193601f198301938390039091019190866161da5a03f115610002575050604051601f190151600160a060020a03161461058557610002565b346100025761054160055481565b3461000257610571600a5460ff1681565b346100025761056f60005433600160a060020a039081169116146107b357610002565b346100025761054160095481565b3461000257610553600654600160a060020a031681565b346100025761054160045481565b3461000257610553600754600160a060020a031681565b346100025761056f60043560005433600160a060020a039081169116146107c457610002565b61056f6004356024356044356064355b600083838360006002336000604051602001526040518082600160a060020a03166c010000000000000000000000000281526014019150506020604051808303816000866161da5a03f115610002575050604080518051600354600083815260208085018652938501819052845183815260ff8a1681860152808601899052606081018890529451929550600160a060020a03909116936001936080808301949193601f198301938390039091019190866161da5a03f115610002575050604051601f190151600160a060020a0316146107e757610002565b34610002576105415b600042600460005054111580156104035750600454621275000142105b15610970575061043361096d565b346100025761054160085481565b61056f6004356024356044356109f533848484610169565b3461000257610571600a5460ff6101009091041681565b3461000257610553600254600160a060020a031681565b3461000257610553600154600160a060020a031681565b346100025761056f60005433600160a060020a039081169116146109fa57610002565b61056f6004356024356044356109f533848484610304565b34610002576105416a017d2a320dd7455500000081565b34610002576105416998774738bc822200000081565b61056f600254600090819033600160a060020a03908116911614610a0757610002565b346100025761056f60005433600160a060020a03908116911614610bd257610002565b3461000257610553600054600160a060020a031681565b60408051918252519081900360200190f35b60408051600160a060020a039092168252519081900360200190f35b005b604080519115158252519081900360200190f35b6004544281111561059557610002565b60055442819011156105a657610002565b600a54610100900460ff16156105bb57610002565b6103e83410806105ce57506103e8340615155b156105d857610002565b6a017d2a320dd74555000000610613600860005054345b6000828201610dcb8482108015906106075750838210155b8015156107e457610002565b111561061e57610002565b61062e6103e8340461070c6103e6565b600654909750600160a060020a0316638cae711f8c60038a046040518360e060020a0281526004018083600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100025760325a03f115610002575050600754600160a060020a03169050638cae711f8c600360028b02046040518360e060020a0281526004018083600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100025760325a03f11561000257505060085461072c9150346105ef565b6108606103e834046104655b6000828202610dcb84158061060757508385838115610002570414610607565b60085560008054604051600160a060020a03909116913480156108fc02929091818181858888f19350505050151561076357610002565b60408051348152602081018990528151600160a060020a038e16927f1cbc5ab135991bd2b6a4b034a04aa2aa086dac1371cb9b16b8b5e2ed6b036bed928290030190a25050505050505050505050565b600a805461ff001916610100179055565b6000805473ffffffffffffffffffffffffffffffffffffffff1916821790555b50565b600454428111156107f757610002565b600554428190111561080857610002565b600a54610100900460ff161561081d57610002565b6103e834108061083057506103e8340615155b1561083a57610002565b6a017d2a320dd74555000000610855600960005054346105ef565b111561070057610002565b600654909750600160a060020a03166381597d0c8c60038a046040518360e060020a0281526004018083600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100025760325a03f115610002575050600754600160a060020a031690506381597d0c8c600360028b02046040518360e060020a0281526004018083600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100025760325a03f1156100025750506009546109329150346105ef565b60095560008054604051600160a060020a03909116913480156108fc02929091818181858888f19350505050151561076357610002565b5060005b90565b4260046000505462127500011115801561099057506004546224ea000142105b1561099e575061041a61096d565b426004600050546224ea0001111580156109be575060045462375f000142105b156109cc575061040161096d565b4260046000505462375f0001111580156109e7575060055442105b1561096957506103e861096d565b505050565b600a805461ff0019169055565b6004544281901115610a1857610002565b600a54610100900460ff1615610a2d57610002565b6103e8341080610a4057506103e8340615155b15610a4a57610002565b600954695f4a8c8375d15540000090610a6390346105ef565b1115610a6e57610002565b339250610a816103e8340461046561070c565b600654909250600160a060020a03166381597d0c84600385046040518360e060020a0281526004018083600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100025760325a03f115610002575050600754600160a060020a031690506381597d0c84600360028602046040518360e060020a0281526004018083600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100025760325a03f115610002575050600954610b539150346105ef565b60095560008054604051600160a060020a03909116913480156108fc02929091818181858888f193505050501515610b8a57610002565b60408051348152602081018490528151600160a060020a038616927f1cbc5ab135991bd2b6a4b034a04aa2aa086dac1371cb9b16b8b5e2ed6b036bed928290030190a2505050565b600a5460ff1615610be257610002565b600654600080546040805160e260020a6320565f43028152600160a060020a039283166004820152690f3f20b8dfa69d0000006024820152905191909316926381597d0c92604480830193919282900301818387803b156100025760325a03f1156100025750506006546001546040805160e260020a6320565f43028152600160a060020a0392831660048201526903cfc82e37e9a7400000602482015290519190921692506381597d0c9160448082019260009290919082900301818387803b156100025760325a03f115610002575050600754600080546040805160e260020a6320565f43028152600160a060020a0392831660048201526901e7e4171bf4d3a00000602482015290519190931693506381597d0c92604480820193929182900301818387803b156100025760325a03f1156100025750506007546001546040805160e260020a6320565f43028152600160a060020a039283166004820152692435edb7132bb4e00000602482015290519190921692506381597d0c9160448082019260009290919082900301818387803b156100025760325a03f115610002575050600a805460ff1916600117905550604051600160a060020a033316907fa54f5b1874ae5ee5a87a7934a20b2d34eec15d48a21e8d473ceb109fc30ceb3a90600090a2565b939250505056",
    "events": {
      "0x1cbc5ab135991bd2b6a4b034a04aa2aa086dac1371cb9b16b8b5e2ed6b036bed": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "tokens",
            "type": "uint256"
          }
        ],
        "name": "Buy",
        "type": "event"
      },
      "0xa54f5b1874ae5ee5a87a7934a20b2d34eec15d48a21e8d473ceb109fc30ceb3a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          }
        ],
        "name": "AllocateCompanyTokens",
        "type": "event"
      }
    },
    "updated_at": 1477930315231
  },
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "BTCS_ETHER_CAP",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newAddress",
            "type": "address"
          }
        ],
        "name": "changeMelonportAddress",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "signer",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "DIVISOR_PRICE",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "endTime",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "FOUNDER_ONE",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "EXT_COMPANY_STAKE_TWO",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "EXT_COMPANY_ONE",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "FOUNDER_STAKE",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "DIVISOR_STAKE",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "EXT_COMPANY_STAKE_ONE",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ADVISOR_STAKE_TWO",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "halt",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "FOUNDER_TWO",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ADVISOR_STAKE_ONE",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "melonToken",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "PRICE_RATE_SECOND",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "startTime",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "PRICE_RATE_THIRD",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "MELONPORT_COMPANY_STAKE",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "EXT_COMPANY_TWO",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ADVISOR_ONE",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "halted",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "btcs",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "PRICE_RATE_FIRST",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "unhalt",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "etherRaised",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "priceRate",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "recipient",
            "type": "address"
          }
        ],
        "name": "btcsBuyRecipient",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "recipient",
            "type": "address"
          },
          {
            "name": "v",
            "type": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32"
          }
        ],
        "name": "buyRecipient",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ADVISOR_TWO",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "v",
            "type": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32"
          }
        ],
        "name": "buy",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "ETHER_CAP",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "MAX_CONTRIBUTION_DURATION",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "PRICE_RATE_FOURTH",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "melonport",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "setMelonport",
            "type": "address"
          },
          {
            "name": "setBTCS",
            "type": "address"
          },
          {
            "name": "setSigner",
            "type": "address"
          },
          {
            "name": "setStartTime",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "TokensBought",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405234620000005760405160808062001cc983398101604090815281516020830151918301516060909301519092905b60008054600160a060020a03808716600160a060020a031992831617808455600180548884169085161790556002805487841694169390931790925560038490556224ea0084016004819055604051309390921691859190610b1380620011b68339600160a060020a0395861691019081529290931660208301526040808301919091526060820192909252905190819003608001906000f08015620000005760058054600160a060020a031916600160a060020a039283161790819055604080516000602091820181905282517fa89c5be00000000000000000000000000000000000000000000000000000000081529251939094169363a89c5be0936004808501949192918390030190829087803b15620000005760325a03f11562000000575050604080518051600554600080547f8cae711f000000000000000000000000000000000000000000000000000000008552600160a060020a0390811660048601526127106103e88502046024860152945192965093169350638cae711f9260448084019391929182900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260f160048201526127106101c286020460248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260f260048201526127106101c286020460248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260c1600482015261271061012c86020460248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260c26004820152612710606486020460248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260a16004820152612710603286020460248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260a26004820152612710601986020460248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050505b50505050505b610ce780620004cf6000396000f300606060405236156101a65763ffffffff60e060020a60003504166301d1c7fd81146101ab57806320145328146101ca578063238ac933146101e55780632b750f4f1461020e5780633197cbb61461022d5780633693db0a1461024c57806339e84cef146102755780633d769e3d146102945780633ee90a29146102bd5780633f423afe146102dc578063434ec416146102fb57806353f6f01f1461031a5780635ed7ca5b1461033957806366875a31146103485780636896a342146103715780636b915d4314610390578063773ef38e146103b957806378e97925146103d857806383a9094f146103f757806392f7ba171461020e5780639f44b34c146104355780639fa9b04c1461045e578063b9b8af0b14610487578063bb632244146104a8578063bdf75a6a146104d1578063cb3e64fd146104f0578063cd72ab69146104ff578063ceb791d91461051e578063d89397b11461053d578063dda44b1014610553578063df969bc014610575578063e5fe4f311461059e578063e8303659146105b4578063e9d8d3d7146105d3578063f4656219146105f2578063fd22274514610611575b610000565b34610000576101b861063a565b60408051918252519081900360200190f35b34610000576101e3600160a060020a0360043516610648565b005b34610000576101f2610690565b60408051600160a060020a039092168252519081900360200190f35b34610000576101b861069f565b60408051918252519081900360200190f35b34610000576101b86106a5565b60408051918252519081900360200190f35b34610000576101f26106ab565b60408051600160a060020a039092168252519081900360200190f35b34610000576101b86106b0565b60408051918252519081900360200190f35b34610000576101f26106b5565b60408051600160a060020a039092168252519081900360200190f35b34610000576101b86106ba565b60408051918252519081900360200190f35b34610000576101b86106c0565b60408051918252519081900360200190f35b34610000576101b86106c6565b60408051918252519081900360200190f35b34610000576101b86106cc565b60408051918252519081900360200190f35b34610000576101e36106d1565b005b34610000576101f26106fd565b60408051600160a060020a039092168252519081900360200190f35b34610000576101b8610702565b60408051918252519081900360200190f35b34610000576101f2610707565b60408051600160a060020a039092168252519081900360200190f35b34610000576101b8610716565b60408051918252519081900360200190f35b34610000576101b861071c565b60408051918252519081900360200190f35b34610000576101b8610722565b60408051918252519081900360200190f35b34610000576101b861069f565b60408051918252519081900360200190f35b34610000576101f261072e565b60408051600160a060020a039092168252519081900360200190f35b34610000576101f2610733565b60408051600160a060020a039092168252519081900360200190f35b3461000057610494610738565b604080519115158252519081900360200190f35b34610000576101f2610741565b60408051600160a060020a039092168252519081900360200190f35b34610000576101b8610750565b60408051918252519081900360200190f35b34610000576101e3610756565b005b34610000576101b861077f565b60408051918252519081900360200190f35b34610000576101b8610785565b60408051918252519081900360200190f35b6101e3600160a060020a0360043516610837565b005b6101e3600160a060020a036004351660ff602435166044356064356109b5565b005b34610000576101f2610c16565b60408051600160a060020a039092168252519081900360200190f35b6101e360ff60043516602435604435610c1b565b005b34610000576101b8610c2d565b60408051918252519081900360200190f35b34610000576101b8610c3b565b60408051918252519081900360200190f35b34610000576101b8610c42565b60408051918252519081900360200190f35b34610000576101f2610c48565b60408051600160a060020a039092168252519081900360200190f35b690d3c21bcecceda10000081565b6000546106639033600160a060020a03908116911614610c57565b6000805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0383161790555b5b50565b600254600160a060020a031681565b6103e881565b60045481565b60f181565b606481565b60c181565b6101c281565b61271081565b61012c81565b601981565b6000546106ec9033600160a060020a03908116911614610c57565b6007805460ff191660011790555b5b565b60f281565b603281565b600554600160a060020a031681565b61079e81565b60035481565b61076c81565b6103e881565b60c281565b60a181565b60075460ff1681565b600154600160a060020a031681565b6107d081565b6000546107719033600160a060020a03908116911614610c57565b6007805460ff191690555b5b565b60065481565b6000426003541115801561079f575060035462093a800142105b156107ad57506107d0610833565b4260035462093a8001111580156107ca5750600354621275000142105b156107d8575061079e610833565b426003546212750001111580156107f55750600354621baf800142105b15610803575061076c610833565b42600354621baf80011115801561081b575060045442105b15610829575061073a610833565b6108336000610c57565b5b90565b6001546000906108559033600160a060020a03908116911614610c57565b600354610863814210610c57565b6007546108739060ff1615610c57565b61089860646a052b7d2dcc80cd2e4000000461089160065434610c67565b1115610c57565b6103e86108a7346107d0610c8f565b811561000057600554604080517f8cae711f000000000000000000000000000000000000000000000000000000008152600160a060020a03888116600483015294909304602484018190529051909550921691638cae711f9160448082019260009290919082900301818387803b156100005760325a03f1156100005750505061093360065434610c67565b6006556000805460405161096892600160a060020a03909216913480156108fc02929091818181858888f19350505050610c57565b60408051348152602081018490528151600160a060020a038616927f8442948036198f1146d3a63c3db355d7e0295c2cc5676c755990445da4fdc1c9928290030190a25b5b5b5b505b5050565b600083838360006002336000604051602001526040518082600160a060020a0316600160a060020a03166c010000000000000000000000000281526014019150506020604051808303816000866161da5a03f115610000575050604080518051600254600083815260208085018652938501819052845183815260ff8a1681860152808601899052606081018890529451929550610a9694600160a060020a03909216936001936080808501949293601f198301938390039091019190866161da5a03f11561000057505060206040510351600160a060020a031614610c57565b600354610aa581421015610c57565b600454610ab3814210610c57565b600754610ac39060ff1615610c57565b610ae46934f086f3b33b6840000061089160065434610c67565b1115610c57565b6103e8610af834610af3610785565b610c8f565b811561000057049650600560009054906101000a9004600160a060020a0316600160a060020a0316638cae711f8c896040518363ffffffff1660e060020a0281526004018083600160a060020a0316600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100005760325a03f11561000057505050610b8b60065434610c67565b60065560008054604051610bc092600160a060020a03909216913480156108fc02929091818181858888f19350505050610c57565b60408051348152602081018990528151600160a060020a038e16927f8442948036198f1146d3a63c3db355d7e0295c2cc5676c755990445da4fdc1c9928290030190a25b5b5b5b505b505b505050505050505050565b60a281565b6109ac338484846109b5565b5b505050565b6934f086f3b33b6840000081565b6224ea0081565b61073a81565b600054600160a060020a031681565b80151561068c57610000565b5b50565b6000828201610c84848210801590610c7f5750838210155b610c57565b8091505b5092915050565b6000828202610c84841580610c7f575083858381156100005704145b610c57565b8091505b50929150505600a165627a7a7230582070ef3a85f7856818b09d8ce3504a0cf5e410147311eecf5addefe85ca4bb4fa5002960606040523461000057604051608080610b1383398101604090815281516020830151918301516060909301519092905b60038054600160a060020a03808716600160a060020a0319928316179092556004805492861692909116919091179055600582905560068190555b505050505b610a948061007f6000396000f300606060405236156100f65763ffffffff60e060020a60003504166306fdde0381146100fb5780630754617214610188578063095ea7b3146101b157806318160ddd146101e157806323b872dd14610200578063313ce567146102365780633197cbb61461025557806351892f0714610274578063593557361461028f57806370a08231146102ba57806378e97925146102e557806381597d0c146103045780638cae711f1461032257806395d89b4114610340578063a89c5be0146103cd578063a9059cbb146103ec578063ce7a60ab1461041c578063dd62ed3e14610437578063fd22274514610468578063fdee5c2214610491575b610000565b34610000576101086104b0565b60408051602080825283518183015283519192839290830191850190808383821561014e575b80518252602083111561014e57601f19909201916020918201910161012e565b505050905090810190601f16801561017a5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576101956104e7565b60408051600160a060020a039092168252519081900360200190f35b34610000576101cd600160a060020a03600435166024356104f6565b604080519115158252519081900360200190f35b34610000576101ee610561565b60408051918252519081900360200190f35b34610000576101cd600160a060020a0360043581169060243516604435610567565b604080519115158252519081900360200190f35b34610000576101ee61058e565b60408051918252519081900360200190f35b34610000576101ee610593565b60408051918252519081900360200190f35b346100005761028d600160a060020a0360043516610599565b005b34610000576101ee600160a060020a03600435166105e1565b60408051918252519081900360200190f35b34610000576101ee600160a060020a0360043516610600565b60408051918252519081900360200190f35b34610000576101ee61061f565b60408051918252519081900360200190f35b346100005761028d600160a060020a0360043516602435610625565b005b346100005761028d600160a060020a03600435166024356106b5565b005b3461000057610108610745565b60408051602080825283518183015283519192839290830191850190808383821561014e575b80518252602083111561014e57601f19909201916020918201910161012e565b505050905090810190601f16801561017a5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576101ee61077c565b60408051918252519081900360200190f35b34610000576101cd600160a060020a036004351660243561078b565b604080519115158252519081900360200190f35b346100005761028d600160a060020a03600435166107b0565b005b34610000576101ee600160a060020a036004358116906024351661081c565b60408051918252519081900360200190f35b3461000057610195610849565b60408051600160a060020a039092168252519081900360200190f35b34610000576101ee610858565b60408051918252519081900360200190f35b60408051808201909152600b81527f4d656c6f6e20546f6b656e000000000000000000000000000000000000000000602082015281565b600354600160a060020a031681565b600160a060020a03338116600081815260016020908152604080832094871680845294825280832086905580518681529051929493927f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925929181900390910190a35060015b92915050565b60025481565b6000600654610577814211610860565b610582858585610870565b91505b5b509392505050565b601281565b60065481565b6004546105b49033600160a060020a03908116911614610860565b6003805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0383161790555b5b50565b600160a060020a0381166000908152600760205260409020545b919050565b600160a060020a0381166000908152602081905260409020545b919050565b60055481565b6003546106409033600160a060020a03908116911614610860565b806106616012600a0a621312d00261065a6002548461097d565b1115610860565b600160a060020a038316600090815260076020526040902054610684908361097d565b600160a060020a0384166000908152600760205260409020556002546106aa908361097d565b6002555b5b505b5050565b6003546106d09033600160a060020a03908116911614610860565b806106f16012600a0a621312d00261065a6002548461097d565b1115610860565b600160a060020a038316600090815260208190526040902054610714908361097d565b600160a060020a0384166000908152602081905260409020556002546106aa908361097d565b6002555b5b505b5050565b60408051808201909152600381527f4d4c4e0000000000000000000000000000000000000000000000000000000000602082015281565b6a0108b2a2c280290940000081565b600060065461079b814211610860565b6107a584846109a5565b91505b5b5092915050565b6303c26700600654016107c4814211610860565b600160a060020a038216600090815260208181526040808320546007909252909120546107f1919061097d565b600160a060020a0383166000908152602081815260408083209390935560079052908120555b5b5050565b600160a060020a038083166000908152600160209081526040808320938516835292905220545b92915050565b600454600160a060020a031681565b6303c2670081565b8015156105dd57610000565b5b50565b600160a060020a0383166000908152602081905260408120548290108015906108c05750600160a060020a0380851660009081526001602090815260408083203390941683529290522054829010155b80156108e55750600160a060020a038316600090815260208190526040902054828101115b1561097157600160a060020a0380841660008181526020818152604080832080548801905588851680845281842080548990039055600183528184203390961684529482529182902080548790039055815186815291519293927fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9281900390910190a3506001610975565b5060005b5b9392505050565b600082820161099a8482108015906109955750838210155b610860565b8091505b5092915050565b600160a060020a0333166000908152602081905260408120548290108015906109e75750600160a060020a038316600090815260208190526040902054828101115b15610a5957600160a060020a0333811660008181526020818152604080832080548890039055938716808352918490208054870190558351868152935191937fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef929081900390910190a350600161055b565b50600061055b565b5b929150505600a165627a7a723058202a3ba2380f738359b06c2b549fb953b7611b5691800db614d4b493157bcab2a10029",
    "events": {
      "0x1cbc5ab135991bd2b6a4b034a04aa2aa086dac1371cb9b16b8b5e2ed6b036bed": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "tokens",
            "type": "uint256"
          }
        ],
        "name": "Buy",
        "type": "event"
      },
      "0xa54f5b1874ae5ee5a87a7934a20b2d34eec15d48a21e8d473ceb109fc30ceb3a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          }
        ],
        "name": "AllocateCompanyTokens",
        "type": "event"
      },
      "0x9490ad14cd92de3de52dbeec762b0d8a67265e1a1fda12b6cb40b9c85e6bffe0": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "tokens",
            "type": "uint256"
          }
        ],
        "name": "IcedTokenBought",
        "type": "event"
      },
      "0x438e64e2c09a9d39157fea5ff7af898ed8ced3cb7fc4aa4b05fac0655fe54fbb": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "tokens",
            "type": "uint256"
          }
        ],
        "name": "LiquidTokenBought",
        "type": "event"
      },
      "0x8442948036198f1146d3a63c3db355d7e0295c2cc5676c755990445da4fdc1c9": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "eth",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "TokensBought",
        "type": "event"
      }
    },
    "updated_at": 1483840040735,
    "links": {},
    "address": "0x9f5e75e93e9a199066e95442e9204f9d7baf433f"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "Contribution";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.Contribution = Contract;
  }
})();
