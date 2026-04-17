const tracer = require('dd-trace');

if (process.env.NODE_ENV === 'production' || process.env.DD_ENV) {
    tracer.init({
        logInjection: true,
        profiling: true,
        env: process.env.DD_ENV || process.env.NODE_ENV,
        service: process.env.DD_SERVICE || 'lex-atc-backend',
        version: process.env.DD_VERSION || '1.0.0'
    });
}

module.exports = tracer;
