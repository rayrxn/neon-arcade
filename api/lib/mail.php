<?php
declare(strict_types=1);

/**
 * Outgoing email: branded HTML + plain-text fallback.
 * Sent with PHP mail() (cPanel sendmail). Tests set NEON_MAIL_LOG to write messages to a file instead.
 */

function site_url(): string
{
    return rtrim((string) (config()['site_url'] ?? 'https://arcadebet.my.id'), '/');
}

function mail_from(): array
{
    $c = config()['mail'] ?? [];
    return [(string) ($c['from'] ?? 'no-reply@arcadebet.my.id'), (string) ($c['fromName'] ?? 'Neon Arcade')];
}

function mail_send(string $to, string $subject, string $html, string $text): bool
{
    $log = getenv('NEON_MAIL_LOG') ?: (config()['mail']['log'] ?? null);
    if ($log) {
        file_put_contents($log, json_encode(['to' => $to, 'subject' => $subject, 'html' => $html, 'text' => $text]) . "\n", FILE_APPEND | LOCK_EX);
        return true;
    }
    [$from, $name] = mail_from();
    $boundary = 'na_' . bin2hex(random_bytes(12));
    $headers = implode("\r\n", [
        'MIME-Version: 1.0',
        'From: ' . mb_encode_mimeheader($name, 'UTF-8') . " <$from>",
        "Reply-To: $from",
        'X-Mailer: NeonArcade',
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
    ]);
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
        . "--$boundary--\r\n";
    $ok = @mail($to, mb_encode_mimeheader($subject, 'UTF-8'), $body, $headers, '-f' . $from);
    if (!$ok) error_log("neon mail: send failed to $to ($subject)");
    return $ok;
}

/** Copy for each email, in Indonesian and English. */
function mail_copy(string $kind, string $lang): array
{
    $copy = [
        'reset' => [
            'en' => [
                'subject' => 'Reset your Neon Arcade password',
                'preheader' => 'Use this link within 30 minutes to choose a new password.',
                'eyebrow' => 'Password reset',
                'title' => 'Choose a new password',
                'intro' => 'Hi @{user}, we got a request to reset the password for your Neon Arcade account. Tap the button below to choose a new one.',
                'cta' => 'Reset password',
                'expires' => 'This link works once and expires in 30 minutes.',
                'ignore' => 'Didn’t ask for this? You can ignore this email. Your password stays the same and nobody can change it without this link.',
            ],
            'id' => [
                'subject' => 'Atur ulang password Neon Arcade kamu',
                'preheader' => 'Pakai link ini dalam 30 menit untuk membuat password baru.',
                'eyebrow' => 'Reset password',
                'title' => 'Buat password baru',
                'intro' => 'Halo @{user}, ada permintaan untuk mengatur ulang password akun Neon Arcade kamu. Tekan tombol di bawah untuk membuat password baru.',
                'cta' => 'Reset password',
                'expires' => 'Link ini hanya bisa dipakai sekali dan berlaku 30 menit.',
                'ignore' => 'Tidak merasa meminta? Abaikan email ini. Password kamu tetap sama dan tidak bisa diganti tanpa link ini.',
            ],
        ],
        'verify' => [
            'en' => [
                'subject' => 'Verify your email for Neon Arcade',
                'preheader' => 'One tap to confirm this is your email.',
                'eyebrow' => 'Email verification',
                'title' => 'Confirm your email',
                'intro' => 'Hi @{user}, confirm that {email} belongs to you. A verified email lets you reset your password and keeps your account safe.',
                'cta' => 'Verify email',
                'expires' => 'This link expires in 24 hours.',
                'ignore' => 'Didn’t create a Neon Arcade account? You can ignore this email.',
            ],
            'id' => [
                'subject' => 'Verifikasi email Neon Arcade kamu',
                'preheader' => 'Satu ketukan untuk memastikan ini email kamu.',
                'eyebrow' => 'Verifikasi email',
                'title' => 'Konfirmasi email kamu',
                'intro' => 'Halo @{user}, pastikan {email} memang milik kamu. Email yang terverifikasi bisa dipakai untuk reset password dan menjaga akunmu tetap aman.',
                'cta' => 'Verifikasi email',
                'expires' => 'Link ini berlaku 24 jam.',
                'ignore' => 'Tidak membuat akun Neon Arcade? Abaikan saja email ini.',
            ],
        ],
    ];
    $common = [
        'en' => ['fallback' => 'Button not working? Copy this link into your browser:', 'footer' => 'Sent by Neon Arcade · arcadebet.my.id', 'auto' => 'This is an automatic message, replies aren’t read.', 'support' => 'Need help? Open a ticket in Support.'],
        'id' => ['fallback' => 'Tombol tidak berfungsi? Salin link ini ke browser:', 'footer' => 'Dikirim oleh Neon Arcade · arcadebet.my.id', 'auto' => 'Ini pesan otomatis, balasan tidak dibaca.', 'support' => 'Butuh bantuan? Buat tiket di Support.'],
    ];
    $l = $lang === 'id' ? 'id' : 'en';
    return $copy[$kind][$l] + $common[$l];
}

/** Table-based layout with inline styles so it renders the same in Gmail, Outlook and phone mail apps. */
function mail_render(string $kind, string $lang, array $vars): array
{
    $c = mail_copy($kind, $lang);
    $fill = fn(string $s) => strtr($s, ['{user}' => $vars['user'] ?? '', '{email}' => $vars['email'] ?? '']);
    $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $url = (string) $vars['url'];
    $accent = $kind === 'reset' ? '#0891b2' : '#059669';      // button: white text needs a deep tone
    $accentText = $kind === 'reset' ? '#0e7490' : '#047857';
    $icon = $kind === 'reset' ? '&#128273;' : '&#9993;&#65039;';
    $year = date('Y');
    $html = <<<HTML
<!doctype html>
<html lang="{$e($lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{$e($c['subject'])}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f7;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f7;">{$e($c['preheader'])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f7;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 20px 4px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <span style="font-size:17px;font-weight:800;letter-spacing:-0.2px;color:#0b0d14;">NEON<span style="color:#06b6d4;">/</span>ARCADE</span>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e4e7ee;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.06);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="height:3px;background:{$accent};background-image:linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6);font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 28px 8px 28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="width:48px;height:48px;border-radius:14px;background:#f1f5f9;border:1px solid #e2e8f0;text-align:center;line-height:48px;font-size:22px;">{$icon}</div>
            <p style="margin:20px 0 0 0;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:{$accentText};">{$e($c['eyebrow'])}</p>
            <h1 style="margin:6px 0 0 0;font-size:24px;line-height:1.25;font-weight:800;color:#0b0d14;">{$e($c['title'])}</h1>
            <p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:#475569;">{$e($fill($c['intro']))}</p>
          </td></tr>
          <tr><td style="padding:24px 28px 8px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="border-radius:12px;background:{$accent};">
                <a href="{$e($url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">{$e($c['cta'])} &rarr;</a>
              </td>
            </tr></table>
            <p style="margin:14px 0 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">&#9201; {$e($c['expires'])}</p>
          </td></tr>
          <tr><td style="padding:20px 28px 28px 28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="border-top:1px solid #eef0f4;padding-top:18px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">{$e($c['fallback'])}</p>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="{$e($url)}" style="color:#0891b2;text-decoration:underline;">{$e($url)}</a></p>
              <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">{$e($c['ignore'])}</p>
            </div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 8px 0 8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;">
        <p style="margin:0;font-size:12px;color:#64748b;">{$e($c['support'])}</p>
        <p style="margin:6px 0 0 0;font-size:11px;color:#94a3b8;">{$e($c['footer'])} · &copy; {$year}<br>{$e($c['auto'])}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
    $text = "NEON/ARCADE\n\n" . $c['title'] . "\n\n" . $fill($c['intro']) . "\n\n" . $c['cta'] . ":\n" . $url . "\n\n" . $c['expires'] . "\n\n" . $c['ignore'] . "\n\n— " . $c['footer'];
    return ['subject' => $c['subject'], 'html' => $html, 'text' => $text];
}
