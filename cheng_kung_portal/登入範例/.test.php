<?php

// 產生隨機的 state（32字元十六進位字串）
function generateState($length = 32) {
    return bin2hex(random_bytes($length / 2));
}
    // OAuth 2.0 授權參數
    $response_type = 'code';
    $client_id = 'dd507556-6d79-43d2-bb83-7f5a1b8a8e47';
    $redirect_uri = 'https://sup.ncku.edu.tw:9453/sso/testlogout.php';
    $resource = 'https://sup.ncku.edu.tw:9453/sso/sso.php';
    // 產生新的 state
    $state = generateState();

    // 組合查詢參數
    $params = [
            'response_type' => $response_type,
            'client_id' => $client_id,
            'redirect_uri' => $redirect_uri,
            'state' => $state,
            'resource' => $resource
    ];

    // 編碼並組合成完整 URL
    $auth_url = 'https://fs.ncku.edu.tw/adfs/oauth2/authorize?' . http_build_query($params);

    $redirectUrl = $auth_url;
    $delaySeconds = 0;

    $html = "
    <!DOCTYPE html>
    <html lang=\"zh-Hant\">
    <head>
        <meta charset=\"UTF-8\">
        <meta http-equiv=\"refresh\" content=\"{$delaySeconds};url={$redirectUrl}\">
            <title>正在重新導向...</title>
    </head>
    <body>
    </body>
    </html>
    ";
    echo $html;
    header('$auth_url');

?>
