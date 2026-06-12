<?php
/* ════════════════════════════════════════════════════════════
   SETUP — corre UMA VEZ para criar tabelas e inserir traders
   Acede a: https://seusite/setup.php
════════════════════════════════════════════════════════════ */
require_once __DIR__ . '/api/config.php';

try {
    $db = getDB(); // executa todas as migrações automaticamente

    /* ── Traders (54) ─────────────────────────────────── */
    $traders = [
        [1,  'trader1A',  15.4,  8.2, 87], [2,  'trader2F',  22.1, 12.5, 92],
        [3,  'trader3C',   7.8,  5.1, 65], [4,  'trader4B',  18.9, 25.3, 45],
        [5,  'trader5E',  11.2,  9.8, 78], [6,  'trader6D',   5.3,  7.2, 58],
        [7,  'trader7G',  19.7, 11.0, 89], [8,  'trader8H',  31.5, 28.7, 38],
        [9,  'trader9K',  13.1,  6.4, 81], [10, 'trader10M',  4.2,  9.1, 52],
        [11, 'trader11R', 26.8, 14.3, 94], [12, 'trader12T',  8.5,  4.7, 63],
        [13, 'trader13N', 17.3, 22.1, 41], [14, 'trader14P', 12.9,  8.8, 76],
        [15, 'trader15W',  3.1, 11.5, 47], [16, 'trader16Z', 20.4,  7.9, 91],
        [17, 'trader17Q', 14.7, 16.2, 69], [18, 'trader18J',  6.9,  5.5, 60],
        [19, 'trader19X', 24.3, 10.1, 88], [20, 'trader20V',  2.4, 18.9, 34],
        [21, 'trader21L', 11.8,  7.3, 74], [22, 'trader22S', 29.1, 31.4, 29],
        [23, 'trader23Y', 16.6,  9.4, 83], [24, 'trader24U',  9.2,  6.8, 61],
        [25, 'trader25O', 21.5, 13.7, 86], [26, 'trader26I',  1.8,  8.3, 44],
        [27, 'trader27E', 18.2, 24.6, 42], [28, 'trader28A', 10.5,  5.9, 72],
        [29, 'trader29B', 33.7, 27.8, 36], [30, 'trader30C', 13.9,  8.1, 80],
        [31, 'sol_whale_k',  28.4,  9.2, 93], [32, 'alpha_mev',    19.6, 11.8, 85],
        [33, 'degen_chad',    4.1, 22.3, 37], [34, 'moonshot_rex', 35.2, 18.5, 79],
        [35, 'quiet_scalp',  12.7,  5.3, 88], [36, 'jito_sniper',  23.9, 13.1, 82],
        [37, 'dark_pool_x',   8.3,  6.7, 64], [38, 'perp_hunter',  17.1, 10.4, 84],
        [39, 'orca_knife',   31.0, 26.9, 41], [40, 'sol_samurai',  14.5,  7.8, 87],
        [41, 'drift_lord',    6.2, 19.4, 43], [42, 'raydium_pro',  22.8, 12.0, 90],
        [43, 'block_zero',   10.9,  8.5, 75], [44, 'laminar_k',    26.3, 15.7, 77],
        [45, 'pumpbot9k',     2.9, 24.1, 28], [46, 'arb_engine',   18.7,  6.1, 92],
        [47, 'sol_monk',     11.4,  4.9, 83], [48, 'mango_max',     7.5, 21.6, 39],
        [49, 'tensor_t',     24.6,  9.7, 89], [50, 'hedge_zero',   16.2,  7.3, 86],
        [51, 'flash_arb',    21.3,  8.6, 91], [52, 'onchain_rex',  15.8,  7.1, 85],
        [53, 'sol_viper',    27.5, 12.4, 88], [54, 'delta_grid',   13.2,  5.8, 82],
    ];
    $stmt = $db->prepare("INSERT IGNORE INTO traders (id,name,weekly_profit,drawdown,score) VALUES (?,?,?,?,?)");
    foreach ($traders as $t) $stmt->execute($t);

    $traderCount = (int)$db->query('SELECT COUNT(*) FROM traders')->fetchColumn();

    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'>
    <style>body{font-family:system-ui,sans-serif;max-width:500px;margin:60px auto;padding:0 20px;}
    h2{color:#16a34a;} .btn{display:inline-block;margin-top:20px;padding:12px 24px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;}</style></head><body>
    <h2>✔ Setup concluído!</h2>
    <p>Tabelas criadas e <strong>$traderCount traders</strong> inseridos.</p>
    <p style='color:#dc2626;font-size:13px;margin-top:16px'>⚠ Apaga ou renomeia o ficheiro <code>setup.php</code> por segurança.</p>
    <a class='btn' href='index.html'>Ir para o Dashboard</a>
    </body></html>";

} catch (Exception $e) {
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'>
    <style>body{font-family:system-ui,sans-serif;max-width:500px;margin:60px auto;padding:0 20px;}h2{color:#dc2626;}</style></head><body>
    <h2>Erro</h2><pre>" . htmlspecialchars($e->getMessage()) . "</pre></body></html>";
}
