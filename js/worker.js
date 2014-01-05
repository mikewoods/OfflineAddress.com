try {
  importScripts("crypto.js");
  importScripts("jsbn2.js");
  importScripts("bitcoin.js");
} catch(e) {}

onmessage = function(event) {
  var array32byte = event.data;
  var eckey = new Bitcoin.ECKey(array32byte);
  var BTCaddress = eckey.getBitcoinAddress().toString();
  var privateKeyWIF = new Bitcoin.Address(array32byte);
  privateKeyWIF.version = 0x80;
  BTCprivateKey = privateKeyWIF.toString();
  var x = new Object();
  x.address = BTCaddress;
  x.key = BTCprivateKey;
  this.postMessage(x);
};
