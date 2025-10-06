const { OpenRouterClient } = require('../dist');

/**
 * Quick Test for Streaming + Auto Tool Execution
 *
 * This test verifies:
 * - Basic streaming works
 * - Tools execute automatically when provided
 * - Callbacks are called correctly
 */

async function runTests() {
    const client = new OpenRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY || 'token',
        model: 'x-ai/grok-4-fast',
        enableCostTracking: true,
        debug: false
    });

    console.log('🧪 OpenRouter-Kit Streaming Tests\n');
    console.log('='.repeat(60));

    // Test 1: Basic Streaming
    console.log('\n✅ Test 1: Basic Streaming');
    console.log('-'.repeat(60));
    try {
        let contentReceived = false;
        let completeReceived = false;

        const result1 = await client.chatStream({
            prompt: 'Say "Hello World" in one line',
            streamCallbacks: {
                onContent: (content) => {
                    contentReceived = true;
                    process.stdout.write(content);
                },
                onComplete: () => {
                    completeReceived = true;
                }
            }
        });

        console.log('\n');
        if (contentReceived && completeReceived && result1.content) {
            console.log('✅ PASSED: Basic streaming works');
        } else {
            console.log('❌ FAILED: Missing callbacks or content');
        }
    } catch (error) {
        console.log('❌ FAILED:', error.message);
    }

    // Test 2: Streaming with Auto Tool Execution
    console.log('\n\n✅ Test 2: Auto Tool Execution');
    console.log('-'.repeat(60));

    const testTools = [
        {
            type: 'function',
            function: {
                name: 'get_weather',
                description: 'Get weather for a city',
                parameters: {
                    type: 'object',
                    properties: {
                        city: { type: 'string', description: 'City name' }
                    },
                    required: ['city']
                }
            },
            execute: async (args) => {
                console.log(`\n  🔧 Tool executed with args:`, args);
                return {
                    city: args.city,
                    temperature: 20,
                    condition: 'Sunny'
                };
            }
        }
    ];

    try {
        let toolExecuting = false;
        let toolResult = false;

        const result2 = await client.chatStream({
            prompt: 'What is the weather in London?',
            tools: testTools,
            streamCallbacks: {
                onContent: (content) => {
                    process.stdout.write(content);
                },
                onToolCallExecuting: (toolName, args) => {
                    toolExecuting = true;
                    console.log(`\n  ⚙️  Callback: onToolCallExecuting('${toolName}')`);
                },
                onToolCallResult: (toolName, result) => {
                    toolResult = true;
                    console.log(`  ✅ Callback: onToolCallResult('${toolName}')`);
                    console.log(`\n  Continuing stream...\n`);
                },
                onComplete: () => {
                    console.log('\n  ✓ Stream complete');
                }
            }
        });

        console.log('\n');
        if (toolExecuting && toolResult) {
            console.log('✅ PASSED: Tools execute automatically');
        } else {
            console.log('❌ FAILED: Tool callbacks not called');
        }
    } catch (error) {
        console.log('❌ FAILED:', error.message);
    }

    // Test 3: Multiple Tools in Parallel
    console.log('\n\n✅ Test 3: Multiple Tools');
    console.log('-'.repeat(60));

    const multiTools = [
        {
            type: 'function',
            function: {
                name: 'add',
                description: 'Add two numbers',
                parameters: {
                    type: 'object',
                    properties: {
                        a: { type: 'number' },
                        b: { type: 'number' }
                    },
                    required: ['a', 'b']
                }
            },
            execute: async (args) => args.a + args.b
        },
        {
            type: 'function',
            function: {
                name: 'multiply',
                description: 'Multiply two numbers',
                parameters: {
                    type: 'object',
                    properties: {
                        a: { type: 'number' },
                        b: { type: 'number' }
                    },
                    required: ['a', 'b']
                }
            },
            execute: async (args) => args.a * args.b
        }
    ];

    try {
        let toolCallCount = 0;

        const result3 = await client.chatStream({
            prompt: 'What is 5 + 3? And what is 4 * 2?',
            tools: multiTools,
            streamCallbacks: {
                onContent: (content) => {
                    process.stdout.write(content);
                },
                onToolCallExecuting: (toolName) => {
                    toolCallCount++;
                    console.log(`\n  🔧 Executing: ${toolName} (call #${toolCallCount})`);
                },
                onToolCallResult: (toolName, result) => {
                    console.log(`  ✅ Result: ${JSON.stringify(result)}\n`);
                }
            }
        });

        console.log('\n');
        if (toolCallCount >= 2) {
            console.log('✅ PASSED: Multiple tools executed');
        } else {
            console.log('⚠️  WARNING: Expected 2+ tool calls, got', toolCallCount);
        }
    } catch (error) {
        console.log('❌ FAILED:', error.message);
    }

    // Test 4: Cost Tracking
    console.log('\n\n✅ Test 4: Cost Tracking');
    console.log('-'.repeat(60));
    try {
        const result4 = await client.chatStream({
            prompt: 'Say hello',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        });

        console.log('\n');
        if (result4.cost !== undefined && result4.cost !== null) {
            console.log(`✅ PASSED: Cost tracked: $${result4.cost.toFixed(6)}`);
        } else {
            console.log('⚠️  WARNING: Cost tracking not available');
        }

        if (result4.durationMs) {
            console.log(`  Duration: ${result4.durationMs}ms`);
        }
        if (result4.usage) {
            console.log(`  Tokens: ${result4.usage.total_tokens}`);
        }
    } catch (error) {
        console.log('❌ FAILED:', error.message);
    }

    // Test 5: Abort Stream
    console.log('\n\n✅ Test 5: Stream Abort');
    console.log('-'.repeat(60));
    try {
        const abortController = new AbortController();

        setTimeout(() => {
            console.log('\n  ⏸️  Aborting after 500ms...');
            abortController.abort();
        }, 500);

        await client.chatStream({
            prompt: 'Write a very long story about space exploration',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        }, abortController.signal);

        console.log('\n❌ FAILED: Stream should have been aborted');
    } catch (error) {
        if (error.message?.includes('cancel') || error.details?.axiosErrorCode === 'ERR_CANCELED') {
            console.log('\n✅ PASSED: Stream aborted successfully');
        } else {
            console.log('\n❌ FAILED:', error.message);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Tests Complete!\n');

    await client.destroy();
}

runTests().catch(console.error);
