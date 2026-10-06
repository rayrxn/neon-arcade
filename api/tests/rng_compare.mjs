// Bandingkan RNG + pemetaan hasil game JS vs PHP untuk 300 kombinasi seed/nonce.
import * as R from '../../src/utils/rng.js'
import { execFileSync } from 'node:child_process'
const cases = []
for (let i = 0; i < 300; i++) cases.push({ s: R.randomHex(32), c: R.randomHex(10), n: i * 7 })
const js = cases.map(({ s, c, n }) => {
  const f = R.generateFloats({ serverSeed: s, clientSeed: c, nonce: n, count: 51 })
  return {
    f0: f[0], dice: R.diceRoll(f[0]), crash: R.crashPoint(f[0]), roulette: R.rouletteNumber(f[0]),
    plinko: R.plinkoPath(f, 16).bin, mines: R.minePositions(f.slice(0, 24), 5), deck: R.shuffleWithFloats(R.createDeck(), f).slice(-4).map((x) => x.id),
    tier: R.pickWeighted(f[1], R.RARITY_TIERS).id, dm: R.diceMultiplier(37.5),
  }
})
const php = JSON.parse(execFileSync('php', ['-r', `
require 'api/lib/core.php'; require 'api/lib/rng.php';
$tiers=[['id'=>'common','weight'=>50],['id'=>'rare','weight'=>30],['id'=>'epic','weight'=>15],['id'=>'legendary','weight'=>4],['id'=>'secret','weight'=>1]];
$out=[]; foreach (json_decode(stream_get_contents(STDIN), true) as $k) { $f=generate_floats($k['s'],$k['c'],$k['n'],51);
$deck=shuffle_with_floats(create_deck(),$f); $out[]=['f0'=>$f[0],'dice'=>dice_roll($f[0]),'crash'=>crash_point($f[0]),'roulette'=>roulette_number($f[0]),
'plinko'=>plinko_path($f,16)['bin'],'mines'=>mine_positions(array_slice($f,0,24),5),'deck'=>array_map(fn($x)=>$x['id'],array_slice($deck,-4)),
'tier'=>pick_weighted($f[1],$tiers)['id'],'dm'=>dice_multiplier(37.5)]; } echo json_encode($out, JSON_PRESERVE_ZERO_FRACTION);`], { input: JSON.stringify(cases) }).toString())
let bad = 0
js.forEach((a, i) => { for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(php[i][k]) && !(typeof a[k] === 'number' && a[k] === php[i][k])) { if (bad++ < 5) console.log('MISMATCH', i, k, a[k], php[i][k]) } })
console.log(bad ? `FAIL ${bad} mismatches` : `PASS rng identical for ${cases.length} seeds × 9 mappings`)
process.exit(bad ? 1 : 0)
