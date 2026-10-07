/** Phase 12 — update log, site version, Rupiah exchange (prank). */
export default {
  updates: {
    title: 'Update log', older: 'Earlier updates', ok: 'Nice!', reload: 'Reload to update', live: 'New',
    released: 'released {time}',
    tags: { new: 'New', improve: 'Better', fix: 'Fixed' },
  },
  exchange: {
    rateAg: '1 AG = Rp1.000', rateAc: '100 AC = Rp1',
    gross: 'Exchange value', fee: 'Admin fee',
    accountLabel: '{bank} account number', accountPlaceholder: '{n}-digit account number', phoneLabel: '{method} phone number',
    holderLabel: 'Account holder name', holderPlaceholder: 'As written in your bank', secure: 'Encrypted and protected',
    confirmTitle: 'Check your withdrawal', rowAmount: 'Amount', rowTo: 'Send to', rowAccount: 'Account number', rowPhone: 'Phone number', rowHolder: 'Account holder',
    eta: 'Funds usually arrive within 1–5 minutes. Make sure the details are correct; transfers can’t be cancelled.',
    stages: { verify: 'Verifying your account', check: 'Checking {method} details', send: 'Sending funds to {method}' },
    errors: { balance: 'Not enough balance.', min: 'Minimum withdrawal is {min}.', account: '{bank} account numbers have {n} digits.', phone: 'Enter a valid phone number (08…).', holder: 'Enter the account holder name.' },
    action: 'Rupiah', title: 'Exchange to Rupiah', subtitle: 'Withdraw your coins as Rupiah, sent straight to your bank or e-wallet.',
    amount: 'Amount to exchange', balance: 'Balance: {amount} {currency}', youGet: 'You receive', next: 'Continue', back: 'Back',
    bank: 'Bank transfer', ewallet: 'E-wallet', choose: 'Choose where to send', confirmTo: 'Send to {method}',
    processing: 'Processing your withdrawal…', processingTo: 'Contacting {method}',
    prankBody: 'AC and AG are play coins for Neon Arcade. They can’t be exchanged for real money, ever.',
    prankNote: 'Your balance is untouched. The account details you typed were never sent or saved, and they’re already cleared.',
    prankOk: 'You got me 😅',
  },
}
