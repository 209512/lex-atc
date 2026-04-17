const autocannon = require('autocannon');

const URL = process.env.TARGET_URL || 'http://localhost:3000';

async function runBenchmark() {
    console.log(`Starting Performance Benchmark against ${URL}...`);

    const result = await autocannon({
        url: `${URL}/api/health`,
        connections: 10,
        pipelining: 1,
        duration: 5,
    });

    console.log(autocannon.printResult(result));

    // Hard Limits
    const p99 = result.latency.p99;
    console.log(`P99 Latency: ${p99}ms`);
    
    // We expect health check to be very fast (<50ms for p99 in local testing)
    if (p99 > 100) {
        console.error('❌ Benchmark failed: P99 latency is greater than 100ms limit.');
        process.exit(1);
    } else {
        console.log('✅ Benchmark passed: P99 latency is within limits.');
        process.exit(0);
    }
}

runBenchmark().catch(err => {
    console.error(err);
    process.exit(1);
});