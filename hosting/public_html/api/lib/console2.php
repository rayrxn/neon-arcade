<?php
declare(strict_types=1);

/**
 * Console R 1.1.1: everything the Admin panel can do, plus console-only recovery tools.
 *  - `do <action> key=value …` runs any Admin panel action with the console's authority (audited, confirmations kept).
 *  - A catalog (groups, plain-language help, fields, examples) drives both `help` and the point-and-click panel.
 *  - Security tools: 2FA status/reset and strict sessions for any account.
 */

/** Fields: [key, type, label, options|null, optional]. Types: user, text, reason, int, num, bool, select, json, game. */
function console_action_catalog(): array
{
    $R = ['reason', 'reason', 'Reason (shown in the audit log)', null, true];
    $U = ['userId', 'user', 'Player (@name)', null, false];
    return [
        // ── Players ──
        'editUser' => ['players', 'Edit a player', 'Change a player\'s display name or username, or reset their avatar. Leave a field empty to keep it.', [$U, ['displayName', 'text', 'Display name (2–24 characters)', null, true], ['username', 'text', 'Username (3–16 letters, digits, _)', null, true], ['resetAvatar', 'bool', 'Reset avatar', null, true], $R], false],
        'warnUser' => ['players', 'Warn a player', 'Adds a written warning to the player\'s record and sends them a notice.', [$U, $R], false],
        'removeWarning' => ['players', 'Remove a warning', 'Deletes one warning from a player\'s record (use the warning id from the Admin panel).', [$U, ['warningId', 'text', 'Warning id'], $R], false],
        'muteUser' => ['players', 'Mute in chat', 'Stops the player from writing in chat for some minutes.', [$U, ['minutes', 'int', 'Minutes'], $R], false],
        'banUser' => ['players', 'Ban a player', 'Signs the player out and blocks sign-in. Leave hours empty for a permanent ban.', [$U, ['hours', 'int', 'Hours (empty = permanent)', null, true], $R], true],
        'unbanUser' => ['players', 'Lift a ban', 'Lets the player sign in again.', [$U, $R], false],
        'freezeAccount' => ['players', 'Freeze account', 'A frozen account can sign in but cannot play, send or buy anything.', [$U, ['frozen', 'bool', 'Frozen'], $R], false],
        'setRole' => ['players', 'Change staff role', 'Gives or removes staff powers. super_admin is the Owner role.', [$U, ['role', 'select', 'Role', ['user', 'developer', 'support', 'moderator', 'admin', 'super_admin']], $R], true],
        'setPlayerRole' => ['players', 'Set player role', 'The player tag shown next to the name (Newcomer, Regular…). Empty = automatic.', [$U, ['role', 'select', 'Role (empty = automatic)', '@playerRoles', true], $R], false],
        'setTestAccount' => ['players', 'Mark as test account', 'Test accounts can use test tools and are left out of statistics.', [$U, ['isTest', 'bool', 'Test account'], $R], false],
        'terminateUserSessions' => ['players', 'Sign out everywhere', 'Ends every sign-in of the player and refunds their open rounds.', [$U, $R], true],
        'resetProgress' => ['players', 'Reset progress', 'progression = level, XP, achievements and stats · quests · daily = daily reward streak · profile = name and avatar.', [$U, ['part', 'select', 'Part', ['progression', 'quests', 'daily', 'profile']], $R], true],
        // ── Economy ──
        'adjustCurrency' => ['economy', 'Add / remove coins', 'Puts AC or AG into a player\'s wallet (negative takes it away). Every change is a ledger entry.', [$U, ['currency', 'select', 'Currency', ['AC', 'AG']], ['delta', 'num', 'Amount (+/-)'], $R], true],
        'resetCurrency' => ['economy', 'Reset a balance', 'Sets AC, AG or both back to zero for one player.', [$U, ['which', 'select', 'Which', ['AC', 'AG', 'both']], $R], true],
        'freezeWallet' => ['economy', 'Freeze wallet', 'Blocks all coin movement for one player (bets, transfers, exchange).', [$U, ['frozen', 'bool', 'Frozen'], $R], false],
        'reverseTransaction' => ['economy', 'Reverse a transaction', 'Undoes one ledger transaction by its id.', [['txId', 'text', 'Transaction id'], $R], true],
        'grantItem' => ['economy', 'Give a shop item', 'Puts a shop item into a player\'s inventory for free. A negative quantity takes it away.', [$U, ['itemId', 'select', 'Item', '@items'], ['qty', 'int', 'Quantity (default 1)', null, true], $R], false],
        'setMembership' => ['economy', 'Set membership', 'Gives VIP or VVIP for some days (0 days removes it).', [$U, ['tier', 'select', 'Tier', ['vip', 'vvip']], ['days', 'int', 'Days'], $R], false],
        'grantPass' => ['economy', 'Give premium pass', 'Unlocks the premium Battle Pass track for this season.', [$U, $R], false],
        'setManager' => ['economy', 'Assign private manager', 'Sets the staff member who looks after a VVIP player.', [$U, ['managerId', 'user', 'Manager (@name)'], $R], false],
        'setLoyaltyXp' => ['economy', 'Set Loyalty XP', 'Sets a player\'s Loyalty XP (the card follows the XP).', [$U, ['xp', 'int', 'Loyalty XP'], $R], false],
        'setLoyaltyCard' => ['economy', 'Set loyalty card', 'floor = at least this card · override = exactly this card · clear = remove the override (the card follows XP again).', [$U, ['mode', 'select', 'Mode', ['floor', 'override', 'clear']], ['card', 'select', 'Card (not needed for clear)', '@cards', true], $R], false],
        'setEconomy' => ['economy', 'Exchange settings', 'How many AC one AG costs and the AC → AG limits. Empty fields keep their current value.', [['acPerAg', 'int', 'AC per 1 AG', null, true], ['convertMinAg', 'int', 'Minimum AG per exchange', null, true], ['convertMaxAgPerDay', 'int', 'Max AG per player per day', null, true], $R], true],
        'setLuck' => ['economy', 'Luck boost (gacor)', 'Temporarily raises the payout multiplier for one player or everyone ("*").', [['username', 'text', 'Player name or *'], ['mult', 'num', 'Multiplier, e.g. 1.2'], ['minutes', 'int', 'Minutes'], ['label', 'text', 'Label', null, true], $R], true],
        'clearLuck' => ['economy', 'Clear luck boost', 'Ends a running luck boost (empty player = the global one).', [['userId', 'user', 'Player (@name)', null, true], $R], false],
        'economyAnalytics' => ['economy', 'Economy report', 'Circulation, wagers, payouts and risk signals.', [], false],
        'createCode' => ['economy', 'Create redeem code', 'Makes a code players can redeem. AC/AG codes need an amount (AG max 10), item codes need an item.', [['code', 'text', 'Code (4–16 letters/digits)'], ['kind', 'select', 'Reward', ['AC', 'AG', 'item']], ['amount', 'int', 'Amount (AC/AG)', null, true], ['itemId', 'select', 'Item (item codes)', '@redeemItems', true], ['maxUses', 'int', 'Max uses in total (empty = unlimited)', null, true], ['perUser', 'int', 'Uses per player (1–10)', null, true], ['expiresAt', 'text', 'Expires (YYYY-MM-DD HH:MM)', null, true], ['membersOnly', 'select', 'Only for members', ['vip', 'vvip'], true], $R], false],
        'setCodeActive' => ['economy', 'Turn a code on/off', 'Pauses or resumes a redeem code.', [['code', 'text', 'Code'], ['active', 'bool', 'Active'], $R], false],
        // ── Games ──
        'setGameStatus' => ['games', 'Game status', 'live = open, maintenance = closed with a notice, disabled = hidden.', [['slug', 'game', 'Game'], ['status', 'select', 'Status', ['live', 'maintenance', 'disabled']], $R], false],
        'setGameMaxBet' => ['games', 'Game max bet', 'Highest bet allowed in one game (in AC).', [['slug', 'game', 'Game'], ['maxBet', 'num', 'Max bet'], $R], false],
        'setGameControls' => ['games', 'Game controls', 'Switch betting and new rounds, change limits or the maintenance notice of one game. Empty fields stay as they are.', [['slug', 'game', 'Game'], ['status', 'select', 'Status', ['live', 'maintenance', 'disabled'], true], ['bettingEnabled', 'bool', 'Betting', null, true], ['newSessions', 'bool', 'New rounds', null, true], ['maxBet', 'int', 'Max bet AC', null, true], ['maxBetAG', 'int', 'Max bet AG', null, true], ['maintenanceMessage', 'text', 'Maintenance notice', null, true], ['forceEnd', 'bool', 'Also end open rounds', null, true], $R], false],
        'endGameSessions' => ['games', 'End open rounds', 'Cancels every open round of one game and refunds the bets.', [['slug', 'game', 'Game'], $R], true],
        'endSession' => ['games', 'End one round', 'Cancels one open round by its id (refunded).', [['sessionId', 'text', 'Round id'], $R], true],
        'invalidateSession' => ['games', 'Void a round', 'Marks a round invalid after a rule break.', [['sessionId', 'text', 'Round id'], ['violation', 'text', 'What happened'], $R], true],
        'setCrashConfig' => ['games', 'Crash settings', 'Preset or custom max multiplier, house edge and tail for Crash.', [['preset', 'select', 'Preset', ['calm', 'standard', 'wild', 'custom']], ['maxMult', 'num', 'Max multiplier', null, true], ['edge', 'num', 'Edge (0–0.1)', null, true], ['tail', 'num', 'Tail (0.5–1)', null, true], $R], true],
        'scheduleCrash' => ['games', 'Schedule a Crash point', 'Sets the crash point of a coming global round (event rounds).', [['round', 'int', 'Round number'], ['point', 'num', 'Crash point'], $R], true],
        'unscheduleCrash' => ['games', 'Remove a scheduled Crash point', 'Removes a scheduled event round.', [['round', 'int', 'Round number'], $R], false],
        // ── Community ──
        'deleteMessage' => ['community', 'Delete chat message', 'Removes one chat message for everyone.', [['messageId', 'text', 'Message id'], $R], false],
        'setSlowMode' => ['community', 'Chat slow mode', 'Seconds a player must wait between messages (0 = off).', [['seconds', 'int', 'Seconds'], $R], false],
        'setModeration' => ['community', 'Chat filter settings', 'Filter level and automatic mutes. Empty fields keep their current value.', [['level', 'select', 'Level', ['relaxed', 'standard', 'strict']], ['autoMute', 'bool', 'Auto-mute', null, true], ['autoMuteStrikes', 'int', 'Strikes before mute (2–20)', null, true], ['autoMuteMinutes', 'int', 'Mute minutes (1–1440)', null, true], ['repeatLimit', 'int', 'Repeat limit (4–30)', null, true], $R], false],
        'addTerm' => ['community', 'Add blocked word', 'Adds a word (letters only) to the chat filter. Severity 1 = mask, 2 = mask + strike, 3 = block the message.', [['term', 'text', 'Word'], ['match', 'select', 'Match', ['word', 'prefix', 'contains']], ['severity', 'select', 'Severity', ['1', '2', '3']]], false],
        'removeTerm' => ['community', 'Remove blocked word', 'Takes a word out of the chat filter.', [['term', 'text', 'Word']], false],
        'reportAction' => ['community', 'Handle a report', 'Resolve, dismiss or assign a player report.', [['reportId', 'text', 'Report id'], ['action', 'select', 'Action', ['resolve', 'dismiss', 'assign', 'note']], ['resolution', 'text', 'Resolution', null, true], ['assigneeId', 'user', 'Assign to (@name)', null, true], ['note', 'text', 'Note', null, true], $R], false],
        'ticketClaim' => ['community', 'Claim a ticket', 'Takes a support ticket.', [['ticketId', 'text', 'Ticket id'], ['force', 'bool', 'Take over from someone', null, true]], false],
        'assignTicket' => ['community', 'Assign a ticket', 'Gives a support ticket to a staff member.', [['ticketId', 'text', 'Ticket id'], ['adminId', 'user', 'Staff (@name)']], false],
        'setTicketStatus' => ['community', 'Ticket status', 'Moves a support ticket to another status.', [['ticketId', 'text', 'Ticket id'], ['status', 'select', 'Status', '@ticketStatuses']], false],
        'ticketPriority' => ['community', 'Ticket priority', 'How urgent a ticket is.', [['ticketId', 'text', 'Ticket id'], ['priority', 'select', 'Priority', ['low', 'normal', 'high', 'urgent']]], false],
        'ticketEscalate' => ['community', 'Escalate a ticket', 'Sends a ticket up to Admins.', [['ticketId', 'text', 'Ticket id'], $R], false],
        'addTicketNote' => ['community', 'Ticket note', 'Private staff note on a ticket.', [['ticketId', 'text', 'Ticket id'], ['text', 'text', 'Note']], false],
        'reviewClaim' => ['community', 'Review a mission claim', 'Approve or reject a mission claim (e.g. the Roblox mission).', [['claimId', 'text', 'Claim id'], ['approve', 'bool', 'Approve'], ['note', 'text', 'Note', null, true]], false],
        // ── Content ──
        'saveAnnouncement' => ['content', 'Announcement', 'Creates an announcement (or edits one when you give its id). Without an end date it shows for 3 days.', [['title', 'text', 'Title (3–80)'], ['message', 'text', 'Message'], ['type', 'select', 'Type', ['info', 'event', 'update', 'maintenance']], ['target', 'select', 'Audience', '@audiences'], ['priority', 'select', 'Priority', ['low', 'normal', 'high', 'urgent'], true], ['active', 'bool', 'Active', null, true], ['startAt', 'text', 'Start (YYYY-MM-DD HH:MM)', null, true], ['endAt', 'text', 'End (YYYY-MM-DD HH:MM)', null, true], ['sound', 'bool', 'Play a sound', null, true], ['id', 'text', 'Edit announcement id', null, true], $R], false],
        'deliverAnnouncements' => ['content', 'Deliver announcements', 'Sends announcements that are due now.', [], false],
        'resetAnnouncements' => ['content', 'Clear announcements', 'Removes every announcement.', [$R], true],
        'upsertShopItem' => ['content', 'Shop item', 'Create or edit a shop item. JSON keys: id, name, description, kind (frame, badge, theme, nameEffect, chatEffect, profileEffect, emote, boost), category (cosmetics, badges, themes, name-effects, chat-effects, profile-effects, emotes, boosts, loyalty, limited, event), price (AG), rarity (common, rare, epic, legendary), active, stock, style, effect, requires.', [['item', 'json', 'Item JSON, e.g. {"id":"neon-frame","name":"Neon frame","kind":"frame","category":"cosmetics","price":5}'], $R], false],
        'setShopItemActive' => ['content', 'Shop item on/off', 'Shows or hides a shop item.', [['id', 'select', 'Item', '@items'], ['active', 'bool', 'Active'], $R], false],
        'upsertEmote' => ['content', 'Emote', 'Create or edit an emote (JSON).', [['emote', 'json', 'Emote JSON'], $R], false],
        'upsertMission' => ['content', 'Mission', 'Create or edit a Rewards mission (JSON).', [['mission', 'json', 'Mission JSON'], $R], false],
        'upsertPlayerRole' => ['content', 'Player role', 'Create or edit a player role tag (JSON).', [['role', 'json', 'Role JSON'], $R], false],
        'deletePlayerRole' => ['content', 'Delete player role', 'Removes a player role tag.', [['slug', 'text', 'Role slug'], $R], true],
        'updateCard' => ['content', 'Loyalty card settings', 'Edit a loyalty card. JSON keys: name, color, xpRequired, maxBetAC, maxBetAG, perks, benefits.', [['slug', 'select', 'Card', ['silver', 'gold', 'platinum', 'infinite', 'black', 'monarch', 'vivace']], ['patch', 'json', 'Changes, e.g. {"maxBetAC":300000}'], $R], true],
        'setMembershipConfig' => ['content', 'Membership settings', 'Price (AG) and length of VIP and VVIP. Empty fields keep their current value; benefits are separated by ;', [['vipPrice', 'int', 'VIP price (AG)', null, true], ['vipDays', 'int', 'VIP days', null, true], ['vipBenefits', 'text', 'VIP benefits (a; b; c)', null, true], ['vvipPrice', 'int', 'VVIP price (AG)', null, true], ['vvipDays', 'int', 'VVIP days', null, true], ['vvipBenefits', 'text', 'VVIP benefits (a; b; c)', null, true], $R], true],
        'endSeasonNow' => ['content', 'End the season now', 'Closes the Battle Pass season and starts the next one.', [$R], true],
        // ── Security ──
        'reviewFlag' => ['security', 'Review a security flag', 'Decide on an anti-cheat flag: confirm, dismiss, false_positive, review, escalate or reopen.', [['flagId', 'text', 'Flag id'], ['decision', 'select', 'Decision', ['confirm', 'dismiss', 'false_positive', 'review', 'escalate', 'reopen']], ['note', 'text', 'Note', null, true], $R], false],
        'updateFlag' => ['security', 'Flag status', 'Change the status of an anti-cheat flag.', [['flagId', 'text', 'Flag id'], ['status', 'select', 'Status', ['open', 'reviewing', 'confirmed', 'dismissed']], $R], false],
        'setCaptcha' => ['security', 'Anti-bot check', 'pow = built-in proof of work · config = use the provider set in the server config. Keys are optional.', [['mode', 'select', 'Mode', ['pow', 'config']], ['siteKey', 'text', 'Site key', null, true], ['secret', 'text', 'Secret key', null, true], $R], true],
        'setAutoFreeze' => ['security', 'Auto-freeze', 'Automatically freezes wallets that trip the economy safeguards.', [['on', 'bool', 'On'], $R], false],
        // ── System ──
        'setMaintenance' => ['system', 'Maintenance mode', 'Closes the site for players. Staff and testers keep access unless you turn that off.', [['enabled', 'bool', 'On'], ['message', 'text', 'Message', null, true], ['startsAt', 'text', 'Starts (YYYY-MM-DD HH:MM)', null, true], ['until', 'text', 'Until (YYYY-MM-DD HH:MM)', null, true], ['bypassAdmins', 'bool', 'Staff can still enter', null, true], ['bypassTesters', 'bool', 'Testers can still enter', null, true], $R], true],
        'emergencyShutdown' => ['system', 'Emergency shutdown', 'Maintenance on, new rounds off everywhere, open rounds refunded. confirm must be SHUTDOWN.', [['enabled', 'bool', 'On'], ['message', 'text', 'Message', null, true], ['confirm', 'text', 'Type SHUTDOWN'], $R], true],
        'setFeature' => ['system', 'Feature flag', 'Who can see a feature: off, tester, vip or public.', [['key', 'select', 'Feature', '@features'], ['state', 'select', 'State', ['off', 'tester', 'vip', 'public']], $R], false],
        'setServiceStatus' => ['system', 'Status page', 'Sets a service on the public status page. Empty status = automatic.', [['service', 'select', 'Service', ['website', 'api', 'database', 'auth', 'games', 'chat', 'notifications']], ['status', 'select', 'Status', ['OPERATIONAL', 'DEGRADED', 'MAINTENANCE', 'OUTAGE'], true], ['note', 'text', 'Note', null, true], $R], false],
        'setBots' => ['system', 'House players', 'Turns the house players in chat, live feeds and Who\'s online on or off.', [['enabled', 'bool', 'On'], $R], false],
        'publishRelease' => ['system', 'Release gate', 'Shows the release to every player (off = staff only).', [['published', 'bool', 'Published'], $R], true],
        'setTestControl' => ['system', 'Test controls', 'Forces wins or losses for a test account (off = normal).', [$U, ['mode', 'select', 'Mode', ['off', 'win', 'loss']], $R], false],
        'simulate' => ['system', 'Simulate an event', 'Sends a test event to a test account.', [$U, ['kind', 'select', 'Event', ['wins10', 'losses10', 'jackpot', 'reward', 'levelUp', 'quest']], $R], false],
        'errorLog' => ['system', 'Error log', 'Latest server and browser errors.', [['context', 'text', 'Filter', null, true]], false],
        'clearErrors' => ['system', 'Clear old errors', 'Deletes errors older than one hour.', [$R], false],
        'qaRun' => ['system', 'Run QA checks', 'Runs every automatic health check.', [], false],
        'releaseReset' => ['system', 'Release reset', 'Wipes progress and balances of test accounts (testers) or everyone (global). Type RESET TESTER or RESET GLOBAL to confirm.', [['scope', 'select', 'Scope', ['testers', 'global']], ['confirm', 'text', 'Confirmation text'], $R], true],
    ];
}

/** Friendly metadata for the classic commands (group, title, long help, fields, examples). */
function console_command_meta(): array
{
    $u = ['name', 'user', 'Player (@name)'];
    return [
        'help' => ['start', 'Help', 'Shows every command grouped by topic. `help <command>` explains one command, `help do <action>` explains an Admin action.', [['command', 'text', 'Command (optional)', null, true]], ['help', 'help ban', 'help do setMembership']],
        'status' => ['start', 'Server status', 'One-look health check: time, PHP, database, maintenance, players online, open rounds and errors in the last hour.', [], ['status']],
        'users' => ['players', 'Find players', 'Searches usernames and emails. Shows up to 25 matches.', [['search', 'text', 'Name or email']], ['users ray', 'users @gmail.com']],
        'user' => ['players', 'Player card', 'Everything about one player: id, role, status, balances, membership, last seen.', [$u], ['user ray']],
        'ban' => ['players', 'Ban (quick)', 'Bans anyone, Owners included. Use hours or "perm".', [$u, ['hours', 'text', 'Hours or perm'], ['reason', 'reason', 'Reason']], ['ban spammer 24 spam in chat', 'ban cheater perm bot use']],
        'unban' => ['players', 'Unban (quick)', 'Lifts a ban right away.', [$u, ['reason', 'reason', 'Reason', null, true]], ['unban ray appeal accepted']],
        'kick' => ['players', 'Kick', 'Signs a player out on every device and refunds their open rounds.', [$u], ['kick ray']],
        'role' => ['players', 'Role (quick)', 'Changes a staff role. super_admin is the Owner.', [$u, ['role', 'select', 'Role', ['user', 'developer', 'support', 'moderator', 'admin', 'super_admin']]], ['role mirelix admin']],
        'wallet' => ['economy', 'Wallet (quick)', 'Adds or removes AC/AG with a ledger entry.', [$u, ['currency', 'select', 'Currency', ['AC', 'AG']], ['amount', 'text', '+/- amount'], ['reason', 'reason', 'Reason']], ['wallet ray AC +50000 event prize', 'wallet ray AG -5 refund']],
        'economy' => ['economy', 'Economy summary', 'Coins in circulation, averages and safeguard flags.', [], ['economy']],
        'maintenance' => ['system', 'Maintenance (quick)', 'Turns maintenance on or off. Staff can still use the site.', [['state', 'select', 'State', ['on', 'off']], ['message', 'text', 'Message', null, true]], ['maintenance on Back at 22:00', 'maintenance off']],
        'release' => ['system', 'Release', 'Shows or changes who sees the 1.0.0 release.', [['action', 'select', 'Action', ['status', 'publish', 'unpublish']]], ['release status']],
        'games' => ['games', 'Game list', 'Every game with status, betting, new rounds and max bet.', [], ['games']],
        'game' => ['games', 'Game switch', 'Opens, closes or hides a game, or switches betting/new rounds.', [['slug', 'game', 'Game'], ['state', 'select', 'Change', ['live', 'maintenance', 'disabled', 'betting-on', 'betting-off', 'new-on', 'new-off']]], ['game crash maintenance', 'game plinko live']],
        'end-rounds' => ['games', 'End open rounds', 'Cancels open rounds (all games or one) and refunds them.', [['slug', 'game', 'Game (optional)', null, true]], ['end-rounds', 'end-rounds mines']],
        'shutdown' => ['system', 'Emergency shutdown', 'Maintenance on, new rounds off, open rounds refunded. Use `restore` to undo.', [['message', 'text', 'Message', null, true]], ['shutdown Server move']],
        'restore' => ['system', 'Restore', 'Undoes shutdown.', [], ['restore']],
        'features' => ['system', 'Feature flags', 'Lists every feature flag and who can see it.', [], ['features']],
        'feature' => ['system', 'Set feature flag', 'Who sees a feature: off, tester, vip or public.', [['key', 'text', 'Feature key'], ['state', 'select', 'State', ['off', 'tester', 'vip', 'public']]], ['feature chess public']],
        'announce' => ['content', 'Announce', 'Sends an announcement now to an audience.', [['audience', 'select', 'Audience', ['all', 'here', 'vip', 'vvip', 'members', 'tester', 'moderator', 'staff']], ['message', 'text', 'Message']], ['announce all Double XP tonight!']],
        'flags' => ['security', 'Security flags', 'Open anti-cheat and security events, most severe first.', [['n', 'int', 'How many', null, true]], ['flags', 'flags 50']],
        'errors' => ['system', 'Errors', 'Latest server and browser errors.', [['n', 'int', 'How many', null, true]], ['errors']],
        'qa' => ['system', 'QA checks', 'Runs the automatic health checks.', [], ['qa']],
        'audit' => ['security', 'Console audit', 'The latest console commands and who ran them.', [['n', 'int', 'How many', null, true]], ['audit 30']],
        'sessions' => ['security', 'Console sessions', 'Open console sessions.', [], ['sessions']],
        'revoke-all' => ['security', 'Revoke console sessions', 'Ends every console session, including this one.', [], ['revoke-all']],
        '2fa' => ['security', '2FA status', 'Shows a player\'s two-step sign-in: method, since when, strict mode and session length.', [$u], ['2fa ray']],
        '2fa-off' => ['security', 'Turn off 2FA (recovery)', 'For a player who lost their phone or email: removes 2FA and strict mode and signs them out everywhere.', [$u, ['reason', 'reason', 'Reason']], ['2fa-off ray lost phone']],
        'strict' => ['security', 'Strict sessions', 'Owners/Admins: 3-hour sessions and the authenticator on every sign-in. Turning on needs their authenticator set up.', [$u, ['state', 'select', 'State', ['on', 'off']]], ['strict ray on', 'strict ray off']],
        'logins' => ['security', 'Login history', 'Recent sign-in attempts of a player (ok / wrong password) with IP.', [$u, ['n', 'int', 'How many', null, true]], ['logins ray']],
        'signins' => ['security', 'Active sign-ins', 'Devices a player is signed in on, with expiry.', [$u], ['signins ray']],
        'do' => ['start', 'Run an Admin action', 'Runs any Admin panel action. Write fields as key=value, put text with spaces in double quotes, JSON in single quotes, and use @name for players.', [['action', 'text', 'Action'], ['fields', 'text', 'key=value …', null, true]], ['do setMembership userId=@ray tier=vvip days=30 reason="event prize"', 'do setGameMaxBet slug=crash maxBet=5000000']],
        'actions' => ['start', 'Admin actions', 'Lists every Admin panel action you can run with `do`, grouped by topic.', [['group', 'text', 'Group (optional)', null, true]], ['actions', 'actions economy']],
    ];
}

const CONSOLE_GROUPS = [
    'start' => 'Start here', 'players' => 'Players', 'economy' => 'Economy', 'games' => 'Games',
    'community' => 'Chat & support', 'content' => 'Content & shop', 'security' => 'Security', 'system' => 'Site & system',
];

/** Actor for `do`: the console's authority, attached to a sign-in-proof system account so database checks that
 *  need a real staff id (wallet ledger, audit) have one. The account cannot sign in (no valid password). */
function console_do_actor(): array
{
    $id = qv("SELECT id FROM users WHERE username = 'neon_console'");
    if (!$id) $id = qv("INSERT INTO users (username, display_name, email, password_hash, role) VALUES ('neon_console', 'Console', 'console@system.invalid', '!console', 'super_admin') RETURNING id");
    return ['id' => (string) $id, 'username' => 'neon_console'] + console_actor();
}

/** Choice lists that come from live data (shop items, cards…), resolved when the catalog is built. */
function console_options($opts): ?array
{
    if (!is_string($opts)) return $opts;
    try {
        return match ($opts) {
            '@items' => array_values(array_map('strval', array_keys(shop_items_all()))),
            '@redeemItems' => array_values(ITEM_IDS),
            '@cards' => array_values(array_filter(array_map('strval', array_keys(cards_all())), fn($c) => $c !== 'none')),
            '@playerRoles' => array_values(array_map('strval', array_keys(roles_all()))),
            '@features' => array_values(array_map('strval', array_keys(FEATURE_KEYS))),
            '@ticketStatuses' => TICKET_STATUSES,
            '@audiences' => ANNOUNCE_TARGETS,
            default => [],
        };
    } catch (Throwable) {
        return [];
    }
}

/** key=value words → args. @name resolves to a user id for user fields; numbers, booleans and JSON are typed. */
function console_parse_fields(array $words, array $spec): array
{
    $types = [];
    $opts = [];
    foreach ($spec as $f) { $types[$f[0]] = $f[1]; $opts[$f[0]] = $f[3] ?? null; }
    $args = [];
    foreach ($words as $w) {
        if (!str_contains($w, '=')) throw new ConsoleError("expected key=value, got \"$w\"");
        [$k, $v] = explode('=', $w, 2);
        if (!array_key_exists($k, $types)) throw new ConsoleError("unknown field \"$k\" — fields: " . implode(', ', array_keys($types)));
        $t = $types[$k];
        if ($t === 'user') $v = $v === '' ? null : console_user($v)['id'];
        elseif ($t === 'bool') {
            $low = strtolower($v);
            if (!in_array($low, ['1', '0', 'true', 'false', 'on', 'off', 'yes', 'no'], true)) throw new ConsoleError("$k must be on or off");
            $v = in_array($low, ['1', 'true', 'on', 'yes'], true);
        }
        elseif ($t === 'json') { $j = json_decode($v, true); if (!is_array($j)) throw new ConsoleError("$k must be JSON, e.g. $k='{\"key\":\"value\"}'"); $v = $j; }
        elseif ($t === 'int' || $t === 'num') {
            if ($v === '') $v = null;
            elseif (!is_numeric($v)) throw new ConsoleError("$k must be a number");
            elseif ($t === 'int' && floor((float) $v) != (float) $v) throw new ConsoleError("$k must be a whole number");
            else $v = $t === 'int' ? (int) $v : $v + 0;
        }
        elseif (($t === 'select' || $t === 'game') && $v !== '') {
            $list = $t === 'game' ? array_column(q('SELECT slug FROM games')->fetchAll(), 'slug') : (console_options($opts[$k]) ?? []);
            if ($list && !in_array($v, array_map('strval', $list), true)) throw new ConsoleError("$k must be one of: " . implode(', ', array_slice($list, 0, 30)));
        }
        if ($v === '' && $t !== 'text' && $t !== 'reason') $v = null;
        $args[$k] = $v;
    }
    foreach ($spec as $f) if (empty($f[4]) && $f[1] !== 'reason' && ($args[$f[0]] ?? null) === null) throw new ConsoleError("missing {$f[0]} ({$f[2]})");
    if (!isset($args['reason']) || trim((string) $args['reason']) === '') $args['reason'] = 'console';
    return $args;
}

/** Friendly console fields → the exact shape each Admin action expects. Empty settings keep their current value. */
function console_action_prepare(string $name, array $a): array
{
    $take = function (array $keys) use (&$a): array {
        $out = [];
        foreach ($keys as $k) { if (array_key_exists($k, $a)) { if ($a[$k] !== null) $out[$k] = $a[$k]; unset($a[$k]); } }
        return $out;
    };
    switch ($name) {
        case 'editUser':
            $patch = $take(['displayName', 'username', 'resetAvatar']);
            if (!$patch) throw new ConsoleError('nothing to change — fill displayName, username or resetAvatar');
            $a['patch'] = $patch;
            break;
        case 'setLoyaltyCard':
            if (($a['mode'] ?? '') === 'clear') { $a['mode'] = 'override'; $a['card'] = null; }
            elseif (empty($a['card'])) throw new ConsoleError('missing card (needed for floor and override)');
            break;
        case 'setEconomy':
            $a = array_merge((array) kv_get('economy'), array_filter($a, fn($v) => $v !== null));
            break;
        case 'setModeration':
            $a = array_merge((array) kv_get('moderation'), array_filter($a, fn($v) => $v !== null));
            break;
        case 'setGameControls':
            $a['patch'] = $take(['status', 'bettingEnabled', 'newSessions', 'maxBet', 'maxBetAG', 'maintenanceMessage']);
            if (!$a['patch'] && empty($a['forceEnd'])) throw new ConsoleError('nothing to change — fill at least one field');
            break;
        case 'saveAnnouncement':
            $d = $take(['title', 'message', 'type', 'target', 'priority', 'active', 'startAt', 'endAt', 'sound', 'id']);
            $d += ['active' => true];
            $a['data'] = $d;
            break;
        case 'setMembershipConfig':
            $cur = (array) kv_get('memberships');
            $f = $take(['vipPrice', 'vipDays', 'vipBenefits', 'vvipPrice', 'vvipDays', 'vvipBenefits']);
            foreach (['vip', 'vvip'] as $tier) {
                $c = (array) ($cur[$tier] ?? []);
                $benefits = isset($f["{$tier}Benefits"]) ? array_values(array_filter(array_map('trim', explode(';', (string) $f["{$tier}Benefits"])))) : ($c['benefits'] ?? []);
                $a[$tier] = ['price' => $f["{$tier}Price"] ?? ($c['price'] ?? 0), 'days' => $f["{$tier}Days"] ?? ($c['days'] ?? 30), 'benefits' => $benefits];
            }
            break;
        case 'addTerm':
            $a['severity'] = (int) ($a['severity'] ?? 2);
            break;
        case 'setPlayerRole':
            if (($a['role'] ?? '') === '') $a['role'] = null;
            break;
    }
    return $a;
}

function console_pretty($v, int $depth = 0): string
{
    if (!is_array($v)) return is_bool($v) ? ($v ? 'yes' : 'no') : (string) ($v ?? '—');
    if ($v === []) return '(empty)';
    $list = array_is_list($v);
    if ($list && $v && is_array($v[0]) && !array_is_list($v[0])) {
        $cols = array_slice(array_keys($v[0]), 0, 6);
        $rows = array_map(fn($r) => array_map(fn($c) => is_array($r[$c] ?? null) ? json_encode($r[$c]) : console_pretty($r[$c] ?? null), array_combine($cols, $cols)), array_slice($v, 0, 40));
        return console_table($rows, $cols) . (count($v) > 40 ? "\n… " . (count($v) - 40) . ' more' : '');
    }
    $out = [];
    foreach ($v as $k => $x) {
        $pad = str_repeat('  ', $depth);
        if (is_array($x) && $x && $depth < 2) $out[] = $pad . $k . ":\n" . console_pretty($x, $depth + 1);
        else $out[] = $pad . str_pad((string) $k, 16) . ' ' . (is_array($x) ? json_encode($x) : console_pretty($x));
    }
    return implode("\n", array_slice($out, 0, 60));
}

function console_help_action(string $name): string
{
    $cat = console_action_catalog();
    if (!isset($cat[$name])) throw new ConsoleError("unknown action: $name — type `actions`");
    [$group, $title, $help, $fields, $danger] = $cat[$name];
    foreach ($fields as &$fx) $fx[3] = console_options($fx[3] ?? null);
    unset($fx);
    $lines = ["$title  (do $name)", '', wordwrap($help, 90), '', 'Fields:'];
    foreach ($fields as $f) $lines[] = '  ' . str_pad($f[0] . '=', 18) . $f[2] . (!empty($f[3]) ? ' — one of: ' . implode(', ', array_slice($f[3], 0, 20)) . (count($f[3]) > 20 ? ', …' : '') : '') . (!empty($f[4]) || $f[1] === 'reason' ? ' (optional)' : '');
    if (!$fields) $lines[] = '  (none)';
    $ex = 'do ' . $name . ' ' . implode(' ', array_map(fn($f) => $f[0] . '=' . ($f[1] === 'user' ? '@name' : ($f[3][0] ?? ($f[1] === 'bool' ? 'on' : ($f[1] === 'reason' ? '"why"' : '…')))), array_filter($fields, fn($f) => empty($f[4]))));
    $lines[] = '';
    $lines[] = 'Example: ' . trim($ex);
    if ($danger) $lines[] = 'Changes live data: the console asks you to confirm.';
    return implode("\n", $lines);
}

/** Commands added in R 1.1.1 (merged into the registry). */
function console_extra_commands(): array
{
    return [
        'do' => ['do <action> key=value …', 'Run any Admin panel action (see `actions`).', false, function (array $a) {
            if (!$a) throw new ConsoleError('usage: do <action> key=value … — type `actions` to see them all');
            $name = array_shift($a);
            $cat = console_action_catalog();
            if (!isset($cat[$name])) throw new ConsoleError("unknown action: $name — type `actions`");
            $args = console_action_prepare($name, console_parse_fields($a, $cat[$name][3]));
            $res = admin_action(console_do_actor(), $name, $args);
            // Results can hold objects (JSON maps); normalise to arrays before printing.
            $res = json_decode((string) json_encode($res), true);
            return "✓ {$cat[$name][1]}\n" . console_pretty($res);
        }],
        'actions' => ['actions [group]', 'List every Admin action you can run with `do`.', false, function (array $a) {
            $out = [];
            foreach (CONSOLE_GROUPS as $g => $label) {
                if (($a[0] ?? '') !== '' && $a[0] !== $g) continue;
                $rows = array_filter(console_action_catalog(), fn($x) => $x[0] === $g);
                if (!$rows) continue;
                $out[] = strtoupper($label);
                foreach ($rows as $k => $x) $out[] = '  ' . str_pad($k, 24) . $x[1] . ($x[4] ? ' [confirm]' : '');
                $out[] = '';
            }
            return trim(implode("\n", $out)) . "\n\n`help do <action>` explains one action.";
        }],
        '2fa' => ['2fa <name>', 'Two-step sign-in status of a player.', false, function (array $a) {
            if (!$a) throw new ConsoleError('usage: 2fa <name>');
            $u = console_user($a[0]);
            $s = security_view($u);
            return implode("\n", ['player      @' . $u['username'] . ' (' . $u['role'] . ')', 'method      ' . ($s['method'] === 'totp' ? 'authenticator app' : ($s['method'] === 'email' ? 'email code' : 'off')),
                'since       ' . ($u['twofa_enabled_at'] ?? '—'), 'strict      ' . ($s['strict'] ? 'on (3 h sessions, authenticator always)' : ($s['strictAllowed'] ? 'off' : 'not available for this role')), 'session     ' . $s['sessionHours'] . ' h']);
        }],
        '2fa-off' => ['2fa-off <name> <reason…>', 'Remove a player\'s 2FA and strict mode (lost phone) and sign them out.', true, function (array $a) {
            if (count($a) < 2) throw new ConsoleError('usage: 2fa-off <name> <reason>');
            $u = console_user($a[0]);
            security_admin_set($u, 'twofa', false);
            audit_log(console_actor(), 'security.2fa_off', $u['id'], $u['username'], $u['id'], $u['twofa_method'], null, implode(' ', array_slice($a, 1)));
            return "@{$u['username']}: 2FA and strict mode removed, signed out everywhere. They can set 2FA up again in Settings.";
        }],
        'strict' => ['strict <name> <on|off>', 'Strict sessions for an Owner/Admin (3 h, authenticator always).', true, function (array $a) {
            if (count($a) < 2 || !in_array($a[1], ['on', 'off'], true)) throw new ConsoleError('usage: strict <name> <on|off>');
            $u = console_user($a[0]);
            $s = security_admin_set($u, 'strict', $a[1] === 'on');
            audit_log(console_actor(), 'security.strict', $u['id'], $u['username'], $u['id'], null, $a[1], 'console');
            return "@{$u['username']}: strict mode " . ($s['strict'] ? 'on — 3-hour sessions, authenticator on every sign-in' : 'off — 7-day sessions');
        }],
        'logins' => ['logins <name> [n]', 'Recent sign-in attempts of a player.', false, function (array $a) {
            if (!$a) throw new ConsoleError('usage: logins <name> [n]');
            $u = console_user($a[0]);
            $n = max(1, min(100, (int) ($a[1] ?? 20)));
            $rows = q("SELECT to_char(at, 'YYYY-MM-DD HH24:MI') AS at, CASE WHEN ok THEN 'ok' ELSE 'wrong password' END AS result, host(ip) AS ip FROM login_attempts WHERE email = ? ORDER BY at DESC LIMIT $n", [$u['email']])->fetchAll();
            return console_table($rows, ['at', 'result', 'ip']);
        }],
        'signins' => ['signins <name>', 'Devices a player is signed in on.', false, function (array $a) {
            if (!$a) throw new ConsoleError('usage: signins <name>');
            $u = console_user($a[0]);
            $rows = q("SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI') AS since, to_char(expires_at, 'YYYY-MM-DD HH24:MI') AS until, host(ip) AS ip, left(user_agent, 40) AS device FROM sessions WHERE user_id = ? AND expires_at > now() ORDER BY created_at DESC", [$u['id']])->fetchAll();
            return console_table($rows, ['since', 'until', 'ip', 'device']);
        }],
    ];
}

/** Friendlier `help`: grouped, with how-to lines. */
function console_help(array $a): string
{
    $cmds = console_commands();
    $meta = console_command_meta();
    if (($a[0] ?? '') === 'do' && isset($a[1])) return console_help_action($a[1]);
    if (isset($a[0])) {
        $k = strtolower($a[0]);
        if (!isset($cmds[$k])) {
            if (isset(console_action_catalog()[$a[0]])) return console_help_action($a[0]);
            throw new ConsoleError("unknown command: $k");
        }
        $m = $meta[$k] ?? null;
        $lines = [($m[1] ?? $k) . '  —  ' . $cmds[$k][0], '', wordwrap($m[2] ?? $cmds[$k][1], 90)];
        if ($m && $m[4]) { $lines[] = ''; $lines[] = 'Examples:'; foreach ($m[4] as $ex) $lines[] = '  ' . $ex; }
        if ($cmds[$k][2]) { $lines[] = ''; $lines[] = 'Changes live data: you type the command twice to confirm.'; }
        return implode("\n", $lines);
    }
    $out = ['NEON ARCADE CONSOLE — type a command and press Enter. Tab completes, ↑ ↓ recall history.', ''];
    foreach (CONSOLE_GROUPS as $g => $label) {
        $rows = [];
        foreach ($cmds as $k => $c) if (($meta[$k][0] ?? 'system') === $g) $rows[] = '  ' . str_pad($c[0], 46) . ($meta[$k][1] ?? $c[1]) . ($c[2] ? ' [confirm]' : '');
        $n = count(array_filter(console_action_catalog(), fn($x) => $x[0] === $g));
        if (!$rows && !$n) continue;
        $out[] = strtoupper($label) . ($n ? "  (+$n admin actions: `actions $g`)" : '');
        array_push($out, ...$rows);
        $out[] = '';
    }
    $out[] = 'Everything in the Admin panel works here too: `actions` lists them, `help do <action>` explains one.';
    return implode("\n", $out);
}

/** Catalog for the point-and-click panel. */
function console_catalog(): array
{
    $cmds = console_commands();
    $meta = console_command_meta();
    $c = [];
    foreach ($cmds as $k => $x) {
        $m = $meta[$k] ?? ['system', $k, $x[1], [], []];
        $c[] = ['kind' => 'command', 'name' => $k, 'group' => $m[0], 'title' => $m[1], 'help' => $m[2], 'usage' => $x[0], 'danger' => (bool) $x[2],
            'fields' => array_map(fn($f) => ['key' => $f[0], 'type' => $f[1], 'label' => $f[2], 'options' => $f[3] ?? null, 'optional' => !empty($f[4])], $m[3]), 'examples' => $m[4]];
    }
    foreach (console_action_catalog() as $k => $x) {
        $c[] = ['kind' => 'action', 'name' => $k, 'group' => $x[0], 'title' => $x[1], 'help' => $x[2], 'usage' => "do $k", 'danger' => (bool) $x[4],
            'fields' => array_map(fn($f) => ['key' => $f[0], 'type' => $f[1], 'label' => $f[2], 'options' => console_options($f[3] ?? null), 'optional' => !empty($f[4]) || $f[1] === 'reason'], $x[3]), 'examples' => []];
    }
    $games = array_column(q('SELECT slug FROM games ORDER BY slug')->fetchAll(), 'slug');
    return ['groups' => CONSOLE_GROUPS, 'items' => $c, 'games' => $games];
}
