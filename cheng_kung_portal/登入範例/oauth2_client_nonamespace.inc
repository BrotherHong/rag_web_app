<?php

// namespace OAuth2;
//ini_set('display_errors', 1);
//ini_set('display_startup_errors', 1);
//error_reporting(E_ALL);
/**
 * @file
 * class OAuth2\Client
 * Ver: 1.3 
 * 2017/6/13 增加 identity 屬性判斷學生(student)或職員(staff)
 * 2017/8/23 修改 getUserIdentity() JWT decode Bug(修改特殊字元造成誤判的問題)
 * 2017/9/13 修改 resource 有 '~' 號問題
 * 2017/9/19 修正 中文亂碼問題
 */
class Oauth2_client {

    /**
     * Unique identifier of an OAuth2\Client object.
     */
    protected $id = NULL;

    /**
     *  - token_endpoint :: something like:
     *       https://oauth2_server.example.org/oauth2/token
     *  - authorization_endpoint :: somethig like:
     *       https://oauth2_server.example.org/oauth2/authorize
     *  - redirect_uri :: something like:
     *       https://oauth2_client.example.org/oauth2/authorized
     *  - scope :: requested scopes, separated by a space
     */
    protected $params = array(
        'auth_flow' => NULL,
        'client_id' => NULL,
        'client_secret' => NULL,
        'token_endpoint' => NULL,
        'authorization_endpoint' => NULL,
        'redirect_uri' => NULL,
        'proxy_server' => NULL
    );

    /**
     * Associated array that keeps data about the access token.
     */
    protected $token = array(
        'access_token' => NULL,
        'expires_in' => NULL,
        'token_type' => NULL,
        'scope' => NULL,
        'refresh_token' => NULL,
        'expiration_time' => NULL,
    );

    /** Return the token array. */
    function token() {
        return $this->token;
    }

    /**
     * Construct an OAuth2\Client object.
     *
     * @param array $params
     *
     * @param string $id
     */
    public function __construct($params = NULL, $id = NULL) {
//        echo "__construct";
        if ($params)
            $this->params = $params + $this->params;

//        var_dump($params);
//        exit;

        if (!$id) {
            $id = md5($this->params['token_endpoint']
                    . $this->params['client_id']
                    . $this->params['auth_flow']);
        }
        $this->id = $id;

        // Get the token data from the session, if it is stored there.
        if (isset($_SESSION['oauth2_client']['token'][$this->id])) {
            $this->token = $_SESSION['oauth2_client']['token'][$this->id] + $this->token;
        }
    }

    /**
     * Clear the token data from the session.
     */
    public function clearToken() {
        if (isset($_SESSION['oauth2_client']['token'][$this->id])) {
            unset($_SESSION['oauth2_client']['token'][$this->id]);
        }
        $this->token = array(
            'access_token' => NULL,
            'expires_in' => NULL,
            'token_type' => NULL,
            'scope' => NULL,
            'refresh_token' => NULL,
            'expiration_time' => NULL,
        );
    }

    /**
     * Get and return an access token.
     *
     * 1.如果token 存在session中,取出session中的. 假如 token 過期，
     * 從 authorization server  取新的。
     *
     * 2.假如refresh_token 也過期，會重新驗證.
     * 
     */
    public function getAccessToken($redirect = TRUE) {
        //檢查是否有存在的token，通常1hr過期，所以設定10sec內的
        //取token就直接回傳，避免重複取用。
        $expiration_time = $this->token['expiration_time'];

        if ($expiration_time > (time() + 10)) {
            return $this->token['access_token'];
        }

        try {
            // Try to use refresh_token.
            $token = $this->getTokenRefreshToken();
//            var_dump($token);
//            exit;
        } catch (Exception $e) {
            // Get a token.
            switch ($this->params['auth_flow']) {
                case 'server-side':
                    if ($redirect) {
                        $token = $this->getTokenServerSide();
                    } else {
                        $this->clearToken();
                        return NULL;
                    }
                    break;
                case 'proxy-side':
//                    if($this->params['proxy_server'])
//                    $encode =  $this->params['client_id'];
//                    header('Location:' . $param)
                    var_dump($this->params['proxy_server']);
                    exit;
                    break;
                default:
                    throw new Exception("Unknown authorization flow " . $this->params['auth_flow'] . " Suported values for auth_flow are:server-side.");
                    break;
            }
        }

    if(isset($token['expires_in'])){
        $token['expiration_time'] = REQUEST_TIME + $token['expires_in'];
    }
        // Store the token (on session as well).
        $this->token = $token;
        $_SESSION['oauth2_client']['token'][$this->id] = $token;

        // Redirect to the original path (if this is a redirection
        // from the server-side flow).
        self::redirect();

        // Return the token.
//        dpm($token['access_token']);
        return $token['access_token'] ?? "";
    }

    /**
     * Get a new access_token using the refresh_token.
     *
     * This is used for the server-side
     */
    protected function getTokenRefreshToken() {
        if (!$this->token['refresh_token']) {
            throw new Exception('There is no refresh_token.');
        }
        return $this->getToken(array(
                    'grant_type' => 'refresh_token',
                    'refresh_token' => $this->token['refresh_token'],
        ));
    }

    /**
     * Get an access_token using the server-side (authorization code) flow.
     *
     *     $access_token = $client->getAccessToken();
     * or:
     *     $client = new OAuth2\Client(array(
     *         'token_endpoint' => 'https://oauth2_server/oauth2/token',
     *         'client_id' => 'client1',
     *         'client_secret' => 'secret1',
     *         'auth_flow' => 'server-side',
     *         'authorization_endpoint' => 'https://oauth2_server/oauth2/authorize',
     *         'redirect_uri' => 'https://oauth2_client/oauth2/authorized',
     *       ));
     *     $access_token = $client->getAccessToken();
     *
     */
    protected function getTokenServerSide() {

//        var_dump($_GET['state']);

        if (!isset($_GET['code'])) {
            $url = $this->getAuthenticationUrl();
            header('Location: ' . $url, TRUE, 302);
            exit;
//            drupal_exit($url);
        } else {
            // Check the query parameter 'state'.
//            if (!isset($_GET['state']) || !isset($_SESSION['oauth2_client']['redirect'][$_GET['state']])) {
//                throw new \Exception("Wrong query parameter 'state'.");
//            }
//                        var_dump($_GET);
//            exit;
            // Get and return a token.
            return $this->getToken(array(
                        'client_id' => $this->params['client_id'],
                        'grant_type' => 'authorization_code',
                        'code' => $_GET['code'],
                        'redirect_uri' => $this->params['redirect_uri'],
            ));
        }
    }

    /**
     * Return the authentication url (used in case of the server-side flow).
     */
    protected function getAuthenticationUrl() {
        $state = md5(uniqid(rand(), TRUE));
        $query_params = array(
            'response_type' => 'code',
            'client_id' => $this->params['client_id'],
            'redirect_uri' => $this->params['redirect_uri'],
            'state' => $state,
            'resource' => str_replace("~", "", $this->params['redirect_uri'])
        );

        $endpoint = $this->params['authorization_endpoint'];

        return $endpoint . '?' . http_build_query($query_params);
    }

    /**
     * Save the information needed for redirection after getting the token.
     */
    public static function setRedirect($state, $redirect = NULL) {
        if ($redirect == NULL) {
            $redirect = array(
                'uri' => $_GET['q'],
                'params' => drupal_get_query_parameters(),
                'client' => 'oauth2_client',
            );
        }
        if (!isset($redirect['client'])) {
            $redirect['client'] = 'external';
        }
        $_SESSION['oauth2_client']['redirect'][$state] = $redirect;
    }

    /**
     * Redirect to the original path.
     *
     * Redirects are registered with OAuth2\Client::setRedirect()
     * The redirect contains the url to go to and the parameters
     * to be sent to it.
     */
    public static function redirect($clean = TRUE) {
        if (!isset($_REQUEST['state']))
            return;
        $state = $_REQUEST['state'];

        /*
         *  修改已經登出後還留state但是session已經清除的問題。
         *  重新導入到<front>首頁頁面
         */

        if (!isset($_SESSION['oauth2_client']['redirect'][$state])) {
//            header($string);
            return;
        }
    }

    /**
     * Get and return an access token for the grant_type given in $params.
     */
    protected function getToken($data) {

//        drupal_set_message('##getToken');
//        dpm($data);

        $token_endpoint = $this->params['token_endpoint'];

        $responseJson = $this->postData($token_endpoint, $data);

        $result = (Array) json_decode($responseJson, TRUE);

//        dpm($result);
        return $result;
    }

    protected function postData($url, $postData) {
        $ch = curl_init();
        $query = "";

/* 已過時
        while (list($key, $val) = each($postData)) {
            if (strlen($query) > 0) {
                $query = $query . '&';
            }
            $query = $query . $key . '=' . $val;
        }
*/
//改寫
	foreach ($postData as $key => $val) {
	    if (strlen($query) > 0) {
	        $query = $query . '&';
    	    }
	    $query = $query . $key . '=' . $val;
	}



//        var_dump($postData);
//        exit;
        $options = array(
            CURLOPT_URL => $url,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_SSL_VERIFYPEER => 0,
            CURLOPT_FOLLOWLOCATION => 1,
            CURLOPT_RETURNTRANSFER => TRUE,
            CURLOPT_POST => TRUE,
            CURLOPT_POSTFIELDS => $query);

        curl_setopt_array($ch, $options);

//        print_r($options);
//        exit;

        $response = curl_exec($ch);

        if (FALSE === $response) {
            $curlErr = curl_error($ch);
            $curlErrNum = curl_errno($ch);

            curl_close($ch);
            throw new Exception($curlErr, $curlErrNum);
//            echo $curlErr . "   " . $curlErrNum;
        }

//        print_r($response);
//        exit;
        return $response;
    }

    public function getUserIdentity($accesstoken = NULL) {

        if (!$accesstoken && isset($this->token['access_token'])) {
            $accesstoken = $this->token['access_token'];
        }

        $jwt_arr = explode('.', $accesstoken);

        if (count($jwt_arr) != 3) {
            //Wrong number of segments
            return;
        }

        list($headb64, $bodyb64, $cryptob64) = $jwt_arr;
//Debug 使用        
        if ($_SERVER['REMOTE_ADDR'] == "140.116.221.144") {

//            var_dump($this->jsondecode(static::urlsafeB64Decode($headb64)));
//            var_dump($this->jsondecode(static::urlsafeB64Decode($bodyb64)));
//            var_dump($this->jsondecode(static::urlsafeB64Decode($cryptob64)));
//            exit();
        }

        $result = $this->jsondecode($this->urlsafeB64Decode($bodyb64));

//        var_dump($result);
//        exit;

        if (count($result) > 0) {
            if (isset($result['DN'])) {
//                var_dump($result['DN']);
                if (preg_match("/ou=students,dc=ncku,dc=edu,dc=tw/i", $result['DN'])) {
                    $result['identity'] = 'student';
                } else if (preg_match("/ou=staff,dc=ncku,dc=edu,dc=tw/i", $result['DN'])) {
                    $result['identity'] = 'staff';
                } else {
                    $result['identity'] = 'none';
                }
            }
        }

//        var_dump($result);
//        exit;
        return $result;
    }

    public function is_base64_encoded($data) {
        if (preg_match('%^[a-zA-Z0-9/+]*={0,2}$%', $data)) {
            return TRUE;
        } else {
            return FALSE;
        }
    }

    private function jsondecode($input) {
        if (version_compare(PHP_VERSION, '5.4.0', '>=') && !(defined('JSON_C_VERSION') && PHP_INT_SIZE > 4)) {
            /** In PHP >=5.4.0, json_decode() accepts an options parameter, that allows you
             * to specify that large ints (like Steam Transaction IDs) should be treated as
             * strings, rather than the PHP default behaviour of converting them to floats.
             */
            $ary = json_decode($input, true, 512, JSON_BIGINT_AS_STRING);
        } else {
            /** Not all servers will support that, however, so for older versions we must
             * manually detect large ints in the JSON string and quote them (thus converting
             * them to strings) before decoding, hence the preg_replace() call.
             */
            $max_int_length = strlen((string) PHP_INT_MAX) - 1;
            $json_without_bigints = preg_replace('/:\s*(-?\d{' . $max_int_length . ',})/', ': "$1"', $input);
            $ary = json_decode($json_without_bigints, true);
        }

        return $ary;
    }

    public static function urlsafeB64Decode($input) {
        $remainder = strlen($input) % 4;
        if ($remainder) {
            $padlen = 4 - $remainder;
            $input .= str_repeat('=', $padlen);
        }
        return base64_decode(strtr($input, '-_', '+/'));
    }

}

