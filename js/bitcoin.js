/*
* BitcoinJS (c) 2011-2012 Stefan Thomas
* Released under MIT license
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
* http://bitcoinjs.org/
*/
function Arcfour() {
    this.i = 0;
    this.j = 0;
    this.S = new Array();
}

// Initialize arcfour context from key, an array of ints, each from [0..255]
function ARC4init(key) {
    var i, j, t;
    for (i = 0; i < 256; ++i)
        this.S[i] = i;
    j = 0;
    for (i = 0; i < 256; ++i) {
        j = (j + this.S[i] + key[i % key.length]) & 255;
        t = this.S[i];
        this.S[i] = this.S[j];
        this.S[j] = t;
    }
    this.i = 0;
    this.j = 0;
}

function ARC4next() {
    var t;
    this.i = (this.i + 1) & 255;
    this.j = (this.j + this.S[this.i]) & 255;
    t = this.S[this.i];
    this.S[this.i] = this.S[this.j];
    this.S[this.j] = t;
    return this.S[(t + this.S[this.i]) & 255];
}

Arcfour.prototype.init = ARC4init;
Arcfour.prototype.next = ARC4next;

// Plug in your RNG constructor here
function prng_newstate() {
    return new Arcfour();
}

// Pool size must be a multiple of 4 and greater than 32.
// An array of bytes the size of the pool will be passed to init()
var rng_psize = 256;

var rng_state;
var rng_pool;
var rng_pptr;

// Mix in a 32-bit integer into the pool
function rng_seed_int(x) {
    rng_pool[rng_pptr++] ^= x & 255;
    rng_pool[rng_pptr++] ^= (x >> 8) & 255;
    rng_pool[rng_pptr++] ^= (x >> 16) & 255;
    rng_pool[rng_pptr++] ^= (x >> 24) & 255;
    if (rng_pptr >= rng_psize)
        rng_pptr -= rng_psize;
}

// Mix in the current time (w/milliseconds) into the pool
function rng_seed_time() {
    rng_seed_int(new Date().getTime());
}

// Initialize the pool with junk if needed.
if (rng_pool == null) {
    rng_pool = new Array();
    rng_pptr = 0;
    var t;
    if (navigator.appName == "Netscape" && navigator.appVersion < "5" && /*window.*/crypto) {
        // Extract entropy (256 bits) from NS4 RNG if available
        var z = /*window.*/crypto.random(32);
        for (t = 0; t < z.length; ++t)
            rng_pool[rng_pptr++] = z.charCodeAt(t) & 255;
    }
    while (rng_pptr < rng_psize) { // extract some randomness from Math.random()
        t = Math.floor(65536 * Math.random());
        rng_pool[rng_pptr++] = t >>> 8;
        rng_pool[rng_pptr++] = t & 255;
    }
    rng_pptr = 0;
    rng_seed_time();
}

function rng_get_byte() {
    if (rng_state == null) {
        rng_seed_time();
        rng_state = prng_newstate();
        rng_state.init(rng_pool);
        for (rng_pptr = 0; rng_pptr < rng_pool.length; ++rng_pptr)
            rng_pool[rng_pptr] = 0;
        rng_pptr = 0;
    //rng_pool = null;
    }
    // TODO: allow reseeding after first request
    return rng_state.next();
}

function rng_get_bytes(ba) {
    var i;
    for (i = 0; i < ba.length; ++i)
        ba[i] = rng_get_byte();
}

function SecureRandom() {
}

SecureRandom.prototype.nextBytes = rng_get_bytes;

// constructor
function ECFieldElementFp(q, x) {
    this.x = x;
    // TODO if(x.compareTo(q) >= 0) error
    this.q = q;
}

function feFpEquals(other) {
    if (other == this)
        return true;
    return (this.q.equals(other.q) && this.x.equals(other.x));
}

function feFpToBigInteger() {
    return this.x;
}

function feFpNegate() {
    return new ECFieldElementFp(this.q, this.x.negate().mod(this.q));
}

function feFpAdd(b) {
    return new ECFieldElementFp(this.q, this.x.add(b.toBigInteger()).mod(this.q));
}

function feFpSubtract(b) {
    return new ECFieldElementFp(this.q, this.x.subtract(b.toBigInteger()).mod(this.q));
}

function feFpMultiply(b) {
    return new ECFieldElementFp(this.q, this.x.multiply(b.toBigInteger()).mod(this.q));
}

function feFpSquare() {
    return new ECFieldElementFp(this.q, this.x.square().mod(this.q));
}

function feFpDivide(b) {
    return new ECFieldElementFp(this.q, this.x.multiply(b.toBigInteger().modInverse(this.q)).mod(this.q));
}

ECFieldElementFp.prototype.equals = feFpEquals;
ECFieldElementFp.prototype.toBigInteger = feFpToBigInteger;
ECFieldElementFp.prototype.negate = feFpNegate;
ECFieldElementFp.prototype.add = feFpAdd;
ECFieldElementFp.prototype.subtract = feFpSubtract;
ECFieldElementFp.prototype.multiply = feFpMultiply;
ECFieldElementFp.prototype.square = feFpSquare;
ECFieldElementFp.prototype.divide = feFpDivide;

// ----------------
// ECPointFp

// constructor
function ECPointFp(curve, x, y, z) {
    this.curve = curve;
    this.x = x;
    this.y = y;
    // Projective coordinates: either zinv == null or z * zinv == 1
    // z and zinv are just BigIntegers, not fieldElements
    if (z == null) {
        this.z = BigInteger.ONE;
    } 
    else {
        this.z = z;
    }
    this.zinv = null;
//TODO: compression flag
}

function pointFpGetX() {
    if (this.zinv == null) {
        this.zinv = this.z.modInverse(this.curve.q);
    }
    return this.curve.fromBigInteger(this.x.toBigInteger().multiply(this.zinv).mod(this.curve.q));
}

function pointFpGetY() {
    if (this.zinv == null) {
        this.zinv = this.z.modInverse(this.curve.q);
    }
    return this.curve.fromBigInteger(this.y.toBigInteger().multiply(this.zinv).mod(this.curve.q));
}

function pointFpEquals(other) {
    if (other == this)
        return true;
    if (this.isInfinity())
        return other.isInfinity();
    if (other.isInfinity())
        return this.isInfinity();
    var u, v;
    // u = Y2 * Z1 - Y1 * Z2
    u = other.y.toBigInteger().multiply(this.z).subtract(this.y.toBigInteger().multiply(other.z)).mod(this.curve.q);
    if (!u.equals(BigInteger.ZERO))
        return false;
    // v = X2 * Z1 - X1 * Z2
    v = other.x.toBigInteger().multiply(this.z).subtract(this.x.toBigInteger().multiply(other.z)).mod(this.curve.q);
    return v.equals(BigInteger.ZERO);
}

function pointFpIsInfinity() {
    if ((this.x == null) && (this.y == null))
        return true;
    return this.z.equals(BigInteger.ZERO) && !this.y.toBigInteger().equals(BigInteger.ZERO);
}

function pointFpNegate() {
    return new ECPointFp(this.curve, this.x, this.y.negate(), this.z);
}

function pointFpAdd(b) {
    if (this.isInfinity())
        return b;
    if (b.isInfinity())
        return this;

    // u = Y2 * Z1 - Y1 * Z2
    var u = b.y.toBigInteger().multiply(this.z).subtract(this.y.toBigInteger().multiply(b.z)).mod(this.curve.q);
    // v = X2 * Z1 - X1 * Z2
    var v = b.x.toBigInteger().multiply(this.z).subtract(this.x.toBigInteger().multiply(b.z)).mod(this.curve.q);
    
    if (BigInteger.ZERO.equals(v)) {
        if (BigInteger.ZERO.equals(u)) {
            return this.twice(); // this == b, so double
        }
        return this.curve.getInfinity(); // this = -b, so infinity
    }
    
    var THREE = new BigInteger("3");
    var x1 = this.x.toBigInteger();
    var y1 = this.y.toBigInteger();
    var x2 = b.x.toBigInteger();
    var y2 = b.y.toBigInteger();
    
    var v2 = v.square();
    var v3 = v2.multiply(v);
    var x1v2 = x1.multiply(v2);
    var zu2 = u.square().multiply(this.z);

    // x3 = v * (z2 * (z1 * u^2 - 2 * x1 * v^2) - v^3)
    var x3 = zu2.subtract(x1v2.shiftLeft(1)).multiply(b.z).subtract(v3).multiply(v).mod(this.curve.q);
    // y3 = z2 * (3 * x1 * u * v^2 - y1 * v^3 - z1 * u^3) + u * v^3
    var y3 = x1v2.multiply(THREE).multiply(u).subtract(y1.multiply(v3)).subtract(zu2.multiply(u)).multiply(b.z).add(u.multiply(v3)).mod(this.curve.q);
    // z3 = v^3 * z1 * z2
    var z3 = v3.multiply(this.z).multiply(b.z).mod(this.curve.q);
    
    return new ECPointFp(this.curve, this.curve.fromBigInteger(x3), this.curve.fromBigInteger(y3), z3);
}

function pointFpTwice() {
    if (this.isInfinity())
        return this;
    if (this.y.toBigInteger().signum() == 0)
        return this.curve.getInfinity();

    // TODO: optimized handling of constants
    var THREE = new BigInteger("3");
    var x1 = this.x.toBigInteger();
    var y1 = this.y.toBigInteger();
    
    var y1z1 = y1.multiply(this.z);
    var y1sqz1 = y1z1.multiply(y1).mod(this.curve.q);
    var a = this.curve.a.toBigInteger();

    // w = 3 * x1^2 + a * z1^2
    var w = x1.square().multiply(THREE);
    if (!BigInteger.ZERO.equals(a)) {
        w = w.add(this.z.square().multiply(a));
    }
    w = w.mod(this.curve.q);
    // x3 = 2 * y1 * z1 * (w^2 - 8 * x1 * y1^2 * z1)
    var x3 = w.square().subtract(x1.shiftLeft(3).multiply(y1sqz1)).shiftLeft(1).multiply(y1z1).mod(this.curve.q);
    // y3 = 4 * y1^2 * z1 * (3 * w * x1 - 2 * y1^2 * z1) - w^3
    var y3 = w.multiply(THREE).multiply(x1).subtract(y1sqz1.shiftLeft(1)).shiftLeft(2).multiply(y1sqz1).subtract(w.square().multiply(w)).mod(this.curve.q);
    // z3 = 8 * (y1 * z1)^3
    var z3 = y1z1.square().multiply(y1z1).shiftLeft(3).mod(this.curve.q);
    
    return new ECPointFp(this.curve, this.curve.fromBigInteger(x3), this.curve.fromBigInteger(y3), z3);
}

// Simple NAF (Non-Adjacent Form) multiplication algorithm
// TODO: modularize the multiplication algorithm
function pointFpMultiply(k) {
    if (this.isInfinity())
        return this;
    if (k.signum() == 0)
        return this.curve.getInfinity();
    
    var e = k;
    var h = e.multiply(new BigInteger("3"));
    
    var neg = this.negate();
    var R = this;
    
    var i;
    for (i = h.bitLength() - 2; i > 0; --i) {
        R = R.twice();
        
        var hBit = h.testBit(i);
        var eBit = e.testBit(i);
        
        if (hBit != eBit) {
            R = R.add(hBit ? this : neg);
        }
    }
    
    return R;
}

// Compute this*j + x*k (simultaneous multiplication)
function pointFpMultiplyTwo(j, x, k) {
    var i;
    if (j.bitLength() > k.bitLength())
        i = j.bitLength() - 1;
    else
        i = k.bitLength() - 1;
    
    var R = this.curve.getInfinity();
    var both = this.add(x);
    while (i >= 0) {
        R = R.twice();
        if (j.testBit(i)) {
            if (k.testBit(i)) {
                R = R.add(both);
            } 
            else {
                R = R.add(this);
            }
        } 
        else {
            if (k.testBit(i)) {
                R = R.add(x);
            }
        }
        --i;
    }
    
    return R;
}

ECPointFp.prototype.getX = pointFpGetX;
ECPointFp.prototype.getY = pointFpGetY;
ECPointFp.prototype.equals = pointFpEquals;
ECPointFp.prototype.isInfinity = pointFpIsInfinity;
ECPointFp.prototype.negate = pointFpNegate;
ECPointFp.prototype.add = pointFpAdd;
ECPointFp.prototype.twice = pointFpTwice;
ECPointFp.prototype.multiply = pointFpMultiply;
ECPointFp.prototype.multiplyTwo = pointFpMultiplyTwo;

// ----------------
// ECCurveFp

// constructor
function ECCurveFp(q, a, b) {
    this.q = q;
    this.a = this.fromBigInteger(a);
    this.b = this.fromBigInteger(b);
    this.infinity = new ECPointFp(this, null, null);
}

function curveFpGetQ() {
    return this.q;
}

function curveFpGetA() {
    return this.a;
}

function curveFpGetB() {
    return this.b;
}

function curveFpEquals(other) {
    if (other == this)
        return true;
    return (this.q.equals(other.q) && this.a.equals(other.a) && this.b.equals(other.b));
}

function curveFpGetInfinity() {
    return this.infinity;
}

function curveFpFromBigInteger(x) {
    return new ECFieldElementFp(this.q, x);
}

// for now, work with hex strings because they're easier in JS
function curveFpDecodePointHex(s) {
    switch (parseInt(s.substr(0, 2), 16)) { // first byte
        case 0:
            return this.infinity;
        case 2:
        case 3:
            // point compression not supported yet
            return null;
        case 4:
        case 6:
        case 7:
            var len = (s.length - 2) / 2;
            var xHex = s.substr(2, len);
            var yHex = s.substr(len + 2, len);
            
            return new ECPointFp(this, 
            this.fromBigInteger(new BigInteger(xHex, 16)), 
            this.fromBigInteger(new BigInteger(yHex, 16)));
        
        default: // unsupported
            return null;
    }
}

ECCurveFp.prototype.getQ = curveFpGetQ;
ECCurveFp.prototype.getA = curveFpGetA;
ECCurveFp.prototype.getB = curveFpGetB;
ECCurveFp.prototype.equals = curveFpEquals;
ECCurveFp.prototype.getInfinity = curveFpGetInfinity;
ECCurveFp.prototype.fromBigInteger = curveFpFromBigInteger;
ECCurveFp.prototype.decodePointHex = curveFpDecodePointHex;

// constructor
function X9ECParameters(curve, g, n, h) {
    this.curve = curve;
    this.g = g;
    this.n = n;
    this.h = h;
}

function x9getCurve() {
    return this.curve;
}

function x9getG() {
    return this.g;
}

function x9getN() {
    return this.n;
}

function x9getH() {
    return this.h;
}

X9ECParameters.prototype.getCurve = x9getCurve;
X9ECParameters.prototype.getG = x9getG;
X9ECParameters.prototype.getN = x9getN;
X9ECParameters.prototype.getH = x9getH;

// ----------------
// SECNamedCurves

function fromHex(s) {
    return new BigInteger(s, 16);
}

function secp128r1() {
    // p = 2^128 - 2^97 - 1
    var p = fromHex("FFFFFFFDFFFFFFFFFFFFFFFFFFFFFFFF");
    var a = fromHex("FFFFFFFDFFFFFFFFFFFFFFFFFFFFFFFC");
    var b = fromHex("E87579C11079F43DD824993C2CEE5ED3");
    //byte[] S = Hex.decode("000E0D4D696E6768756151750CC03A4473D03679");
    var n = fromHex("FFFFFFFE0000000075A30D1B9038A115");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "161FF7528B899B2D0C28607CA52C5B86" 
    + "CF5AC8395BAFEB13C02DA292DDED7A83");
    return new X9ECParameters(curve, G, n, h);
}

function secp160k1() {
    // p = 2^160 - 2^32 - 2^14 - 2^12 - 2^9 - 2^8 - 2^7 - 2^3 - 2^2 - 1
    var p = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFAC73");
    var a = BigInteger.ZERO;
    var b = fromHex("7");
    //byte[] S = null;
    var n = fromHex("0100000000000000000001B8FA16DFAB9ACA16B6B3");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "3B4C382CE37AA192A4019E763036F4F5DD4D7EBB" 
    + "938CF935318FDCED6BC28286531733C3F03C4FEE");
    return new X9ECParameters(curve, G, n, h);
}

function secp160r1() {
    // p = 2^160 - 2^31 - 1
    var p = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFF");
    var a = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFC");
    var b = fromHex("1C97BEFC54BD7A8B65ACF89F81D4D4ADC565FA45");
    //byte[] S = Hex.decode("1053CDE42C14D696E67687561517533BF3F83345");
    var n = fromHex("0100000000000000000001F4C8F927AED3CA752257");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "4A96B5688EF573284664698968C38BB913CBFC82" 
    + "23A628553168947D59DCC912042351377AC5FB32");
    return new X9ECParameters(curve, G, n, h);
}

function secp192k1() {
    // p = 2^192 - 2^32 - 2^12 - 2^8 - 2^7 - 2^6 - 2^3 - 1
    var p = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFEE37");
    var a = BigInteger.ZERO;
    var b = fromHex("3");
    //byte[] S = null;
    var n = fromHex("FFFFFFFFFFFFFFFFFFFFFFFE26F2FC170F69466A74DEFD8D");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "DB4FF10EC057E9AE26B07D0280B7F4341DA5D1B1EAE06C7D" 
    + "9B2F2F6D9C5628A7844163D015BE86344082AA88D95E2F9D");
    return new X9ECParameters(curve, G, n, h);
}

function secp192r1() {
    // p = 2^192 - 2^64 - 1
    var p = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFFFF");
    var a = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFFFC");
    var b = fromHex("64210519E59C80E70FA7E9AB72243049FEB8DEECC146B9B1");
    //byte[] S = Hex.decode("3045AE6FC8422F64ED579528D38120EAE12196D5");
    var n = fromHex("FFFFFFFFFFFFFFFFFFFFFFFF99DEF836146BC9B1B4D22831");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "188DA80EB03090F67CBF20EB43A18800F4FF0AFD82FF1012" 
    + "07192B95FFC8DA78631011ED6B24CDD573F977A11E794811");
    return new X9ECParameters(curve, G, n, h);
}

function secp224r1() {
    // p = 2^224 - 2^96 + 1
    var p = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000000000000000000001");
    var a = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFE");
    var b = fromHex("B4050A850C04B3ABF54132565044B0B7D7BFD8BA270B39432355FFB4");
    //byte[] S = Hex.decode("BD71344799D5C7FCDC45B59FA3B9AB8F6A948BC5");
    var n = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFF16A2E0B8F03E13DD29455C5C2A3D");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "B70E0CBD6BB4BF7F321390B94A03C1D356C21122343280D6115C1D21" 
    + "BD376388B5F723FB4C22DFE6CD4375A05A07476444D5819985007E34");
    return new X9ECParameters(curve, G, n, h);
}

function secp256k1() {
    // p = 2^256 - 2^32 - 2^9 - 2^8 - 2^7 - 2^6 - 2^4 - 1
    var p = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F");
    var a = BigInteger.ZERO;
    var b = fromHex("7");
    //byte[] S = null;
    var n = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798" 
    + "483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8");
    return new X9ECParameters(curve, G, n, h);
}

function secp256r1() {
    // p = 2^224 (2^32 - 1) + 2^192 + 2^96 - 1
    var p = fromHex("FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF");
    var a = fromHex("FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC");
    var b = fromHex("5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B");
    //byte[] S = Hex.decode("C49D360886E704936A6678E1139D26B7819F7E90");
    var n = fromHex("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");
    var h = BigInteger.ONE;
    var curve = new ECCurveFp(p, a, b);
    var G = curve.decodePointHex("04" 
    + "6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296" 
    + "4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5");
    return new X9ECParameters(curve, G, n, h);
}

// TODO: make this into a proper hashtable
function getSECCurveByName(name) {
    if (name == "secp128r1")
        return secp128r1();
    if (name == "secp160k1")
        return secp160k1();
    if (name == "secp160r1")
        return secp160r1();
    if (name == "secp192k1")
        return secp192k1();
    if (name == "secp192r1")
        return secp192r1();
    if (name == "secp224r1")
        return secp224r1();
    if (name == "secp256k1")
        return secp256k1();
    if (name == "secp256r1")
        return secp256r1();
    return null;
}


var EventEmitter = function() {
};
/**
 * Bind a callback to an event, with an option scope context
 *
 * @param {string} name the name of the event
 * @param {function} callback the callback function to fire when the event is triggered
 * @param {object} context the scope to use for the callback (which will become 'this' inside the callback)
 */
EventEmitter.prototype.on = function(name, callback, context) {
    if (!context)
        context = this;
    if (!this._listeners)
        this._listeners = {};
    if (!this._listeners[name])
        this._listeners[name] = [];
    if (!this._unbinders)
        this._unbinders = {};
    if (!this._unbinders[name])
        this._unbinders[name] = [];
    var f = function(e) {
        callback.apply(context, [e]);
    };
    this._unbinders[name].push(callback);
    this._listeners[name].push(f);
};
/**
 * Trigger an event, firing all bound callbacks
 * 
 * @param {string} name the name of the event
 * @param {object} event the event object to be passed through to the callback
 */
EventEmitter.prototype.trigger = function(name, event) {
    if (event === undefined)
        event = {}
    if (!this._listeners)
        this._listeners = {};
    if (!this._listeners[name])
        return;
    var i = this._listeners[name].length;
    while (i--)
        this._listeners[name][i](event);
};
/**
 * Remove a bound listener
 * 
 * @param {string} name the name of the event
 * @param {object} event the event object to be passed through to the callback
 */
EventEmitter.prototype.removeListener = function(name, callback) {
    if (!this._unbinders)
        this._unbinders = {};
    if (!this._unbinders[name])
        return;
    var i = this._unbinders[name].length;
    while (i--) {
        if (this._unbinders[name][i] === callback) {
            this._unbinders[name].splice(i, 1);
            this._listeners[name].splice(i, 1);
        }
    }
};
/**
 * Augment an object with the EventEmitter mixin
 * 
 * @param {object} obj The object to be augmented (often an object's protoype)
 */
EventEmitter.augment = function(obj) {
    for (var method in EventEmitter.prototype) {
        if (!obj[method])
            obj[method] = EventEmitter.prototype[method];
    }
};

(function(exports) {
    var Bitcoin = exports;
    
    if ('object' !== typeof module) {
        Bitcoin.EventEmitter = EventEmitter;
    }
})(
'object' === typeof module ? module.exports : (/*window.*/Bitcoin = {})
);

// BigInteger monkey patching
BigInteger.valueOf = nbv;

/**
 * Returns a byte array representation of the big integer.
 *
 * This returns the absolute of the contained value in big endian
 * form. A value of zero results in an empty array.
 */
BigInteger.prototype.toByteArrayUnsigned = function() {
    var ba = this.abs().toByteArray();
    if (ba.length) {
        if (ba[0] == 0) {
            ba = ba.slice(1);
        }
        return ba.map(function(v) {
            return (v < 0) ? v + 256 : v;
        });
    } else {
        // Empty array, nothing to do
        return ba;
    }
};

/**
 * Turns a byte array into a big integer.
 *
 * This function will interpret a byte array as a big integer in big
 * endian notation and ignore leading zeros.
 */
BigInteger.fromByteArrayUnsigned = function(ba) {
    if (!ba.length) {
        return ba.valueOf(0);
    } else if (ba[0] & 0x80) {
        // Prepend a zero so the BigInteger class doesn't mistake this
        // for a negative integer.
        return new BigInteger([0].concat(ba));
    } else {
        return new BigInteger(ba);
    }
};

/**
 * Converts big integer to signed byte representation.
 *
 * The format for this value uses a the most significant bit as a sign
 * bit. If the most significant bit is already occupied by the
 * absolute value, an extra byte is prepended and the sign bit is set
 * there.
 *
 * Examples:
 *
 *      0 =>     0x00
 *      1 =>     0x01
 *     -1 =>     0x81
 *    127 =>     0x7f
 *   -127 =>     0xff
 *    128 =>   0x0080
 *   -128 =>   0x8080
 *    255 =>   0x00ff
 *   -255 =>   0x80ff
 *  16300 =>   0x3fac
 * -16300 =>   0xbfac
 *  62300 => 0x00f35c
 * -62300 => 0x80f35c
 */
BigInteger.prototype.toByteArraySigned = function() {
    var val = this.abs().toByteArrayUnsigned();
    var neg = this.compareTo(BigInteger.ZERO) < 0;
    
    if (neg) {
        if (val[0] & 0x80) {
            val.unshift(0x80);
        } else {
            val[0] |= 0x80;
        }
    } else {
        if (val[0] & 0x80) {
            val.unshift(0x00);
        }
    }
    
    return val;
};

/**
 * Parse a signed big integer byte representation.
 *
 * For details on the format please see BigInteger.toByteArraySigned.
 */
BigInteger.fromByteArraySigned = function(ba) {
    // Check for negative value
    if (ba[0] & 0x80) {
        // Remove sign bit
        ba[0] &= 0x7f;
        
        return BigInteger.fromByteArrayUnsigned(ba).negate();
    } else {
        return BigInteger.fromByteArrayUnsigned(ba);
    }
};

// Console ignore
var names = ["log", "debug", "info", "warn", "error", "assert", "dir", 
    "dirxml", "group", "groupEnd", "time", "timeEnd", "count", 
    "trace", "profile", "profileEnd"];

if ("undefined" == typeof /*window.*/console)
    /*window.*/console = {};
for (var i = 0; i < names.length; ++i)
    if ("undefined" == typeof /*window.*/console[names[i]])
        /*window.*/console[names[i]] = function() {
        };

// Bitcoin utility functions
Bitcoin.Util = {
    /**
   * Cross-browser compatibility version of Array.isArray.
   */
    isArray: Array.isArray || function(o) 
    {
        return Object.prototype.toString.call(o) === '[object Array]';
    },

    /**
   * Create an array of a certain length filled with a specific value.
   */
    makeFilledArray: function(len, val) 
    {
        var array = [];
        var i = 0;
        while (i < len) {
            array[i++] = val;
        }
        return array;
    },

    /**
   * Turn an integer into a "var_int".
   *
   * "var_int" is a variable length integer used by Bitcoin's binary format.
   *
   * Returns a byte array.
   */
    numToVarInt: function(i) 
    {
        if (i < 0xfd) {
            // unsigned char
            return [i];
        } else if (i <= 1 << 16) {
            // unsigned short (LE)
            return [0xfd, i >>> 8, i & 255];
        } else if (i <= 1 << 32) {
            // unsigned int (LE)
            return [0xfe].concat(Crypto.util.wordsToBytes([i]));
        } else {
            // unsigned long long (LE)
            return [0xff].concat(Crypto.util.wordsToBytes([i >>> 32, i]));
        }
    },

    /**
   * Parse a Bitcoin value byte array, returning a BigInteger.
   */
    valueToBigInt: function(valueBuffer) 
    {
        if (valueBuffer instanceof BigInteger)
            return valueBuffer;

        // Prepend zero byte to prevent interpretation as negative integer
        return BigInteger.fromByteArrayUnsigned(valueBuffer);
    },

    /**
   * Format a Bitcoin value as a string.
   *
   * Takes a BigInteger or byte-array and returns that amount of Bitcoins in a
   * nice standard formatting.
   *
   * Examples:
   * 12.3555
   * 0.1234
   * 900.99998888
   * 34.00
   */
    formatValue: function(valueBuffer) {
        var value = this.valueToBigInt(valueBuffer).toString();
        var integerPart = value.length > 8 ? value.substr(0, value.length - 8) : '0';
        var decimalPart = value.length > 8 ? value.substr(value.length - 8) : value;
        while (decimalPart.length < 8)
            decimalPart = "0" + decimalPart;
        decimalPart = decimalPart.replace(/0*$/, '');
        while (decimalPart.length < 2)
            decimalPart += "0";
        return integerPart + "." + decimalPart;
    },

    /**
   * Parse a floating point string as a Bitcoin value.
   *
   * Keep in mind that parsing user input is messy. You should always display
   * the parsed value back to the user to make sure we understood his input
   * correctly.
   */
    parseValue: function(valueString) {
        // TODO: Detect other number formats (e.g. comma as decimal separator)
        var valueComp = valueString.split('.');
        var integralPart = valueComp[0];
        var fractionalPart = valueComp[1] || "0";
        while (fractionalPart.length < 8)
            fractionalPart += "0";
        fractionalPart = fractionalPart.replace(/^0+/g, '');
        var value = BigInteger.valueOf(parseInt(integralPart));
        value = value.multiply(BigInteger.valueOf(100000000));
        value = value.add(BigInteger.valueOf(parseInt(fractionalPart)));
        return value;
    },

    /**
   * Calculate RIPEMD160(SHA256(data)).
   *
   * Takes an arbitrary byte array as inputs and returns the hash as a byte
   * array.
   */
    sha256ripe160: function(data) {
        return Crypto.RIPEMD160(Crypto.SHA256(data, {asBytes: true}), {asBytes: true});
    }
};

for (var i in Crypto.util) {
    if (Crypto.util.hasOwnProperty(i)) {
        Bitcoin.Util[i] = Crypto.util[i];
    }
}

(function(Bitcoin) {
    Bitcoin.Base58 = {
        alphabet: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
        validRegex: /^[1-9A-HJ-NP-Za-km-z]+$/,
        base: BigInteger.valueOf(58),

        /**
     * Convert a byte array to a base58-encoded string.
     *
     * Written by Mike Hearn for BitcoinJ.
     *   Copyright (c) 2011 Google Inc.
     *
     * Ported to JavaScript by Stefan Thomas.
     */
        encode: function(input) {
            var bi = BigInteger.fromByteArrayUnsigned(input);
            var chars = [];
            
            while (bi.compareTo(B58.base) >= 0) {
                var mod = bi.mod(B58.base);
                chars.unshift(B58.alphabet[mod.intValue()]);
                bi = bi.subtract(mod).divide(B58.base);
            }
            chars.unshift(B58.alphabet[bi.intValue()]);

            // Convert leading zeros too.
            for (var i = 0; i < input.length; i++) {
                if (input[i] == 0x00) {
                    chars.unshift(B58.alphabet[0]);
                } else
                    break;
            }
            
            return chars.join('');
        },

        /**
     * Convert a base58-encoded string to a byte array.
     *
     * Written by Mike Hearn for BitcoinJ.
     *   Copyright (c) 2011 Google Inc.
     *
     * Ported to JavaScript by Stefan Thomas.
     */
        decode: function(input) {
            var bi = BigInteger.valueOf(0);
            var leadingZerosNum = 0;
            for (var i = input.length - 1; i >= 0; i--) {
                var alphaIndex = B58.alphabet.indexOf(input[i]);
                if (alphaIndex < 0) {
                    throw "Invalid character";
                }
                bi = bi.add(BigInteger.valueOf(alphaIndex)
                .multiply(B58.base.pow(input.length - 1 - i)));

                // This counts leading zero bytes
                if (input[i] == "1")
                    leadingZerosNum++;
                else
                    leadingZerosNum = 0;
            }
            var bytes = bi.toByteArrayUnsigned();

            // Add leading zeros
            while (leadingZerosNum-- > 0)
                bytes.unshift(0);
            
            return bytes;
        }
    };
    
    var B58 = Bitcoin.Base58;
})(
'undefined' != typeof Bitcoin ? Bitcoin : module.exports
);

Bitcoin.Address = function(bytes) {
    if ("string" == typeof bytes) {
        bytes = Bitcoin.Address.decodeString(bytes);
    }
    this.hash = bytes;
    
    this.version = 0x00;
};

/**
 * Serialize this object as a standard Bitcoin address.
 *
 * Returns the address as a base58-encoded string in the standardized format.
 */
Bitcoin.Address.prototype.toString = function() {
    // Get a copy of the hash
    var hash = this.hash.slice(0);

    // Version
    hash.unshift(this.version);
    
    var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
    
    var bytes = hash.concat(checksum.slice(0, 4));
    
    return Bitcoin.Base58.encode(bytes);
};

Bitcoin.Address.prototype.getHashBase64 = function() {
    return Crypto.util.bytesToBase64(this.hash);
};

/**
 * Parse a Bitcoin address contained in a string.
 */
Bitcoin.Address.decodeString = function(string) {
    var bytes = Bitcoin.Base58.decode(string);
    
    var hash = bytes.slice(0, 21);
    
    var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
    
    if (checksum[0] != bytes[21] || 
    checksum[1] != bytes[22] || 
    checksum[2] != bytes[23] || 
    checksum[3] != bytes[24]) {
        throw "Checksum validation failed!";
    }
    
    var version = hash.shift();
    
    if (version != 0) {
        throw "Version " + version + " not supported!";
    }
    
    return hash;
};

function integerToBytes(i, len) {
    var bytes = i.toByteArrayUnsigned();
    
    if (len < bytes.length) {
        bytes = bytes.slice(bytes.length - len);
    } else
        while (len > bytes.length) {
            bytes.unshift(0);
        }
    
    return bytes;
}
;

ECFieldElementFp.prototype.getByteLength = function() {
    return Math.floor((this.toBigInteger().bitLength() + 7) / 8);
};

ECPointFp.prototype.getEncoded = function(compressed) {
    var x = this.getX().toBigInteger();
    var y = this.getY().toBigInteger();

    // Get value as a 32-byte Buffer
    // Fixed length based on a patch by bitaddress.org and Casascius
    var enc = integerToBytes(x, 32);
    
    if (compressed) {
        if (y.isEven()) {
            // Compressed even pubkey
            // M = 02 || X
            enc.unshift(0x02);
        } else {
            // Compressed uneven pubkey
            // M = 03 || X
            enc.unshift(0x03);
        }
    } else {
        // Uncompressed pubkey
        // M = 04 || X || Y
        enc.unshift(0x04);
        enc = enc.concat(integerToBytes(y, 32));
    }
    return enc;
};

ECPointFp.decodeFrom = function(curve, enc) {
    var type = enc[0];
    var dataLen = enc.length - 1;

    // Extract x and y as byte arrays
    var xBa = enc.slice(1, 1 + dataLen / 2);
    var yBa = enc.slice(1 + dataLen / 2, 1 + dataLen);

    // Prepend zero byte to prevent interpretation as negative integer
    xBa.unshift(0);
    yBa.unshift(0);

    // Convert to BigIntegers
    var x = new BigInteger(xBa);
    var y = new BigInteger(yBa);

    // Return point
    return new ECPointFp(curve, curve.fromBigInteger(x), curve.fromBigInteger(y));
};

ECPointFp.prototype.add2D = function(b) {
    if (this.isInfinity())
        return b;
    if (b.isInfinity())
        return this;
    
    if (this.x.equals(b.x)) {
        if (this.y.equals(b.y)) {
            // this = b, i.e. this must be doubled
            return this.twice();
        }
        // this = -b, i.e. the result is the point at infinity
        return this.curve.getInfinity();
    }
    
    var x_x = b.x.subtract(this.x);
    var y_y = b.y.subtract(this.y);
    var gamma = y_y.divide(x_x);
    
    var x3 = gamma.square().subtract(this.x).subtract(b.x);
    var y3 = gamma.multiply(this.x.subtract(x3)).subtract(this.y);
    
    return new ECPointFp(this.curve, x3, y3);
};

ECPointFp.prototype.twice2D = function() {
    if (this.isInfinity())
        return this;
    if (this.y.toBigInteger().signum() == 0) {
        // if y1 == 0, then (x1, y1) == (x1, -y1)
        // and hence this = -this and thus 2(x1, y1) == infinity
        return this.curve.getInfinity();
    }
    
    var TWO = this.curve.fromBigInteger(BigInteger.valueOf(2));
    var THREE = this.curve.fromBigInteger(BigInteger.valueOf(3));
    var gamma = this.x.square().multiply(THREE).add(this.curve.a).divide(this.y.multiply(TWO));
    
    var x3 = gamma.square().subtract(this.x.multiply(TWO));
    var y3 = gamma.multiply(this.x.subtract(x3)).subtract(this.y);
    
    return new ECPointFp(this.curve, x3, y3);
};

ECPointFp.prototype.multiply2D = function(k) {
    if (this.isInfinity())
        return this;
    if (k.signum() == 0)
        return this.curve.getInfinity();
    
    var e = k;
    var h = e.multiply(new BigInteger("3"));
    
    var neg = this.negate();
    var R = this;
    
    var i;
    for (i = h.bitLength() - 2; i > 0; --i) {
        R = R.twice();
        
        var hBit = h.testBit(i);
        var eBit = e.testBit(i);
        
        if (hBit != eBit) {
            R = R.add2D(hBit ? this : neg);
        }
    }
    
    return R;
};

ECPointFp.prototype.isOnCurve = function() {
    var x = this.getX().toBigInteger();
    var y = this.getY().toBigInteger();
    var a = this.curve.getA().toBigInteger();
    var b = this.curve.getB().toBigInteger();
    var n = this.curve.getQ();
    var lhs = y.multiply(y).mod(n);
    var rhs = x.multiply(x).multiply(x)
    .add(a.multiply(x)).add(b).mod(n);
    return lhs.equals(rhs);
};

ECPointFp.prototype.toString = function() {
    return '(' + this.getX().toBigInteger().toString() + ',' + 
    this.getY().toBigInteger().toString() + ')';
};

/**
 * Validate an elliptic curve point.
 *
 * See SEC 1, section 3.2.2.1: Elliptic Curve Public Key Validation Primitive
 */
ECPointFp.prototype.validate = function() {
    var n = this.curve.getQ();

    // Check Q != O
    if (this.isInfinity()) {
        throw new Error("Point is at infinity.");
    }

    // Check coordinate bounds
    var x = this.getX().toBigInteger();
    var y = this.getY().toBigInteger();
    if (x.compareTo(BigInteger.ONE) < 0 || 
    x.compareTo(n.subtract(BigInteger.ONE)) > 0) {
        throw new Error('x coordinate out of bounds');
    }
    if (y.compareTo(BigInteger.ONE) < 0 || 
    y.compareTo(n.subtract(BigInteger.ONE)) > 0) {
        throw new Error('y coordinate out of bounds');
    }

    // Check y^2 = x^3 + ax + b (mod n)
    if (!this.isOnCurve()) {
        throw new Error("Point is not on the curve.");
    }

    // Check nQ = 0 (Q is a scalar multiple of G)
    if (this.multiply(n).isInfinity()) {
        // TODO: This check doesn't work - fix.
        throw new Error("Point is not a scalar multiple of G.");
    }
    
    return true;
};

function dmp(v) {
    if (!(v instanceof BigInteger))
        v = v.toBigInteger();
    return Crypto.util.bytesToHex(v.toByteArrayUnsigned());
}
;

Bitcoin.ECDSA = (function() {
    var ecparams = getSECCurveByName("secp256k1");
    var rng = new SecureRandom();
    
    var P_OVER_FOUR = null;
    
    function implShamirsTrick(P, k, Q, l) 
    {
        var m = Math.max(k.bitLength(), l.bitLength());
        var Z = P.add2D(Q);
        var R = P.curve.getInfinity();
        
        for (var i = m - 1; i >= 0; --i) {
            R = R.twice2D();
            
            R.z = BigInteger.ONE;
            
            if (k.testBit(i)) {
                if (l.testBit(i)) {
                    R = R.add2D(Z);
                } else {
                    R = R.add2D(P);
                }
            } else {
                if (l.testBit(i)) {
                    R = R.add2D(Q);
                }
            }
        }
        
        return R;
    }
    ;
    
    var ECDSA = {
        getBigRandom: function(limit) {
            return new BigInteger(limit.bitLength(), rng)
            .mod(limit.subtract(BigInteger.ONE))
            .add(BigInteger.ONE)
            ;
        },
        sign: function(hash, priv) {
            var d = priv;
            var n = ecparams.getN();
            var e = BigInteger.fromByteArrayUnsigned(hash);
            
            do {
                var k = ECDSA.getBigRandom(n);
                var G = ecparams.getG();
                var Q = G.multiply(k);
                var r = Q.getX().toBigInteger().mod(n);
            } while (r.compareTo(BigInteger.ZERO) <= 0);
            
            var s = k.modInverse(n).multiply(e.add(d.multiply(r))).mod(n);
            
            return ECDSA.serializeSig(r, s);
        },
        
        verify: function(hash, sig, pubkey) {
            var r, s;
            if (Bitcoin.Util.isArray(sig)) {
                var obj = ECDSA.parseSig(sig);
                r = obj.r;
                s = obj.s;
            } else if ("object" === typeof sig && sig.r && sig.s) {
                r = sig.r;
                s = sig.s;
            } else {
                throw "Invalid value for signature";
            }
            
            var Q;
            if (pubkey instanceof ECPointFp) {
                Q = pubkey;
            } else if (Bitcoin.Util.isArray(pubkey)) {
                Q = ECPointFp.decodeFrom(ecparams.getCurve(), pubkey);
            } else {
                throw "Invalid format for pubkey value, must be byte array or ECPointFp";
            }
            var e = BigInteger.fromByteArrayUnsigned(hash);
            
            return ECDSA.verifyRaw(e, r, s, Q);
        },
        
        verifyRaw: function(e, r, s, Q) {
            var n = ecparams.getN();
            var G = ecparams.getG();
            
            if (r.compareTo(BigInteger.ONE) < 0 || 
            r.compareTo(n) >= 0)
                return false;
            
            if (s.compareTo(BigInteger.ONE) < 0 || 
            s.compareTo(n) >= 0)
                return false;
            
            var c = s.modInverse(n);
            
            var u1 = e.multiply(c).mod(n);
            var u2 = r.multiply(c).mod(n);

            // TODO(!!!): For some reason Shamir's trick isn't working with
            // signed message verification!? Probably an implementation
            // error!
            //var point = implShamirsTrick(G, u1, Q, u2);
            var point = G.multiply(u1).add(Q.multiply(u2));
            
            var v = point.getX().toBigInteger().mod(n);
            
            return v.equals(r);
        },

        /**
     * Serialize a signature into DER format.
     *
     * Takes two BigIntegers representing r and s and returns a byte array.
     */
        serializeSig: function(r, s) {
            var rBa = r.toByteArraySigned();
            var sBa = s.toByteArraySigned();
            
            var sequence = [];
            sequence.push(0x02); // INTEGER
            sequence.push(rBa.length);
            sequence = sequence.concat(rBa);
            
            sequence.push(0x02); // INTEGER
            sequence.push(sBa.length);
            sequence = sequence.concat(sBa);
            
            sequence.unshift(sequence.length);
            sequence.unshift(0x30); // SEQUENCE
            
            return sequence;
        },

        /**
     * Parses a byte array containing a DER-encoded signature.
     *
     * This function will return an object of the form:
     *
     * {
     *   r: BigInteger,
     *   s: BigInteger
     * }
     */
        parseSig: function(sig) {
            var cursor;
            if (sig[0] != 0x30)
                throw new Error("Signature not a valid DERSequence");
            
            cursor = 2;
            if (sig[cursor] != 0x02)
                throw new Error("First element in signature must be a DERInteger");
            ;
            var rBa = sig.slice(cursor + 2, cursor + 2 + sig[cursor + 1]);
            
            cursor += 2 + sig[cursor + 1];
            if (sig[cursor] != 0x02)
                throw new Error("Second element in signature must be a DERInteger");
            var sBa = sig.slice(cursor + 2, cursor + 2 + sig[cursor + 1]);
            
            cursor += 2 + sig[cursor + 1];

            //if (cursor != sig.length)
            //  throw new Error("Extra bytes in signature");
            
            var r = BigInteger.fromByteArrayUnsigned(rBa);
            var s = BigInteger.fromByteArrayUnsigned(sBa);
            
            return {r: r,s: s};
        },
        
        parseSigCompact: function(sig) {
            if (sig.length !== 65) {
                throw "Signature has the wrong length";
            }

            // Signature is prefixed with a type byte storing three bits of
            // information.
            var i = sig[0] - 27;
            if (i < 0 || i > 7) {
                throw "Invalid signature type";
            }
            
            var n = ecparams.getN();
            var r = BigInteger.fromByteArrayUnsigned(sig.slice(1, 33)).mod(n);
            var s = BigInteger.fromByteArrayUnsigned(sig.slice(33, 65)).mod(n);
            
            return {r: r,s: s,i: i};
        },

        /**
     * Recover a public key from a signature.
     *
     * See SEC 1: Elliptic Curve Cryptography, section 4.1.6, "Public
     * Key Recovery Operation".
     *
     * http://www.secg.org/download/aid-780/sec1-v2.pdf
     */
        recoverPubKey: function(r, s, hash, i) {
            // The recovery parameter i has two bits.
            i = i & 3;

            // The less significant bit specifies whether the y coordinate
            // of the compressed point is even or not.
            var isYEven = i & 1;

            // The more significant bit specifies whether we should use the
            // first or second candidate key.
            var isSecondKey = i >> 1;
            
            var n = ecparams.getN();
            var G = ecparams.getG();
            var curve = ecparams.getCurve();
            var p = curve.getQ();
            var a = curve.getA().toBigInteger();
            var b = curve.getB().toBigInteger();

            // We precalculate (p + 1) / 4 where p is if the field order
            if (!P_OVER_FOUR) {
                P_OVER_FOUR = p.add(BigInteger.ONE).divide(BigInteger.valueOf(4));
            }

            // 1.1 Compute x
            var x = isSecondKey ? r.add(n) : r;

            // 1.3 Convert x to point
            var alpha = x.multiply(x).multiply(x).add(a.multiply(x)).add(b).mod(p);
            var beta = alpha.modPow(P_OVER_FOUR, p);
            
            var xorOdd = beta.isEven() ? (i % 2) : ((i + 1) % 2);
            // If beta is even, but y isn't or vice versa, then convert it,
            // otherwise we're done and y == beta.
            var y = (beta.isEven() ? !isYEven : isYEven) ? beta : p.subtract(beta);

            // 1.4 Check that nR is at infinity
            var R = new ECPointFp(curve, 
            curve.fromBigInteger(x), 
            curve.fromBigInteger(y));
            R.validate();

            // 1.5 Compute e from M
            var e = BigInteger.fromByteArrayUnsigned(hash);
            var eNeg = BigInteger.ZERO.subtract(e).mod(n);

            // 1.6 Compute Q = r^-1 (sR - eG)
            var rInv = r.modInverse(n);
            var Q = implShamirsTrick(R, s, G, eNeg).multiply(rInv);
            
            Q.validate();
            if (!ECDSA.verifyRaw(e, r, s, Q)) {
                throw "Pubkey recovery unsuccessful";
            }
            
            var pubKey = new Bitcoin.ECKey();
            pubKey.pub = Q;
            return pubKey;
        },

        /**
     * Calculate pubkey extraction parameter.
     *
     * When extracting a pubkey from a signature, we have to
     * distinguish four different cases. Rather than putting this
     * burden on the verifier, Bitcoin includes a 2-bit value with the
     * signature.
     *
     * This function simply tries all four cases and returns the value
     * that resulted in a successful pubkey recovery.
     */
        calcPubkeyRecoveryParam: function(address, r, s, hash) 
        {
            for (var i = 0; i < 4; i++) {
                try {
                    var pubkey = Bitcoin.ECDSA.recoverPubKey(r, s, hash, i);
                    if (pubkey.getBitcoinAddress().toString() == address) {
                        return i;
                    }
                } catch (e) {
                }
            }
            throw "Unable to find valid recovery factor";
        }
    };
    
    return ECDSA;
})();


Bitcoin.ECKey = (function() {
    var ECDSA = Bitcoin.ECDSA;
    var ecparams = getSECCurveByName("secp256k1");
    var rng = new SecureRandom();
    
    var ECKey = function(input) {
        if (!input) {
            // Generate new key
            var n = ecparams.getN();
            this.priv = ECDSA.getBigRandom(n);
        } else if (input instanceof BigInteger) {
            // Input is a private key value
            this.priv = input;
        } else if (Bitcoin.Util.isArray(input)) {
            // Prepend zero byte to prevent interpretation as negative integer
            this.priv = BigInteger.fromByteArrayUnsigned(input);
        } else if ("string" == typeof input) {
            if (input.length == 51 && input[0] == '5') {
                // Base58 encoded private key
                this.priv = BigInteger.fromByteArrayUnsigned(ECKey.decodeString(input));
            } else {
                // Prepend zero byte to prevent interpretation as negative integer
                this.priv = BigInteger.fromByteArrayUnsigned(Crypto.util.base64ToBytes(input));
            }
        }
        this.compressed = !!ECKey.compressByDefault;
    };

    /**
   * Whether public keys should be returned compressed by default.
   */
    ECKey.compressByDefault = false;

    /**
   * Set whether the public key should be returned compressed or not.
   */
    ECKey.prototype.setCompressed = function(v) {
        this.compressed = !!v;
    };

    /**
   * Return public key in DER encoding.
   */
    ECKey.prototype.getPub = function() {
        return this.getPubPoint().getEncoded(this.compressed);
    };

    /**
   * Return public point as ECPoint object.
   */
    ECKey.prototype.getPubPoint = function() {
        if (!this.pub)
            this.pub = ecparams.getG().multiply(this.priv);
        
        return this.pub;
    };

    /**
   * Get the pubKeyHash for this key.
   *
   * This is calculated as RIPE160(SHA256([encoded pubkey])) and returned as
   * a byte array.
   */
    ECKey.prototype.getPubKeyHash = function() {
        if (this.pubKeyHash)
            return this.pubKeyHash;
        
        return this.pubKeyHash = Bitcoin.Util.sha256ripe160(this.getPub());
    };
    
    ECKey.prototype.getBitcoinAddress = function() {
        var hash = this.getPubKeyHash();
        var addr = new Bitcoin.Address(hash);
        return addr;
    };
    
    ECKey.prototype.getExportedPrivateKey = function() {
        var hash = this.priv.toByteArrayUnsigned();
        while (hash.length < 32)
            hash.unshift(0);
        hash.unshift(0x80);
        var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
        var bytes = hash.concat(checksum.slice(0, 4));
        return Bitcoin.Base58.encode(bytes);
    };
    
    ECKey.prototype.setPub = function(pub) {
        this.pub = ECPointFp.decodeFrom(ecparams.getCurve(), pub);
    };
    
    ECKey.prototype.toString = function(format) {
        if (format === "base64") {
            return Crypto.util.bytesToBase64(this.priv.toByteArrayUnsigned());
        } else {
            return Crypto.util.bytesToHex(this.priv.toByteArrayUnsigned());
        }
    };
    
    ECKey.prototype.sign = function(hash) {
        return ECDSA.sign(hash, this.priv);
    };
    
    ECKey.prototype.verify = function(hash, sig) {
        return ECDSA.verify(hash, sig, this.getPub());
    };

    /**
   * Parse an exported private key contained in a string.
   */
    ECKey.decodeString = function(string) {
        var bytes = Bitcoin.Base58.decode(string);
        
        var hash = bytes.slice(0, 33);
        
        var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
        
        if (checksum[0] != bytes[33] || 
        checksum[1] != bytes[34] || 
        checksum[2] != bytes[35] || 
        checksum[3] != bytes[36]) {
            throw "Checksum validation failed!";
        }
        
        var version = hash.shift();
        
        if (version != 0x80) {
            throw "Version " + version + " not supported!";
        }
        
        return hash;
    };
    
    return ECKey;
})();
