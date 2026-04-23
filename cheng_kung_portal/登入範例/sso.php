<?php
session_start();

//這行一定要加上去，目的取得REQUEST_TIME控制token取得
define('REQUEST_TIME', (int) $_SERVER['REQUEST_TIME']);

require_once('../../oauth2_client_nonamespace.inc'); // 確保這個檔案包含你之前的 class 定義
$langc = [
    'NOACCESS' => '無權限存取',
    'CLOSEWINDOW' => '請關閉視窗',
    'PASSWD_ERR' => '密碼錯誤',
    'LOGOIN_AGAIN' => '請重新登入',
    // 其他語言字串...
];
function clean_all(){
    if (!empty($oauth2_client)){
    	$oauth2_client->clearToken();
    }
    // 1. 清除所有 session 變數
	$_SESSION = array();
   	$result = array();
    // 2. 如果有使用 session cookie，則刪除它
    if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
            $params["/"], $params["sup.ncku.edu.tw"],
            $params["secure"], $params["httponly"]
        );
    }
    
    // 3. 銷毀 session
    session_destroy();

    $redirectUrl = 'https://sup.ncku.edu.tw:9453/sso/logout.php';
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

}
/**
 * 下面設定與OAuth Server 溝通的參數， 
 *   $base_url 改成自己的Web Server Domain
 *   client_id 改成由OAuth管理員授權的client_id
 *   client_secret 改成申請的系統代碼
 *   redirect_uri 改成申請的redirect_uri
 * 
 *   參數:'nckusso' 需要改為個人申請的app的名稱     
 */
$base_url = "https://sup.ncku.edu.tw:9453";
$server_url = "https://fs.ncku.edu.tw";
$oauth2_clients['nckusupsso'] = array(
    'token_endpoint' => $server_url . '/adfs/oauth2/token',
    'auth_flow' => 'server-side',
    'client_id' => 'dd507556-6d79-43d2-bb83-7f5a1b8a8e47',
    'client_secret' => 'nckusupsso',
    'authorization_endpoint' => $server_url . '/adfs/oauth2/authorize',
    'redirect_uri' => $base_url . '/sso/sso.php',
);

// NEW一個 oauth2_client 物件
$oauth2_client = new OAuth2_Client($oauth2_clients['nckusupsso'], 'nckusupsso');

//先清除Token
$oauth2_client->clearToken();

//在輸入帳號密碼完成授權後會回傳accessToken
$access_token = $oauth2_client->getAccessToken();

/**
 * 利用accessToken 轉換為可讀的資料，回傳 array , 回傳範例如下
 *   $result['commonname'] = "S26051017"
 *   $result['DN'] = "CN=S26051017,OU=Students,DC=ncku,DC=edu,DC=tw"
 *   $result['email'] = "s26051017@ncku.edu.tw"
 *   $result['identity'] =  "student" 或 "staff"
 */
$result = $oauth2_client->getUserIdentity($access_token);
echo "<b>$access_token</b>";
//自行處理登入系統身份識別，可利用 $result['identity'] 先判別學生或職員
//其他識別是否有權限使用系統，可以將原先判別的程式寫在這裡
$chklogin = FALSE;
if (isset($result['commonname'])) {
    (isset($_SESSION["Tstuno"]) ? session_destroy() : '');
    //EX:跑流程～取得學年學期......
    $rs = 114;
    $Nowtime = date("Y") - 1911 . date("md");
    $Nowtime = substr('0' . $Nowtime, -7);
    // 顯示頁面
  /*	
	echo "<h2>使用者資料</h2><hr>";
	foreach ($result as $key => $value) {
   	    echo "<b>$key</b>: $value<br>";
	}
  */
    if ($result['identity'] == 'student') {
        //成功後寫入$_SESSION[''] 與之前系統判別做銜接，正確銜接上後就可以不用修訂原系統程式。
        //這部分請大家自行控制
        $_SESSION['Tstuno'] = trim($result['commonname']);
	$student_year = substr($_SESSION['Tstuno'],3,2);
	$new_student_year = substr($rs,1,2); 
	
	$chklogin = TRUE;
	if($student_year == $new_student_year){
	    $new_student = TRUE;
	    echo "<b> 新生：Y</b>";
	}else{
            $new_student = FALSE;
	    echo "<b> 新生：N</b>";
	}
	echo "<b> 學號：".$_SESSION['Tstuno'];
	echo "<b> 入學年度：1$student_year</b>";

    } else { // 非學生身份
        echo $result['identity'];
        echo ("=>NO STUDENT".$langc['NOACCESS']);
        echo "<br>";
	clean_all();
        die;
    }
} else { // 驗證不過就導到其他網頁處理
    clean_all();    
    die;
}
/* OAuth2 End */

