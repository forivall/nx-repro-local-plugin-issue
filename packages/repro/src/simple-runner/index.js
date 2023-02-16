// https://github.com/nrwl/nx/issues/9823#issuecomment-1207397040
require('nx/src/utils/nx-plugin').resolveLocalNxPlugin('@repro-local-plugin-issue/repro');

module.exports = require(__dirname + '.ts');
