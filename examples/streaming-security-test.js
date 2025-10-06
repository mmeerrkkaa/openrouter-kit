const { OpenRouterClient } = require('../dist');

async function testSecurity() {
    console.log('='.repeat(60));
    console.log('Testing Streaming Security & Cost Tracking');
    console.log('='.repeat(60));

    // ==========================================
    // Test 1: Cost Tracking Enabled
    // ==========================================
    console.log('\n💰 Test 1: Cost Tracking in Streaming Mode\n');

    const clientWithCost = new OpenRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY || 'token',
        model: 'x-ai/grok-4-fast',
        enableCostTracking: true,
        debug: false
    });

    try {
        const result = await clientWithCost.chatStream({
            prompt: 'Say hello in 5 words',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        });

        console.log('\n\n✓ Streaming result:');
        console.log('  Cost:', result.cost !== null ? `$${result.cost?.toFixed(6)}` : 'Not calculated');
        console.log('  Duration:', `${result.durationMs}ms`);
        console.log('  Usage:', result.usage);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    await clientWithCost.destroy();

    // ==========================================
    // Test 2: Authentication Required
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('🔒 Test 2: Authentication Required (No Token)\n');

    const clientWithAuth = new OpenRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY || 'token',
        model: 'x-ai/grok-4-fast',
        security: {
            requireAuthentication: true,
            userAuthentication: {
                type: 'jwt',
                jwtSecret: 'test-secret-key-123'
            }
        },
        debug: false
    });

    try {
        await clientWithAuth.chatStream({
            prompt: 'Test without token'
        });
        console.log('❌ FAILED: Should have thrown authentication error');
    } catch (error) {
        if (error.message.includes('Authentication') || error.message.includes('required')) {
            console.log('✓ PASSED: Authentication correctly required');
            console.log('  Error:', error.message);
        } else {
            console.log('❌ FAILED: Wrong error type:', error.message);
        }
    }

    // ==========================================
    // Test 3: Valid Token Accepted
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('✅ Test 3: Valid Token Accepted\n');

    const validToken = clientWithAuth.createAccessToken({
        userId: 'test-user-123',
        role: 'admin'
    });

    try {
        const result = await clientWithAuth.chatStream({
            prompt: 'Say hi',
            accessToken: validToken,
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        });

        console.log('\n\n✓ PASSED: Valid token accepted');
        console.log('  Duration:', `${result.durationMs}ms`);
    } catch (error) {
        console.error('❌ FAILED:', error.message);
    }

    await clientWithAuth.destroy();

    // ==========================================
    // Test 4: Error Event Emission
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('📡 Test 4: Error Event Emission\n');

    const clientWithEvents = new OpenRouterClient({
        apiKey: 'invalid-key-for-testing',
        model: 'x-ai/grok-4-fast',
        debug: false
    });

    let errorEventReceived = false;
    clientWithEvents.on('error', (error) => {
        errorEventReceived = true;
        console.log('✓ Error event received:', error.message);
    });

    try {
        await clientWithEvents.chatStream({
            prompt: 'This should fail'
        });
        console.log('❌ FAILED: Should have thrown error');
    } catch (error) {
        if (errorEventReceived) {
            console.log('✓ PASSED: Error event was emitted');
        } else {
            console.log('⚠️  WARNING: Error thrown but event not emitted');
        }
    }

    await clientWithEvents.destroy();

    // ==========================================
    // Test 5: Stream Cleanup on Abort
    // ==========================================
    console.log('\n\n' + '='.repeat(60));
    console.log('🛑 Test 5: Stream Cleanup on Abort\n');

    const clientForAbort = new OpenRouterClient({
        apiKey: process.env.OPENROUTER_API_KEY || 'token',
        model: 'x-ai/grok-4-fast',
        debug: false
    });

    const abortController = new AbortController();

    setTimeout(() => {
        console.log('Aborting stream...');
        abortController.abort();
    }, 500);

    try {
        await clientForAbort.chatStream({
            prompt: 'Write a long story',
            streamCallbacks: {
                onContent: (content) => process.stdout.write(content)
            }
        }, abortController.signal);
        console.log('\n❌ FAILED: Should have been aborted');
    } catch (error) {
        if (error.message?.includes('cancel') || error.message?.includes('abort')) {
            console.log('\n✓ PASSED: Stream properly aborted and cleaned up');
        } else {
            console.log('\n⚠️  Unexpected error:', error.message);
        }
    }

    await clientForAbort.destroy();

    console.log('\n\n' + '='.repeat(60));
    console.log('✨ All Security & Tracking Tests Complete!');
    console.log('='.repeat(60));
}

testSecurity().catch(console.error);
