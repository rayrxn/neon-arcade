# Owner Console

The Owner Console is a separate authority boundary. It is **not a user role** and there is no role above Owner.
Whoever holds the console key can run the commands below; an Owner account without the key cannot.

## Turning it on (once, on the server)

Easiest (no copy-paste): in the cPanel Terminal run
```
php ~/neon-src/tools/owner-console.php --set-key
```
type the new key twice — the hash is written into `~/neon-config.php` for you (a backup is restored if anything fails).

Manual alternative:

1. Open the cPanel Terminal (or SSH) and run:
   ```
   php ~/neon-src/tools/owner-console.php --hash
   ```
   Type a new console key twice (16+ characters). Store the key in a password manager.
2. The command prints one line like `'console' => ['key_hash' => '$argon2id$…'],`.
   Add it inside the array returned by `~/neon-config.php`. Only the hash is stored; the key never is.
3. Done. Without that line the console stays off (web and CLI).

## Using it

- **Web:** `https://arcadebet.my.id/#/system-console` → enter the console key.
  Tab completes a command, ↑/↓ walks history, `clear` clears the screen, `lock` ends the session.
- **CLI:** `php ~/neon-src/tools/owner-console.php` (interactive) or `php ~/neon-src/tools/owner-console.php status` (one command).

## Security

- Unlock: key checked with `password_verify`; 5 wrong keys from one IP lock unlocking for 15 minutes.
- Session: random token in an HttpOnly, SameSite=Strict cookie, stored only as a SHA-256 hash; ends after 30 minutes idle; `revoke-all` ends every session.
- Requests need the `X-Neon` header (CSRF guard, same as the rest of the API).
- Only the commands in the table exist. There is no shell, no `eval` and no SQL passthrough.
- Commands marked *confirm* run only after the exact command line is typed a second time.
- Every line (including failed unlocks and confirmation prompts) is written to `console_audit`; actions that change players
  are also written to the admin audit log with the actor shown as *system/console*.

## Commands

| Command | What it does | Confirm |
|---|---|---|
| `help [command]` | List commands or show one command. |  |
| `status` | Server, database, maintenance and player counts. |  |
| `users <search>` | Find players by name or email. |  |
| `user <name>` | Show one player: role, status, balances, card, membership. |  |
| `ban <name> <hours|perm> <reason…>` | Ban a player (any role, including Owners). | yes |
| `unban <name> [reason…]` | Lift a ban. |  |
| `kick <name>` | Sign a player out everywhere and cancel their open rounds (refunded). | yes |
| `role <name> <user|developer|support|moderator|admin|super_admin>` | Change a staff role. | yes |
| `wallet <name> <AC|AG> <+/-amount> <reason…>` | Add or remove coins (ledger entry, audited). | yes |
| `maintenance <on|off> [message…]` | Turn site maintenance on or off (staff keep access). |  |
| `games` | List games with status, betting, new rounds and max bets. |  |
| `game <slug> <live|maintenance|disabled|betting-on|betting-off|new-on|new-off>` | Change one game. |  |
| `end-rounds [slug]` | Cancel open rounds (all games or one) with a full refund. | yes |
| `shutdown [message…]` | Emergency: maintenance on, new rounds off everywhere, open rounds refunded. | yes |
| `restore` | Undo shutdown: maintenance off, new rounds on. |  |
| `features` | List feature flags. |  |
| `feature <key> <off|tester|vip|public>` | Set a feature flag. |  |
| `announce <all|here|vip|vvip|members|tester|moderator|staff> <message…>` | Send an announcement now. |  |
| `flags [n]` | Open security events, most severe first. |  |
| `errors [n]` | Latest server and browser errors. |  |
| `economy` | Circulation, averages and safeguard flags. |  |
| `qa` | Run the QA health checks. |  |
| `audit [n]` | Latest console commands. |  |
| `sessions` | Active console sessions. |  |
| `revoke-all` | End every console session (including this one). | yes |
