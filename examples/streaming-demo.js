const { OpenRouterClient } = require('../dist');

async function main() {
    const client = new OpenRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY || 'token',
        model: 'x-ai/grok-4-fast',
        debug: false
    });

    console.log('='.repeat(60));
    console.log('OpenRouter Streaming Examples');
    console.log('='.repeat(60));

    // ==========================================
    // Example 1: Basic Streaming
    // ==========================================
    console.log('\n📝 Example 1: Basic Streaming\n');

    try {
        const result = await client.chatStream({
            prompt: 'Write a haiku about coding',
            streamCallbacks: {
                onContent: (content) => {
                    process.stdout.write(content);
                },
                onComplete: (fullContent, usage) => {
                    console.log('\n\n✓ Complete!');
                    console.log('Tokens:', usage?.total_tokens);
                }
            }
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // ==========================================
    // Example 2: Streaming with History
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('📚 Example 2: Streaming with Conversation History\n');

    try {
        // First message
        await client.chatStream({
            prompt: 'My favorite color is blue.',
            user: 'demo-user',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        });

        console.log('\n');

        // Second message - uses history
        await client.chatStream({
            prompt: 'What did I just tell you?',
            user: 'demo-user',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content),
                onComplete: () => console.log('\n\n✓ History working!')
            }
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // ==========================================
    // Example 3: Streaming with AUTO Tool Execution
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('🔧 Example 3: Streaming with AUTO Tool Execution\n');

    const tools = [
        {
            type: 'function',
            function: {
                name: 'get_weather',
                description: 'Get current weather for a location',
                parameters: {
                    type: 'object',
                    properties: {
                        location: { type: 'string', description: 'City name' },
                        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
                    },
                    required: ['location']
                }
            },
            execute: async (args) => {
                return {
                    location: args.location,
                    temperature: 22,
                    unit: args.unit || 'celsius',
                    condition: 'Sunny'
                };
            }
        },
        {
            type: 'function',
            function: {
                name: 'calculate',
                description: 'Perform math calculation',
                parameters: {
                    type: 'object',
                    properties: {
                        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
                        a: { type: 'number' },
                        b: { type: 'number' }
                    },
                    required: ['operation', 'a', 'b']
                }
            },
            execute: async (args) => {
                const ops = {
                    add: args.a + args.b,
                    subtract: args.a - args.b,
                    multiply: args.a * args.b,
                    divide: args.a / args.b
                };
                return ops[args.operation];
            }
        }
    ];

    try {
        const result = await client.chatStream({
            prompt: 'What is the weather in Paris and what is 25 * 4?',
            tools: tools, // 🔥 Tools execute automatically!
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content),
                onToolCallExecuting: (name, args) => {
                    console.log(`\n\n🔧 Executing: ${name}(${JSON.stringify(args)})`);
                },
                onToolCallResult: (name, result) => {
                    console.log(`✅ Result: ${JSON.stringify(result)}`);
                    console.log('\nContinuing stream...\n');
                }
            }
        });

        console.log('\n\n✓ Complete with tool execution!');
        console.log('💡 Tip: Tools execute automatically when provided');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // ==========================================
    // Example 4: Abort Streaming
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('🛑 Example 4: Abort Streaming After 1 Second\n');

    const abortController = new AbortController();

    setTimeout(() => {
        console.log('\n\n⏸️  Aborting stream...');
        abortController.abort();
    }, 1000);

    try {
        await client.chatStream({
            prompt: 'Write a very long story about programming',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        }, abortController.signal);
    } catch (error) {
        if (error.message?.includes('cancel') || error.details?.axiosErrorCode === 'ERR_CANCELED') {
            console.log('\n✓ Stream aborted successfully!');
        } else {
            console.error('❌ Error:', error.message);
        }
    }

    // ==========================================
    // Example 5: Detailed Chunk Inspection
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('🔍 Example 5: Inspect Stream Chunks\n');

    let chunkCount = 0;
    try {
        await client.chatStream({
            prompt: 'Count from 1 to 5',
            streamCallbacks: {
                onChunk: (chunk) => {
                    chunkCount++;
                    if (chunk.choices[0]?.delta?.content) {
                        process.stdout.write(chunk.choices[0].delta.content);
                    }
                },
                onComplete: (fullContent, usage) => {
                    console.log(`\n\n✓ Received ${chunkCount} chunks`);
                    console.log('Full content:', fullContent);
                    console.log('Usage:', usage);
                }
            }
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // ==========================================
    // Cleanup
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('✨ All examples complete!');
    console.log('='.repeat(60));

    await client.destroy();
}

main().catch(console.error);
