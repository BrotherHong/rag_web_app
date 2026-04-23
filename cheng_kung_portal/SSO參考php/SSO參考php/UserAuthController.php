<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\TaskUser;
use Illuminate\Support\Facades\Auth;

class UserAuthController extends Controller
{   
    //用來判斷權限
    public function checkAuth(Request $request)
    {

        // //測試用
        // return response()->json([
        //     'isLoggedIn' =>false,
        //     'terms' => false,
        // ]);
        // 檢查使用者是否已登入 session(['TaskUser_id' => $user->id]);

        // 分流：如果是 127.0.0.1，直接回傳已登入且同意條款
        if ($request->ip() == '127.0.0.1') {
            $temp =    TaskUser::find('2');
            session(['TaskUser_id' => $temp->id]);
            session(['terms' => $temp->terms]);
            session(['is_freshman' => $temp->is_freshman]);
            session(['student_type' => $temp->student_type]);
            return response()->json([
            'isLoggedIn' => session('TaskUser_id') ? true : false,
            'terms' => session('terms') == 1 ? true : false,
            ]);
        }
        //這邊每次檢查權限時，都會確保是最新的資料
        //首先 先獲取 學生用戶的資料
        $user = TaskUser::find(session('TaskUser_id'));
        //如果沒有找到用戶資料，則返回未登入狀態
if (!$user) {
    //清除所有 session 資料 all
    session()->forget(['TaskUser_id', 'terms', 'is_freshman', 'student_type']);
            return response()->json([
                'isLoggedIn' => false,
                'terms' => false,
            ]);
        }
        //卻保有用戶資料
        //id_number
        
        //開始更新各種 session 資料
        session(['TaskUser_id' => $user->id]);
        session(['terms' => $user->terms]);
        session(['is_freshman' => $user->is_freshman]);
        session(['student_type' => $user->student_type]);


                 return response()->json([
            'isLoggedIn' => session('TaskUser_id') ? true : false,
            'terms' => session('terms') == 1 ? true : false,
            ]);
        // if (!Auth::check()) {
        //     return response()->json([
        //     'isLoggedIn' => session('TaskUser_id') ? true : false,
        //     'terms' => session('terms') == 1 ? true : false,
        //     ]);
        // }

        // $user = Auth::user();
        
        // // 檢查使用者是否有關聯的 TaskUser 記錄
        // $taskUser = TaskUser::where('main_sys_user_id', $user->id)->first();
        
        // // 如果找不到 TaskUser 記錄或者用戶未同意條款
        // if (!$taskUser || !$taskUser->terms) {
        //     return response()->json([
        //         'isLoggedIn' => true,
        //         'terms' => false,
        //     ]);
        // }

        // // 用戶已登入且已同意條款
        // return response()->json([
        //     'isLoggedIn' => true,
        //     'terms' => true,
        // ]);
    }
}