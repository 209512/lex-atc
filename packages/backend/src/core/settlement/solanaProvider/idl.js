const DEFAULT_PROGRAM_ID = '1exAtcSett1ementProgram11111111111111111111';

const buildIdl = () => ({
    version: '0.1.0',
    name: 'lex_atc_settlement',
    instructions: [
        {
            name: 'submitSnapshot',
            accounts: [
                { name: 'channel', isMut: true, isSigner: false },
                { name: 'authority', isMut: true, isSigner: true },
                { name: 'treasury', isMut: false, isSigner: false },
                { name: 'ixSysvar', isMut: false, isSigner: false },
                { name: 'systemProgram', isMut: false, isSigner: false }
            ],
            args: [
                { name: 'nonce', type: 'u64' },
                { name: 'stateHash', type: 'bytes' }
            ]
        },
        {
            name: 'openDispute',
            accounts: [
                { name: 'channel', isMut: true, isSigner: false },
                { name: 'authority', isMut: true, isSigner: true },
                { name: 'treasury', isMut: false, isSigner: false }
            ],
            args: [
                { name: 'targetNonce', type: 'u64' }
            ]
        },
        {
            name: 'slash',
            accounts: [
                { name: 'channel', isMut: true, isSigner: false },
                { name: 'authority', isMut: false, isSigner: false },
                { name: 'treasury', isMut: true, isSigner: true },
                { name: 'escrowTokenAccount', isMut: true, isSigner: false },
                { name: 'treasuryTokenAccount', isMut: true, isSigner: false },
                { name: 'tokenProgram', isMut: false, isSigner: false }
            ],
            args: [
                { name: 'reason', type: 'string' }
            ]
        }
    ],
    accounts: [
        {
            name: 'stateChannel',
            type: {
                kind: 'struct',
                fields: [
                    { name: 'lastNonce', type: 'u64' },
                    { name: 'stateHash', type: { array: ['u8', 32] } },
                    { name: 'status', type: { defined: 'ChannelStatus' } },
                    { name: 'lastUpdatedAt', type: 'i64' },
                    { name: 'treasuryPubkey', type: 'publicKey' },
                    { name: 'disputeOpenedAt', type: 'i64' },
                    { name: 'disputeTargetNonce', type: 'u64' },
                    { name: 'escrowBalance', type: 'u64' },
                    { name: 'bump', type: 'u8' }
                ]
            }
        }
    ],
    types: [
        {
            name: 'ChannelStatus',
            type: {
                kind: 'enum',
                variants: [
                    { name: 'Active' },
                    { name: 'Disputed' },
                    { name: 'Slashed' },
                    { name: 'Closed' }
                ]
            }
        }
    ]
});

module.exports = {
    DEFAULT_PROGRAM_ID,
    buildIdl,
};

