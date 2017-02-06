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
        "constant": true,
        "inputs": [],
        "name": "AMBASSADOR_STAKE",
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
        "name": "EXT_COMPANY_STAKE_THREE",
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
        "name": "AMBASSADOR_SEVEN",
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
        "name": "EXT_COMPANY_THREE",
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
        "name": "AMBASSADOR_TWO",
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
        "name": "AMBASSADOR_SIX",
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
        "name": "ADVISOR_STAKE_THREE",
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
        "constant": true,
        "inputs": [],
        "name": "ADVISOR_THREE",
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
        "constant": true,
        "inputs": [],
        "name": "AMBASSADOR_THREE",
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
        "name": "AMBASSADOR_ONE",
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
        "name": "AMBASSADOR_FOUR",
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
        "name": "AMBASSADOR_FIVE",
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
    "unlinked_binary": "0x60606040523462000000576040516080806200241183398101604090815281516020830151918301516060909301519092905b60008054600160a060020a03808716600160a060020a031992831617808455600180548884169085161790556002805487841694169390931790925560038490556224ea00840160048190556040518493309316918691610b4b80620018c68339600160a060020a0395861691019081529290931660208301526040808301919091526060820192909252905190819003608001906000f08015620000005760058054600160a060020a031916600160a060020a039283161790819055604080516000602091820181905282517f336da0590000000000000000000000000000000000000000000000000000000081529251939094169363336da059936004808501949192918390030190829087803b15620000005760325a03f11562000000575050604080518051600554600080547f8cae711f000000000000000000000000000000000000000000000000000000008552600160a060020a03908116600486015261271084046103e881026024870152955193985094965093169350638cae711f9260448084019391929182900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c000000000000000000000000000000000000000000000000000000008152738cb08267c381d6339cab49b7bafacc9ce5a503a060048201526101d1850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260f260048201526101d1850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815272779e0e4c6083cfd26de77b4dbc107a7ebb99d2600482015261012c850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260c260048201526064850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260c360048201526032850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260a160048201526032850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815273715a70a7c7d76acc8d5874862e381c1940c19cce60048201526019850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f11562000000575050600554604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260a36004820152600a850260248201529051600160a060020a0390921692506381597d0c91604480830192600092919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e16004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e26004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e36004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e46004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e56004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e66004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f1156200000057505060058054604080517f81597d0c00000000000000000000000000000000000000000000000000000000815260e76004820152928502602484015251600160a060020a0390911692506381597d0c9160448082019260009290919082900301818387803b15620000005760325a03f11562000000575050505b5050505050505b610fad80620009196000396000f3006060604052361561022a5763ffffffff60e060020a60003504166301d1c7fd811461022f5780630a5a4e171461024e57806317d4e24c1461026d578063201453281461028c578063238ac933146102a75780632b750f4f146102d05780633197cbb6146102ef5780633693db0a1461030e57806339e84cef146103375780633d769e3d146103565780633ee90a291461037f5780633f423afe1461039e578063434ec416146103bd57806353f6f01f146103dc5780635ed7ca5b146103fb578063603ccf5e1461040a57806366875a31146104335780636896a3421461026d5780636b3fdf161461047b5780636b915d43146104a457806370dbb783146104cd578063773ef38e146104f657806378e979251461051557806383a9094f146105345780638b8373ca1461055357806392f7ba17146102d05780639afa3dc71461059b5780639f44b34c146105ba5780639fa9b04c146105e3578063b9b8af0b1461060c578063bb6322441461062d578063bdf75a6a14610656578063c1929d8c14610675578063cb3e64fd1461069e578063cd72ab69146106ad578063ceb791d9146106cc578063d89397b1146106eb578063dda44b1014610701578063df969bc014610723578063e01dd67b1461074c578063e5fe4f3114610775578063e6d8d4351461078b578063e8303659146107b4578063e9d8d3d7146107d3578063f4656219146107f2578063f47cd13314610811578063f71c60bd1461083a578063fd22274514610863575b610000565b346100005761023c61088c565b60408051918252519081900360200190f35b346100005761023c61089a565b60408051918252519081900360200190f35b346100005761023c61089f565b60408051918252519081900360200190f35b34610000576102a5600160a060020a03600435166108a4565b005b34610000576102b46108ec565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c6108fb565b60408051918252519081900360200190f35b346100005761023c610901565b60408051918252519081900360200190f35b34610000576102b4610907565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c61091f565b60408051918252519081900360200190f35b34610000576102b4610924565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c61093b565b60408051918252519081900360200190f35b346100005761023c610941565b60408051918252519081900360200190f35b346100005761023c610947565b60408051918252519081900360200190f35b346100005761023c61094d565b60408051918252519081900360200190f35b34610000576102a5610952565b005b34610000576102b461097e565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b4610983565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c61089f565b60408051918252519081900360200190f35b34610000576102b461098d565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b4610992565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b46109a1565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c6109a6565b60408051918252519081900360200190f35b346100005761023c6109ac565b60408051918252519081900360200190f35b346100005761023c6109b2565b60408051918252519081900360200190f35b34610000576102b46109b8565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c6108fb565b60408051918252519081900360200190f35b346100005761023c6109c3565b60408051918252519081900360200190f35b34610000576102b46109c8565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b46109cd565b60408051600160a060020a039092168252519081900360200190f35b34610000576106196109d2565b604080519115158252519081900360200190f35b34610000576102b46109db565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c6109ea565b60408051918252519081900360200190f35b34610000576102b46109f0565b60408051600160a060020a039092168252519081900360200190f35b34610000576102a56109f5565b005b346100005761023c610a1e565b60408051918252519081900360200190f35b346100005761023c610a24565b60408051918252519081900360200190f35b6102a5600160a060020a0360043516610ad6565b005b6102a5600160a060020a036004351660ff60243516604435606435610c54565b005b34610000576102b4610eb5565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b4610ecd565b60408051600160a060020a039092168252519081900360200190f35b6102a560ff60043516602435604435610ed2565b005b34610000576102b4610ee4565b60408051600160a060020a039092168252519081900360200190f35b346100005761023c610ee9565b60408051918252519081900360200190f35b346100005761023c610ef7565b60408051918252519081900360200190f35b346100005761023c610efe565b60408051918252519081900360200190f35b34610000576102b4610f04565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b4610f09565b60408051600160a060020a039092168252519081900360200190f35b34610000576102b4610f0e565b60408051600160a060020a039092168252519081900360200190f35b690d3c21bcecceda10000081565b600581565b603281565b6000546108bf9033600160a060020a03908116911614610f1d565b6000805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0383161790555b5b50565b600254600160a060020a031681565b6103e881565b60045481565b738cb08267c381d6339cab49b7bafacc9ce5a503a081565b606481565b72779e0e4c6083cfd26de77b4dbc107a7ebb99d281565b6101d181565b61271081565b61012c81565b601981565b60005461096d9033600160a060020a03908116911614610f1d565b6007805460ff191660011790555b5b565b60e781565b60f281565b603281565b60c381565b600554600160a060020a031681565b60e281565b61079e81565b60035481565b61076c81565b60e681565b6103e881565b600a81565b60c281565b60a181565b60075460ff1681565b600154600160a060020a031681565b6107d081565b60a381565b600054610a109033600160a060020a03908116911614610f1d565b6007805460ff191690555b5b565b60065481565b60004260035411158015610a3e575060035462093a800142105b15610a4c57506107d0610ad2565b4260035462093a800111158015610a695750600354621275000142105b15610a77575061079e610ad2565b42600354621275000111158015610a945750600354621baf800142105b15610aa2575061076c610ad2565b42600354621baf800111158015610aba575060045442105b15610ac8575061073a610ad2565b610ad26000610f1d565b5b90565b600154600090610af49033600160a060020a03908116911614610f1d565b600354610b02814210610f1d565b600754610b129060ff1615610f1d565b610b3760646a052b7d2dcc80cd2e40000004610b3060065434610f2d565b1115610f1d565b6103e8610b46346107d0610f55565b811561000057600554604080517f8cae711f000000000000000000000000000000000000000000000000000000008152600160a060020a03888116600483015294909304602484018190529051909550921691638cae711f9160448082019260009290919082900301818387803b156100005760325a03f11561000057505050610bd260065434610f2d565b60065560008054604051610c0792600160a060020a03909216913480156108fc02929091818181858888f19350505050610f1d565b60408051348152602081018490528151600160a060020a038616927f8442948036198f1146d3a63c3db355d7e0295c2cc5676c755990445da4fdc1c9928290030190a25b5b5b5b505b5050565b600083838360006002336000604051602001526040518082600160a060020a0316600160a060020a03166c010000000000000000000000000281526014019150506020604051808303816000866161da5a03f115610000575050604080518051600254600083815260208085018652938501819052845183815260ff8a1681860152808601899052606081018890529451929550610d3594600160a060020a03909216936001936080808501949293601f198301938390039091019190866161da5a03f11561000057505060206040510351600160a060020a031614610f1d565b600354610d4481421015610f1d565b600454610d52814210610f1d565b600754610d629060ff1615610f1d565b610d836934f086f3b33b68400000610b3060065434610f2d565b1115610f1d565b6103e8610d9734610d92610a24565b610f55565b811561000057049650600560009054906101000a9004600160a060020a0316600160a060020a0316638cae711f8c896040518363ffffffff1660e060020a0281526004018083600160a060020a0316600160a060020a0316815260200182815260200192505050600060405180830381600087803b156100005760325a03f11561000057505050610e2a60065434610f2d565b60065560008054604051610e5f92600160a060020a03909216913480156108fc02929091818181858888f19350505050610f1d565b60408051348152602081018990528151600160a060020a038e16927f8442948036198f1146d3a63c3db355d7e0295c2cc5676c755990445da4fdc1c9928290030190a25b5b5b5b505b505b505050505050505050565b73715a70a7c7d76acc8d5874862e381c1940c19cce81565b60e381565b610c4b33848484610c54565b5b505050565b60e181565b6934f086f3b33b6840000081565b6224ea0081565b61073a81565b60e481565b60e581565b600054600160a060020a031681565b8015156108e857610000565b5b50565b6000828201610f4a848210801590610f455750838210155b610f1d565b8091505b5092915050565b6000828202610f4a841580610f45575083858381156100005704145b610f1d565b8091505b50929150505600a165627a7a7230582008d77db061e56d6744e6ee674f9456c5000e01f56221f46d874528daf5ef7f2d002960606040523461000057604051608080610b4b83398101604090815281516020830151918301516060909301519092905b60038054600160a060020a03808716600160a060020a0319928316179092556004805492861692909116919091179055600582905560068190555b505050505b610acc8061007f6000396000f300606060405236156101015763ffffffff60e060020a60003504166306fdde0381146101065780630754617214610193578063095ea7b3146101bc57806318160ddd146101ec57806323b872dd1461020b578063313ce567146102415780633197cbb614610260578063336da0591461027f57806351892f071461029e57806359355736146102b957806370a08231146102e457806378e979251461030f57806381597d0c1461032e5780638cae711f1461034c57806395d89b411461036a578063a89c5be0146103f7578063a9059cbb14610416578063ce7a60ab14610446578063dd62ed3e14610461578063fd22274514610492578063fdee5c22146104bb575b610000565b34610000576101136104da565b604080516020808252835181830152835191928392908301918501908083838215610159575b80518252602083111561015957601f199092019160209182019101610139565b505050905090810190601f1680156101855780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576101a0610511565b60408051600160a060020a039092168252519081900360200190f35b34610000576101d8600160a060020a0360043516602435610520565b604080519115158252519081900360200190f35b34610000576101f961058b565b60408051918252519081900360200190f35b34610000576101d8600160a060020a0360043581169060243516604435610591565b604080519115158252519081900360200190f35b34610000576101f96105b8565b60408051918252519081900360200190f35b34610000576101f96105bd565b60408051918252519081900360200190f35b34610000576101f96105c3565b60408051918252519081900360200190f35b34610000576102b7600160a060020a03600435166105d1565b005b34610000576101f9600160a060020a0360043516610619565b60408051918252519081900360200190f35b34610000576101f9600160a060020a0360043516610638565b60408051918252519081900360200190f35b34610000576101f9610657565b60408051918252519081900360200190f35b34610000576102b7600160a060020a036004351660243561065d565b005b34610000576102b7600160a060020a03600435166024356106ed565b005b346100005761011361077d565b604080516020808252835181830152835191928392908301918501908083838215610159575b80518252602083111561015957601f199092019160209182019101610139565b505050905090810190601f1680156101855780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576101f96107b4565b60408051918252519081900360200190f35b34610000576101d8600160a060020a03600435166024356107c3565b604080519115158252519081900360200190f35b34610000576102b7600160a060020a03600435166107e8565b005b34610000576101f9600160a060020a0360043581169060243516610854565b60408051918252519081900360200190f35b34610000576101a0610881565b60408051600160a060020a039092168252519081900360200190f35b34610000576101f9610890565b60408051918252519081900360200190f35b60408051808201909152600b81527f4d656c6f6e20546f6b656e000000000000000000000000000000000000000000602082015281565b600354600160a060020a031681565b600160a060020a03338116600081815260016020908152604080832094871680845294825280832086905580518681529051929493927f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925929181900390910190a35060015b92915050565b60025481565b60006006546105a1814211610898565b6105ac8585856108a8565b91505b5b509392505050565b601281565b60065481565b69d3c21bcecceda100000081565b6004546105ec9033600160a060020a03908116911614610898565b6003805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0383161790555b5b50565b600160a060020a0381166000908152600760205260409020545b919050565b600160a060020a0381166000908152602081905260409020545b919050565b60055481565b6003546106789033600160a060020a03908116911614610898565b806106996012600a0a621312d002610692600254846109b5565b1115610898565b600160a060020a0383166000908152600760205260409020546106bc90836109b5565b600160a060020a0384166000908152600760205260409020556002546106e290836109b5565b6002555b5b505b5050565b6003546107089033600160a060020a03908116911614610898565b806107296012600a0a621312d002610692600254846109b5565b1115610898565b600160a060020a03831660009081526020819052604090205461074c90836109b5565b600160a060020a0384166000908152602081905260409020556002546106e290836109b5565b6002555b5b505b5050565b60408051808201909152600381527f4d4c4e0000000000000000000000000000000000000000000000000000000000602082015281565b6a0108b2a2c280290940000081565b60006006546107d3814211610898565b6107dd84846109dd565b91505b5b5092915050565b6303c26700600654016107fc814211610898565b600160a060020a0382166000908152602081815260408083205460079092529091205461082991906109b5565b600160a060020a0383166000908152602081815260408083209390935560079052908120555b5b5050565b600160a060020a038083166000908152600160209081526040808320938516835292905220545b92915050565b600454600160a060020a031681565b6303c2670081565b80151561061557610000565b5b50565b600160a060020a0383166000908152602081905260408120548290108015906108f85750600160a060020a0380851660009081526001602090815260408083203390941683529290522054829010155b801561091d5750600160a060020a038316600090815260208190526040902054828101115b156109a957600160a060020a0380841660008181526020818152604080832080548801905588851680845281842080548990039055600183528184203390961684529482529182902080548790039055815186815291519293927fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9281900390910190a35060016109ad565b5060005b5b9392505050565b60008282016109d28482108015906109cd5750838210155b610898565b8091505b5092915050565b600160a060020a033316600090815260208190526040812054829010801590610a1f5750600160a060020a038316600090815260208190526040902054828101115b15610a9157600160a060020a0333811660008181526020818152604080832080548890039055938716808352918490208054870190558351868152935191937fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef929081900390910190a3506001610585565b506000610585565b5b929150505600a165627a7a72305820470340d97901dadd8b057a36ee885f2fdc8e449d1b64284a2acbd969029229fc0029",
    "events": {
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
    "updated_at": 1486330017097
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
