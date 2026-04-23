<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemLog;
use App\Models\TaskUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Session;

class APIController extends Controller
{
    private $langc = [
        'NOACCESS' => '無權限存取',
        'CLOSEWINDOW' => '請關閉視窗',
        'PASSWD_ERR' => '密碼錯誤',
        'LOGOIN_AGAIN' => '請重新登入',
    ];

    //test
    public function index_main(Request $request)
    {
        //新增log
        SystemLog::create([
            'log_date' => now(),
            'user_ip' => $request->ip(),
            'operation_type' => '登入SSO',
            'user_id' => 0, // 如果未登入則為0
            'endpoint' => $request->path(),
            'request_data' => $request->all(),
            'response_data' => [],
            'remarks' => '學生透過SSO登入系統',
        ])->save();

        Log::info('SSO回調開始');

        // 移除 session_start() - Laravel 會自動處理
        // if (session_status() == PHP_SESSION_NONE) {
        //     session_start();
        // }

        // 這行一定要加上去，目的取得REQUEST_TIME控制token取得
        if (! defined('REQUEST_TIME')) {
            define('REQUEST_TIME', (int) $_SERVER['REQUEST_TIME']);
        }

        // 引入 OAuth2 客戶端類別
        require_once public_path('../storage/app/oauth2_client_nonamespace.inc');

        // 語言字串
        $langc = [
            'NOACCESS' => '無權限存取',
            'CLOSEWINDOW' => '請關閉視窗',
            'PASSWD_ERR' => '密碼錯誤',
            'LOGOIN_AGAIN' => '請重新登入',
        ];

        // OAuth Server 參數設定
        $base_url = 'https://sup.ncku.edu.tw:9453';
        $server_url = 'https://fs.ncku.edu.tw';
        $oauth2_clients['nckusupsso'] = [
            'token_endpoint' => $server_url.'/adfs/oauth2/token',
            'auth_flow' => 'server-side',
            'client_id' => 'dd507556-6d79-43d2-bb83-7f5a1b8a8e47',
            'client_secret' => 'nckusupsso',
            'authorization_endpoint' => $server_url.'/adfs/oauth2/authorize',
            'redirect_uri' => $base_url.'/sso/sso.php',
        ];

        // NEW一個 oauth2_client 物件
        $oauth2_client = new \OAuth2_Client($oauth2_clients['nckusupsso'], 'nckusupsso');

        // 先清除Token
        $oauth2_client->clearToken();

        // 在輸入帳號密碼完成授權後會回傳accessToken
        $access_token = $oauth2_client->getAccessToken();

        // 利用accessToken 轉換為可讀的資料
        $result = $oauth2_client->getUserIdentity($access_token);

        // dd($result);
        //dump("Access Token: $access_token");

        $chklogin = false;
        if (isset($result['commonname'])) {
            // 清除舊的 session - 改用 Laravel session
            session()->forget('Tstuno');

            // 取得學年學期
            $rs = 114;
            $Nowtime = date('Y') - 1911 .date('md');
            $Nowtime = substr('0'.$Nowtime, -7);

            if ($result['identity'] == 'student') {
                // 寫入 session - 改用 Laravel session
                session(['Tstuno' => trim($result['commonname'])]);
                $student_year = substr(session('Tstuno'), 3, 2);
                $new_student_year = substr($rs, 1, 2);

                $chklogin = true;
                if ($student_year == $new_student_year) {
                    $new_student = true;
                    $new_student_text = '新生：Y';
                } else {
                    $new_student = false;
                    $new_student_text = '新生：N';
                }
                //這是測試
                // $new_student = TRUE;
                //
                //
                //
                //---------------------------
                // // 顯示資料
                //是否是本國籍
                $is_tw = true;
                $student_type = '本國';
                // dump("=== SSO 登入成功 ===");
                // dump("學號：" . session('Tstuno'));
                // dump("信箱：" . ($result['email'] ?? '無'));
                // dump("入學年度：1$student_year");
                // dump($new_student_text);
                // dump("當前學年：$rs");
                // dump("身份：" . $result['identity']);
                // dump("身別判定" . $result['studentida']??"無");
                // dump("姓名：" . ($result['fullname'] ?? '無'));
                if (isset($result['studentida']) && $result['studentida'] == 2) {
                    $is_tw = false;
                    $student_type = '僑生';
                    //   dump("僑生");
                }
                if (isset($result['studentida']) && $result['studentida'] == 7) {
                    $is_tw = false;
                    $student_type = '陸生';
                    //  dump("陸生");
                }
                //session('Tstuno') 第6個是字母 如果是7 就是外籍生
                if (substr(session('Tstuno'), 5, 1) == '7') {
                    $is_tw = false;
                    $student_type = '外籍生';
                    //  dump("外籍生");

                }
                if ($is_tw) {
                    $student_type = '本國';
                    // dump("本國籍學生");
                }

                $user = TaskUser::where('student_id', session('Tstuno'))->first();
                //如果有找到使用者
                if ($user) {
                    $user->is_freshman = $new_student == true ? 'y' : 'n';
                    $user->status = 'y';
                    //如果 $result['fullname'] 不等於 空值
                    if ($result['fullname'] != '') {
                        $user->name = $result['fullname'] ?? '';
                    }
                    $user->save();
                    //在session中存入使用者資料 id
                    session(['TaskUser_id' => $user->id]);
                    //是否是新生
                    session(['is_freshman' => $new_student]);
                    //是否同意條款
                    session(['terms' => $user->terms]);
                    //學生身分別
                    session(['student_type' => $user->student_type]);

                } else {
                    //如果沒有找到使用者，則創建一個新的使用者
                    $user = TaskUser::create([
                        'terms' => 0,
                        'status' => 'y',
                        'student_id' => session('Tstuno'),
                        'is_freshman' => $new_student ? 'y' : 'n',
                        'student_type' => $student_type,
                        'email' => $result['email'] ?? '',
                        'name' => $result['fullname'] ?? '',
                    ]);
                    //在session中存入使用者資料 id
                    session(['TaskUser_id' => $user->id]);
                    //是否是新生
                    session(['is_freshman' => $new_student]);
                    //是否同意條款
                    session(['terms' => $user->terms]);
                    //學生身分別
                    session(['student_type' => $user->student_type]);
                }

                // 檢查是否有記錄的返回 URL（從 ncku2 或其他系統來的）
                $returnUrl = '/activity'; // 預設返回 URL

                if (Session::has('sso_return_url')) {
                    $returnUrl = Session::get('sso_return_url');
                    Log::info('[SSO] 偵測到自定義返回 URL', [
                        'return_url' => $returnUrl,
                        'sso_source' => Session::get('sso_source', 'unknown'),
                        'student_id' => session('Tstuno'),
                    ]);

                    // 清除 SSO 相關的 session
                    Session::forget('sso_return_url');
                    Session::forget('sso_source');
                    Session::forget('sso_original_path');
                } else {
                    Log::info('[SSO] 使用預設返回 URL', [
                        'return_url' => $returnUrl,
                        'student_id' => session('Tstuno'),
                    ]);
                }

                // dd($result);
                // 跳轉到對應的系統頁面
                return redirect($returnUrl);

            } else {
                //這邊的話是教師身份
                session(['Tstuno' => trim($result['commonname'])]);

                $user = TaskUser::where('student_id', session('Tstuno'))->first();
                //如果有找到使用者
                if ($user) {
                    //在session中存入使用者資料 id
                    session(['TaskUser_id' => $user->id]);
                    //是否是新生
                    session(['is_freshman' => $user->is_freshman]);
                    //是否同意條款
                    session(['terms' => $user->terms]);
                    //學生身分別
                    session(['student_type' => $user->student_type]);

                } else {
                    //如果沒有找到使用者，則創建一個新的使用者
                    $user = TaskUser::create([
                        'terms' => 0, //是否同意條款
                        'status' => 'y', //是否啟用
                        'student_id' => session('Tstuno'), // 學號
                        'is_freshman' => 'y', //是否是新生
                        'student_type' => '本國',
                        'name' => $result['fullname'] ?? '',
                        'remark' => '教師身份',
                    ]);
                    session(['TaskUser_id' => $user->id]);
                    //是否是新生
                    session(['is_freshman' => $user->is_freshman]);
                    //是否同意條款
                    session(['terms' => $user->terms]);
                    //學生身分別
                    session(['student_type' => $user->student_type]);
                }

                // 檢查是否有記錄的返回 URL（教師身份也要處理）
                $returnUrl = '/activity'; // 預設返回 URL

                if (Session::has('sso_return_url')) {
                    $returnUrl = Session::get('sso_return_url');
                    Log::info('[SSO] 教師身份 - 偵測到自定義返回 URL', [
                        'return_url' => $returnUrl,
                        'sso_source' => Session::get('sso_source', 'unknown'),
                        'teacher_id' => session('Tstuno'),
                    ]);

                    // 清除 SSO 相關的 session
                    Session::forget('sso_return_url');
                    Session::forget('sso_source');
                    Session::forget('sso_original_path');
                }

                return redirect($returnUrl);
            }
        } else {
            //    return redirect('/activity');
            // 驗證不過

            dump('驗證失敗，commonname 不存在');
            dd('驗證失敗');
        }
    }

    public function userDataGet(Request $request)
    {

        $requestId = uniqid('SSO_', true); // 為每個請求創建唯一 ID

        // === 步驟 1: 記錄請求開始 ===
        Log::info("[$requestId] SSO 登入流程開始", [
            'request_id' => $requestId,
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'request_url' => $request->fullUrl(),
            'request_method' => $request->method(),
            'request_headers' => $request->headers->all(),
            'request_parameters' => $request->all(),
            'session_id' => Session::getId(),
            'timestamp' => now()->toDateTimeString(),
            'php_session_status' => session_status(),
            'server_request_time' => $_SERVER['REQUEST_TIME'] ?? null,
        ]);

        // === 步驟 2: 設定 REQUEST_TIME 常數 ===
        if (! defined('REQUEST_TIME')) {
            define('REQUEST_TIME', (int) $_SERVER['REQUEST_TIME']);
            Log::info("[$requestId] REQUEST_TIME 常數已設定", [
                'request_time' => REQUEST_TIME,
                'server_request_time' => $_SERVER['REQUEST_TIME'] ?? null,
            ]);
        } else {
            Log::info("[$requestId] REQUEST_TIME 常數已存在", [
                'request_time' => REQUEST_TIME,
            ]);
        }

        // === 步驟 3: 載入 OAuth2 客戶端類別 ===
        $oauth2_file_path = base_path('app/Libraries/oauth2_client_nonamespace.inc');
        Log::info("[$requestId] 準備載入 OAuth2 客戶端類別", [
            'file_path' => $oauth2_file_path,
            'file_exists' => file_exists($oauth2_file_path),
            'file_readable' => is_readable($oauth2_file_path),
        ]);

        try {
            require_once $oauth2_file_path;
            Log::info("[$requestId] OAuth2 客戶端類別載入成功");
        } catch (\Exception $e) {
            Log::error("[$requestId] OAuth2 客戶端類別載入失敗", [
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            return $this->cleanAllAndRedirect('系統載入失敗', $requestId);
        }

        try {
            // === 步驟 4: OAuth2 設定參數 ===
            $base_url = 'https://sup.ncku.edu.tw:9453';
            $server_url = 'https://fs.ncku.edu.tw';

            $oauth2_config = [
                'token_endpoint' => $server_url.'/adfs/oauth2/token',
                'auth_flow' => 'server-side',
                'client_id' => 'dd507556-6d79-43d2-bb83-7f5a1b8a8e47',
                'client_secret' => 'nckusupsso',
                'authorization_endpoint' => $server_url.'/adfs/oauth2/authorize',
                'redirect_uri' => $base_url.'/sso/sso.php',
            ];

            Log::info("[$requestId] OAuth2 設定參數", [
                'base_url' => $base_url,
                'server_url' => $server_url,
                'token_endpoint' => $oauth2_config['token_endpoint'],
                'auth_flow' => $oauth2_config['auth_flow'],
                'client_id' => $oauth2_config['client_id'],
                'authorization_endpoint' => $oauth2_config['authorization_endpoint'],
                'redirect_uri' => $oauth2_config['redirect_uri'],
                'client_secret_length' => strlen($oauth2_config['client_secret']), // 不記錄完整密鑰
            ]);

            // === 步驟 5: 創建 OAuth2 客戶端物件 ===
            Log::info("[$requestId] 開始創建 OAuth2 客戶端物件");

            $oauth2_client = new \Oauth2_client($oauth2_config, 'nckusupsso');

            Log::info("[$requestId] OAuth2 客戶端物件創建成功", [
                'client_class' => get_class($oauth2_client),
            ]);

            // === 步驟 6: 清除現有的 Token ===
            Log::info("[$requestId] 清除現有 Token");
            $oauth2_client->clearToken();
            Log::info("[$requestId] Token 清除完成");

            // === 步驟 7: 獲取訪問令牌 ===
            Log::info("[$requestId] 開始獲取訪問令牌");

            $access_token = $oauth2_client->getAccessToken();

            if (! $access_token) {
                Log::warning("[$requestId] 無法獲取訪問令牌", [
                    'token_result' => $access_token,
                    'token_type' => gettype($access_token),
                    'oauth2_token_info' => $oauth2_client->token(),
                ]);

                return $this->cleanAllAndRedirect('無法獲取訪問令牌', $requestId);
            }

            Log::info("[$requestId] 訪問令牌獲取成功", [
                'token_length' => strlen($access_token),
                'token_prefix' => substr($access_token, 0, 20).'...',
                'token_info' => $oauth2_client->token(),
            ]);

            // === 步驟 8: 獲取用戶身份資訊 ===
            Log::info("[$requestId] 開始解析用戶身份資訊");

            $result = $oauth2_client->getUserIdentity($access_token);

            Log::info("[$requestId] 用戶身份資訊解析結果", [
                'result_type' => gettype($result),
                'result_keys' => is_array($result) ? array_keys($result) : 'not_array',
                'has_commonname' => isset($result['commonname']),
                'has_identity' => isset($result['identity']),
                'has_email' => isset($result['email']),
                'has_dn' => isset($result['DN']),
                'result_count' => is_array($result) ? count($result) : 0,
            ]);

            if (! isset($result['commonname'])) {
                Log::warning("[$requestId] 用戶身份資訊中缺少 commonname", [
                    'available_keys' => is_array($result) ? array_keys($result) : 'not_array',
                    'full_result' => $result,
                ]);

                return $this->cleanAllAndRedirect('無法獲取用戶資訊', $requestId);
            }

            // === 步驟 9: 檢查用戶身份 ===
            Log::info("[$requestId] 檢查用戶身份", [
                'identity' => $result['identity'] ?? 'not_set',
                'commonname' => $result['commonname'] ?? 'not_set',
                'email' => $result['email'] ?? 'not_set',
                'dn' => $result['DN'] ?? 'not_set',
            ]);

            if ($result['identity'] !== 'student') {
                Log::warning("[$requestId] 用戶身份驗證失敗 - 非學生身份", [
                    'identity' => $result['identity'],
                    'commonname' => $result['commonname'],
                    'expected_identity' => 'student',
                    'full_user_data' => $result,
                ]);

                return $this->cleanAllAndRedirect(
                    $result['identity'].'=>NO STUDENT'.$this->langc['NOACCESS'],
                    $requestId
                );
            }

            Log::info("[$requestId] 用戶身份驗證通過 - 學生身份確認");

            // === 步驟 10: 處理學生資料 ===
            return $this->processStudentData($result, $access_token, $requestId, $request);

        } catch (\Exception $e) {
            Log::error("[$requestId] SSO 系統錯誤", [
                'error_message' => $e->getMessage(),
                'error_code' => $e->getCode(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'error_trace' => $e->getTraceAsString(),
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->cleanAllAndRedirect('系統錯誤：'.$e->getMessage(), $requestId);
        }
    }

    /**
     * 處理學生資料
     */
    private function processStudentData($result, $access_token, $requestId, Request $request)
    {
        Log::info("[$requestId] 開始處理學生資料", [
            'student_commonname' => $result['commonname'],
        ]);

        // === 步驟 11: Session 處理 ===
        $old_session_data = Session::all();
        Log::info("[$requestId] 檢查現有 Session", [
            'has_tstuno' => Session::has('Tstuno'),
            'old_tstuno' => Session::get('Tstuno'),
            'session_count' => count($old_session_data),
            'session_keys' => array_keys($old_session_data),
        ]);

        if (Session::has('Tstuno')) {
            Log::info("[$requestId] 清除舊的 Session 資料");
            Session::flush();
        }

        // === 步驟 12: 學年學期資料計算 ===
        $rs = 114;
        $nowtime = date('Y') - 1911 .date('md');
        $nowtime = substr('0'.$nowtime, -7);

        Log::info("[$requestId] 學年學期資料計算", [
            'rs' => $rs,
            'current_year' => date('Y'),
            'minguo_year' => date('Y') - 1911,
            'nowtime_raw' => $nowtime,
            'date_md' => date('md'),
        ]);

        // === 步驟 13: 設定 Session 變數 ===
        $student_id = trim($result['commonname']);
        Session::put('Tstuno', $student_id);

        Log::info("[$requestId] Session 變數設定", [
            'student_id' => $student_id,
            'session_tstuno' => Session::get('Tstuno'),
            'session_id' => Session::getId(),
        ]);

        // === 步驟 14: 學生年級計算 ===
        $student_year = substr(Session::get('Tstuno'), 3, 2);
        $new_student_year = substr($rs, 1, 2);
        $is_new_student = ($student_year == $new_student_year);

        Log::info("[$requestId] 學生年級分析", [
            'student_id_full' => Session::get('Tstuno'),
            'student_year' => $student_year,
            'new_student_year' => $new_student_year,
            'is_new_student' => $is_new_student,
            'admission_year' => '1'.$student_year,
            'calculation_rs' => $rs,
        ]);

        // === 步驟 15: 準備回傳資料 ===
        $responseData = [
            'success' => true,
            'message' => '登入成功',
            'data' => [
                'access_token' => $access_token,
                'student_id' => Session::get('Tstuno'),
                'student_year' => $student_year,
                'admission_year' => '1'.$student_year,
                'is_new_student' => $is_new_student,
                'identity' => $result['identity'],
                'email' => $result['email'] ?? '',
                'dn' => $result['DN'] ?? '',
                'common_name' => $result['commonname'] ?? '',
            ],
        ];

        // === 步驟 16: 成功登入 LOG ===
        Log::info("[$requestId] ✅ SSO 登入成功完成", [
            'student_id' => Session::get('Tstuno'),
            'student_year' => $student_year,
            'admission_year' => '1'.$student_year,
            'is_new_student' => $is_new_student,
            'identity' => $result['identity'],
            'email' => $result['email'] ?? '',
            'dn' => $result['DN'] ?? '',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'session_id' => Session::getId(),
            'login_time' => now()->toDateTimeString(),
            'access_token_length' => strlen($access_token),
            'access_token_prefix' => substr($access_token, 0, 30).'...',
            'response_data_keys' => array_keys($responseData['data']),
            'process_duration' => 'completed',
        ]);

        return response()->json($responseData);
    }

    /**
     * 清除所有資料並重定向
     */
    private function cleanAllAndRedirect($message = '', $requestId = null)
    {
        $requestId = $requestId ?? uniqid('ERROR_', true);

        Log::warning("[$requestId] ❌ 執行清除和重定向", [
            'message' => $message,
            'session_before_flush' => Session::all(),
            'session_id' => Session::getId(),
        ]);

        // 清除 Laravel session
        Session::flush();

        Log::info("[$requestId] Session 已清除", [
            'session_after_flush' => Session::all(),
            'new_session_id' => Session::getId(),
        ]);

        // 準備錯誤回應
        $responseData = [
            'success' => false,
            'message' => $message ?: $this->langc['NOACCESS'],
            'redirect_url' => 'https://sup.ncku.edu.tw:9453/sso/logout.php',
            'request_id' => $requestId,
        ];

        Log::info("[$requestId] 錯誤回應準備完成", [
            'response_data' => $responseData,
        ]);

        return response()->json($responseData, 401);
    }

    /**
     * 登出功能
     */
    public function logout(Request $request)
    {
        $logoutId = uniqid('LOGOUT_', true);
        $student_id = Session::get('Tstuno');

        Log::info("[$logoutId] 開始登出流程", [
            'student_id' => $student_id,
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'session_id' => Session::getId(),
            'session_data' => Session::all(),
        ]);

        // 清除 session
        Session::flush();

        Log::info("[$logoutId] ✅ 登出完成", [
            'student_id' => $student_id,
            'logout_time' => now()->toDateTimeString(),
            'redirect_url' => 'https://fs.ncku.edu.tw/adfs/ls/?wa=wsignout1.0',
        ]);

        // 重定向到 ADFS 登出頁面
        return redirect('https://fs.ncku.edu.tw/adfs/ls/?wa=wsignout1.0');
    }

    /**
     * 獲取目前登入用戶資訊
     */
    public function getCurrentUser(Request $request)
    {
        $checkId = uniqid('CHECK_', true);

        Log::info("[$checkId] 檢查當前用戶狀態", [
            'ip' => $request->ip(),
            'session_id' => Session::getId(),
            'has_tstuno' => Session::has('Tstuno'),
            'tstuno_value' => Session::get('Tstuno'),
            'all_session_data' => Session::all(),
        ]);

        if (! Session::has('Tstuno')) {
            Log::info("[$checkId] 用戶未登入");

            return response()->json([
                'success' => false,
                'message' => '用戶未登入',
            ], 401);
        }

        $responseData = [
            'success' => true,
            'data' => [
                'student_id' => Session::get('Tstuno'),
                'is_logged_in' => true,
            ],
        ];

        Log::info("[$checkId] ✅ 當前用戶狀態檢查完成", [
            'student_id' => Session::get('Tstuno'),
            'response_data' => $responseData,
        ]);

        return response()->json($responseData);
    }
}
