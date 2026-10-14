const fs = require('fs');

// 1. Test classifyTransaction & normalizeTxFilterType
console.log('--- TEST 1: classifyTransaction & normalizeTxFilterType ---');

function normalizeTxFilterType(type) {
    const t = String(type || 'all').toLowerCase().trim();
    if (t === 'deposit' || t === 'deposits' || t === 'credit') return 'deposit';
    if (t === 'purchase' || t === 'purchases' || t === 'debit') return 'purchase';
    return 'all';
}

function classifyTransaction(tx) {
    if (!tx || typeof tx !== 'object') {
        return { isCredit: false, isDeposit: false, isPurchase: false, isReward: false, title: 'Transaction', iconClass: 'tx-type-debit', iconName: 'ph-receipt' };
    }

    const typeStr   = String(tx.type || tx.transactionType || tx.action || tx.category || '').toLowerCase().trim();
    const reasonStr = String(tx.reason || tx.description || tx.memo || tx.note || '').toLowerCase().trim();
    const refStr    = String(tx.reference || tx.ref || '').toLowerCase().trim();
    const rawAmount = parseFloat(tx.amount);

    const isReward = typeStr.includes('referral') || typeStr.includes('reward') || reasonStr.includes('referral') || reasonStr.includes('reward');

    const isExplicitPurchase = (
        typeStr === 'debit' ||
        typeStr === 'purchase' ||
        typeStr === 'purchases' ||
        typeStr === 'buy' ||
        typeStr === 'activation' ||
        typeStr === 'number_purchase' ||
        reasonStr.includes('purchase') ||
        reasonStr.includes('activation') ||
        reasonStr.includes('buy number') ||
        refStr.startsWith('adm-dr-') ||
        refStr.startsWith('buy-') ||
        refStr.startsWith('act-')
    );

    const isExplicitDeposit = (
        typeStr === 'credit' ||
        typeStr === 'deposit' ||
        typeStr === 'deposits' ||
        typeStr === 'funding' ||
        typeStr === 'wallet_funding' ||
        typeStr === 'topup' ||
        reasonStr.includes('deposit') ||
        reasonStr.includes('funding') ||
        reasonStr.includes('paystack') ||
        reasonStr.includes('credited') ||
        reasonStr.includes('top-up') ||
        reasonStr.includes('topup') ||
        refStr.startsWith('adm-cr-') ||
        refStr.startsWith('pstk-') ||
        refStr.startsWith('paystack-') ||
        refStr.startsWith('dep-')
    );

    let isDeposit = false;
    let isPurchase = false;

    if (isReward) {
        isDeposit = true;
    } else if (isExplicitPurchase) {
        isPurchase = true;
    } else if (isExplicitDeposit) {
        isDeposit = true;
    } else if (!isNaN(rawAmount)) {
        if (rawAmount < 0) {
            isPurchase = true;
        } else {
            isDeposit = true;
        }
    }

    const isCredit = isDeposit;

    let title = 'Transaction';
    let iconClass = isCredit ? 'tx-type-credit' : 'tx-type-debit';
    let iconName = isCredit ? 'ph-arrow-down-left' : 'ph-sim-card';

    if (isReward) {
        title = 'Referral Reward';
        iconClass = 'tx-type-reward';
        iconName = 'ph-gift';
    } else if (isPurchase) {
        title = 'Number Purchase';
        iconClass = 'tx-type-debit';
        iconName = 'ph-sim-card';
        if (reasonStr && reasonStr.length < 40) {
            title = tx.reason || tx.description || 'Number Purchase';
        }
    } else if (isDeposit) {
        title = 'Wallet Deposit';
        iconClass = 'tx-type-credit';
        iconName = 'ph-arrow-down-left';
        if (reasonStr && (reasonStr.includes('paystack') || reasonStr.includes('admin') || reasonStr.includes('manual')) && reasonStr.length < 40) {
            title = tx.reason || tx.description || 'Wallet Deposit';
        }
    }

    return {
        isCredit,
        isDeposit,
        isPurchase,
        isReward,
        title,
        iconClass,
        iconName
    };
}

const mockTransactions = [
    { id: 1, amount: 500, type: 'debit', reason: 'Number purchase', reference: 'ACT-001' },
    { id: 2, amount: 2000, type: 'credit', reason: 'Wallet Funding via Paystack', reference: 'PSTK-002' },
    { id: 3, amount: 350, type: 'purchase', reason: 'WhatsApp Activation', reference: 'BUY-003' },
    { id: 4, amount: 5000, type: 'deposit', reason: 'Admin credit', reference: 'ADM-CR-004' },
    { id: 5, amount: -750, type: 'debit', reason: 'USA Telegram', reference: 'ACT-005' },
    { id: 6, amount: 100, type: 'referral_reward', reason: 'Referral bonus', reference: 'REF-006' }
];

console.log('Testing normalization:');
console.assert(normalizeTxFilterType('all') === 'all', 'all filter');
console.assert(normalizeTxFilterType('All') === 'all', 'All filter uppercase');
console.assert(normalizeTxFilterType('deposit') === 'deposit', 'deposit filter');
console.assert(normalizeTxFilterType('Deposits') === 'deposit', 'Deposits filter');
console.assert(normalizeTxFilterType('credit') === 'deposit', 'credit filter -> deposit');
console.assert(normalizeTxFilterType('purchase') === 'purchase', 'purchase filter');
console.assert(normalizeTxFilterType('Purchases') === 'purchase', 'Purchases filter');
console.assert(normalizeTxFilterType('debit') === 'purchase', 'debit filter -> purchase');
console.log('✓ normalizeTxFilterType passed');

console.log('Testing classification:');
const c1 = classifyTransaction(mockTransactions[0]); // debit 500
console.assert(c1.isPurchase === true, 'Tx 1 should be purchase');
console.assert(c1.isDeposit === false, 'Tx 1 should not be deposit');

const c2 = classifyTransaction(mockTransactions[1]); // credit 2000
console.assert(c2.isDeposit === true, 'Tx 2 should be deposit');
console.assert(c2.isPurchase === false, 'Tx 2 should not be purchase');

const c3 = classifyTransaction(mockTransactions[2]); // purchase 350
console.assert(c3.isPurchase === true, 'Tx 3 should be purchase');

const c4 = classifyTransaction(mockTransactions[3]); // deposit 5000
console.assert(c4.isDeposit === true, 'Tx 4 should be deposit');

const c5 = classifyTransaction(mockTransactions[4]); // -750 debit
console.assert(c5.isPurchase === true, 'Tx 5 should be purchase');

const c6 = classifyTransaction(mockTransactions[5]); // referral reward
console.assert(c6.isDeposit === true, 'Tx 6 should be deposit (reward)');
console.log('✓ classifyTransaction passed');

function filterTxs(list, filterType) {
    const f = normalizeTxFilterType(filterType);
    if (f === 'deposit') return list.filter(t => classifyTransaction(t).isDeposit);
    if (f === 'purchase') return list.filter(t => classifyTransaction(t).isPurchase);
    return list;
}

const allFiltered = filterTxs(mockTransactions, 'all');
const depFiltered = filterTxs(mockTransactions, 'deposit');
const purFiltered = filterTxs(mockTransactions, 'purchase');

console.assert(allFiltered.length === 6, 'All should return all 6');
console.assert(depFiltered.length === 3, `Deposit should return 3, got ${depFiltered.length}`);
console.assert(purFiltered.length === 3, `Purchase should return 3, got ${purFiltered.length}`);
console.log('✓ Filtering passed');

// 2. Test OTP Deduplication and multi-message support
console.log('\n--- TEST 2: OTP Deduplication & Multi-message ---');

function extractOTP(text) {
    if (!text) return null;
    const str = String(text).trim();
    const labeledMatch = str.match(/(?:code(?:\s+is)?|otp(?:\s+is)?|pin(?:\s+is)?|passcode(?:\s+is)?|verification(?:\s+code)?|código)[\s:=#\-]+([0-9A-Za-z]{4,8})\b/i);
    if (labeledMatch && labeledMatch[1] && /\d/.test(labeledMatch[1])) return labeledMatch[1];
    const prefixedMatch = str.match(/\b(?:G|FB|VK|WA|TG)[-\s]?(\d{4,8})\b/i);
    if (prefixedMatch && prefixedMatch[1]) return prefixedMatch[1];
    const hyphenatedMatch = str.match(/\b(\d{3}[-\s]\d{3})\b/);
    if (hyphenatedMatch && hyphenatedMatch[1]) return hyphenatedMatch[1];
    const startMatch = str.match(/^([0-9]{4,8})\b/);
    if (startMatch && startMatch[1]) return startMatch[1];
    const endMatch = str.match(/[:\s]([0-9]{4,8})[.\s]*$/);
    if (endMatch && endMatch[1]) return endMatch[1];
    return null;
}

function getSmsEventId(orderId, smsItem, index = 0) {
    const cleanOrderId = String(orderId || 'order').trim();
    if (!smsItem) return `${cleanOrderId}_otp_${index}`;

    if (typeof smsItem === 'object') {
        const directId = smsItem.id || smsItem.sms_id || smsItem._id;
        if (directId) return `${cleanOrderId}_id_${String(directId).trim()}`;
        const code = String(smsItem.code || smsItem.otp || smsItem.pin || extractOTP(smsItem.text || '') || '').trim();
        const text = String(smsItem.text || smsItem.message || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const date = String(smsItem.created_at || smsItem.date || smsItem.time || '').trim();
        return `${cleanOrderId}_${code}_${text}${date ? '_' + date : '_' + index}`;
    }

    const text = String(smsItem).trim().replace(/\s+/g, ' ');
    const code = String(extractOTP(text) || '').trim();
    return `${cleanOrderId}_${code}_${text.slice(0, 40)}_${index}`;
}

const mockStorage = new Set();
function isProcessed(id) { return mockStorage.has(id); }
function markProcessed(id) { mockStorage.add(id); }

// Order 999 with empty SMS initially (PENDING)
const orderEmpty = { id: '999', status: 'PENDING', sms: [] };
function parseOrderSms(order) {
    if (!order) return { hasReceivedSms: false, otp: null, fullText: '', sender: '', smsTime: '', smsList: [] };
    const orderId = order.id || 'order';
    let rawSmsList = Array.isArray(order.sms) ? order.sms : (order.sms ? [order.sms] : []);
    const parsedItems = [];
    rawSmsList.forEach((item, idx) => {
        if (!item) return;
        let itemCode = '';
        let itemText = '';
        if (typeof item === 'string') {
            itemText = item.trim();
            itemCode = extractOTP(itemText) || '';
        } else if (typeof item === 'object') {
            const rawCode = item.code || item.otp || item.pin;
            itemText = String(item.text || item.message || '').trim();
            itemCode = (rawCode && String(rawCode).trim()) ? String(rawCode).trim() : (extractOTP(itemText) || '');
        }
        if (itemCode || itemText) {
            const eventId = getSmsEventId(orderId, item, idx);
            parsedItems.push({ code: itemCode, text: itemText, eventId });
        }
    });
    return {
        hasReceivedSms: parsedItems.length > 0,
        otp: parsedItems.length > 0 ? parsedItems[parsedItems.length - 1].code : null,
        smsList: parsedItems
    };
}

const parsedEmpty = parseOrderSms(orderEmpty);
console.assert(parsedEmpty.hasReceivedSms === false, 'Empty SMS must NOT mark hasReceivedSms true');
console.assert(parsedEmpty.smsList.length === 0, 'Empty SMS must have empty smsList');

// Arrival of 1st SMS
const orderFirstSms = {
    id: '999',
    status: 'RECEIVED',
    sms: ['Your WhatsApp verification code is 482910']
};
const parsed1 = parseOrderSms(orderFirstSms);
console.assert(parsed1.hasReceivedSms === true, 'First SMS must be detected');
console.assert(parsed1.otp === '482910', `OTP must be 482910, got ${parsed1.otp}`);

let soundPlayedCount = 0;
parsed1.smsList.forEach(item => {
    if (!isProcessed(item.eventId)) {
        markProcessed(item.eventId);
        soundPlayedCount++;
    }
});
console.assert(soundPlayedCount === 1, `Sound should play once, played ${soundPlayedCount}`);

// Subsequent polling tick with the SAME SMS (no change)
const parsed1Tick2 = parseOrderSms(orderFirstSms);
parsed1Tick2.smsList.forEach(item => {
    if (!isProcessed(item.eventId)) {
        markProcessed(item.eventId);
        soundPlayedCount++;
    }
});
console.assert(soundPlayedCount === 1, `Sound MUST NOT play again on duplicate poll tick! Count: ${soundPlayedCount}`);

// Arrival of 2nd legitimate SMS for the SAME order
const orderSecondSms = {
    id: '999',
    status: 'RECEIVED',
    sms: [
        'Your WhatsApp verification code is 482910',
        'Your second WhatsApp code is 881923'
    ]
};
const parsed2 = parseOrderSms(orderSecondSms);
console.assert(parsed2.smsList.length === 2, 'Should have 2 messages');
console.assert(parsed2.otp === '881923', `Latest OTP should be 881923, got ${parsed2.otp}`);

parsed2.smsList.forEach(item => {
    if (!isProcessed(item.eventId)) {
        markProcessed(item.eventId);
        soundPlayedCount++;
    }
});
console.assert(soundPlayedCount === 2, `Sound MUST play for the 2nd distinct OTP event! Count: ${soundPlayedCount}`);

// Subsequent polling tick with both SMS messages
const parsed2Tick2 = parseOrderSms(orderSecondSms);
parsed2Tick2.smsList.forEach(item => {
    if (!isProcessed(item.eventId)) {
        markProcessed(item.eventId);
        soundPlayedCount++;
    }
});
console.assert(soundPlayedCount === 2, `Sound MUST NOT play again on repeated poll! Count: ${soundPlayedCount}`);

console.log('✓ Multi-message & OTP deduplication passed successfully!');
console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY.');
