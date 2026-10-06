/** Phase 7 copy: server mode (accounts, balances, games, progress stored on the server). */
export default {
  errors: {
    network: "Can't reach the server. Check your connection and try again.",
    serverSoon: "This feature is moving to the server. It's unavailable for now.",
    invalidInput: 'Invalid data.',
  },
  server: {
    loading: 'Loading account…',
    offlineTitle: 'Server unreachable',
    offlineBody: 'Your account and balance live on the server. Try again in a moment.',
    retry: 'Try again',
    adminBanner: 'The admin panel still reads data from this browser. Admin actions move to the server in the next stage.',
  },
  auth: {
    serverNote: 'Your account & balance are stored safely on the server. AC and AG have no cash value.',
  },
}
