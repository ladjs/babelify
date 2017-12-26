const stream = require('stream');
const util = require('util');
const path = require('path');
const babel = require('@babel/core');

module.exports = Babelify;
util.inherits(Babelify, stream.Transform);

function Babelify(filename, opts) {
	opts = Object.assign({}, opts);
	if (!(this instanceof Babelify)) {
		return Babelify.configure(opts)(filename);
	}

	stream.Transform.call(this);
	this._data = '';
	this._filename = filename;
	this._babel = opts.babel || babel;
	delete opts.babel;
	this._opts = Object.assign({filename}, opts);
}

Babelify.prototype._transform = function (buf, enc, callback) {
	this._data += buf;
	callback();
};

// TODO - replace with semver when babel 7 release
Babelify.prototype._validateBabelVersion = function () {
	const split = this._babel.version.split('-');
	const version = split[0];
	if (parseInt(version[0], 10) < 7) {
		return false;
	}
	if (!split[1]) {
		return true;
	}
	const splitBeta = split[1].split('.');
	if (splitBeta.length === 2 && parseInt(splitBeta[1], 10) >= 32) {
		return true;
	}
	return false;
};

Babelify.prototype._handleTransformResult = function (result) {
	this.emit('babelify', result, this._filename);
	const code = result.code;
	this.push(code);
};

Babelify.prototype._handleTransformError = function (err) {
	if (err) {
		this.emit('error', err);
	}
};

Babelify.prototype._flush = function (callback) {
	if (this._validateBabelVersion()) {
		const self = this;
		this._babel.transform(this._data, this._opts, (err, result) => {
			if (err) {
				self._handleTransformError(err);
			}	else {
				self._handleTransformResult(result);
			}
			callback();
		});
		return;
	}
	try {
		const result = this._babel.transform(this._data, this._opts);
		this._handleTransformResult(result);
	} catch (err) {
		this._handleTransformError(err);
		return;
	}
	callback();
};

Babelify.configure = function (opts) {
	opts = Object.assign({}, opts);
	const extensions = opts.extensions ?
    [].concat(opts.extensions) :
    babel.DEFAULT_EXTENSIONS || ['.js', '.jsx', '.es6', '.es', '.babel'];
	const sourceMapsAbsolute = opts.sourceMapsAbsolute;
	if (opts.sourceMaps !== false) {
		opts.sourceMaps = 'inline';
	}

  // Babelify specific options
	delete opts.sourceMapsAbsolute;
	delete opts.extensions;
	delete opts.filename;

  // Babelify backwards-compat
	delete opts.sourceMapRelative;

  // Browserify specific options
	delete opts._flags;
	delete opts.basedir;
	delete opts.global;

  // Browserify cli options
	delete opts._;
  // "--opt [ a b ]" and "--opt a --opt b" are allowed:
	if (opts.ignore && opts.ignore._) {
		opts.ignore = opts.ignore._;
	}
	if (opts.only && opts.only._) {
		opts.only = opts.only._;
	}
	if (opts.plugins && opts.plugins._) {
		opts.plugins = opts.plugins._;
	}
	if (opts.presets && opts.presets._) {
		opts.presets = opts.presets._;
	}

	return function (filename) {
		const extname = path.extname(filename);
		if (extensions.indexOf(extname) === -1) {
			return new stream.PassThrough();
		}

		const _opts = sourceMapsAbsolute ?
      Object.assign({sourceFileName: filename}, opts) :
      opts;

		return new Babelify(filename, _opts);
	};
};
